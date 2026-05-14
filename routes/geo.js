const express = require('express');
const router = express.Router();
const axios = require('axios');

// GET /api/geo/ip - detect approximate location from IP
router.get('/ip', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;
    // Skip for localhost
    if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.')) {
      return res.json({ lat: 39.7392, lng: -104.9903, city: 'Denver', state: 'CO', source: 'default' });
    }
    const resp = await axios.get(`http://ip-api.com/json/${ip}?fields=status,lat,lon,city,region,zip`, { timeout: 3000 });
    if (resp.data.status === 'success') {
      return res.json({
        lat: resp.data.lat,
        lng: resp.data.lon,
        city: resp.data.city,
        state: resp.data.region,
        zip: resp.data.zip,
        source: 'ip'
      });
    }
    res.json({ lat: 39.7392, lng: -104.9903, city: 'Denver', state: 'CO', source: 'fallback' });
  } catch (err) {
    res.json({ lat: 39.7392, lng: -104.9903, city: 'Denver', state: 'CO', source: 'error' });
  }
});

module.exports = router;
