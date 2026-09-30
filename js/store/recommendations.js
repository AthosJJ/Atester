/* Recommandations : cache mémoire + IndexedDB. Toute écriture passe ici,
   met à jour updatedAt et notifie les vues (événement 'change'). */
import { db } from './db.js';
import { emit } from './events.js';
import { CATEGORY_KEYS, STATUS_KEYS } from '../config.js';
import { uid, nowISO, localDateISO, titleKey, norm } from '../utils.js';

let list = [];
const byId = new Map();

export async function loadRecos() {
  list = await db.recommendations.toArray();
  byId.clear();
  for (const r of list) byId.set(r.id, r);
}

export const allRecos = () => list;
export const getReco = (id) => byId.get(id) || null;
export const recosOf = (cat) => list.filter((r) => r.category === cat);
export const recosByPerson = (pid) => list.filter((r) => r.personIds.includes(pid));

export function emptyDetails(category) {
  if (category === 'place') return { address: '', city: '', lat: null, lng: null, osmId: null, source: null };
  if (category === 'screen') return { tmdbId: null, tmdbType: null, year: null, posterPath: null, genres: [], platforms: [], overview: '', seasons: null };
  return { itunesId: null, showName: '', author: '', artworkUrl: '', episodeTitle: '', appleUrl: '', feedUrl: '' };
}

const isDate = (s) => typeof s === 'string' && !isNaN(new Date(s));
const str = (s) => (s == null ? '' : String(s));
const num = (n) => (n === '' || n == null || !isFinite(Number(n)) ? null : Number(n));

/* Garantit la forme d'une recommandation (création, édition, import). */
export function normalizeReco(r) {
  const category = CATEGORY_KEYS.includes(r.category) ? r.category : 'place';
  const status = STATUS_KEYS.includes(r.status) ? r.status : 'todo';
  const rating = status === 'done' && Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5 ? r.rating : null;
  const now = nowISO();
  const details = { ...emptyDetails(category), ...(r.details && typeof r.details === 'object' ? r.details : {}) };
  if (category === 'place') {
    details.lat = num(details.lat);
    details.lng = num(details.lng);
    if (details.lat == null || details.lng == null) { details.lat = null; details.lng = null; }
  }
  if (category === 'screen') {
    details.genres = Array.isArray(details.genres) ? details.genres.map(str).filter(Boolean) : [];
    details.platforms = Array.isArray(details.platforms) ? details.platforms.map(str).filter(Boolean) : [];
  }
  return {
    id: str(r.id) || uid(),
    category,
    subcategory: str(r.subcategory) || 'other',
    title: str(r.title).trim(),
    personIds: [...new Set((Array.isArray(r.personIds) ? r.personIds : []).map(str).filter(Boolean))],
    recommendedAt: /^\d{4}-\d{2}-\d{2}/.test(str(r.recommendedAt)) ? str(r.recommendedAt).slice(0, 10) : localDateISO(),
    status,
    rating,
    theirNote: str(r.theirNote),
    myReview: str(r.myReview),
    favorite: Boolean(r.favorite),
    link: str(r.link),
    details,
    createdAt: isDate(r.createdAt) ? r.createdAt : now,
    updatedAt: isDate(r.updatedAt) ? r.updatedAt : now,
    doneAt: status === 'done' ? (isDate(r.doneAt) ? r.doneAt : now) : null
  };
}

function keep(r) {
  if (!byId.has(r.id)) list.push(r);
  else list[list.findIndex((x) => x.id === r.id)] = r;
  byId.set(r.id, r);
}

function drop(id) {
  byId.delete(id);
  list = list.filter((x) => x.id !== id);
}

/* Demande un stockage persistant au premier ajout (iOS purge moins). */
let persistAsked = false;
async function askPersist() {
  if (persistAsked) return;
  persistAsked = true;
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch { /* non pris en charge */ }
}

export async function createReco(data) {
  const now = nowISO();
  const r = normalizeReco({ ...data, id: uid(), createdAt: now, updatedAt: now });
  await db.recommendations.put(r);
  keep(r);
  emit('change', { type: 'create', ids: [r.id] });
  askPersist();
  return r;
}

export async function updateReco(id, patch, { silent = false } = {}) {
  const cur = byId.get(id);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  if (patch.category && patch.category !== cur.category) {
    next.details = { ...emptyDetails(patch.category), ...(patch.details || {}) };
  } else if (patch.details) {
    next.details = { ...cur.details, ...patch.details };
  }
  if (patch.status && patch.status !== cur.status) {
    next.doneAt = patch.status === 'done' ? nowISO() : null;
  }
  if (next.status !== 'done') next.rating = null;
  next.updatedAt = nowISO();
  const r = normalizeReco(next);
  await db.recommendations.put(r);
  keep(r);
  if (!silent) emit('change', { type: 'update', ids: [id] });
  return r;
}

export function setStatus(id, status, { rating = null, myReview } = {}) {
  const patch = { status };
  if (status === 'done') patch.rating = rating;
  if (myReview !== undefined) patch.myReview = myReview;
  return updateReco(id, patch);
}

export function toggleFavorite(id) {
  const r = byId.get(id);
  return r ? updateReco(id, { favorite: !r.favorite }) : null;
}

export function addPersonsTo(id, personIds) {
  const r = byId.get(id);
  return r ? updateReco(id, { personIds: [...r.personIds, ...personIds] }) : null;
}

/* Renvoie l'élément supprimé, pour pouvoir annuler. */
export async function deleteReco(id) {
  const r = byId.get(id);
  if (!r) return null;
  await db.recommendations.delete(id);
  drop(id);
  emit('change', { type: 'delete', ids: [id] });
  return r;
}

/* Remet un instantané tel quel (annulation). */
export async function restoreReco(snapshot) {
  await db.recommendations.put(snapshot);
  keep(snapshot);
  emit('change', { type: 'restore', ids: [snapshot.id] });
}

export async function putRecos(recos, { silent = false } = {}) {
  if (!recos.length) return;
  await db.recommendations.bulkPut(recos);
  recos.forEach(keep);
  if (!silent) emit('change', { type: 'bulk', ids: recos.map((r) => r.id) });
}

export async function deleteRecos(ids, { silent = false } = {}) {
  if (!ids.length) return;
  await db.recommendations.bulkDelete(ids);
  ids.forEach(drop);
  if (!silent) emit('change', { type: 'bulk-delete', ids });
}

/* Met à jour le cache après une transaction faite ailleurs (fusion de personnes). */
export function cacheRecos(recos) { recos.forEach(keep); }

export async function reassignSubcat(cat, from, to) {
  const now = nowISO();
  const changed = list
    .filter((r) => r.category === cat && r.subcategory === from)
    .map((r) => ({ ...r, subcategory: to, updatedAt: now }));
  await putRecos(changed);
  return changed.length;
}

/* ——— Doublons ——— */

export function externalKey(r) {
  const d = r.details || {};
  if (r.category === 'place' && d.osmId) return 'osm:' + d.osmId;
  if (r.category === 'screen' && d.tmdbId) return `tmdb:${d.tmdbType || ''}:${d.tmdbId}`;
  if (r.category === 'podcast' && d.itunesId) return 'itunes:' + d.itunesId;
  return null;
}

/* Même identifiant externe, ou même titre normalisé (dans la même ville pour un lieu). */
export function findDuplicate(candidate, { excludeId = null, pool = list } = {}) {
  const ext = externalKey(candidate);
  const tk = titleKey(candidate.title);
  const city = norm(candidate.details?.city);
  for (const r of pool) {
    if (r.id === excludeId || r.category !== candidate.category) continue;
    const rext = externalKey(r);
    if (ext && rext) {
      if (ext === rext) return r;
      continue;
    }
    if (!tk || titleKey(r.title) !== tk) continue;
    if (candidate.category !== 'place') return r;
    const rc = norm(r.details?.city);
    if (!city || !rc || city === rc) return r;
  }
  return null;
}
