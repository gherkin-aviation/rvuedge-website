/**
 * CPT Code Lookup — Client-side search & filter
 * Vanilla JS, no dependencies. Filters ~17,000 code entries via data-search attributes.
 */
(function () {
  'use strict';

  var searchInput = document.getElementById('cpt-search');
  var resultCount = document.getElementById('cpt-result-count');
  var codesList = document.getElementById('cpt-codes-list');
  var noResults = document.getElementById('cpt-no-results');
  var chips = document.querySelectorAll('#cpt-chips .chip');

  if (!searchInput || !codesList) return;

  var entries = codesList.querySelectorAll('.cpt-entry');
  var sectionHeaders = codesList.querySelectorAll('.cpt-section-header');
  var totalCount = entries.length;
  var activeFilter = 'all';
  var debounceTimer = null;

  // Format number with commas
  function fmt(n) {
    return n.toLocaleString();
  }

  // Update result count display
  function updateCount(visible) {
    if (visible === totalCount && activeFilter === 'all') {
      resultCount.textContent = 'Showing ' + fmt(totalCount) + ' codes';
    } else {
      resultCount.textContent = 'Showing ' + fmt(visible) + ' of ' + fmt(totalCount) + ' codes';
    }
    noResults.style.display = visible === 0 ? '' : 'none';
  }

  // Main filter function
  function filterEntries() {
    var query = searchInput.value.trim().toLowerCase();
    var visible = 0;

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var cat = entry.getAttribute('data-category') || '';
      var searchText = entry.getAttribute('data-search') || '';

      var matchesFilter = activeFilter === 'all' || cat === activeFilter;
      var matchesSearch = !query || searchText.indexOf(query) !== -1;

      if (matchesFilter && matchesSearch) {
        entry.style.display = '';
        visible++;
      } else {
        entry.style.display = 'none';
      }
    }

    // Show/hide section headers based on filter
    for (var j = 0; j < sectionHeaders.length; j++) {
      var header = sectionHeaders[j];
      var headerCat = header.getAttribute('data-category') || '';
      var showHeader = activeFilter === 'all' || headerCat === activeFilter;
      var showForSearch = !query; // Hide section headers when searching
      header.style.display = showHeader && showForSearch ? '' : 'none';
    }

    updateCount(visible);
  }

  // Search input with debounce
  searchInput.addEventListener('input', function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(filterEntries, 150);
  });

  // Category chip click handlers
  for (var i = 0; i < chips.length; i++) {
    chips[i].addEventListener('click', function () {
      // Remove active from all
      for (var j = 0; j < chips.length; j++) {
        chips[j].classList.remove('active');
      }
      this.classList.add('active');
      activeFilter = this.getAttribute('data-filter');
      filterEntries();
    });
  }

  // Handle direct anchor links (e.g., #cpt-99213)
  function scrollToAnchor() {
    var hash = window.location.hash;
    if (hash && hash.startsWith('#cpt-')) {
      var target = document.getElementById(hash.substring(1));
      if (target) {
        // Clear any filters first
        searchInput.value = '';
        activeFilter = 'all';
        for (var j = 0; j < chips.length; j++) {
          chips[j].classList.remove('active');
          if (chips[j].getAttribute('data-filter') === 'all') {
            chips[j].classList.add('active');
          }
        }
        filterEntries();

        // Scroll to element with offset for sticky header
        setTimeout(function () {
          var rect = target.getBoundingClientRect();
          var offset = 140; // Account for sticky search bar
          window.scrollTo({
            top: rect.top + window.pageYOffset - offset,
            behavior: 'smooth'
          });
          // Highlight briefly
          target.classList.add('highlighted');
          setTimeout(function () {
            target.classList.remove('highlighted');
          }, 2000);
        }, 100);
      }
    }
  }

  window.addEventListener('hashchange', scrollToAnchor);
  if (window.location.hash) {
    scrollToAnchor();
  }

  // Sticky search bar behavior
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
})();
