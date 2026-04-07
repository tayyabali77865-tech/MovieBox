/**
 * MovieBox - API Service (TMDB Integration)
 * Handles all movie and anime data fetching with caching.
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
    // Cache versioning (v4) to clear any old 1999/2003 data from user's browser
    const manualData = JSON.parse(localStorage.getItem('moviebox_admin') || '{}');
    const manualList = Object.values(manualData);
    const cacheKey = `movies_v4_${type}_${filter}_${page}_${query}_${genre}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    let url = '';
    const isAnime = type === 'anime';

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
        // Use discover for movies to ensure every page is full of future releases
        url = `${API_CONFIG.BASE_URL}/discover/movie?api_key=${API_CONFIG.KEY}&primary_release_date.gte=${dateStr}&sort_by=primary_release_date.asc&page=${page}`;
      } else {
        // TV/Anime: use discover with tomorrow's date for accurate future releases
        url = `${API_CONFIG.BASE_URL}/discover/tv?api_key=${API_CONFIG.KEY}&first_air_date.gte=${dateStr}&sort_by=first_air_date.asc&page=${page}`;
        if (isAnime) url += '&with_genres=16';
      }
    } else {
      const endpoint = (isAnime || type === 'tv') ? 'tv' : 'movie';
      const sortMap = {
        'popular': 'popularity.desc',
        'top_rated': 'vote_average.desc',
        'trending': 'popularity.desc',
        'upcoming': 'primary_release_date.asc'
      };
      const sortBy = sortMap[filter] || 'popularity.desc';

      if (genre) {
        url = `${API_CONFIG.BASE_URL}/discover/${endpoint}?api_key=${API_CONFIG.KEY}&with_genres=${genre}&sort_by=${sortBy}&page=${page}`;
        if (isAnime && !genre.split(',').includes('16')) url += ',16';
        if (filter === 'top_rated') url += '&vote_count.gte=100';
      } else {
        url = `${API_CONFIG.BASE_URL}/${endpoint}/${filter}?api_key=${API_CONFIG.KEY}&page=${page}`;
        if (isAnime) {
          url = `${API_CONFIG.BASE_URL}/discover/tv?api_key=${API_CONFIG.KEY}&with_genres=16&sort_by=${sortBy}&page=${page}`;
          if (filter === 'top_rated') url += '&vote_count.gte=100';
        }
      }
    }

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('API Error');
      const data = await response.json();

      if (isAnime) {
        data.results = data.results.filter(m => m.genre_ids && m.genre_ids.includes(16));
      }

      this.cacheData(cacheKey, data);
      
      // Merge Manual Admin Content
      const manualData = JSON.parse(localStorage.getItem('moviebox_admin') || '{}');
      const manualItems = Object.values(manualData).filter(item => {
         // Filter by type
         const isAnime = type === 'anime';
         if (item.type !== (isAnime ? 'anime' : type)) return false;
         
         // Filter by Upcoming
         if (filter === 'upcoming') {
            const nowUTC = new Date().toISOString().split('T')[0];
            const itemDate = item.release_date || item.first_air_date;
            if (!itemDate || itemDate <= nowUTC) return false;
         }

         // Filter by Search
         if (query) {
            const title = (item.title || item.name || '').toLowerCase();
            if (!title.includes(query.toLowerCase())) return false;
         }

         return true;
      });

      // Override logic
      if (manualItems.length > 0 && page === 1) {
         manualItems.forEach(manualItem => {
            const formatted = {
               ...manualItem,
               id: isNaN(manualItem.id) ? manualItem.id : parseInt(manualItem.id),
               manual: true 
            };
            const index = data.results.findIndex(r => r.id === formatted.id);
            if (index !== -1) {
               data.results[index] = formatted;
            } else {
               data.results.unshift(formatted);
            }
         });
      }

      return data;
    } catch (error) {
      console.error('TMDB API GET MOVIES ERROR:', error);
      return { _error: error.message || 'Unknown Fetch Error' };
    }
  },

  async getTrailer(id, type = 'movie') {
    const cacheKey = `trailer_${id}_${type}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    const url = `${API_CONFIG.BASE_URL}/${type}/${id}/videos?api_key=${API_CONFIG.KEY}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      const trailer = data.results.find(v => v.type === 'Trailer' && v.site === 'YouTube') || data.results[0];
      if (trailer) {
        const trailerUrl = `https://www.youtube.com/embed/${trailer.key}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3&enablejsapi=1`;
        this.cacheData(cacheKey, trailerUrl);
        return trailerUrl;
      }
      return null;
    } catch (error) {
      return null;
    }
  },

  async getGenres(type = 'movie') {
    const cacheKey = `genres_${type}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    const url = `${API_CONFIG.BASE_URL}/genre/${type}/list?api_key=${API_CONFIG.KEY}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      this.cacheData(cacheKey, data.genres);
      return data.genres;
    } catch (error) {
      return [];
    }
  },

  cacheData(key, data) {
    const cacheObj = {
      timestamp: Date.now(),
      data: data
    };
    localStorage.setItem(key, JSON.stringify(cacheObj));
  },

  getCachedData(key) {
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    const cacheObj = JSON.parse(cached);
    const isValid = (Date.now() - cacheObj.timestamp) < API_CONFIG.CACHE_TIME;

    if (isValid) return cacheObj.data;
    localStorage.removeItem(key);
    return null;
  }
};
