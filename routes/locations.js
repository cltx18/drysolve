const express = require('express');
const router = express.Router();
const db = require('../db');

// Haversine distance in miles
function distanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// GET /api/locations - public list of all active locations
router.get('/', (req, res) => {
  try {
    const locations = db.prepare(`
      SELECT id, slug, name, city, state, phone, email, latitude, longitude, service_radius_miles, services, featured
      FROM locations WHERE active = 1
      ORDER BY featured DESC, state ASC, city ASC
    `).all();
    res.json({ locations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/locations/nearest?lat=X&lng=Y or ?zip=XXXXX
router.get('/nearest', async (req, res) => {
  try {
    let { lat, lng, zip } = req.query;

    // If zip provided, look up coords via free zip API
    if (zip && (!lat || !lng)) {
      try {
        const axios = require('axios');
        const resp = await axios.get(`https://api.zippopotam.us/us/${zip}`, { timeout: 3000 });
        if (resp.data && resp.data.places && resp.data.places[0]) {
          lat = parseFloat(resp.data.places[0].latitude);
          lng = parseFloat(resp.data.places[0].longitude);
        }
      } catch (e) {
        // fall through
      }
    }

    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat/lng or valid zip required' });
    }

    lat = parseFloat(lat);
    lng = parseFloat(lng);

    const locations = db.prepare(`
      SELECT id, slug, name, city, state, phone, email, address, latitude, longitude, service_radius_miles, services
      FROM locations WHERE active = 1 AND latitude IS NOT NULL
    `).all();

    const withDistance = locations.map(loc => ({
      ...loc,
      distance: distanceMiles(lat, lng, loc.latitude, loc.longitude),
      services: loc.services ? loc.services.split(',') : []
    })).sort((a, b) => a.distance - b.distance);

    const nearest = withDistance[0];
    const inService = nearest && nearest.distance <= nearest.service_radius_miles;

    res.json({
      nearest: nearest || null,
      in_service_area: !!inService,
      alternates: withDistance.slice(1, 4)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/locations/:slug - single location detail
router.get('/:slug', (req, res) => {
  try {
    const loc = db.prepare('SELECT * FROM locations WHERE slug = ? AND active = 1').get(req.params.slug);
    if (!loc) return res.status(404).json({ error: 'Location not found' });
    loc.services = loc.services ? loc.services.split(',') : [];
    loc.zip_codes = loc.zip_codes ? loc.zip_codes.split(',') : [];
    res.json({ location: loc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
