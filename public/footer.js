// Shared site footer - inject once, update everywhere
(function() {
  const footerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <a href="/" class="logo">
            <div class="logo-mark">DS</div>
            <span class="logo-text">DrySolve<span>.</span></span>
          </a>
          <p>24/7 emergency restoration services. Water damage, storm damage, and commercial property restoration — locally owned, IICRC-certified, on-site within 60 minutes.</p>
          <a href="tel:+17207613601" class="footer-phone">(720) 761-3601</a>
          <p style="font-size:13px;margin-bottom:0">1000 E 73rd Ave Ste. 7309<br>Denver, CO 80229</p>
          <div class="badges">
            <span class="badge">IICRC Certified</span>
            <span class="badge">Insurance Approved</span>
            <span class="badge">24/7 Response</span>
          </div>
        </div>

        <div>
          <h4>Services</h4>
          <ul>
            <li><a href="/services/water-damage">Water Damage Restoration</a></li>
            <li><a href="/services/water-damage#burst-pipes">Burst Pipe Repair</a></li>
            <li><a href="/services/water-damage#flooding">Flood Damage Cleanup</a></li>
            <li><a href="/services/water-damage#sewage">Sewage Backup</a></li>
            <li><a href="/services/water-damage#drying">Structural Drying</a></li>
            <li><a href="/services/storm-damage">Storm Damage</a></li>
            <li><a href="/services/storm-damage#wind">Wind &amp; Hail Damage</a></li>
            <li><a href="/services/storm-damage#tarping">Emergency Tarping</a></li>
            <li><a href="/services/storm-damage#boardup">Board-Up Services</a></li>
            <li><a href="/services/commercial">Commercial Restoration</a></li>
            <li><a href="/services/commercial#multi-family">Multi-Family Properties</a></li>
            <li><a href="/services/commercial#retail">Retail &amp; Hospitality</a></li>
            <li><a href="/services/commercial#large-loss">Large-Loss Response</a></li>
          </ul>
        </div>

        <div>
          <h4>Resources</h4>
          <ul>
            <li><a href="/resources">Resource Center</a></li>
            <li><a href="/resources#water-damage-guide">Water Damage Guide</a></li>
            <li><a href="/resources#storm-prep">Storm Preparation</a></li>
            <li><a href="/insurance-claims">Insurance Claims 101</a></li>
            <li><a href="/resources#property-managers">For Property Managers</a></li>
            <li><a href="/resources#iicrc">IICRC Standards Explained</a></li>
            <li><a href="/resources#xactimate">Xactimate &amp; Estimates</a></li>
            <li><a href="/resources#mitigation-process">The Mitigation Process</a></li>
            <li><a href="/service-areas">Service Areas</a></li>
            <li><a href="/faq">Frequently Asked Questions</a></li>
            <li><a href="/glossary">Restoration Glossary</a></li>
          </ul>
        </div>

        <div>
          <h4>Company</h4>
          <ul>
            <li><a href="/about">About DrySolve</a></li>
            <li><a href="/about#mission">Our Mission</a></li>
            <li><a href="/about#certifications">Certifications</a></li>
            <li><a href="/service-areas">Service Area</a></li>
            <li><a href="/contact">Contact Us</a></li>
            <li><a href="tel:+17207613601">24/7 Emergency</a></li>
            <li><a href="mailto:info@drysolverestoration.com">Email Us</a></li>
          </ul>
          <h5>Visit</h5>
          <ul>
            <li><a href="https://www.google.com/maps/dir/?api=1&destination=1000+E+73rd+Ave+Ste+7309+Denver+CO+80229" target="_blank" rel="noopener">Get Directions</a></li>
          </ul>
        </div>

        <div>
          <h4>Legal</h4>
          <ul>
            <li><a href="/privacy">Privacy Policy</a></li>
            <li><a href="/terms">Terms of Service</a></li>
            <li><a href="/accessibility">Accessibility</a></li>
            <li><a href="/sitemap.xml">Sitemap</a></li>
          </ul>
          <h5>Trust</h5>
          <ul>
            <li>IICRC Certified Firm</li>
            <li>Licensed &amp; Insured</li>
            <li>Insurance Direct-Bill</li>
          </ul>
        </div>
      </div>

      <div class="footer-bottom">
        <div>© 2026 DrySolve Restoration. All rights reserved.</div>
        <div class="footer-bottom-links">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/accessibility">Accessibility</a>
          <a href="/sitemap.xml">Sitemap</a>
        </div>
      </div>
    </div>
  `;

  function inject() {
    let target = document.getElementById('site-footer');
    if (target) {
      target.innerHTML = footerHTML;
      target.className = 'footer';
      return;
    }
    const existing = document.querySelector('footer.footer');
    if (existing) {
      existing.innerHTML = footerHTML;
      return;
    }
    const f = document.createElement('footer');
    f.className = 'footer';
    f.id = 'site-footer';
    f.innerHTML = footerHTML;
    document.body.appendChild(f);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
