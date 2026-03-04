/* ============================================
   RVU Edge — Master Animation Controller
   GSAP 3.12 + ScrollTrigger
   ============================================ */

(function () {
  'use strict';

  // Register GSAP plugins
  gsap.registerPlugin(ScrollTrigger);

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = window.innerWidth < 768;

  // ---- Page Fade-In ----
  function initPageFadeIn() {
    gsap.from('body', { opacity: 0, duration: 0.6, ease: 'power2.out' });
  }

  // ---- Scroll Progress Bar ----
  function initScrollProgress() {
    const bar = document.getElementById('scroll-progress');
    if (!bar) return;
    gsap.to(bar, {
      scaleX: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: document.body,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.3,
      },
    });
  }

  // ---- Hero Animations ----
  function initHero() {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    // Animated gradient orbs
    gsap.utils.toArray('.hero-orb').forEach((orb, i) => {
      gsap.to(orb, {
        x: () => gsap.utils.random(-40, 40),
        y: () => gsap.utils.random(-40, 40),
        duration: gsap.utils.random(4, 7),
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        delay: i * 0.5,
      });
    });

    // Word-by-word text reveal
    const heroWords = document.querySelectorAll('.hero-word');
    if (heroWords.length) {
      tl.from(heroWords, {
        y: 40,
        opacity: 0,
        duration: 0.6,
        stagger: 0.08,
        delay: 0.3,
      });
    }

    // Subtitle
    tl.from('.hero-subtitle', { y: 20, opacity: 0, duration: 0.5 }, '-=0.2');

    // Button cascade
    tl.from('.hero-cta', { y: 20, opacity: 0, duration: 0.4, stagger: 0.12 }, '-=0.2');

    // Store badges
    tl.from('.hero-badges', { y: 15, opacity: 0, duration: 0.4 }, '-=0.1');

    // 3D phone parallax entrance
    const heroPhone = document.querySelector('.hero-phone');
    if (heroPhone && !isMobile) {
      tl.from(heroPhone, {
        rotateY: -25,
        rotateX: 10,
        opacity: 0,
        x: 80,
        duration: 1,
        ease: 'power2.out',
      }, 0.5);

      // Scroll-driven flatten
      gsap.to(heroPhone, {
        rotateY: 0,
        rotateX: 0,
        scrollTrigger: {
          trigger: '.hero',
          start: 'top top',
          end: '80% top',
          scrub: 1,
        },
      });
    }
  }

  // ---- Stats Counter Bar ----
  function initStatsCounter() {
    const counters = document.querySelectorAll('.stat-number');
    if (!counters.length) return;

    counters.forEach((counter) => {
      const target = parseInt(counter.dataset.target, 10);
      const suffix = counter.dataset.suffix || '';
      const prefix = counter.dataset.prefix || '';
      const obj = { val: 0 };

      ScrollTrigger.create({
        trigger: counter,
        start: 'top 90%',
        once: true,
        onEnter: () => {
          gsap.to(obj, {
            val: target,
            duration: 1.8,
            ease: 'power2.out',
            onUpdate: () => {
              counter.textContent = prefix + Math.round(obj.val).toLocaleString() + suffix;
            },
            onComplete: () => {
              counter.textContent = prefix + target.toLocaleString() + suffix;
            },
          });
        },
      });
    });
  }

  // ---- Specialty Marquee (pause on hover) ----
  function initMarquee() {
    const track = document.querySelector('.marquee-track');
    if (!track) return;
    track.addEventListener('mouseenter', () => track.style.animationPlayState = 'paused');
    track.addEventListener('mouseleave', () => track.style.animationPlayState = 'running');
  }

  // ---- Career Journey Scroll-Pin ----
  function initCareerScrollPin() {
    if (isMobile) return;

    const section = document.querySelector('.career-scroll-section');
    if (!section) return;

    const panels = gsap.utils.toArray('.career-panel');
    const phoneImg = document.querySelector('.career-phone-img');
    const images = ['career-stage.png', 'import-export.png', 'mgma-benchmarks.png'];

    panels.forEach((panel, i) => {
      ScrollTrigger.create({
        trigger: panel,
        start: 'top 60%',
        end: 'bottom 40%',
        onEnter: () => swapCareerImage(i),
        onEnterBack: () => swapCareerImage(i),
      });
    });

    function swapCareerImage(index) {
      if (!phoneImg) return;
      const newSrc = 'images/screenshots/iphone/' + images[index];
      if (phoneImg.src.endsWith(images[index])) return;
      gsap.to(phoneImg, {
        opacity: 0,
        duration: 0.25,
        onComplete: () => {
          phoneImg.src = newSrc;
          gsap.to(phoneImg, { opacity: 1, duration: 0.25 });
        },
      });
    }

    // Phone sticks via CSS sticky — no GSAP pin needed
  }

  // ---- QuickLog Live-Typing Animation ----
  function initQuickLogTyping() {
    const typingEl = document.getElementById('quicklog-typing');
    if (!typingEl) return;

    const code = '99213509921499215';
    let typed = '';

    ScrollTrigger.create({
      trigger: typingEl,
      start: 'top 80%',
      once: true,
      onEnter: () => {
        let i = 0;
        const interval = setInterval(() => {
          typed += code[i];
          typingEl.textContent = typed;
          i++;
          if (i >= code.length) clearInterval(interval);
        }, 80);
      },
    });
  }

  // ---- Feature Cards: Stagger + Cursor Glow ----
  function initFeatureCards() {
    const cards = gsap.utils.toArray('.feature-card');
    if (!cards.length) return;

    // Staggered entrance
    ScrollTrigger.batch(cards, {
      start: 'top 85%',
      onEnter: (batch) => {
        gsap.from(batch, {
          y: 50,
          opacity: 0,
          scale: 0.95,
          duration: 0.6,
          stagger: 0.1,
          ease: 'power2.out',
        });
      },
      once: true,
    });

    // Cursor-tracking glow
    cards.forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        card.style.setProperty('--glow-x', x + 'px');
        card.style.setProperty('--glow-y', y + 'px');
      });
    });
  }

  // ---- Vanilla Tilt on Feature Cards ----
  function initTilt() {
    if (isMobile || typeof VanillaTilt === 'undefined') return;
    const tiltCards = document.querySelectorAll('.tilt-card');
    VanillaTilt.init(tiltCards, {
      max: 8,
      speed: 400,
      glare: true,
      'max-glare': 0.15,
      gyroscope: false,
    });
  }

  // ---- Comparison Table Checkmarks Bounce ----
  function initComparisonAnim() {
    const table = document.querySelector('.comparison-section');
    if (!table) return;

    ScrollTrigger.create({
      trigger: table,
      start: 'top 80%',
      once: true,
      onEnter: () => {
        gsap.from('.comparison-table .cmp-yes, .comparison-table .cmp-no', {
          scale: 0,
          opacity: 0,
          duration: 0.4,
          stagger: 0.03,
          ease: 'back.out(1.7)',
        });
      },
    });
  }

  // ---- Pricing Cards ----
  function initPricingCards() {
    const cards = gsap.utils.toArray('.pricing-card');
    if (!cards.length) return;

    ScrollTrigger.batch(cards, {
      start: 'top 85%',
      onEnter: (batch) => {
        gsap.from(batch, {
          y: 40,
          opacity: 0,
          scale: 0.95,
          duration: 0.6,
          stagger: 0.15,
          ease: 'power2.out',
        });
      },
      once: true,
    });
  }

  // ---- Review Stars Scale-In ----
  function initReviewStars() {
    const reviewSection = document.querySelector('.reviews-section');
    if (!reviewSection) return;

    ScrollTrigger.create({
      trigger: reviewSection,
      start: 'top 80%',
      once: true,
      onEnter: () => {
        gsap.from(reviewSection.querySelectorAll('.star'), {
          scale: 0,
          opacity: 0,
          duration: 0.3,
          stagger: 0.04,
          ease: 'back.out(2)',
        });
      },
    });
  }

  // ---- Generic Scroll Reveal (replacement for AOS) ----
  function initScrollReveal() {
    const reveals = gsap.utils.toArray('.reveal');
    reveals.forEach((el) => {
      gsap.from(el, {
        y: 40,
        opacity: 0,
        duration: 0.7,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          once: true,
        },
      });
    });
  }

  // ---- Init All ----
  function init() {
    if (prefersReducedMotion) return;

    initPageFadeIn();
    initScrollProgress();
    initHero();
    initStatsCounter();
    initMarquee();
    initCareerScrollPin();
    initQuickLogTyping();
    initFeatureCards();
    initTilt();
    initComparisonAnim();
    initPricingCards();
    initReviewStars();
    initScrollReveal();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
