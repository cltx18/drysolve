# DrySolve Restoration

ServPro-style multi-location restoration franchise platform with backend admin, lead routing, and franchise inquiry intake.

**Stack:** Node/Express · better-sqlite3 · Twilio · Railway

---

## What's Built

### Public site
- **Homepage** — hero with auto-detect location finder + ZIP lookup + browser geo
- **Service pages** — Water Damage, Storm Damage, Commercial (with inline lead forms)
- **Franchise page** — full inquiry form with capital/experience qualification
- **Locations page** — finder + list of all active franchise locations
- **Location detail pages** — `/locations/:slug` (loads dynamically from API)
- **About, Contact, 404**
- **SEO:** sitemap.xml, robots.txt, structured data, Open Graph

### Backend
- `POST /api/leads` — Capture customer leads (auto-routes by ZIP/city to nearest location, forwards to GHL webhook)
- `POST /api/franchise` — Capture franchise inquiries (forwards to GHL)
- `GET /api/locations` — List all active locations
- `GET /api/locations/nearest?zip=XXXXX` — Haversine-distance nearest finder
- `GET /api/locations/:slug` — Single location detail
- `GET /api/geo/ip` — IP-based location detection (free, no API key)
- `POST /api/admin/login` — JWT auth with httpOnly cookie
- Admin CRUD endpoints for locations, leads, franchise inquiries

### Admin dashboard (`/admin`)
- Overview: stats, recent leads, leads-by-state
- Locations: add/edit/disable franchise locations (slug, coordinates, ZIPs, services, owner, license, IICRC flag, featured flag)
- Leads: filter by status, update status inline
- Franchise inquiries: detail view with notes + status

### Database
- Seeds Denver flagship location on first run (`/locations/denver-co`)
- Seeds admin user: `admin` / `DrySolve2026!` (override via `ADMIN_PASSWORD`)

---

## Local development

```bash
npm install
cp .env.example .env
# Edit .env with your values
node db/init.js
npm start
```

Visit:
- Public site: http://localhost:3000
- Admin: http://localhost:3000/admin (login: admin / DrySolve2026!)

---

## Railway deployment

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial DrySolve build"
git remote add origin https://github.com/YOUR-USERNAME/drysolve.git
git push -u origin main
```

### 2. Create Railway project
- New Project → Deploy from GitHub Repo → select your `drysolve` repo
- Railway auto-detects Node and builds

### 3. Add a Volume for SQLite persistence
**CRITICAL** — without this, your DB resets on every deploy.

- In your Railway service, go to **Variables → Volume**
- Mount path: `/data`
- Size: 1GB (plenty)

### 4. Set environment variables
In Railway → Variables tab, add:

| Variable | Value |
|----------|-------|
| `PORT` | `3000` |
| `NODE_ENV` | `production` |
| `DB_PATH` | `/data/drysolve.db` |
| `TWILIO_PHONE` | `+17207706366` |
| `ADMIN_PASSWORD` | Strong password |
| `JWT_SECRET` | Long random string (32+ chars) |
| `GHL_LEAD_WEBHOOK` | Your GHL inbound webhook URL for leads |
| `GHL_FRANCHISE_WEBHOOK` | Your GHL inbound webhook URL for franchise inquiries |

### 5. Wait for deploy
Railway will run `node db/init.js && node server.js` per `railway.json`.

### 6. Verify
- Visit `https://your-app.up.railway.app/health` → should return `{"status":"ok"}`
- Visit `/admin` → login with your admin credentials
- Visit `/` → should auto-detect your location and route to Denver

---

## GoDaddy DNS → drysolverestoration.com

In your Railway service → Settings → Networking → add custom domain `drysolverestoration.com` (and `www.drysolverestoration.com`).

Railway will give you DNS targets. In GoDaddy DNS Manager:

| Type | Name | Value |
|------|------|-------|
| A | @ | `66.33.22.1` |
| CNAME | www | `YOUR-RAILWAY-SUBDOMAIN.up.railway.app` |

DNS propagation: 5 minutes to a few hours. Railway auto-provisions SSL via Let's Encrypt.

---

## GoHighLevel webhook setup

To forward leads + franchise inquiries to GHL:

1. In GHL → Automation → Workflows → create a workflow triggered by **Inbound Webhook**
2. Copy the webhook URL
3. Add it to Railway env as `GHL_LEAD_WEBHOOK` (and one for `GHL_FRANCHISE_WEBHOOK`)
4. Map the JSON fields to GHL contact fields in your workflow

Lead payload structure:
```json
{
  "lead_id": 1,
  "location_id": 1,
  "first_name": "John",
  "last_name": "Smith",
  "full_name": "John Smith",
  "phone": "+17205550100",
  "email": "john@example.com",
  "address": "123 Main St",
  "city": "Denver",
  "state": "CO",
  "zip": "80202",
  "service_type": "water_damage",
  "urgency": "emergency",
  "message": "...",
  "source": "drysolverestoration.com"
}
```

Franchise inquiry adds `tag: "franchise_inquiry"` plus the financial qualification fields.

---

## Adding a new franchise location

Two options:

**Option A — via admin UI:**
1. Sign in to `/admin`
2. Locations tab → "+ Add Location"
3. Fill out slug, name, city, state, phone, lat/lng, ZIP codes, services
4. Save

**Option B — via SQL:**
```sql
INSERT INTO locations (slug, name, city, state, zip_codes, phone, latitude, longitude, services, featured)
VALUES ('phoenix-az', 'DrySolve of Phoenix', 'Phoenix', 'AZ', '85001,85002,...', '+16025550100', 33.4484, -112.0740, 'water_damage,storm_damage,commercial', 1);
```

Once added, the location is immediately:
- Discoverable in the location finder
- Listed at `/locations`
- Has its own page at `/locations/phoenix-az`
- Routes leads by ZIP/city automatically

---

## Architecture notes

- **`app.set('trust proxy', 1)`** — required for Railway because the proxy strips client IPs. Without it, `req.ip` returns the proxy's IP and Twilio webhooks hang.
- **Lead routing** — incoming leads are matched first by ZIP, then by city fallback, against the `locations` table.
- **Distance calculation** — Haversine formula in miles.
- **IP geo** — uses free `ip-api.com` (no API key, 45 req/min limit per IP) with Denver fallback.
- **ZIP lookup** — uses free `zippopotam.us` (no API key).
- **JWT** — stored in httpOnly cookie, expires in 7 days.

---

## Future work

- Add Stripe for franchise application fee collection
- Add SMS notifications to local owners on new leads (via Twilio)
- Add maps (Mapbox or Google) to location pages
- Add a customer review system
- Add Vendor portal for franchisees to view their own leads (similar to RestoreLink)
- Add GA4 + Meta Pixel for conversion tracking

---

## License

Proprietary © 2026 DrySolve Restoration
