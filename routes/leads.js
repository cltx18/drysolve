const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../db');

// POST /api/leads - customer service request
router.post('/', async (req, res) => {
  try {
    const {
      name, phone, email, address, city, state, zip,
      service_type, urgency, message, source
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone required' });
    }

    // Find best location to assign lead based on zip/city
    let location_id = null;
    if (zip) {
      const zipMatch = db.prepare(`
        SELECT id FROM locations
        WHERE active = 1 AND zip_codes LIKE ?
        LIMIT 1
      `).get(`%${zip}%`);
      if (zipMatch) location_id = zipMatch.id;
    }
    if (!location_id && city) {
      const cityMatch = db.prepare(`
        SELECT id FROM locations WHERE active = 1 AND city = ? LIMIT 1
      `).get(city);
      if (cityMatch) location_id = cityMatch.id;
    }

    const result = db.prepare(`
      INSERT INTO leads (location_id, name, phone, email, address, city, state, zip, service_type, urgency, message, source, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      location_id,
      name,
      phone,
      email || null,
      address || null,
      city || null,
      state || null,
      zip || null,
      service_type || null,
      urgency || null,
      message || null,
      source || 'website',
      req.ip
    );

    // Forward to GoHighLevel webhook if configured
    if (process.env.GHL_LEAD_WEBHOOK) {
      try {
        await axios.post(process.env.GHL_LEAD_WEBHOOK, {
          lead_id: result.lastInsertRowid,
          location_id,
          first_name: name.split(' ')[0],
          last_name: name.split(' ').slice(1).join(' '),
          full_name: name,
          phone, email, address, city, state, zip,
          service_type, urgency, message,
          source: 'drysolverestoration.com'
        }, { timeout: 5000 });
      } catch (e) {
        console.error('GHL webhook failed:', e.message);
      }
    }

    res.json({
      success: true,
      lead_id: result.lastInsertRowid,
      message: 'A DrySolve specialist will contact you within minutes.'
    });
  } catch (err) {
    console.error('Lead submission error:', err);
    res.status(500).json({ error: 'Submission failed. Please call us directly.' });
  }
});

module.exports = router;
