const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'drysolve.db');

// Ensure directory exists for Railway volume
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Franchise/Locations table
db.exec(`
  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    zip_codes TEXT,
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT,
    latitude REAL,
    longitude REAL,
    service_radius_miles INTEGER DEFAULT 50,
    services TEXT,
    owner_name TEXT,
    license_number TEXT,
    iicrc_certified INTEGER DEFAULT 1,
    active INTEGER DEFAULT 1,
    featured INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    service_type TEXT,
    urgency TEXT,
    message TEXT,
    source TEXT DEFAULT 'website',
    status TEXT DEFAULT 'new',
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (location_id) REFERENCES locations(id)
  );

  CREATE TABLE IF NOT EXISTS franchise_inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    target_market TEXT,
    liquid_capital TEXT,
    net_worth TEXT,
    timeline TEXT,
    industry_experience TEXT,
    referral_source TEXT,
    message TEXT,
    status TEXT DEFAULT 'new',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_locations_slug ON locations(slug);
  CREATE INDEX IF NOT EXISTS idx_locations_state ON locations(state);
  CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
  CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
  CREATE INDEX IF NOT EXISTS idx_franchise_status ON franchise_inquiries(status);
`);

// Seed the flagship Denver location
const existing = db.prepare('SELECT COUNT(*) as count FROM locations').get();
if (existing.count === 0) {
  const insertLoc = db.prepare(`
    INSERT INTO locations (slug, name, city, state, zip_codes, phone, email, address, latitude, longitude, service_radius_miles, services, owner_name, featured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertLoc.run(
    'denver-co',
    'DrySolve Restoration of Denver',
    'Denver',
    'CO',
    '80014,80016,80017,80022,80031,80123,80127,80202,80203,80204,80205,80206,80207,80209,80210,80211,80212,80214,80215,80216,80218,80219,80220,80221,80222,80223,80224,80226,80227,80228,80229,80230,80231,80232,80233,80234,80235,80236,80237,80238,80239,80246,80247,80249',
    process.env.TWILIO_PHONE || '+17207613601',
    'denver@drysolverestoration.com',
    '1000 E 73rd Ave Ste. 7309, Denver, CO 80229',
    39.8237,
    -104.9772,
    50,
    'water_damage,storm_damage,commercial',
    'Logan',
    1
  );

  console.log('✓ Seeded flagship Denver location');
}

// Migration: ensure Denver location has the correct street address (idempotent)
db.prepare(`
  UPDATE locations
  SET address = ?, latitude = ?, longitude = ?
  WHERE slug = 'denver-co'
`).run('1000 E 73rd Ave Ste. 7309, Denver, CO 80229', 39.8237, -104.9772);

// Seed admin user
const adminExists = db.prepare('SELECT COUNT(*) as count FROM admin_users').get();
if (adminExists.count === 0) {
  const defaultPassword = process.env.ADMIN_PASSWORD || 'DrySolve2026!';
  const hash = bcrypt.hashSync(defaultPassword, 10);
  db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run('admin', hash);
  console.log('✓ Seeded admin user (username: admin)');
  console.log('  Default password: ' + defaultPassword + ' (CHANGE IMMEDIATELY)');
}

console.log('✅ Database initialized at:', DB_PATH);
module.exports = db;
