// DrySolve Restoration — Analytics & Conversion Tracking
// Loads Google Ads (gtag) and optionally GTM, then exposes a single trackConversion() API.
//
// Configuration is read from window.DS_ANALYTICS, which is rendered server-side from env vars:
//   GOOGLE_ADS_ID           e.g. "AW-1234567890"
//   GOOGLE_ADS_CONVERSIONS  JSON map: { "lead_form": "abc123", "phone_click": "def456", "call_answered": "ghi789" }
//   GTM_CONTAINER_ID        e.g. "GTM-XXXXXXX" (optional — falls back to gtag.js if absent)
//   GA4_MEASUREMENT_ID      e.g. "G-XXXXXXXXXX" (optional)
//
// Public API:
//   window.dsAnalytics.trackConversion(eventName, opts)
//   window.dsAnalytics.capturedGclid  — read by form submission to persist for offline conversion upload

(function() {
  const cfg = window.DS_ANALYTICS || {};
  const adsId = cfg.adsId || null;
  const gtmId = cfg.gtmId || null;
  const ga4Id = cfg.ga4Id || null;
  const conversions = cfg.conversions || {};

  // --- Bootstrap dataLayer (used by gtag and GTM) -----------------------
  window.dataLayer = window.dataLayer || [];
  window.gtag = function() { dataLayer.push(arguments); };
  gtag('js', new Date());

  // --- Load Google Tag Manager if configured ---------------------------
  if (gtmId) {
    (function(w, d, s, l, i) {
      w[l] = w[l] || [];
      w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
      const f = d.getElementsByTagName(s)[0];
      const j = d.createElement(s);
      j.async = true;
      j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i;
      f.parentNode.insertBefore(j, f);
    })(window, document, 'script', 'dataLayer', gtmId);
  }

  // --- Load gtag.js for Google Ads / GA4 ------------------------------
  const gtagIds = [adsId, ga4Id].filter(Boolean);
  if (gtagIds.length) {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + gtagIds[0];
    document.head.appendChild(s);
    gtagIds.forEach(id => gtag('config', id, { send_page_view: true }));
  }

  // --- Capture GCLID from URL on landing ------------------------------
  // GCLID = Google Click Identifier. Required for server-side offline conversion uploads.
  // We capture from URL and stash in localStorage with 90-day expiry (Google Ads attribution window).
  function captureGclid() {
    const params = new URLSearchParams(window.location.search);
    const gclid = params.get('gclid');
    if (gclid) {
      const payload = { gclid, ts: Date.now() };
      try { localStorage.setItem('ds_gclid', JSON.stringify(payload)); } catch (e) {}
      return gclid;
    }
    try {
      const stored = JSON.parse(localStorage.getItem('ds_gclid') || 'null');
      if (stored && (Date.now() - stored.ts) < 90 * 24 * 60 * 60 * 1000) return stored.gclid;
    } catch (e) {}
    return null;
  }
  const gclid = captureGclid();

  // --- Public conversion API ------------------------------------------
  // eventName: 'lead_form' | 'phone_click' | 'call_answered' | custom
  // opts: { value?: number, currency?: string, transaction_id?: string, extra?: object }
  function trackConversion(eventName, opts) {
    opts = opts || {};
    const conversionLabel = conversions[eventName];

    // Always push to dataLayer (GTM hooks)
    dataLayer.push({
      event: 'ds_conversion',
      conversion_type: eventName,
      conversion_value: opts.value || 0,
      conversion_currency: opts.currency || 'USD',
      gclid: gclid,
      ...(opts.extra || {})
    });

    // Fire Google Ads conversion if we have a label for this event
    if (adsId && conversionLabel) {
      const sendObj = {
        send_to: adsId + '/' + conversionLabel,
        value: opts.value || 0,
        currency: opts.currency || 'USD'
      };
      if (opts.transaction_id) sendObj.transaction_id = opts.transaction_id;
      gtag('event', 'conversion', sendObj);
    }

    // Fire GA4 event mirror
    if (ga4Id) {
      gtag('event', eventName, {
        value: opts.value || 0,
        currency: opts.currency || 'USD',
        ...(opts.extra || {})
      });
    }
  }

  // --- Auto-track all tel: link clicks --------------------------------
  document.addEventListener('click', function(e) {
    const a = e.target.closest('a[href^="tel:"]');
    if (!a) return;
    const phone = a.getAttribute('href').replace('tel:', '');
    trackConversion('phone_click', {
      value: 1,
      extra: { phone_number: phone, click_location: a.textContent.trim().slice(0, 50) }
    });
  });

  // Expose
  window.dsAnalytics = { trackConversion, capturedGclid: gclid };
})();
