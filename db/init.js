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
    yelp_url TEXT,
    angi_url TEXT,
    thirtythree_mile_url TEXT,
    inquirly_url TEXT,
    trello_url TEXT,
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
    gclid TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_term TEXT,
    utm_content TEXT,
    conversion_uploaded INTEGER DEFAULT 0,
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

  CREATE TABLE IF NOT EXISTS calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_sid TEXT UNIQUE NOT NULL,
    from_number TEXT,
    to_number TEXT,
    direction TEXT,
    status TEXT,
    duration_seconds INTEGER,
    location_id INTEGER,
    recording_sid TEXT,
    recording_url TEXT,
    recording_duration INTEGER,
    transcription_sid TEXT,
    transcription_text TEXT,
    transcription_status TEXT,
    caller_city TEXT,
    caller_state TEXT,
    caller_zip TEXT,
    answered_by TEXT,
    forwarded_to TEXT,
    lead_id INTEGER,
    notes TEXT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (location_id) REFERENCES locations(id),
    FOREIGN KEY (lead_id) REFERENCES leads(id)
  );

  CREATE INDEX IF NOT EXISTS idx_locations_slug ON locations(slug);
  CREATE INDEX IF NOT EXISTS idx_locations_state ON locations(state);
  CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
  CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
  CREATE INDEX IF NOT EXISTS idx_franchise_status ON franchise_inquiries(status);
  CREATE INDEX IF NOT EXISTS idx_calls_sid ON calls(call_sid);
  CREATE INDEX IF NOT EXISTS idx_calls_created ON calls(created_at);
  CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
`);

// Migration: add profile-link columns to existing locations table (idempotent)
const profileLinkCols = ['yelp_url', 'angi_url', 'thirtythree_mile_url', 'inquirly_url', 'trello_url'];
const existingCols = db.prepare("PRAGMA table_info(locations)").all().map(c => c.name);
for (const col of profileLinkCols) {
  if (!existingCols.includes(col)) {
    db.exec(`ALTER TABLE locations ADD COLUMN ${col} TEXT`);
    console.log(`✓ Added column locations.${col}`);
  }
}

// Migration: add attribution columns to existing leads table (idempotent)
const leadAttrCols = {
  gclid: 'TEXT',
  utm_source: 'TEXT',
  utm_medium: 'TEXT',
  utm_campaign: 'TEXT',
  utm_term: 'TEXT',
  utm_content: 'TEXT',
  conversion_uploaded: 'INTEGER DEFAULT 0'
};
const existingLeadCols = db.prepare("PRAGMA table_info(leads)").all().map(c => c.name);
for (const [col, type] of Object.entries(leadAttrCols)) {
  if (!existingLeadCols.includes(col)) {
    db.exec(`ALTER TABLE leads ADD COLUMN ${col} ${type}`);
    console.log(`✓ Added column leads.${col}`);
  }
}

// Seed top US restoration metros (idempotent — only inserts if slug doesn't exist)
const metros = [
  {
    slug: 'denver-co',
    name: 'DrySolve Restoration of Denver',
    city: 'Denver', state: 'CO',
    address: '1000 E 73rd Ave Ste. 7309, Denver, CO 80229',
    phone: process.env.TWILIO_PHONE || '+17207613601',
    email: 'denver@drysolverestoration.com',
    lat: 39.8237, lng: -104.9772,
    radius: 50, featured: 1, owner: 'Logan',
    zips: '80014,80016,80017,80022,80031,80123,80127,80202,80203,80204,80205,80206,80207,80209,80210,80211,80212,80214,80215,80216,80218,80219,80220,80221,80222,80223,80224,80226,80227,80228,80229,80230,80231,80232,80233,80234,80235,80236,80237,80238,80239,80246,80247,80249'
  },
  {
    slug: 'austin-tx',
    name: 'DrySolve Restoration of Austin',
    city: 'Austin', state: 'TX',
    address: 'Austin, TX',
    phone: '+15124000279',
    email: 'austin@drysolverestoration.com',
    lat: 30.2672, lng: -97.7431,
    radius: 50, featured: 0, owner: null,
    zips: '78701,78702,78703,78704,78705,78712,78717,78719,78721,78722,78723,78724,78725,78726,78727,78728,78729,78730,78731,78732,78733,78734,78735,78736,78737,78738,78739,78741,78742,78744,78745,78746,78747,78748,78749,78750,78751,78752,78753,78754,78756,78757,78758,78759,78610,78613,78617,78620,78621,78626,78628,78633,78634,78641,78645,78652,78653,78660,78664,78665,78669,78681'
  },
  {
    slug: 'dallas-tx',
    name: 'DrySolve Restoration of Dallas–Fort Worth',
    city: 'Dallas', state: 'TX',
    address: 'Dallas, TX',
    phone: process.env.TWILIO_PHONE || '+17207613601',
    email: 'dallas@drysolverestoration.com',
    lat: 32.7767, lng: -96.7970,
    radius: 60, featured: 0, owner: null,
    zips: '75201,75202,75203,75204,75205,75206,75207,75208,75209,75210,75211,75212,75214,75215,75216,75217,75218,75219,75220,75223,75224,75225,75226,75227,75228,75229,75230,75231,75232,75233,75234,75235,75236,75237,75238,75240,75241,75243,75244,75246,75247,75248,75249,75251,75252,75253,75254,76101,76102,76103,76104,76105,76106,76107,76108,76109,76110,76111,76112,76113,76114,76115,76116,76117,76118,76119,76120,76123,76126,76129,76131,76132,76133,76134,76135,76137,76140,76148,76155,76164,76177,76179,76180,76182,76244'
  },
  {
    slug: 'houston-tx',
    name: 'DrySolve Restoration of Houston',
    city: 'Houston', state: 'TX',
    address: 'Houston, TX',
    phone: process.env.TWILIO_PHONE || '+17207613601',
    email: 'houston@drysolverestoration.com',
    lat: 29.7604, lng: -95.3698,
    radius: 60, featured: 0, owner: null,
    zips: '77001,77002,77003,77004,77005,77006,77007,77008,77009,77010,77011,77012,77013,77014,77015,77016,77017,77018,77019,77020,77021,77022,77023,77024,77025,77026,77027,77028,77029,77030,77031,77032,77033,77034,77035,77036,77037,77038,77039,77040,77041,77042,77043,77044,77045,77046,77047,77048,77049,77050,77051,77053,77054,77055,77056,77057,77058,77059,77060,77061,77062,77063,77064,77065,77066,77067,77068,77069,77070,77071,77072,77073,77074,77075,77076,77077,77078,77079,77080,77081,77082,77083,77084,77085,77086,77087,77088,77089,77090,77091,77092,77093,77094,77095,77096,77098,77099'
  },
  {
    slug: 'phoenix-az',
    name: 'DrySolve Restoration of Phoenix',
    city: 'Phoenix', state: 'AZ',
    address: 'Phoenix, AZ',
    phone: process.env.TWILIO_PHONE || '+17207613601',
    email: 'phoenix@drysolverestoration.com',
    lat: 33.4484, lng: -112.0740,
    radius: 60, featured: 0, owner: null,
    zips: '85001,85003,85004,85006,85007,85008,85009,85012,85013,85014,85015,85016,85017,85018,85019,85020,85021,85022,85023,85024,85027,85028,85029,85031,85032,85033,85034,85035,85037,85040,85041,85042,85043,85044,85045,85048,85050,85051,85053,85054,85083,85085,85086,85087,85201,85202,85203,85204,85205,85206,85207,85208,85210,85212,85213,85215,85224,85225,85226,85233,85234,85248,85249,85250,85251,85253,85254,85255,85256,85257,85258,85259,85260,85262,85266,85268,85281,85282,85283,85284,85286,85295,85297,85298'
  },
  {
    slug: 'salt-lake-city-ut',
    name: 'DrySolve Restoration of Salt Lake City',
    city: 'Salt Lake City', state: 'UT',
    address: 'Salt Lake City, UT',
    phone: process.env.TWILIO_PHONE || '+17207613601',
    email: 'slc@drysolverestoration.com',
    lat: 40.7608, lng: -111.8910,
    radius: 50, featured: 0, owner: null,
    zips: '84101,84102,84103,84104,84105,84106,84107,84108,84109,84111,84112,84113,84115,84116,84117,84118,84119,84120,84121,84123,84124,84128,84129,84003,84004,84005,84010,84014,84015,84020,84025,84037,84040,84041,84043,84044,84047,84054,84057,84058,84062,84065,84070,84074,84084,84088,84092,84093,84094,84095,84096,84097'
  },
  {
    slug: 'las-vegas-nv',
    name: 'DrySolve Restoration of Las Vegas',
    city: 'Las Vegas', state: 'NV',
    address: 'Las Vegas, NV',
    phone: process.env.TWILIO_PHONE || '+17207613601',
    email: 'lasvegas@drysolverestoration.com',
    lat: 36.1699, lng: -115.1398,
    radius: 50, featured: 0, owner: null,
    zips: '89101,89102,89103,89104,89106,89107,89108,89109,89110,89113,89115,89117,89118,89119,89120,89121,89122,89123,89124,89128,89129,89130,89131,89134,89135,89138,89139,89141,89142,89143,89144,89145,89146,89147,89148,89149,89156,89166,89169,89178,89179,89183,89002,89011,89012,89014,89015,89030,89031,89032,89074,89081,89084,89085,89086,89096'
  },
  {
    slug: 'kansas-city-mo',
    name: 'DrySolve Restoration of Kansas City',
    city: 'Kansas City', state: 'MO',
    address: 'Kansas City, MO',
    phone: process.env.TWILIO_PHONE || '+17207613601',
    email: 'kc@drysolverestoration.com',
    lat: 39.0997, lng: -94.5786,
    radius: 60, featured: 0, owner: null,
    zips: '64101,64102,64105,64106,64108,64109,64110,64111,64112,64113,64114,64116,64117,64118,64119,64120,64123,64124,64125,64126,64127,64128,64129,64130,64131,64132,64133,64134,64136,64137,64138,64139,64145,64146,64147,64149,64151,64152,64153,64154,64155,64156,64157,64158,64161,64163,64164,64165,64166,64167,66101,66102,66103,66104,66105,66106,66109,66111,66112,66115,66118'
  }
];

const insertLoc = db.prepare(`
  INSERT INTO locations (slug, name, city, state, zip_codes, phone, email, address,
                          latitude, longitude, service_radius_miles, services,
                          owner_name, featured, iicrc_certified, active)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
  ON CONFLICT(slug) DO NOTHING
`);

let seededCount = 0;
for (const m of metros) {
  const result = insertLoc.run(
    m.slug, m.name, m.city, m.state, m.zips,
    m.phone, m.email, m.address,
    m.lat, m.lng, m.radius,
    'water_damage,storm_damage,commercial',
    m.owner, m.featured
  );
  if (result.changes > 0) seededCount++;
}
if (seededCount > 0) console.log(`✓ Seeded ${seededCount} new metro location(s)`);

// Migration: ensure Denver location has the correct street address (idempotent)
db.prepare(`
  UPDATE locations
  SET address = ?, latitude = ?, longitude = ?
  WHERE slug = 'denver-co' AND (address IS NULL OR address NOT LIKE '%73rd Ave%')
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
