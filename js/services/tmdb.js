/* Films et séries avec TMDB (API v3). La clé est saisie par l'utilisateur et
   ne quitte jamais l'appareil ; elle n'est pas incluse dans les exports.
   Accepte une « clé d'API » v3 ou un « jeton d'accès en lecture » v4. */
import { fetchJSON, ApiError } from './http.js';
import { getMeta, setMeta } from '../store/settings.js';

const API = 'https://api.themoviedb.org/3';
export const IMG = 'https://image.tmdb.org/t/p/';

export const getKey = () => getMeta('tmdbKey', '') || '';
export const keyStatus = () => getMeta('tmdbKeyStatus', null); // 'ok' | 'invalid' | null
export const hasUsableKey = () => Boolean(getKey()) && keyStatus() !== 'invalid';

export async function saveKey(key) {
  await setMeta('tmdbKey', key.trim() || null);
  await setMeta('tmdbKeyStatus', null);
}

const isBearer = (key) => key.startsWith('eyJ') && key.length > 60;

async function call(path, params = {}, { key = getKey(), signal } = {}) {
  if (!key) throw new ApiError('auth');
  const qs = new URLSearchParams(params);
  const headers = { Accept: 'application/json' };
  if (isBearer(key)) headers.Authorization = `Bearer ${key}`;
  else qs.set('api_key', key);
  try {
    return await fetchJSON(`${API}${path}?${qs}`, { signal, headers });
  } catch (err) {
    if (err.kind === 'auth' && key === getKey()) await setMeta('tmdbKeyStatus', 'invalid');
    throw err;
  }
}

/* « Tester la clé » : true si TMDB l'accepte. */
export async function testKey(key) {
  try {
    await call('/authentication', {}, { key });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.kind === 'auth' ? 'invalid' : err.kind };
  }
}

export const posterUrl = (path, size = 'w342') => (path ? `${IMG}${size}${path}` : '');

export async function searchTitles(q, { signal } = {}) {
  const data = await call('/search/multi', { query: q, language: 'fr-FR', include_adult: 'false' }, { signal });
  return (data.results || [])
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .slice(0, 8)
    .map((r) => ({
      tmdbId: r.id,
      tmdbType: r.media_type,
      title: r.title || r.name || '',
      originalTitle: r.original_title || r.original_name || '',
      year: (r.release_date || r.first_air_date || '').slice(0, 4) || null,
      posterPath: r.poster_path || null,
      overview: r.overview || '',
      genreIds: r.genre_ids || [],
      subcat: (r.genre_ids || []).includes(99) ? 'documentaire' : (r.media_type === 'tv' ? 'serie' : 'film')
    }));
}

/* Détails à l'enregistrement : titre français, année, genres, synopsis,
   saisons et plateformes par abonnement en France (source JustWatch). */
export async function fetchDetails(type, id, { signal } = {}) {
  const d = await call(`/${type}/${id}`, { language: 'fr-FR', append_to_response: 'watch/providers' }, { signal });
  const fr = d['watch/providers']?.results?.FR || {};
  return {
    title: d.title || d.name || '',
    year: (d.release_date || d.first_air_date || '').slice(0, 4) || null,
    genres: (d.genres || []).map((g) => g.name),
    overview: d.overview || '',
    seasons: type === 'tv' ? (d.number_of_seasons ?? null) : null,
    posterPath: d.poster_path || null,
    platforms: (fr.flatrate || []).map((p) => p.provider_name),
    documentary: (d.genres || []).some((g) => g.id === 99)
  };
}
