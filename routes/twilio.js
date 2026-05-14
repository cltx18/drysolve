const express = require('express');
const router = express.Router();
const db = require('../db');

// Helper: find best-matching location for an incoming call by caller zip/city/state
function findMatchingLocation({ zip, city, state }) {
  if (zip) {
    const locs = db.prepare('SELECT * FROM locations WHERE active = 1').all();
    const match = locs.find(l => (l.zip_codes || '').split(',').map(z => z.trim()).includes(zip));
    if (match) return match;
  }
  if (city && state) {
    const m = db.prepare(`
      SELECT * FROM locations WHERE active = 1
      AND LOWER(city) = LOWER(?) AND UPPER(state) = UPPER(?) LIMIT 1
    `).get(city, state);
    if (m) return m;
  }
  if (state) {
    const m = db.prepare(`
      SELECT * FROM locations WHERE active = 1 AND UPPER(state) = UPPER(?)
      ORDER BY featured DESC LIMIT 1
    `).get(state);
    if (m) return m;
  }
  return db.prepare(`SELECT * FROM locations WHERE active = 1 ORDER BY featured DESC LIMIT 1`).get();
}

// XML escape
function esc(s) {
  return String(s || '').replace(/[<>&'"]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;' }[c]));
}

/**
 * POST /api/twilio/voice
 * Primary inbound call webhook. Configure this in Twilio Console
 * as the "A Call Comes In" webhook for your phone number.
 *
 * Returns TwiML that:
 * 1. Records the entire call
 * 2. Routes (dials) the matching location's phone number
 * 3. Transcribes the recording when complete
 */
router.post('/voice', (req, res) => {
  const {
    CallSid, From, To, Direction,
    FromCity, FromState, FromZip, FromCountry,
    CallStatus
  } = req.body;

  console.log('[Twilio] Incoming call:', { CallSid, From, To, FromCity, FromState, FromZip });

  // Match caller to a franchise location
  const matched = findMatchingLocation({ zip: FromZip, city: FromCity, state: FromState });
  const forwardTo = matched?.phone || process.env.FALLBACK_FORWARD_NUMBER || '';

  // Insert/upsert call record
  try {
    db.prepare(`
      INSERT INTO calls (call_sid, from_number, to_number, direction, status,
                         location_id, forwarded_to, caller_city, caller_state, caller_zip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(call_sid) DO UPDATE SET
        status = excluded.status,
        location_id = excluded.location_id,
        forwarded_to = excluded.forwarded_to
    `).run(
      CallSid, From || null, To || null, Direction || 'inbound',
      CallStatus || 'ringing',
      matched?.id || null,
      forwardTo || null,
      FromCity || null, FromState || null, FromZip || null
    );
  } catch (err) {
    console.error('[Twilio] DB insert error:', err.message);
  }

  // Build TwiML response
  const base = `${req.protocol}://${req.get('host')}`;
  const recordingCb = `${base}/api/twilio/recording-status`;
  const transcribeCb = `${base}/api/twilio/transcription`;
  const dialCb = `${base}/api/twilio/dial-status`;

  let twiml;
  if (forwardTo) {
    // Greeting + Dial with recording. Dial verb records both legs.
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you for calling DrySolve Restoration. Connecting you to a certified technician now.</Say>
  <Dial timeout="20" record="record-from-answer-dual"
        recordingStatusCallback="${esc(recordingCb)}"
        recordingStatusCallbackMethod="POST"
        recordingStatusCallbackEvent="completed"
        action="${esc(dialCb)}"
        method="POST"
        callerId="${esc(To || '')}">
    <Number>${esc(forwardTo)}</Number>
  </Dial>
  <Say voice="Polly.Joanna">We were unable to connect your call. Please leave a brief message after the tone and a technician will return your call within fifteen minutes.</Say>
  <Record maxLength="180" playBeep="true"
          action="${esc(recordingCb)}"
          transcribe="true"
          transcribeCallback="${esc(transcribeCb)}"
          recordingStatusCallback="${esc(recordingCb)}"/>
</Response>`;
  } else {
    // No forwarding number configured — just record a voicemail
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you for calling DrySolve Restoration. Please leave a brief message describing your emergency and a technician will return your call within fifteen minutes.</Say>
  <Record maxLength="300" playBeep="true"
          transcribe="true"
          transcribeCallback="${esc(transcribeCb)}"
          recordingStatusCallback="${esc(recordingCb)}"
          recordingStatusCallbackMethod="POST"/>
</Response>`;
  }

  res.type('text/xml').send(twiml);
});

/**
 * POST /api/twilio/dial-status
 * Fired after the <Dial> verb completes (answered, busy, no-answer, failed).
 */
router.post('/dial-status', (req, res) => {
  const { CallSid, DialCallStatus, DialCallDuration, DialCallSid, AnsweredBy } = req.body;
  try {
    db.prepare(`
      UPDATE calls
      SET status = COALESCE(?, status),
          duration_seconds = COALESCE(?, duration_seconds),
          answered_by = COALESCE(?, answered_by),
          ended_at = CURRENT_TIMESTAMP
      WHERE call_sid = ?
    `).run(
      DialCallStatus || null,
      DialCallDuration ? parseInt(DialCallDuration) : null,
      AnsweredBy || null,
      CallSid
    );
  } catch (err) {
    console.error('[Twilio] dial-status DB error:', err.message);
  }
  // Empty TwiML keeps the call flow ending after Dial (or falls through to voicemail if Dial failed)
  res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response/>');
});

/**
 * POST /api/twilio/recording-status
 * Fired when a recording is complete. Saves the recording URL & SID to the call record.
 */
router.post('/recording-status', (req, res) => {
  const {
    CallSid, RecordingSid, RecordingUrl, RecordingStatus,
    RecordingDuration, RecordingChannels
  } = req.body;

  if (RecordingStatus === 'completed' && RecordingSid) {
    try {
      db.prepare(`
        UPDATE calls
        SET recording_sid = ?,
            recording_url = ?,
            recording_duration = ?
        WHERE call_sid = ?
      `).run(
        RecordingSid,
        RecordingUrl || null,
        RecordingDuration ? parseInt(RecordingDuration) : null,
        CallSid
      );
      console.log('[Twilio] Recording saved for call', CallSid);
    } catch (err) {
      console.error('[Twilio] recording-status DB error:', err.message);
    }
  }
  res.sendStatus(204);
});

/**
 * POST /api/twilio/transcription
 * Fired when a transcription is complete.
 * Also creates a Lead record from the call if the call was a voicemail (no dial).
 */
router.post('/transcription', (req, res) => {
  const {
    CallSid, TranscriptionSid, TranscriptionText, TranscriptionStatus,
    RecordingSid, From
  } = req.body;

  try {
    db.prepare(`
      UPDATE calls
      SET transcription_sid = ?,
          transcription_text = ?,
          transcription_status = ?
      WHERE call_sid = ?
    `).run(
      TranscriptionSid || null,
      TranscriptionText || null,
      TranscriptionStatus || null,
      CallSid
    );
    console.log('[Twilio] Transcription saved for call', CallSid);

    // Auto-create a Lead from the call for follow-up tracking
    const call = db.prepare('SELECT * FROM calls WHERE call_sid = ?').get(CallSid);
    if (call && !call.lead_id && TranscriptionText) {
      const leadResult = db.prepare(`
        INSERT INTO leads (location_id, name, phone, message, service_type, source, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        call.location_id || null,
        'Phone caller',
        call.from_number || From || 'unknown',
        TranscriptionText,
        'phone-inquiry',
        'inbound-call',
        'new'
      );
      db.prepare('UPDATE calls SET lead_id = ? WHERE id = ?').run(leadResult.lastInsertRowid, call.id);
      console.log('[Twilio] Auto-created lead from call', CallSid);
    }
  } catch (err) {
    console.error('[Twilio] transcription DB error:', err.message);
  }

  res.sendStatus(204);
});

/**
 * GET /api/twilio/recording/:sid
 * Authenticated proxy to fetch a Twilio recording (mp3).
 * Streams the audio through the server so the admin doesn't need direct Twilio creds.
 */
router.get('/recording/:sid', async (req, res) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return res.status(500).json({ error: 'Twilio credentials not configured' });
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${req.params.sid}.mp3`;
  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const upstream = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    if (!upstream.ok) return res.status(upstream.status).json({ error: 'recording fetch failed' });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `inline; filename="${req.params.sid}.mp3"`);
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
