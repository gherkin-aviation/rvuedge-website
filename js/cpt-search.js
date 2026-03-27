/**
 * CPT Code Lookup — JSON-powered client-side search
 * Fetches /data/cpt-codes.json and renders results on demand.
 * Works on the main (all codes) page and category sub-pages alike.
 * Category navigation via dropdown on all pages.
 */
(function () {
  'use strict';

  var searchInput = document.getElementById('cpt-search');
  var resultCount = document.getElementById('cpt-result-count');
  var codesList = document.getElementById('cpt-codes-list');
  var noResults = document.getElementById('cpt-no-results');
  var showMoreBtn = document.getElementById('cpt-show-more');
  var loadingEl = document.getElementById('cpt-loading');
  var pageWrapper = document.getElementById('cpt-page-wrapper');
  var categorySelect = document.getElementById('cpt-category-select');

  if (!searchInput || !codesList) return;

  var isAllPage = pageWrapper && pageWrapper.classList.contains('cpt-page-all');
  var pageCategory = pageWrapper ? pageWrapper.getAttribute('data-category') : null;
  var debounceTimer = null;
  var PAGE_SIZE = 50;

  // State
  var allCodes = [];       // Full dataset (or category-filtered subset)
  var filtered = [];       // Current search results
  var rendered = 0;        // How many results are currently in the DOM
  var activeFilter = 'all'; // Dropdown filter (main page only)
  var dataReady = false;

  var fuseInstance = null;

  function buildFuseIndex(codes) {
    if (typeof Fuse === 'undefined') {
      console.warn('Fuse.js not loaded, using fallback search');
      return;
    }
    try {
      fuseInstance = new Fuse(codes, {
        keys: ['c', 'n', 's', 'd'],
        threshold: 0.3,
        minMatchCharLength: 2,
        ignoreLocation: true,
        useExtendedSearch: true,
      });
      console.log('Fuse.js index built for ' + codes.length + ' codes');
    } catch (err) {
      console.error('Fuse.js init failed:', err);
      fuseInstance = null;
    }
  }

  function fmt(n) {
    return n.toLocaleString();
  }

  function escHtml(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Build search index string for an entry (called once at load time)
  function buildSearchIndex(e) {
    var parts = [e.c, e.d];
    if (e.l) parts.push(e.l);
    if (e.n) parts.push(e.n);
    if (e.x) parts.push(e.x);
    if (e.e) parts.push(e.e);
    if (e.s) parts.push(e.s);
    return parts.join(' ').toLowerCase();
  }

  // Render a single entry as HTML string
  function renderEntry(e) {
    var isModifier = e.mod === 1;
    var idPrefix = isModifier ? 'mod-' : 'cpt-';
    var code = e.c;
    var idVal = isModifier ? code.replace(/^-/, '') : code;

    var addon = e.a ? ' <span class="cpt-addon">+Add-on</span>' : '';
    var longHtml = e.l ? '<p class="cpt-long">' + escHtml(e.l) + '</p>' : '';
    var commonHtml = e.n ? '<p class="cpt-common">Also known as: ' + escHtml(e.n) + '</p>' : '';
    var ctxHtml = e.x ? '<p class="cpt-context">' + escHtml(e.x) + '</p>' : '';

    var tagsHtml = '';
    if (e.t && e.t.length) {
      var tags = '';
      for (var i = 0; i < e.t.length; i++) {
        tags += '<span class="cpt-tag">' + escHtml(e.t[i]) + '</span>';
      }
      tagsHtml = '<div class="cpt-tags">' + tags + '</div>';
    }

    var rvuLabel = isModifier ? 'Multiplier: ' : 'wRVU: ';
    var rvuVal = isModifier ? e.r : (typeof e.r === 'number' ? e.r.toFixed(2) : '0.00');
    var globalHtml = isModifier ? '' : '<span class="cpt-global">Global: ' + escHtml(e.g) + '</span>';

    var entryClass = isModifier ? 'cpt-entry modifier-entry' : 'cpt-entry';

    return '<article class="' + entryClass + '" id="' + idPrefix + escHtml(idVal) + '">' +
      '<div class="cpt-code-col"><span class="cpt-code">' + escHtml(code) + '</span>' + addon + '</div>' +
      '<div class="cpt-details">' +
      '<h3>' + escHtml(e.d) + '</h3>' +
      longHtml + commonHtml + ctxHtml + tagsHtml +
      '<div class="cpt-meta">' +
      '<span class="cpt-rvu">' + rvuLabel + rvuVal + '</span>' +
      globalHtml +
      '<span class="cpt-category">' + escHtml(e.cd) + '</span>' +
      '</div></div></article>';
  }

  function renderBatch(startIdx, count) {
    var end = Math.min(startIdx + count, filtered.length);
    var html = '';
    for (var i = startIdx; i < end; i++) {
      html += renderEntry(filtered[i]);
    }
    return { html: html, count: end - startIdx };
  }

  function updateCount(visible, total) {
    if (!resultCount) return;
    if (visible === total) {
      resultCount.textContent = 'Showing ' + fmt(total) + ' codes';
    } else {
      resultCount.textContent = 'Showing ' + fmt(visible) + ' of ' + fmt(total) + ' codes';
    }
  }

  function updateShowMore() {
    if (showMoreBtn) {
      if (rendered < filtered.length) {
        showMoreBtn.style.display = '';
        showMoreBtn.textContent = 'Show more results (' + fmt(filtered.length - rendered) + ' remaining)';
      } else {
        showMoreBtn.style.display = 'none';
      }
    }
  }

  function doSearch() {
    var query = searchInput.value.trim();
    console.log('doSearch called, query="' + query + '", fuseInstance=' + !!fuseInstance + ', allCodes=' + allCodes.length);

    if (!query) {
      // No query — show all (with category filter)
      filtered = [];
      for (var i = 0; i < allCodes.length; i++) {
        var entry = allCodes[i];
        if (activeFilter !== 'all' && entry.cat !== activeFilter) continue;
        filtered.push(entry);
      }
    } else if (fuseInstance) {
      // Fuse.js tokenized fuzzy search
      var results = fuseInstance.search(query, { limit: 200 });
      filtered = [];
      for (var i = 0; i < results.length; i++) {
        var entry = results[i].item;
        if (activeFilter !== 'all' && entry.cat !== activeFilter) continue;
        filtered.push(entry);
      }
    } else {
      // Fallback if Fuse not loaded
      var q = query.toLowerCase();
      filtered = [];
      for (var i = 0; i < allCodes.length; i++) {
        var entry = allCodes[i];
        if (activeFilter !== 'all' && entry.cat !== activeFilter) continue;
        if (entry._s && entry._s.indexOf(q) !== -1) filtered.push(entry);
      }
    }

    // Render first batch
    rendered = 0;
    var batch = renderBatch(0, PAGE_SIZE);
    codesList.innerHTML = batch.html;
    rendered = batch.count;

    updateCount(filtered.length, allCodes.length);
    updateShowMore();
    noResults.style.display = filtered.length === 0 ? '' : 'none';
  }

  function showMore() {
    var batch = renderBatch(rendered, PAGE_SIZE);
    codesList.insertAdjacentHTML('beforeend', batch.html);
    rendered += batch.count;
    updateShowMore();
  }

  // Fetch and initialize
  function init() {
    fetch('/data/cpt-codes.json')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        // Pre-filter by page category if on a sub-page
        if (pageCategory) {
          var subset = [];
          for (var i = 0; i < data.length; i++) {
            if (data[i].cat === pageCategory) subset.push(data[i]);
          }
          allCodes = subset;
        } else {
          allCodes = data;
        }

        // Build search index once
        for (var j = 0; j < allCodes.length; j++) {
          allCodes[j]._s = buildSearchIndex(allCodes[j]);
        }

        buildFuseIndex(allCodes);

        dataReady = true;
        if (loadingEl) loadingEl.style.display = 'none';

        // Check for anchor link before initial render
        if (window.location.hash) {
          scrollToAnchor(data);
        } else {
          // Show first batch of results
          filtered = allCodes.slice();
          var batch = renderBatch(0, PAGE_SIZE);
          codesList.innerHTML = batch.html;
          rendered = batch.count;
          updateCount(allCodes.length, allCodes.length);
          updateShowMore();
        }
      })
      .catch(function (err) {
        if (loadingEl) loadingEl.textContent = 'Failed to load codes. Please refresh.';
        console.error('CPT data load error:', err);
      });
  }

  // Search input with debounce
  searchInput.addEventListener('input', function () {
    if (!dataReady) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(doSearch, 150);
  });

  // Show more button
  if (showMoreBtn) {
    showMoreBtn.addEventListener('click', showMore);
  }

  // Category dropdown handler — filter in-place on main page, navigate on sub-pages
  if (categorySelect) {
    categorySelect.addEventListener('change', function () {
      var val = this.value;
      if (!val) return;

      if (isAllPage) {
        // Main page: filter in-place without navigation
        if (val === '/cpt-codes/') {
          activeFilter = 'all';
        } else {
          // Extract slug from /cpt-codes/surgery/ → surgery
          var match = val.match(/\/cpt-codes\/([^/]+)\//);
          activeFilter = match ? match[1] : 'all';
        }
        if (dataReady) doSearch();
      } else {
        // Sub-page: navigate to the selected category page
        window.location = val;
      }
    });
  }

  // Handle direct anchor links (e.g., #cpt-99213)
  function scrollToAnchor(fullData) {
    var hash = window.location.hash;
    if (!hash) return;

    var isModAnchor = hash.startsWith('#mod-');
    var isCptAnchor = hash.startsWith('#cpt-');
    if (!isCptAnchor && !isModAnchor) return;

    var targetCode = hash.substring(5); // strip #cpt- or #mod-

    // Search in full dataset if provided (for cross-category anchors on main page)
    var searchIn = fullData || allCodes;
    var found = null;
    for (var i = 0; i < searchIn.length; i++) {
      var code = searchIn[i].c;
      var codeNorm = code.replace(/^-/, '');
      if (code.toUpperCase() === targetCode.toUpperCase() ||
          codeNorm.toUpperCase() === targetCode.toUpperCase()) {
        found = searchIn[i];
        break;
      }
    }

    if (!found) return;

    // Ensure it's in allCodes (might not be if on a sub-page)
    if (fullData && pageCategory && found.cat !== pageCategory) {
      window.location = '/cpt-codes/' + hash;
      return;
    }

    // Render just that entry
    searchInput.value = '';
    activeFilter = 'all';
    filtered = [found];
    codesList.innerHTML = renderEntry(found);
    rendered = 1;
    updateCount(1, allCodes.length);
    if (showMoreBtn) showMoreBtn.style.display = 'none';

    setTimeout(function () {
      var target = document.getElementById(hash.substring(1));
      if (target) {
        var rect = target.getBoundingClientRect();
        window.scrollTo({
          top: rect.top + window.pageYOffset - 140,
          behavior: 'smooth'
        });
        target.classList.add('highlighted');
        setTimeout(function () {
          target.classList.remove('highlighted');
        }, 2000);
      }
    }, 100);
  }

  window.addEventListener('hashchange', function () {
    if (dataReady) scrollToAnchor();
  });

  // Sticky search bar
  var searchBar = document.getElementById('cpt-search-bar');
  if (searchBar) {
    var searchBarTop = searchBar.offsetTop;
    window.addEventListener('scroll', function () {
      if (window.pageYOffset > searchBarTop - 64) {
        searchBar.classList.add('stuck');
      } else {
        searchBar.classList.remove('stuck');
      }
    }, { passive: true });
  }

  // Start loading data
  init();
})();
