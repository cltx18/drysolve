require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy - REQUIRED for Railway/Twilio webhooks
app.set('trust proxy', 1);

// Middleware
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting for forms
const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false
});

// Routes
const locationRoutes = require('./routes/locations');
const leadRoutes = require('./routes/leads');
const franchiseRoutes = require('./routes/franchise');
const adminRoutes = require('./routes/admin');
const geoRoutes = require('./routes/geo');
const twilioRoutes = require('./routes/twilio');

app.use('/api/locations', locationRoutes);
app.use('/api/leads', formLimiter, leadRoutes);
app.use('/api/franchise', formLimiter, franchiseRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/twilio', twilioRoutes);

// Page routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/services/water-damage', (req, res) => res.sendFile(path.join(__dirname, 'public', 'water-damage.html')));
app.get('/services/storm-damage', (req, res) => res.sendFile(path.join(__dirname, 'public', 'storm-damage.html')));
app.get('/services/commercial', (req, res) => res.sendFile(path.join(__dirname, 'public', 'commercial.html')));
app.get('/contact', (req, res) => res.sendFile(path.join(__dirname, 'public', 'contact.html')));
app.get('/about', (req, res) => res.sendFile(path.join(__dirname, 'public', 'about.html')));

// Resources
app.get('/resources', (req, res) => res.sendFile(path.join(__dirname, 'public', 'resources.html')));
app.get(['/faq', '/resources/faq'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'faq.html')));
app.get(['/insurance-claims', '/resources/insurance-claims'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'insurance-claims.html')));
app.get(['/service-areas', '/resources/service-areas'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'service-areas.html')));
app.get(['/glossary', '/resources/glossary'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'glossary.html')));

// Legal
app.get('/legal', (req, res) => res.sendFile(path.join(__dirname, 'public', 'legal.html')));
app.get(['/privacy', '/legal/privacy'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy.html')));
app.get(['/terms', '/legal/terms'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'terms.html')));
app.get(['/accessibility', '/legal/accessibility'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'accessibility.html')));

// Admin
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin', 'login.html')));
app.get('/admin/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'admin', 'dashboard.html')));

// Location detail pages (dynamic)
app.get('/locations/:slug', (req, res) => res.sendFile(path.join(__dirname, 'public', 'location-detail.html')));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'DrySolve Restoration' }));

// Analytics config endpoint — injects gtag/GTM IDs from env vars
app.get('/analytics-config.js', (req, res) => {
  const conversions = {};
  try {
    if (process.env.GOOGLE_ADS_CONVERSIONS) {
      Object.assign(conversions, JSON.parse(process.env.GOOGLE_ADS_CONVERSIONS));
    }
  } catch (e) {
    console.warn('Invalid GOOGLE_ADS_CONVERSIONS JSON:', e.message);
  }
  const cfg = {
    adsId: process.env.GOOGLE_ADS_ID || null,
    gtmId: process.env.GTM_CONTAINER_ID || null,
    ga4Id: process.env.GA4_MEASUREMENT_ID || null,
    clarityId: process.env.CLARITY_PROJECT_ID || 'wqusmpw24t',
    conversions
  };
  res.type('application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(`window.DS_ANALYTICS = ${JSON.stringify(cfg)};`);
});

// Sitemap
app.get('/sitemap.xml', (req, res) => res.sendFile(path.join(__dirname, 'public', 'sitemap.xml')));
app.get('/robots.txt', (req, res) => res.sendFile(path.join(__dirname, 'public', 'robots.txt')));

// 404
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.listen(PORT, () => {
  console.log(`🌊 DrySolve Restoration running on port ${PORT}`);
});
