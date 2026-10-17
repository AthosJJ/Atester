/* Films et séries avec TMDB (API v3). La clé n'est ni dans le code ni dans
   l'app : une fois la personne connectée, elle est lue dans le document
   Firestore config/tmdb (champ apiKey, lisible par tout compte connecté,
   jamais modifiable depuis l'app) et gardée en mémoire. Accepte une « clé
   d'API » v3 ou un « jeton d'accès en lecture » v4. */
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';
import { db } from './firebase.js';
import { fetchJSON, ApiError } from './http.js';
import { emit } from '../store/events.js';

const API = 'https://api.themoviedb.org/3';
export const IMG = 'https://image.tmdb.org/t/p/';

let key = '';
let status = null; // 'ok' | 'missing' | 'invalid' | null (pas encore lue)
let loading = null;

function setStatus(next) {
  if (status === next) return;
  status = next;
  emit('meta', 'tmdb');
}

/* Lecture de config/tmdb ; sans réseau, elle sera retentée au retour en ligne. */
export function loadKey() {
  if (loading) return loading;
  loading = getDoc(doc(db, 'config', 'tmdb'))
    .then((snap) => {
      key = snap.exists() ? String(snap.data().apiKey || '').trim() : '';
      setStatus(key ? 'ok' : 'missing');
    })
    .catch((err) => {
      console.warn('[tmdb] clé non lue', err?.code || err);
    })
    .finally(() => { loading = null; });
  return loading;
}

window.addEventListener('online', () => { if (!key && status !== null) loadKey(); });

export const keyStatus = () => status;
export const hasUsableKey = () => Boolean(key) && status === 'ok';

/* Juste après la connexion, la clé peut être encore en route. */
export async function ensureKey() {
  if (status === null) await loadKey();
  return hasUsableKey();
}

/* Message à afficher quand la recherche de films est indisponible. */
export function unavailableMessage() {
  if (status === 'invalid') return 'TMDB refuse la clé configurée : la recherche de films est désactivée. Tu peux ajouter le titre à la main.';
  if (status === 'missing') return 'La recherche de films n’est pas encore disponible. Tu peux ajouter le titre à la main.';
  return 'La recherche de films est indisponible pour l’instant. Tu peux ajouter le titre à la main.';
}

const isBearer = (k) => k.startsWith('eyJ') && k.length > 60;

async function call(path, params = {}, { signal } = {}) {
  if (!key) throw new ApiError('auth');
  const used = key;
  const qs = new URLSearchParams(params);
  const headers = { Accept: 'application/json' };
  if (isBearer(used)) headers.Authorization = `Bearer ${used}`;
  else qs.set('api_key', used);
  try {
    return await fetchJSON(`${API}${path}?${qs}`, { signal, headers });
  } catch (err) {
    if (err.kind === 'auth' && used === key) setStatus('invalid');
    throw err;
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
