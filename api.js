/**
 * MovieBox - API Service (TMDB Integration)
 * Hardened with LocalStorage safety and detailed fetch diagnostics.
 */

const API_CONFIG = {
  KEY: '3370c7875d057cde17b3d68c22cba6e8',
  BASE_URL: 'https://api.themoviedb.org/3',
  IMG_URL: 'https://image.tmdb.org/t/p/w500',
  BACKDROP_URL: 'https://image.tmdb.org/t/p/original',
  CACHE_TIME: 24 * 60 * 60 * 1000,
};

const API = {
  async getMovies(type = 'movie', filter = 'trending', page = 1, query = '', genre = '') {
    let url = '';
    const isAnime = type === 'anime';
    const cacheKey = `movies_v5_${type}_${filter}_${page}_${query}_${genre}`;
    
    // Safety check for cached data
    try {
        const cached = this.getCachedData(cacheKey);
        if (cached) return cached;
    } catch (e) {
        console.warn('Cache access error:', e);
    }

    // URL Construction
    if (query) {
      url = `${API_CONFIG.BASE_URL}/search/${isAnime ? 'tv' : type}?api_key=${API_CONFIG.KEY}&query=${encodeURIComponent(query)}&page=${page}`;
      if (isAnime) url += '&with_genres=16';
    } else if (filter === 'trending') {
      if (isAnime) {
        url = `${API_CONFIG.BASE_URL}/discover/tv?api_key=${API_CONFIG.KEY}&with_genres=16&sort_by=popularity.desc&page=${page}`;
      } else {
        url = `${API_CONFIG.BASE_URL}/trending/${type}/day?api_key=${API_CONFIG.KEY}&page=${page}`;
      }
    } else if (filter === 'upcoming') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];
      if (type === 'movie') {
        url = `${API_CONFIG.BASE_URL}/discover/movie?api_key=${API_CONFIG.KEY}&primary_release_date.gte=${dateStr}&sort_by=primary_release_date.asc&page=${page}`;
      } else {
        url = `${API_CONFIG.BASE_URL}/discover/tv?api_key=${API_CONFIG.KEY}&first_air_date.gte=${dateStr}&sort_by=first_air_date.asc&page=${page}`;
        if (isAnime) url += '&with_genres=16';
      }
    } else {
      const endpoint = (isAnime || type === 'tv') ? 'tv' : 'movie';
      const sortBy = 'popularity.desc';
      if (genre) {
        url = `${API_CONFIG.BASE_URL}/discover/${endpoint}?api_key=${API_CONFIG.KEY}&with_genres=${genre}&sort_by=${sortBy}&page=${page}`;
        if (isAnime && !genre.split(',').includes('16')) url += ',16';
      } else {
        url = `${API_CONFIG.BASE_URL}/${endpoint}/${filter}?api_key=${API_CONFIG.KEY}&page=${page}`;
        if (isAnime) {
            url = `${API_CONFIG.BASE_URL}/discover/tv?api_key=${API_CONFIG.KEY}&with_genres=16&sort_by=${sortBy}&page=${page}`;
        }
      }
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();

      if (isAnime) {
        data.results = data.results.filter(m => m.genre_ids && m.genre_ids.includes(16));
      }

      this.cacheData(cacheKey, data);
      
      // Safe Manual Merge
      try {
        const manualData = JSON.parse(localStorage.getItem('moviebox_admin') || '{}');
        const manualItems = Object.values(manualData).filter(item => {
            if (item.type !== (isAnime ? 'anime' : type)) return false;
            if (filter === 'upcoming') {
                const nowUTC = new Date().toISOString().split('T')[0];
                const itemDate = item.release_date || item.first_air_date;
                if (!itemDate || itemDate <= nowUTC) return false;
            }
            if (query) {
                const title = (item.title || item.name || '').toLowerCase();
                if (!title.includes(query.toLowerCase())) return false;
            }
            return true;
        });

        if (manualItems.length > 0 && page === 1) {
            manualItems.forEach(manualItem => {
                const formatted = { ...manualItem, manual: true };
                const index = data.results.findIndex(r => r.id == formatted.id);
                if (index !== -1) data.results[index] = formatted;
                else data.results.unshift(formatted);
            });
        }
      } catch (err) {
        console.error('Manual merge failed but continuing:', err);
      }

      return data;
    } catch (error) {
      console.error('TMDB FETCH ERROR:', error);
      return { _error: error.message + ' | URL: ' + url.substring(0, 50) + '...' };
    }
  },

  async getTrailer(id, type = 'movie') {
    const url = `${API_CONFIG.BASE_URL}/${type}/${id}/videos?api_key=${API_CONFIG.KEY}`;
    try {
      const response = await fetch(url, { credentials: 'omit' });
      const data = await response.json();
      const trailer = data.results.find(v => v.type === 'Trailer' && v.site === 'YouTube') || data.results[0];
      return trailer ? `https://www.youtube.com/embed/${trailer.key}?autoplay=1&mute=1&enablejsapi=1` : null;
    } catch (e) { return null; }
  },

  async getGenres(type = 'movie') {
    const url = `${API_CONFIG.BASE_URL}/genre/${type}/list?api_key=${API_CONFIG.KEY}`;
    try {
      const response = await fetch(url, { credentials: 'omit' });
      const data = await response.json();
      return data.genres || [];
    } catch (e) { return []; }
  },

  cacheData(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data: data }));
    } catch (e) {}
  },

  getCachedData(key) {
    try {
        const cached = localStorage.getItem(key);
        if (!cached) return null;
        const cacheObj = JSON.parse(cached);
        if ((Date.now() - cacheObj.timestamp) < API_CONFIG.CACHE_TIME) return cacheObj.data;
        localStorage.removeItem(key);
    } catch (e) {}
    return null;
  }
};

window.API = API;
