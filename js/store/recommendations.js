/* Recommandations : cache mémoire alimenté par Firestore (store/cloud.js).
   Toute écriture passe ici : elle met à jour updatedAt, s'applique tout de
   suite en mémoire, notifie les vues (événement 'change') et part vers
   Firestore sans être attendue. */
import { emit } from './events.js';
import { register, put, patch as patchDoc, remove, commit } from './cloud.js';
import { CATEGORY_KEYS, STATUS_KEYS } from '../config.js';
import { uid, nowISO, localDateISO, titleKey, norm, sameData } from '../utils.js';

let list = [];
const byId = new Map();

/* Instantané Firestore : seules les fiches réellement différentes du cache
   (modifiées sur un autre appareil, ou annulées par le serveur) sont signalées. */
register('recommendations', (snap, first) => {
  if (first) { list = []; byId.clear(); }
  const ids = [];
  for (const ch of snap.docChanges()) {
    const id = ch.doc.id;
    if (ch.type === 'removed') {
      if (byId.has(id)) { drop(id); ids.push(id); }
      continue;
    }
    const r = normalizeReco({ ...ch.doc.data(), id });
    if (!sameData(byId.get(id), r)) { keep(r); ids.push(id); }
  }
  if (ids.length) emit('change', { type: 'sync', ids });
});

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
  keep(r);
  put('recommendations', r.id, r);
  emit('change', { type: 'create', ids: [r.id] });
  askPersist();
  return r;
}

/* Champs modifiés, au format Firestore (« details.platforms ») : deux
   appareils qui changent des champs différents ne s'écrasent pas. */
function changedFields(cur, next) {
  const out = {};
  for (const k of Object.keys(next)) {
    if (k === 'details') {
      for (const dk of Object.keys(next.details)) {
        if (!sameData(cur.details?.[dk], next.details[dk])) out['details.' + dk] = next.details[dk];
      }
    } else if (!sameData(cur[k], next[k])) {
      out[k] = next[k];
    }
  }
  return out;
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
  keep(r);
  if (r.category !== cur.category) put('recommendations', id, r);
  else patchDoc('recommendations', id, changedFields(cur, r));
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
  drop(id);
  remove('recommendations', id);
  emit('change', { type: 'delete', ids: [id] });
  return r;
}

/* Remet un instantané tel quel (annulation). */
export async function restoreReco(snapshot) {
  keep(snapshot);
  put('recommendations', snapshot.id, snapshot);
  emit('change', { type: 'restore', ids: [snapshot.id] });
}

/* Écritures en bloc (exemples, sous-catégorie supprimée). */
export async function putRecos(recos, { silent = false } = {}) {
  if (!recos.length) return;
  recos.forEach(keep);
  commit(recoOps(recos));
  if (!silent) emit('change', { type: 'bulk', ids: recos.map((r) => r.id) });
}

export async function deleteRecos(ids, { silent = false } = {}) {
  if (!ids.length) return;
  ids.forEach(drop);
  commit(ids.map((id) => ({ type: 'delete', col: 'recommendations', id })));
  if (!silent) emit('change', { type: 'bulk-delete', ids });
}

/* Opérations Firestore correspondantes, pour un lot préparé ailleurs
   (fusion de personnes, import). */
export const recoOps = (recos) => recos.map((r) => ({ type: 'set', col: 'recommendations', id: r.id, data: r }));

/* Met à jour le cache après un lot écrit ailleurs. */
export function cacheRecos(recos) { recos.forEach(keep); }
export function uncacheRecos(ids) { ids.forEach(drop); }

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
