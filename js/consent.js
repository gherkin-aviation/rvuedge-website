/* ============================================
   RVU Edge — Analytics consent
   Google Analytics loads only after the visitor clicks Accept.
   Until then, or after Decline, nothing is sent to Google.
   ============================================ */

(function () {
  'use strict';

  var GA_ID = 'G-H9Y3GE1661';
  var KEY = 'rvuedge-analytics-consent';
  var banner = null;

  function readChoice() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function saveChoice(value) {
    try { localStorage.setItem(KEY, value); } catch (e) { /* private mode */ }
  }

  function addScript(src) {
    var s = document.createElement('script');
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  }

  // Also removes cookies set before this banner existed.
  function clearAnalyticsCookies() {
    var host = location.hostname;
    var domains = ['', host, '.' + host.replace(/^www\./, '')];
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (!/^(_ga|_gid|_gat)/.test(name)) return;
      domains.forEach(function (d) {
        document.cookie = name + '=; Max-Age=0; path=/' + (d ? '; domain=' + d : '');
      });
    });
  }

  function startAnalytics() {
    if (typeof window.gtag === 'function') return;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });

    addScript('https://www.googletagmanager.com/gtag/js?id=' + GA_ID);
    addScript('/js/analytics.js');
  }

  function stopAnalytics() {
    window['ga-disable-' + GA_ID] = true;
    clearAnalyticsCookies();
    // Withdrawn after accepting on this page: Google's code is already in
    // memory, so reload. The reloaded page sees "denied" and loads none of it.
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', { analytics_storage: 'denied' });
      location.reload();
    }
  }

  function hideBanner() {
    if (banner) banner.remove();
    banner = null;
  }

  function choose(value) {
    saveChoice(value);
    hideBanner();
    if (value === 'granted') startAnalytics();
    else stopAnalytics();
  }

  function showBanner(focus) {
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'consent-banner';
      banner.setAttribute('role', 'region');
      banner.setAttribute('aria-label', 'Cookie consent');
      banner.innerHTML =
        '<p class="consent-text">We use Google Analytics cookies to see which pages are useful. ' +
        'They stay off unless you allow them. <a href="/privacy/#website">Privacy Policy</a></p>' +
        '<div class="consent-actions">' +
          '<button type="button" class="consent-btn" data-consent="denied">Decline</button>' +
          '<button type="button" class="consent-btn" data-consent="granted">Accept</button>' +
        '</div>';
      banner.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-consent]');
        if (btn) choose(btn.getAttribute('data-consent'));
      });
      document.body.appendChild(banner);
    }
    if (focus) banner.querySelector('.consent-btn').focus();
  }

  // Any element with data-cookie-settings reopens the banner.
  document.addEventListener('click', function (e) {
    var link = e.target.closest('[data-cookie-settings]');
    if (!link) return;
    e.preventDefault();
    showBanner(true);
  });

  var choice = readChoice();
  if (choice === 'granted') {
    startAnalytics();
    return;
  }
  clearAnalyticsCookies();
  if (choice === 'denied') return;
  // Global Privacy Control is a browser-wide opt-out: treat it as Decline.
  if (navigator.globalPrivacyControl === true) return;
  showBanner(false);
})();
