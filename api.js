/**
 * MovieBox - API Service (TMDB Integration)
 * Cleaned URL construction to prevent any extra slashes or spaces.
 */

const KEY = '3370c7875d057cde17b3d68c22cba6e8';
const BASE = 'https://api.themoviedb.org/3';

const API = {
  async getMovies(type = 'movie', filter = 'trending', page = 1, query = '', genre = '') {
    let url = '';
    const isAnime = type === 'anime';
    const cacheKey = `mv5_${type}_${filter}_${page}_${query}_${genre}`;
    
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    // Build URL without any extra slashes
    if (query) {
      const endpoint = isAnime ? 'tv' : type;
      url = `${BASE}/search/${endpoint}?api_key=${KEY}&query=${encodeURIComponent(query)}&page=${page}`;
      if (isAnime) url += '&with_genres=16';
    } else if (filter === 'trending') {
      if (isAnime) {
        url = `${BASE}/discover/tv?api_key=${KEY}&with_genres=16&sort_by=popularity.desc&page=${page}`;
      } else {
        url = `${BASE}/trending/${type}/day?api_key=${KEY}&page=${page}`;
      }
    } else if (filter === 'upcoming') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];
      if (type === 'movie') {
        url = `${BASE}/discover/movie?api_key=${KEY}&primary_release_date.gte=${dateStr}&sort_by=primary_release_date.asc&page=${page}`;
      } else {
        url = `${BASE}/discover/tv?api_key=${KEY}&first_air_date.gte=${dateStr}&sort_by=first_air_date.asc&page=${page}`;
        if (isAnime) url += '&with_genres=16';
      }
    } else {
      const endpoint = (isAnime || type === 'tv') ? 'tv' : 'movie';
      const sortBy = filter === 'top_rated' ? 'vote_average.desc' : 'popularity.desc';
      url = `${BASE}/discover/${endpoint}?api_key=${KEY}&sort_by=${sortBy}&page=${page}`;
      if (genre) url += `&with_genres=${genre}`;
      if (isAnime) url += genre.includes('16') ? '' : '&with_genres=16';
      if (filter === 'top_rated') url += '&vote_count.gte=100';
    }

    try {
      const resp = await fetch(url.trim(), { method: 'GET', mode: 'cors' });
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      const data = await resp.json();

      if (isAnime) {
        data.results = data.results.filter(m => m.genre_ids && m.genre_ids.includes(16));
      }

      this.cacheData(cacheKey, data);
      
      // Manual Merge Logic
      try {
        const manual = JSON.parse(localStorage.getItem('moviebox_admin') || '{}');
        const items = Object.values(manual).filter(i => {
            if (i.type !== (isAnime ? 'anime' : type)) return false;
            if (query && !(i.title || i.name || '').toLowerCase().includes(query.toLowerCase())) return false;
            return true;
        });
        if (items.length > 0 && page === 1) {
            items.forEach(item => {
                const f = { ...item, manual: true };
                const idx = data.results.findIndex(r => r.id == f.id);
                if (idx !== -1) data.results[idx] = f;
                else data.results.unshift(f);
            });
        }
      } catch (e) {}

      return data;
    } catch (err) {
      return { _error: `${err.message} | URL: ${url}` };
    }
  },

  async getTrailer(id, type = 'movie') {
    const url = `${BASE}/${type}/${id}/videos?api_key=${KEY}`;
    try {
      const resp = await fetch(url);
      const data = await resp.json();
      const t = data.results.find(v => v.type === 'Trailer' && v.site === 'YouTube') || data.results[0];
      return t ? `https://www.youtube.com/embed/${t.key}?autoplay=1&mute=1` : null;
    } catch (e) { return null; }
  },

  async getGenres(type = 'movie') {
    const url = `${BASE}/genre/${type}/list?api_key=${KEY}`;
    try {
      const resp = await fetch(url);
      const data = await resp.json();
      return data.genres || [];
    } catch (e) { return []; }
  },

  cacheData(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch (e) {}
  },

  getCachedData(key) {
    try {
      const c = localStorage.getItem(key);
      if (!c) return null;
      const o = JSON.parse(c);
      if ((Date.now() - o.ts) < 86400000) return o.data;
    } catch (e) {}
    return null;
  }
};

window.API = API;
window.API_CONFIG = { IMG_URL: 'https://image.tmdb.org/t/p/w500', BACKDROP_URL: 'https://image.tmdb.org/t/p/original' };
