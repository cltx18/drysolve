const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production-drysolve';

// Auth middleware
function requireAuth(req, res, next) {
  const token = req.cookies.admin_token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// POST /api/admin/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
  res.json({ success: true, user: { username: user.username, role: user.role } });
});

router.post('/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.json({ success: true });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

// ===== DASHBOARD STATS =====
router.get('/stats', requireAuth, (req, res) => {
  const stats = {
    total_locations: db.prepare('SELECT COUNT(*) as c FROM locations WHERE active = 1').get().c,
    total_leads: db.prepare('SELECT COUNT(*) as c FROM leads').get().c,
    new_leads: db.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'new'").get().c,
    leads_this_week: db.prepare("SELECT COUNT(*) as c FROM leads WHERE created_at >= datetime('now', '-7 days')").get().c,
    franchise_inquiries: db.prepare('SELECT COUNT(*) as c FROM franchise_inquiries').get().c,
    new_franchise_inquiries: db.prepare("SELECT COUNT(*) as c FROM franchise_inquiries WHERE status = 'new'").get().c,
    total_calls: db.prepare('SELECT COUNT(*) as c FROM calls').get().c,
    calls_this_week: db.prepare("SELECT COUNT(*) as c FROM calls WHERE created_at >= datetime('now', '-7 days')").get().c,
    missed_calls: db.prepare("SELECT COUNT(*) as c FROM calls WHERE status IN ('no-answer','busy','failed')").get().c,
    leads_by_state: db.prepare(`
      SELECT state, COUNT(*) as count FROM leads
      WHERE state IS NOT NULL GROUP BY state ORDER BY count DESC LIMIT 10
    `).all(),
    recent_leads: db.prepare(`
      SELECT l.*, loc.name as location_name FROM leads l
      LEFT JOIN locations loc ON l.location_id = loc.id
      ORDER BY l.created_at DESC LIMIT 10
    `).all(),
    recent_calls: db.prepare(`
      SELECT c.*, loc.name as location_name FROM calls c
      LEFT JOIN locations loc ON c.location_id = loc.id
      ORDER BY c.created_at DESC LIMIT 10
    `).all()
  };
  res.json(stats);
});

// ===== LOCATIONS CRUD =====
router.get('/locations', requireAuth, (req, res) => {
  const locations = db.prepare(`
    SELECT l.*, (SELECT COUNT(*) FROM leads WHERE location_id = l.id) as lead_count
    FROM locations l ORDER BY l.featured DESC, l.created_at DESC
  `).all();
  res.json({ locations });
});

router.post('/locations', requireAuth, (req, res) => {
  try {
    const {
      slug, name, city, state, zip_codes, phone, email, address,
      latitude, longitude, service_radius_miles, services, owner_name,
      license_number, iicrc_certified, featured,
      yelp_url, angi_url, thirtythree_mile_url, inquirly_url, trello_url
    } = req.body;

    if (!slug || !name || !city || !state || !phone) {
      return res.status(400).json({ error: 'slug, name, city, state, phone required' });
    }

    const result = db.prepare(`
      INSERT INTO locations
      (slug, name, city, state, zip_codes, phone, email, address, latitude, longitude,
       service_radius_miles, services, owner_name, license_number, iicrc_certified, featured,
       yelp_url, angi_url, thirtythree_mile_url, inquirly_url, trello_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      slug, name, city, state, zip_codes || null, phone, email || null, address || null,
      latitude || null, longitude || null, service_radius_miles || 50,
      Array.isArray(services) ? services.join(',') : (services || null),
      owner_name || null, license_number || null,
      iicrc_certified ? 1 : 0, featured ? 1 : 0,
      yelp_url || null, angi_url || null, thirtythree_mile_url || null,
      inquirly_url || null, trello_url || null
    );

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Slug already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.put('/locations/:id', requireAuth, (req, res) => {
  try {
    const {
      slug, name, city, state, zip_codes, phone, email, address,
      latitude, longitude, service_radius_miles, services, owner_name,
      license_number, iicrc_certified, featured, active,
      yelp_url, angi_url, thirtythree_mile_url, inquirly_url, trello_url
    } = req.body;

    db.prepare(`
      UPDATE locations SET
        slug = ?, name = ?, city = ?, state = ?, zip_codes = ?, phone = ?, email = ?,
        address = ?, latitude = ?, longitude = ?, service_radius_miles = ?,
        services = ?, owner_name = ?, license_number = ?, iicrc_certified = ?,
        featured = ?, active = ?,
        yelp_url = ?, angi_url = ?, thirtythree_mile_url = ?,
        inquirly_url = ?, trello_url = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      slug, name, city, state, zip_codes || null, phone, email || null, address || null,
      latitude || null, longitude || null, service_radius_miles || 50,
      Array.isArray(services) ? services.join(',') : (services || null),
      owner_name || null, license_number || null,
      iicrc_certified ? 1 : 0, featured ? 1 : 0,
      active !== undefined ? (active ? 1 : 0) : 1,
      yelp_url || null, angi_url || null, thirtythree_mile_url || null,
      inquirly_url || null, trello_url || null,
      req.params.id
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/locations/:id', requireAuth, (req, res) => {
  db.prepare('UPDATE locations SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ===== LEADS =====
router.get('/leads', requireAuth, (req, res) => {
  const { status, location_id, limit = 100 } = req.query;
  let sql = `
    SELECT l.*, loc.name as location_name, loc.city as location_city
    FROM leads l LEFT JOIN locations loc ON l.location_id = loc.id
    WHERE 1=1
  `;
  const params = [];
  if (status) { sql += ' AND l.status = ?'; params.push(status); }
  if (location_id) { sql += ' AND l.location_id = ?'; params.push(location_id); }
  sql += ' ORDER BY l.created_at DESC LIMIT ?';
  params.push(parseInt(limit));

  const leads = db.prepare(sql).all(...params);
  res.json({ leads });
});

router.put('/leads/:id', requireAuth, (req, res) => {
  const { status, location_id } = req.body;
  if (status) {
    db.prepare('UPDATE leads SET status = ? WHERE id = ?').run(status, req.params.id);
  }
  if (location_id) {
    db.prepare('UPDATE leads SET location_id = ? WHERE id = ?').run(location_id, req.params.id);
  }
  res.json({ success: true });
});

// ===== FRANCHISE INQUIRIES =====
router.get('/franchise', requireAuth, (req, res) => {
  const inquiries = db.prepare(`
    SELECT * FROM franchise_inquiries ORDER BY created_at DESC
  `).all();
  res.json({ inquiries });
});

router.put('/franchise/:id', requireAuth, (req, res) => {
  const { status, notes } = req.body;
  db.prepare(`
    UPDATE franchise_inquiries SET status = COALESCE(?, status), notes = COALESCE(?, notes)
    WHERE id = ?
  `).run(status || null, notes || null, req.params.id);
  res.json({ success: true });
});

// ===== CALLS =====
router.get('/calls', requireAuth, (req, res) => {
  const { status, location_id, limit = 100 } = req.query;
  let sql = `
    SELECT c.*, loc.name as location_name, loc.city as location_city
    FROM calls c LEFT JOIN locations loc ON c.location_id = loc.id
    WHERE 1=1
  `;
  const params = [];
  if (status) { sql += ' AND c.status = ?'; params.push(status); }
  if (location_id) { sql += ' AND c.location_id = ?'; params.push(location_id); }
  sql += ' ORDER BY c.created_at DESC LIMIT ?';
  params.push(parseInt(limit));

  const calls = db.prepare(sql).all(...params);
  res.json({ calls });
});

router.get('/calls/:id', requireAuth, (req, res) => {
  const call = db.prepare(`
    SELECT c.*, loc.name as location_name, loc.city as location_city, loc.phone as location_phone
    FROM calls c LEFT JOIN locations loc ON c.location_id = loc.id
    WHERE c.id = ?
  `).get(req.params.id);
  if (!call) return res.status(404).json({ error: 'Call not found' });
  res.json({ call });
});

router.put('/calls/:id', requireAuth, (req, res) => {
  const { status, notes, location_id } = req.body;
  db.prepare(`
    UPDATE calls
    SET status = COALESCE(?, status),
        notes = COALESCE(?, notes),
        location_id = COALESCE(?, location_id)
    WHERE id = ?
  `).run(status || null, notes || null, location_id || null, req.params.id);
  res.json({ success: true });
});

module.exports = router;
