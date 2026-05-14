// Google Ads Offline Conversion Upload
//
// Posts converted leads (status: 'won' or call-answered events) to Google Ads
// via the Click Conversion API so closed deals attribute back to the ad click.
//
// Requires environment variables:
//   GOOGLE_ADS_CUSTOMER_ID         e.g. "123-456-7890" (your Ads account ID, no dashes)
//   GOOGLE_ADS_DEVELOPER_TOKEN     from Google Ads API Center
//   GOOGLE_ADS_OAUTH_CLIENT_ID     from Google Cloud Console
//   GOOGLE_ADS_OAUTH_CLIENT_SECRET from Google Cloud Console
//   GOOGLE_ADS_REFRESH_TOKEN       generated via OAuth playground
//   GOOGLE_ADS_LOGIN_CUSTOMER_ID   optional, manager account ID
//   GOOGLE_ADS_CONVERSION_ACTIONS  JSON: { "lead_form": "customers/X/conversionActions/Y", "call_answered": "..." }
//
// If creds aren't set, this module no-ops gracefully — useful while the Ads account is still being set up.

const axios = require('axios');
const db = require('../db');

const ADS_API_BASE = 'https://googleads.googleapis.com/v17';

function configured() {
  return !!(
    process.env.GOOGLE_ADS_CUSTOMER_ID &&
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    process.env.GOOGLE_ADS_REFRESH_TOKEN &&
    process.env.GOOGLE_ADS_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET
  );
}

let cachedToken = null;
let cachedTokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiry - 60_000) return cachedToken;
  const r = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: process.env.GOOGLE_ADS_OAUTH_CLIENT_ID,
    client_secret: process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
    grant_type: 'refresh_token'
  });
  cachedToken = r.data.access_token;
  cachedTokenExpiry = Date.now() + (r.data.expires_in * 1000);
  return cachedToken;
}

function customerPath() {
  return process.env.GOOGLE_ADS_CUSTOMER_ID.replace(/-/g, '');
}

function conversionAction(key) {
  try {
    const map = JSON.parse(process.env.GOOGLE_ADS_CONVERSION_ACTIONS || '{}');
    return map[key] || null;
  } catch {
    return null;
  }
}

// Format ISO datetime as Google Ads expected format: yyyy-mm-dd hh:mm:ss+HH:MM
function fmtConversionDate(d) {
  const date = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  const tz = (() => {
    const offMin = -date.getTimezoneOffset();
    const sign = offMin >= 0 ? '+' : '-';
    const h = pad(Math.floor(Math.abs(offMin) / 60));
    const m = pad(Math.abs(offMin) % 60);
    return `${sign}${h}:${m}`;
  })();
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${tz}`;
}

/**
 * Upload a single conversion for a lead by ID.
 * @param {number} leadId
 * @param {string} actionKey - 'lead_form' | 'call_answered' | 'qualified_lead' | 'won_deal'
 * @param {number} value - conversion value in USD
 */
async function uploadLeadConversion(leadId, actionKey = 'qualified_lead', value = 100) {
  if (!configured()) {
    console.log('[GoogleAds] Skipping conversion upload — credentials not configured');
    return { skipped: true };
  }

  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
  if (!lead) throw new Error('Lead not found');
  if (!lead.gclid) {
    console.log(`[GoogleAds] Lead ${leadId} has no GCLID — cannot upload (likely came from organic)`);
    return { skipped: true, reason: 'no_gclid' };
  }
  if (lead.conversion_uploaded) {
    return { skipped: true, reason: 'already_uploaded' };
  }

  const actionResource = conversionAction(actionKey);
  if (!actionResource) {
    console.warn(`[GoogleAds] No conversion action configured for ${actionKey}`);
    return { skipped: true, reason: 'no_action_configured' };
  }

  try {
    const token = await getAccessToken();
    const url = `${ADS_API_BASE}/customers/${customerPath()}:uploadClickConversions`;

    const payload = {
      conversions: [{
        gclid: lead.gclid,
        conversionAction: actionResource,
        conversionDateTime: fmtConversionDate(new Date()),
        conversionValue: value,
        currencyCode: 'USD',
        orderId: `lead-${leadId}`
      }],
      partialFailure: true,
      validateOnly: false
    };

    const headers = {
      'Authorization': `Bearer ${token}`,
      'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
      'Content-Type': 'application/json'
    };
    if (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
      headers['login-customer-id'] = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/-/g, '');
    }

    const r = await axios.post(url, payload, { headers, timeout: 10_000 });

    db.prepare('UPDATE leads SET conversion_uploaded = 1 WHERE id = ?').run(leadId);
    console.log(`[GoogleAds] Uploaded conversion for lead ${leadId} (${actionKey}, $${value})`);
    return { success: true, response: r.data };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error(`[GoogleAds] Conversion upload failed for lead ${leadId}: ${msg}`);
    return { success: false, error: msg };
  }
}

/**
 * Upload a phone-call conversion from a Twilio call.
 */
async function uploadCallConversion(callId, value = 100) {
  if (!configured()) return { skipped: true };

  const call = db.prepare('SELECT * FROM calls WHERE id = ?').get(callId);
  if (!call) throw new Error('Call not found');

  // Find the most recent GCLID for this caller's phone number (within 90 days)
  const recentLead = db.prepare(`
    SELECT gclid FROM leads
    WHERE phone = ? AND gclid IS NOT NULL
      AND created_at >= datetime('now', '-90 days')
    ORDER BY created_at DESC LIMIT 1
  `).get(call.from_number);

  if (!recentLead?.gclid) {
    console.log(`[GoogleAds] No GCLID found for caller ${call.from_number} — call not attributable`);
    return { skipped: true, reason: 'no_gclid' };
  }

  const actionResource = conversionAction('call_answered');
  if (!actionResource) return { skipped: true, reason: 'no_action_configured' };

  try {
    const token = await getAccessToken();
    const url = `${ADS_API_BASE}/customers/${customerPath()}:uploadClickConversions`;
    const payload = {
      conversions: [{
        gclid: recentLead.gclid,
        conversionAction: actionResource,
        conversionDateTime: fmtConversionDate(new Date()),
        conversionValue: value,
        currencyCode: 'USD',
        orderId: `call-${callId}`
      }],
      partialFailure: true
    };
    const headers = {
      'Authorization': `Bearer ${token}`,
      'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
      'Content-Type': 'application/json'
    };
    if (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
      headers['login-customer-id'] = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/-/g, '');
    }
    await axios.post(url, payload, { headers, timeout: 10_000 });
    console.log(`[GoogleAds] Uploaded call conversion for call ${callId}`);
    return { success: true };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error(`[GoogleAds] Call conversion upload failed: ${msg}`);
    return { success: false, error: msg };
  }
}

module.exports = { uploadLeadConversion, uploadCallConversion, configured };
