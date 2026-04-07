/**
 * MovieBox - Main Application Logic
 * Integrates API fetching, UI rendering, searching, and interactions.
 */

const App = {
  movies: [],
  currentType: 'movie',
  currentFilter: 'trending',
  currentPage: 1,
  totalPages: 1,
  searchQuery: '',
  selectedGenre: '',
  recentlyViewed: JSON.parse(localStorage.getItem('recently_viewed')) || [],

  // Elements
  grid: document.getElementById('movie-container'),
  modal: document.getElementById('movie-modal'),
  searchBar: document.getElementById('movie-search'),
  genreSelect: document.getElementById('genre-select'),
  navItems: document.querySelectorAll('.nav-item'),
  filterChips: document.querySelectorAll('.filter-chip'),
  ytPlayer: null,

  /**
   * Initialize the application
   */
  async init() {
    this.setupEventListeners();
    this.setupRouting();
    await this.fetchAndRender(); // Fetch with default trending filter
    await this.loadGenres();
    this.renderRecentlyViewed();
    this.setupNavScroll();
  },

  /**
   * Event Listeners setup
   */
  setupEventListeners() {
    // Navigation (Movie, TV, Anime)
    this.navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        if (item.id === 'admin-toggle') return;
        e.preventDefault();
        this.navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        this.currentType = item.dataset.type;
        this.searchQuery = '';
        this.currentPage = 1;
        this.selectedGenre = '';
        this.genreSelect.value = '';
        this.loadGenres(); // Refill genres for new category
        this.fetchAndRender();
      });
    });

    // Search with debounce
    let debounceTimer;
    this.searchBar.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.searchQuery = e.target.value.trim();
        this.currentPage = 1;
        this.fetchAndRender();
      }, 500);
    });

    // Filter Chips (Trending, Popular, etc.)
    this.filterChips.forEach(chip => {
      if (chip.tagName === 'SELECT') return;
      chip.addEventListener('click', () => {
        // Reset genre select when switching main categories
        if (this.selectedGenre) {
          this.selectedGenre = '';
          this.genreSelect.value = '';
        }

        this.filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.currentFilter = chip.dataset.filter;
        this.currentPage = 1;
        this.fetchAndRender();
      });
    });

    // Genre Filter
    this.genreSelect.addEventListener('change', (e) => {
      this.selectedGenre = e.target.value;
      this.currentPage = 1;

      // If a genre is selected, switch main chip to 'popular' as the sorting method
      if (this.selectedGenre) {
        this.filterChips.forEach(c => {
          c.classList.remove('active');
          if (c.dataset.filter === 'popular') c.classList.add('active');
        });
        this.currentFilter = 'popular';
      }

      this.fetchAndRender();
    });

    // Modal close events
    document.getElementById('close-modal').addEventListener('click', () => this.closeModal());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.closeModal();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal.classList.contains('active')) this.closeModal();
    });

    // Sound toggle in modal
    document.getElementById('sound-toggle').addEventListener('click', () => this.toggleSound());
  },

  /**
   * Routing setup (URL based state)
   */
  setupRouting() {
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash;
      if (hash.startsWith('#media/')) {
        const [_, mediaType, movieId] = hash.split('/');
        this.openModal(parseInt(movieId), mediaType, false);
      } else if (hash.startsWith('#watch/')) {
        const [_, mediaType, movieId] = hash.split('/');
        this.openModal(parseInt(movieId), mediaType, false, true);
      } else if (hash === '') {
        this.closeModal(false);
      }
    });

    // Initial check on page load
    if (window.location.hash.startsWith('#media/')) {
      setTimeout(() => {
        const [_, mediaType, movieId] = window.location.hash.split('/');
        this.openModal(parseInt(movieId), mediaType, false);
      }, 500);
    } else if (window.location.hash.startsWith('#watch/')) {
      setTimeout(() => {
        const [_, mediaType, movieId] = window.location.hash.split('/');
        this.openModal(parseInt(movieId), mediaType, false, true);
      }, 500);
    }
  },

  /**
   * Fetch movies and render the grid
   */
  async fetchAndRender() {
    this.showSkeletons();
    let data;
    try {
      // Use the updated API call that handles discover/sorting
      data = await API.getMovies(this.currentType, this.currentFilter, this.currentPage, this.searchQuery, this.selectedGenre);

      if (data && data.results) {
        // Safety filter for Upcoming section (absolute future enforcement)
        if (this.currentFilter === 'upcoming') {
          const nowUTC = new Date().toISOString().split('T')[0];
          data.results = data.results.filter(item => {
            const rd = item.release_date || item.first_air_date;
            return rd && rd > nowUTC;
          });

          // Sort by release date ascending
          data.results.sort((a, b) => {
            const d1 = new Date(a.release_date || a.first_air_date);
            const d2 = new Date(b.release_date || b.first_air_date);
            return d1 - d2;
          });
        }

        this.movies = data.results;
        this.totalPages = Math.min(data.total_pages || 1, 500);
        this.renderMovies(this.movies);
        this.renderPagination();
      } else {
        throw new Error(data && data._error ? data._error : 'No Results Found');
      }
    } catch (error) {
      console.error('Fetch error:', error);
      this.grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: #f44336;">
          <h3 style="font-size:1.5rem; margin-bottom:1rem;">Error: ${error.message}</h3>
          <p style="font-size:1rem; opacity:0.7;">Check your connection or try a **VPN** if TMDb is blocked by your ISP.<br><br>
          <button onclick="location.reload()" class="btn-primary" style="padding:10px 20px; font-size:0.8rem;">Try Refreshing</button></p>
        </div>`;
    }
    this.renderFilterHeading();
  },

  /**
   * Render numbered pagination controls
   */
  renderPagination() {
    let container = document.getElementById('pagination-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'pagination-container';
      container.className = 'pagination';
      this.grid.parentNode.insertBefore(container, this.grid.nextSibling);
    }

    const page = this.currentPage;
    const total = this.totalPages;

    // Build page numbers window
    const pages = [];
    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('...');
      for (let i = Math.max(2, page - 1); i <= Math.min(total - 1, page + 1); i++) pages.push(i);
      if (page < total - 2) pages.push('...');
      pages.push(total);
    }

    container.innerHTML = `
      <button class="page-btn" id="page-prev" ${page === 1 ? 'disabled' : ''} onclick="App.goToPage(${page - 1})">
        <i class="fas fa-chevron-left"></i>
      </button>
      ${pages.map(p => p === '...'
      ? `<span class="page-ellipsis">...</span>`
      : `<button class="page-btn ${p === page ? 'active' : ''}" onclick="App.goToPage(${p})">${p}</button>`
    ).join('')}
      <button class="page-btn" id="page-next" ${page === total ? 'disabled' : ''} onclick="App.goToPage(${page + 1})">
        <i class="fas fa-chevron-right"></i>
      </button>
    `;
  },

  /**
   * Load genres into dropdown
   */
  async loadGenres() {
    try {
      const type = this.currentType === 'movie' ? 'movie' : 'tv';
      const genres = await API.getGenres(type);
      if (!genres) return;
      this.genreSelect.innerHTML = '<option value="">All Genres</option>' +
        genres.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
    } catch (e) {
      this.genreSelect.innerHTML = '<option value="">All Genres</option>';
    }
  },

  /**
   * Navigate to specific page
   */
  goToPage(page) {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.fetchAndRender();
  },

  /**
   * Show skeleton state
   */
  showSkeletons() {
    this.grid.innerHTML = Array(12).fill('<div class="movie-card skeleton"></div>').join('');
  },

  /**
   * Render final items to grid
   */
  renderMovies(movies) {
    if (movies.length === 0) {
      this.grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 5rem; color: #666; font-size:1.5rem;">No results found.</div>';
      return;
    }

    this.grid.innerHTML = movies.map(m => {
      const title = m.title || m.name || 'Unknown';
      const year = (m.release_date || m.first_air_date || '????').split('-')[0];
      const rating = m.vote_average ? m.vote_average.toFixed(1) : 'N/A';
      
      const isManual = m.manual === true;
      const poster = m.poster_path ? (isManual && m.poster_path.startsWith('http') ? m.poster_path : API_CONFIG.IMG_URL + m.poster_path) : 'https://via.placeholder.com/500x750?text=No+Poster';
      const type = isManual ? (m.type || 'movie') : (m.title ? 'movie' : 'tv');
      const isHindi = m.original_language === 'hi';

      let releaseDateLabel = '';
      if (this.currentFilter === 'upcoming') {
        const dateString = m.release_date || m.first_air_date || '';
        if (dateString) {
          const d = new Date(dateString);
          releaseDateLabel = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        }
      }

      return `
        <div class="movie-card fade-in" onclick="App.openModal(${isManual ? `'${m.id}'` : m.id}, '${type}')">
            ${isHindi ? '<div class="hindi-badge">Hindi</div>' : ''}
            <img src="${poster}" alt="${title}" loading="lazy">
            <div class="movie-card-info">
                <h3 class="movie-title">${title}</h3>
                <div class="movie-meta">
                    <span><i class="fas fa-star" style="color: #ffcc00"></i> ${rating}</span>
                    <span>${year}</span>
                    ${releaseDateLabel ? `<br><span style="font-size: 0.8rem; color: #888;"><i class="far fa-calendar-alt"></i> ${releaseDateLabel}</span>` : ''}
                </div>
            </div>
        </div>
      `;
    }).join('');
  },

  /**
   * Update category heading
   */
  renderFilterHeading() {
    const heading = document.getElementById('filter-heading');
    if (!heading) return;

    const singType = this.currentType === 'movie' ? 'Movie' : this.currentType === 'tv' ? 'TV Series' : 'Anime';
    let filterTxt = '';

    if (this.selectedGenre) {
      const gOpt = this.genreSelect.options[this.genreSelect.selectedIndex];
      filterTxt = gOpt && gOpt.value ? gOpt.text : 'All Genres';
    } else {
      const fMap = { 'trending': 'Trending', 'popular': 'Popular', 'top_rated': 'Top Rated', 'upcoming': 'Upcoming' };
      filterTxt = fMap[this.currentFilter] || 'Trending';
    }

    heading.textContent = `${filterTxt} ${singType}`;
    heading.style.display = 'block';
  },

  /**
   * Modal Logic
   */
  async openModal(movieId, type, updateHash = true, isWatching = false) {
    if (updateHash) {
      window.location.hash = isWatching ? `watch/${type}/${movieId}` : `media/${type}/${movieId}`;
      return;
    }

    document.getElementById('modal-title').textContent = 'Loading...';
    this.modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    try {
      const url = `${API_CONFIG.BASE_URL}/${type}/${movieId}?api_key=${API_CONFIG.KEY}`;
      const res = await fetch(url);
      const movie = await res.json();

      this.addToRecentlyViewed(movie);
      this.renderRecentlyViewed();

      document.getElementById('modal-poster').src = movie.poster_path ? (API_CONFIG.IMG_URL + movie.poster_path) : 'https://via.placeholder.com/500x750?text=No+Poster';
      document.getElementById('modal-title').textContent = movie.title || movie.name;
      document.getElementById('modal-rating').innerHTML = `<i class="fas fa-star rating-star"></i> ${movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A'}`;
      document.getElementById('modal-year').innerHTML = `<i class="far fa-calendar-alt"></i> ${(movie.release_date || movie.first_air_date || '????').split('-')[0]}`;
      document.getElementById('modal-description').textContent = movie.overview || 'No description available.';

      this.updateMetaTags(movie, type);
      
      const watchBtn = document.getElementById('modal-watch-btn');
      watchBtn.onclick = () => {
         const store = JSON.parse(localStorage.getItem('moviebox_admin') || '{}');
         if (movie.manual && movie.customLink) {
            window.open(movie.customLink, '_blank');
         } else if (store[movie.id] && store[movie.id].customLink) {
            window.open(store[movie.id].customLink, '_blank');
         } else {
            window.open(`https://moviebox.pk/web/searchResult?keyword=${encodeURIComponent(movie.title || movie.name)}`, '_blank');
         }
      };

      const trailerContainer = document.getElementById('trailer-container');
      const trailerUrl = await API.getTrailer(movieId, type);
      const noTrailer = document.getElementById('no-trailer');

      if (trailerUrl) {
        trailerContainer.innerHTML = `<iframe id="trailer-video" src="${trailerUrl}" width="100%" height="100%" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
        noTrailer.style.display = 'none';
      } else {
        trailerContainer.innerHTML = '';
        noTrailer.style.display = 'flex';
      }

      const body = document.querySelector('.modal-body');
      const hero = document.querySelector('.modal-hero');
      if (isWatching) {
        body.style.display = 'none';
        hero.style.height = '100%';
      } else {
        body.style.display = 'flex';
        hero.style.height = '60%';
      }
    } catch (e) {
      console.error(e);
      this.closeModal();
    }
  },

  closeModal(updHash = true) {
    this.modal.classList.remove('active');
    document.body.style.overflow = 'auto';
    document.getElementById('trailer-container').innerHTML = '';
    if (updHash) window.location.hash = '';
    this.resetMetaTags();
  },

  resetMetaTags() {
    const title = 'MovieBox | Discover Movies & Anime';
    const desc = 'Watch Movies, TV Series, and Anime online with Hindi Dubbed versions. Stay updated with Trending, Popular, Top Rated, and Upcoming releases.';
    const poster = 'https://cdn-www.bluestacks.com/bs-images/MBMTV_PC_EN.jpg';
    const url = 'https://movie-box-cyan.vercel.app/';

    document.title = title;
    this.setMeta('description', desc);
    this.setMeta('keywords', 'Movies online, Hindi Dubbed Movies, TV Series online, Anime online, Upcoming Movies, Trending TV Shows, Movie reviews');
    
    this.setMetaProperty('og:title', title);
    this.setMetaProperty('og:description', desc);
    this.setMetaProperty('og:url', url);
    this.setMetaProperty('og:image', poster);

    this.setMetaProperty('twitter:title', title);
    this.setMetaProperty('twitter:description', desc);
    this.setMetaProperty('twitter:image', poster);
  },

  toggleSound() {
    const btn = document.getElementById('sound-toggle');
    const iframe = document.getElementById('trailer-video');
    if (!iframe) return;
    const isM = btn.querySelector('span').textContent === 'Muted';
    iframe.src = iframe.src.replace(isM ? 'mute=1' : 'mute=0', isM ? 'mute=0' : 'mute=1');
    btn.querySelector('span').textContent = isM ? 'Unmuted' : 'Muted';
    btn.querySelector('i').className = isM ? 'fas fa-volume-up' : 'fas fa-volume-mute';
  },

  /**
   * Continue Watching Logic
   */
  addToRecentlyViewed(movie) {
    let list = this.recentlyViewed.filter(m => m.id !== movie.id);
    list.unshift(movie);
    this.recentlyViewed = list.slice(0, 10);
    localStorage.setItem('recently_viewed', JSON.stringify(this.recentlyViewed));
  },

  renderRecentlyViewed() {
    let section = document.getElementById('recently-viewed-section');
    if (!this.recentlyViewed.length) {
      if (section) section.style.display = 'none';
      return;
    }

    if (!section) {
      section = document.createElement('section');
      section.id = 'recently-viewed-section';
      section.className = 'fade-in';
      section.style.marginBottom = '2rem';
      section.innerHTML = `
          <h2 class="section-title">Continue Watching</h2>
          <div id="recently-viewed-grid" style="display: flex; overflow-x: auto; gap: 1.5rem; margin-top: 2rem; padding-bottom: 2rem; scroll-snap-type: x mandatory;"></div>
       `;
      this.grid.parentNode.insertBefore(section, document.getElementById('filter-heading'));
    }

    section.style.display = 'block';
    document.getElementById('recently-viewed-grid').innerHTML = this.recentlyViewed.map(m => `
        <div class="movie-card" style="aspect-ratio: 2/3; flex: 0 0 auto; width: 150px; scroll-snap-align: start;" onclick="App.openModal(${m.id}, '${m.title ? 'movie' : 'tv'}')">
           <img src="${m.poster_path ? API_CONFIG.IMG_URL + m.poster_path : 'https://via.placeholder.com/500x750?text=No+Poster'}" alt="${m.title || m.name}">
           <div class="movie-card-info" style="padding: 0.5rem;"><h4 class="movie-title" style="font-size: 0.8rem;">${m.title || m.name}</h4></div>
        </div>
    `).join('');
  },

  /**
   * Dynamic SEO System
   * Updates meta tags for movie sharing context
   */
  updateMetaTags(m, type) {
    const title = m.title || m.name || 'MovieBox';
    const year = (m.release_date || m.first_air_date || '????').split('-')[0];
    const genre = m.genres ? m.genres.map(g => g.name).join(', ') : (m.genres_str || 'Movie');
    const poster = m.poster_path ? (m.manual && m.poster_path.startsWith('http') ? m.poster_path : API_CONFIG.IMG_URL + m.poster_path) : 'https://cdn-www.bluestacks.com/bs-images/MBMTV_PC_EN.jpg';
    const category = type === 'movie' ? 'movie' : 'tv';
    const url = `https://movie-box-cyan.vercel.app/#media/${category}/${m.id}`;

    // Browser Title
    document.title = `${title} (${year}) - Watch Online | MovieBox`;

    // SEO Meta
    this.setMeta('description', `Watch ${title} (${year}) online. This is a ${genre} available in Hindi Dubbed. Stream trailers, reviews, and details on MovieBox.`);
    this.setMeta('keywords', `${title}, ${title} Hindi Dubbed, ${genre}, Watch ${title} online, ${category} online`);
    
    // Open Graph
    this.setMetaProperty('og:title', `${title} - Watch Online | MovieBox`);
    this.setMetaProperty('og:description', `Stream ${title} (${year}) online. ${title} is a ${genre} available in Hindi Dubbed. Check ratings and trailers.`);
    this.setMetaProperty('og:url', url);
    this.setMetaProperty('og:image', poster);

    // Twitter
    this.setMetaProperty('twitter:title', `${title} - Watch Online | MovieBox`);
    this.setMetaProperty('twitter:description', `Stream ${title} (${year}) online. Check ratings, trailers, and reviews on MovieBox.`);
    this.setMetaProperty('twitter:image', poster);
  },

  setMeta(name, content) {
    const el = document.querySelector(`meta[name="${name}"]`);
    if (el) el.setAttribute('content', content);
  },

  setMetaProperty(prop, content) {
    const el = document.querySelector(`meta[property="${prop}"]`);
    if (el) el.setAttribute('content', content);
  },

  setupNavScroll() {
    const nav = document.getElementById('navbar');
    window.addEventListener('scroll', () => {
      window.scrollY > 50 ? nav.classList.add('scrolled') : nav.classList.remove('scrolled');
    });
  }
};

window.App = App;
App.init();
