/* Podcasts avec l'API iTunes Search (Apple), sans clé.
   Si le navigateur bloque la requête (CORS), repli sur JSONP. */
import { fetchJSON, jsonp, isAbort } from './http.js';

const BASE = 'https://itunes.apple.com/search';

/* Thème deviné depuis les genres Apple Podcasts. */
const GENRE_SUBCAT = {
  1324: 'societe', 1489: 'societe', 1488: 'societe', 1511: 'societe',
  1301: 'culture', 1309: 'culture', 1310: 'culture', 1483: 'culture', 1502: 'culture',
  1487: 'histoire',
  1533: 'sciences', 1318: 'sciences', 1512: 'sciences',
  1321: 'business',
  1303: 'humour',
  1545: 'sport',
  1304: 'dev-perso', 1500: 'dev-perso'
};
const NAME_SUBCAT = [
  [/soci|news|actu|crime|politi|government/i, 'societe'],
  [/histo/i, 'histoire'],
  [/scien|techno|sant|health/i, 'sciences'],
  [/business|entrepr|invest|career/i, 'business'],
  [/comed|humou/i, 'humour'],
  [/sport/i, 'sport'],
  [/educat|self|d[ée]velopp|improve/i, 'dev-perso'],
  [/art|film|tv|music|musique|fiction|litt|book|design|culture/i, 'culture']
];

function guessSubcat(r) {
  for (const id of (r.genreIds || []).map(Number)) if (GENRE_SUBCAT[id]) return GENRE_SUBCAT[id];
  const name = r.primaryGenreName || '';
  for (const [re, key] of NAME_SUBCAT) if (re.test(name)) return key;
  return null;
}

async function query(params, signal) {
  const url = `${BASE}?${new URLSearchParams(params)}`;
  try {
    return await fetchJSON(url, { signal });
  } catch (err) {
    if (isAbort(err) || err.kind === 'offline' || err.kind === 'timeout') throw err;
    return jsonp(url, { signal });
  }
}

export async function searchShows(q, { signal } = {}) {
  const data = await query({ term: q, media: 'podcast', country: 'FR', limit: '10' }, signal);
  return (data.results || []).filter((r) => r.collectionId).map((r) => ({
    itunesId: r.collectionId,
    showName: r.collectionName || r.trackName || '',
    author: r.artistName || '',
    artworkUrl: r.artworkUrl600 || r.artworkUrl100 || '',
    appleUrl: r.collectionViewUrl || '',
    feedUrl: r.feedUrl || '',
    subcat: guessSubcat(r)
  }));
}

/* Épisode précis (facultatif) : on cherche dans l'émission choisie si possible. */
export async function searchEpisodes(q, { showName = '', itunesId = null, signal } = {}) {
  const term = [showName, q].filter(Boolean).join(' ');
  const data = await query({ term, media: 'podcast', entity: 'podcastEpisode', country: 'FR', limit: '15' }, signal);
  const items = (data.results || []).map((r) => ({
    title: r.trackName || '',
    showName: r.collectionName || '',
    collectionId: r.collectionId,
    url: r.trackViewUrl || '',
    date: (r.releaseDate || '').slice(0, 10),
    artworkUrl: r.artworkUrl600 || r.artworkUrl160 || ''
  })).filter((e) => e.title);
  return itunesId ? items.sort((a, b) => Number(b.collectionId === itunesId) - Number(a.collectionId === itunesId)) : items;
}
