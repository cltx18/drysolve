const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../db');

// POST /api/franchise - franchise inquiry submission
router.post('/', async (req, res) => {
  try {
    const {
      first_name, last_name, email, phone,
      address, city, state, zip,
      target_market, liquid_capital, net_worth,
      timeline, industry_experience, referral_source, message
    } = req.body;

    if (!first_name || !last_name || !email || !phone) {
      return res.status(400).json({ error: 'Name, email, and phone are required' });
    }

    const result = db.prepare(`
      INSERT INTO franchise_inquiries
      (first_name, last_name, email, phone, address, city, state, zip,
       target_market, liquid_capital, net_worth, timeline, industry_experience, referral_source, message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      first_name, last_name, email, phone,
      address || null, city || null, state || null, zip || null,
      target_market || null, liquid_capital || null, net_worth || null,
      timeline || null, industry_experience || null, referral_source || null, message || null
    );

    // Forward to GHL
    if (process.env.GHL_FRANCHISE_WEBHOOK) {
      try {
        await axios.post(process.env.GHL_FRANCHISE_WEBHOOK, {
          inquiry_id: result.lastInsertRowid,
          first_name, last_name, email, phone,
          address, city, state, zip,
          target_market, liquid_capital, net_worth,
          timeline, industry_experience, referral_source, message,
          source: 'drysolverestoration.com/franchise',
          tag: 'franchise_inquiry'
        }, { timeout: 5000 });
      } catch (e) {
        console.error('GHL franchise webhook failed:', e.message);
      }
    }

    res.json({
      success: true,
      inquiry_id: result.lastInsertRowid,
      message: 'Thank you for your interest. Our franchise development team will reach out within 1 business day.'
    });
  } catch (err) {
    console.error('Franchise inquiry error:', err);
    res.status(500).json({ error: 'Submission failed. Please try again.' });
  }
});

module.exports = router;
