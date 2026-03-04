/* ============================================
   RVU Edge — Enhanced GA4 Event Tracking
   ============================================ */

(function () {
  'use strict';

  // Safety check
  if (typeof gtag !== 'function') return;

  // ---- Helper: send GA4 event ----
  function track(eventName, params) {
    gtag('event', eventName, params || {});
  }

  // ---- CTA Button Clicks ----
  function initCTATracking() {
    // App Store download buttons
    document.querySelectorAll('a[href*="apps.apple.com"]').forEach(function (link) {
      link.addEventListener('click', function () {
        track('app_store_click', {
          link_text: link.textContent.trim().substring(0, 50),
          link_location: getSectionName(link),
        });
      });
    });

    // Watch Demo button
    document.querySelectorAll('a[href="#video"]').forEach(function (link) {
      link.addEventListener('click', function () {
        track('watch_demo_click', {
          link_location: getSectionName(link),
        });
      });
    });

    // Pricing CTAs
    document.querySelectorAll('.pricing-card a').forEach(function (link) {
      link.addEventListener('click', function () {
        var card = link.closest('.pricing-card');
        var plan = card && card.querySelector('h3') ? card.querySelector('h3').textContent.trim() : 'unknown';
        track('pricing_cta_click', {
          plan_type: plan,
          link_text: link.textContent.trim().substring(0, 50),
        });
      });
    });
  }

  // ---- Android Waitlist Form ----
  function initFormTracking() {
    var form = document.querySelector('#android-waitlist form');
    if (!form) return;

    form.addEventListener('submit', function () {
      track('android_waitlist_signup', {
        form_location: 'android_waitlist_section',
      });
    });
  }

  // ---- QuickLog Video Play ----
  function initVideoTracking() {
    var video = document.getElementById('quicklog-video');
    if (!video) return;

    var tracked25 = false, tracked50 = false, tracked75 = false, tracked100 = false;

    video.addEventListener('play', function () {
      track('video_play', { video_title: 'quicklog_demo' });
    });

    video.addEventListener('timeupdate', function () {
      if (!video.duration) return;
      var pct = (video.currentTime / video.duration) * 100;
      if (pct >= 25 && !tracked25) { tracked25 = true; track('video_progress', { video_title: 'quicklog_demo', percent: 25 }); }
      if (pct >= 50 && !tracked50) { tracked50 = true; track('video_progress', { video_title: 'quicklog_demo', percent: 50 }); }
      if (pct >= 75 && !tracked75) { tracked75 = true; track('video_progress', { video_title: 'quicklog_demo', percent: 75 }); }
      if (pct >= 100 && !tracked100) { tracked100 = true; track('video_progress', { video_title: 'quicklog_demo', percent: 100 }); }
    });
  }

  // ---- Scroll Depth Milestones ----
  function initScrollDepth() {
    var milestones = [25, 50, 75, 90];
    var fired = {};

    window.addEventListener('scroll', throttle(function () {
      var scrollPct = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100);
      milestones.forEach(function (m) {
        if (scrollPct >= m && !fired[m]) {
          fired[m] = true;
          track('scroll_depth', { percent: m, page_path: window.location.pathname });
        }
      });
    }, 300));
  }

  // ---- Section Visibility ----
  function initSectionTracking() {
    var sections = {
      '#career': 'career_journey',
      '#video': 'quicklog_video',
      '#features': 'features',
      '#gallery': 'screenshot_gallery',
      '#pricing': 'pricing',
      '#android-waitlist': 'android_waitlist',
    };

    Object.keys(sections).forEach(function (selector) {
      var el = document.querySelector(selector);
      if (!el) return;

      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            track('section_view', { section_name: sections[selector] });
            observer.disconnect();
          }
        });
      }, { threshold: 0.3 });

      observer.observe(el);
    });
  }

  // ---- Comparison Table Open ----
  function initComparisonTracking() {
    var toggle = document.querySelector('.comparison-toggle');
    if (!toggle) return;

    toggle.addEventListener('click', function () {
      var section = toggle.closest('.comparison-section');
      var isOpening = section && !section.classList.contains('open');
      if (isOpening) {
        track('comparison_table_open');
      }
    });
  }

  // ---- Outbound Link Clicks ----
  function initOutboundTracking() {
    document.addEventListener('click', function (e) {
      var link = e.target.closest('a[href]');
      if (!link) return;
      var href = link.getAttribute('href');
      if (href && href.startsWith('http') && !href.includes('rvuedge.com')) {
        track('outbound_click', {
          link_url: href,
          link_text: link.textContent.trim().substring(0, 50),
        });
      }
    });
  }

  // ---- Career Stage Interest (subpage visits tracked via page_view, but also nav clicks) ----
  function initCareerStageTracking() {
    document.querySelectorAll('a[href*="/students"], a[href*="/residents"], a[href*="/attendings"]').forEach(function (link) {
      link.addEventListener('click', function () {
        var stage = 'unknown';
        if (link.href.includes('students')) stage = 'student';
        else if (link.href.includes('residents')) stage = 'resident';
        else if (link.href.includes('attendings')) stage = 'attending';
        track('career_stage_click', { career_stage: stage, link_location: getSectionName(link) });
      });
    });
  }

  // ---- Contact / Support Clicks ----
  function initContactTracking() {
    document.querySelectorAll('a[href^="mailto:"]').forEach(function (link) {
      link.addEventListener('click', function () {
        track('contact_email_click', {
          email: link.getAttribute('href').replace('mailto:', ''),
          link_location: getSectionName(link),
        });
      });
    });
  }

  // ---- Utility: get nearest section name ----
  function getSectionName(el) {
    var section = el.closest('section, footer, nav');
    if (!section) return 'unknown';
    return section.id || section.className.split(' ')[0] || 'unknown';
  }

  // ---- Utility: throttle ----
  function throttle(fn, wait) {
    var last = 0;
    return function () {
      var now = Date.now();
      if (now - last >= wait) {
        last = now;
        fn.apply(this, arguments);
      }
    };
  }

  // ---- Init All ----
  function init() {
    initCTATracking();
    initFormTracking();
    initVideoTracking();
    initScrollDepth();
    initSectionTracking();
    initComparisonTracking();
    initOutboundTracking();
    initCareerStageTracking();
    initContactTracking();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
