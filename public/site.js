// DrySolve Restoration - Global Site JS

// Mobile nav toggle
document.addEventListener('DOMContentLoaded', () => {
  const hamburger = document.querySelector('.hamburger');
  const nav = document.querySelector('.nav');
  if (hamburger && nav) {
    hamburger.addEventListener('click', () => nav.classList.toggle('open'));
  }

  // Auto-detect location on pages with the finder
  const finder = document.getElementById('location-finder');
  if (finder) initLocationFinder();
});

async function initLocationFinder() {
  const finder = document.getElementById('location-finder');
  const resultEl = document.getElementById('lf-result');
  const detectedBannerEl = document.getElementById('lf-detected-banner');

  // Try IP-based detection silently
  try {
    const geoResp = await fetch('/api/geo/ip');
    const geo = await geoResp.json();
    if (geo.lat && geo.lng) {
      const nearestResp = await fetch(`/api/locations/nearest?lat=${geo.lat}&lng=${geo.lng}`);
      const nearestData = await nearestResp.json();
      if (nearestData.nearest) {
        showDetectedLocation(geo, nearestData);
      }
    }
  } catch (e) {
    console.warn('IP geo failed', e);
  }

  // Manual zip lookup
  const zipInput = document.getElementById('lf-zip');
  const goBtn = document.getElementById('lf-go');
  if (goBtn) goBtn.addEventListener('click', () => lookupZip(zipInput.value));
  if (zipInput) zipInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') lookupZip(zipInput.value);
  });

  // Browser geolocation
  const geoBtn = document.getElementById('lf-geo');
  if (geoBtn) geoBtn.addEventListener('click', () => {
    if (!navigator.geolocation) return alert('Geolocation not supported');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const r = await fetch(`/api/locations/nearest?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`);
      const data = await r.json();
      renderNearest(data);
    }, () => alert('Could not get your location'));
  });
}

function showDetectedLocation(geo, nearestData) {
  const finder = document.getElementById('location-finder');
  const banner = document.getElementById('lf-detected-banner');
  if (!nearestData.nearest) return;
  finder.classList.add('detected');
  if (banner) {
    const inService = nearestData.in_service_area;
    banner.innerHTML = inService
      ? `<strong>We've found your local DrySolve</strong>Serving ${geo.city}, ${geo.state} — ${nearestData.nearest.name} is ${Math.round(nearestData.nearest.distance)} miles away.`
      : `<strong>Detected: ${geo.city}, ${geo.state}</strong>Nearest location is ${nearestData.nearest.name} (${Math.round(nearestData.nearest.distance)} mi). Enter your zip to confirm coverage.`;
  }
  renderNearest(nearestData);
}

async function lookupZip(zip) {
  zip = (zip || '').trim();
  if (!/^\d{5}$/.test(zip)) return alert('Please enter a valid 5-digit zip code');
  const r = await fetch(`/api/locations/nearest?zip=${zip}`);
  const data = await r.json();
  renderNearest(data);
}

function renderNearest(data) {
  const resultEl = document.getElementById('lf-result');
  if (!resultEl) return;
  if (!data.nearest) {
    resultEl.innerHTML = `<div class="lf-result-card"><div class="city">No location found yet</div><p style="color:#64748b;font-size:14px;margin-top:8px">Call us — we're rapidly expanding and may already serve your area.</p><a href="tel:+17207613601" class="phone">(720) 761-3601</a></div>`;
    resultEl.classList.add('active');
    return;
  }
  const n = data.nearest;
  const phoneHref = (n.phone || '').replace(/\D/g, '');
  const inService = data.in_service_area;
  resultEl.innerHTML = `
    <div class="lf-result-card">
      <div class="city">${n.name}</div>
      <div class="distance">${Math.round(n.distance)} miles away ${inService ? '— in your service area' : '— outside primary service area'}</div>
      <a href="tel:+1${phoneHref}" class="phone">${formatPhone(n.phone)}</a>
      <a href="/locations/${n.slug}" class="btn btn-outline" style="margin-top:8px;font-size:14px;padding:10px 18px;">View Location Details</a>
    </div>
  `;
  resultEl.classList.add('active');
}

function formatPhone(p) {
  if (!p) return '';
  const d = p.replace(/\D/g, '').slice(-10);
  return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
}

// Generic form submission helper
async function submitForm(formEl, endpoint, successMsg) {
  const data = Object.fromEntries(new FormData(formEl).entries());
  const errorEl = formEl.querySelector('.form-error');
  const successEl = formEl.querySelector('.form-success');
  if (errorEl) errorEl.classList.remove('active');
  if (successEl) successEl.classList.remove('active');

  const btn = formEl.querySelector('button[type=submit]');
  const originalText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }

  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await r.json();
    if (!r.ok) throw new Error(json.error || 'Submission failed');
    if (successEl) {
      successEl.textContent = successMsg || json.message || 'Thanks — we will be in touch.';
      successEl.classList.add('active');
    }
    formEl.reset();
    if (window.gtag) gtag('event', 'form_submit', { event_category: 'lead', event_label: endpoint });
  } catch (err) {
    if (errorEl) { errorEl.textContent = err.message; errorEl.classList.add('active'); }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
  }
}
