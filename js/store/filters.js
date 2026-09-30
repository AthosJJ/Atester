/* Filtres, recherche et tri. Un état par onglet, encodé dans l'URL et gardé
   dans localStorage (chargement instantané) et dans la table meta.
   Les critères se combinent en ET entre eux, en OU à l'intérieur d'un critère. */
import { CAT_OF, STATUS, STATUS_KEYS } from '../config.js';
import { norm, lsGet, lsSet, distanceKm } from '../utils.js';
import { emit } from './events.js';
import { allRecos } from './recommendations.js';
import { getPerson } from './persons.js';
import { subcat, getMeta, setMeta } from './settings.js';

export const CONTENT_TABS = ['lieux', 'ecrans', 'podcasts'];

/* Critères proposés dans le panneau, par onglet. */
export const TAB_CRITERIA = {
  lieux: ['persons', 'subcats', 'statuses', 'cities', 'fav', 'minRating'],
  ecrans: ['persons', 'subcats', 'statuses', 'platforms', 'fav', 'minRating'],
  podcasts: ['persons', 'subcats', 'statuses', 'fav', 'minRating']
};

/* Onglets où le statut a son contrôle segmenté (À voir / Vu / Tout). */
export const hasStatusSegment = (tab) => tab === 'ecrans' || tab === 'podcasts';
export const STATUS_PRESETS = { todo: ['todo'], done: ['done'], all: [] };

export function defaults(tab) {
  return {
    q: '', persons: [], subcats: [], statuses: hasStatusSegment(tab) ? ['todo'] : [],
    cities: [], platforms: [], fav: false, minRating: 0, sort: 'recent', view: 'carte', zone: false
  };
}

const states = {};

function sanitize(tab, raw = {}) {
  const d = defaults(tab);
  const arr = (v) => (Array.isArray(v) ? [...new Set(v.map(String).filter(Boolean))] : []);
  return {
    q: typeof raw.q === 'string' ? raw.q : d.q,
    persons: arr(raw.persons),
    subcats: arr(raw.subcats),
    statuses: Array.isArray(raw.statuses) ? arr(raw.statuses).filter((s) => STATUS_KEYS.includes(s)) : d.statuses,
    cities: arr(raw.cities),
    platforms: arr(raw.platforms),
    fav: Boolean(raw.fav),
    minRating: Number.isInteger(raw.minRating) && raw.minRating >= 1 && raw.minRating <= 5 ? raw.minRating : 0,
    sort: typeof raw.sort === 'string' && raw.sort ? raw.sort : d.sort,
    view: raw.view === 'liste' ? 'liste' : 'carte',
    zone: Boolean(raw.zone)
  };
}

export function getFilters(tab) {
  if (!states[tab]) {
    const saved = lsGet('filters:' + tab) || getMeta('filters', {})[tab];
    states[tab] = sanitize(tab, saved || {});
  }
  return states[tab];
}

function persist(tab) {
  lsSet('filters:' + tab, states[tab]);
  const all = { ...getMeta('filters', {}), [tab]: states[tab] };
  setMeta('filters', all, true).catch(() => {});
}

export function setFilters(tab, patch) {
  states[tab] = sanitize(tab, { ...getFilters(tab), ...patch });
  persist(tab);
  emit('filters', { tab });
}

export function replaceFilters(tab, st, { silent = false } = {}) {
  states[tab] = sanitize(tab, st);
  persist(tab);
  if (!silent) emit('filters', { tab });
}

/* Efface les critères et la recherche, garde la vue et le tri. */
export function resetFilters(tab) {
  const cur = getFilters(tab);
  replaceFilters(tab, { ...defaults(tab), view: cur.view, sort: cur.sort });
}

export function toggleValue(tab, key, value) {
  const cur = getFilters(tab)[key];
  setFilters(tab, { [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] });
}

/* ——— URL ——— */

const LIST_PARAMS = { persons: 'p', subcats: 'sc', statuses: 'st', cities: 'v', platforms: 'pf' };
const FILTER_PARAM_KEYS = ['q', 'p', 'sc', 'st', 'v', 'pf', 'fav', 'min', 'tri', 'vue', 'zone'];

/* Les virgules séparent les valeurs ; chaque valeur est encodée à part. */
export function toQuery(tab, st = getFilters(tab)) {
  const d = defaults(tab);
  const parts = [];
  if (tab === 'lieux') parts.push('vue=' + st.view);
  for (const [key, p] of Object.entries(LIST_PARAMS)) {
    if (key === 'statuses') {
      const same = st.statuses.length === d.statuses.length && st.statuses.every((s) => d.statuses.includes(s));
      if (!same) parts.push('st=' + (st.statuses.length ? st.statuses.join(',') : 'all'));
      continue;
    }
    if (st[key].length) parts.push(p + '=' + st[key].map(encodeURIComponent).join(','));
  }
  if (st.fav) parts.push('fav=1');
  if (st.minRating) parts.push('min=' + st.minRating);
  if (st.sort !== d.sort) parts.push('tri=' + st.sort);
  if (st.zone) parts.push('zone=1');
  if (st.q) parts.push('q=' + encodeURIComponent(st.q));
  return parts.join('&');
}

export function parseQuery(query) {
  const out = {};
  for (const part of String(query || '').split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    const k = i < 0 ? part : part.slice(0, i);
    const v = i < 0 ? '' : part.slice(i + 1);
    out[k] = v;
  }
  return out;
}

const dec = (s) => { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; } };

export const hasFilterParams = (params) => Object.keys(params).some((k) => FILTER_PARAM_KEYS.includes(k) && k !== 'vue');

/* Un lien définit l'état complet : ce qui n'y figure pas revient à sa valeur par défaut. */
export function fromParams(tab, params, base = defaults(tab)) {
  const st = { ...base };
  for (const [key, p] of Object.entries(LIST_PARAMS)) {
    if (!(p in params)) continue;
    if (key === 'statuses' && params[p] === 'all') { st.statuses = []; continue; }
    st[key] = params[p] ? params[p].split(',').map(dec).filter(Boolean) : [];
  }
  if ('fav' in params) st.fav = params.fav === '1';
  if ('min' in params) st.minRating = parseInt(params.min, 10) || 0;
  if ('tri' in params) st.sort = params.tri;
  if ('vue' in params) st.view = params.vue === 'liste' ? 'liste' : 'carte';
  if ('zone' in params) st.zone = params.zone === '1';
  if ('q' in params) st.q = dec(params.q);
  return sanitize(tab, st);
}

/* ——— Filtrage ——— */

const cityOf = (r) => (r.details && r.details.city ? String(r.details.city).trim() : '');

export function haystack(r) {
  const d = r.details || {};
  const names = r.personIds.map((id) => getPerson(id)?.name || '');
  return norm([
    r.title, r.theirNote, r.myReview, ...names, d.city, d.address, d.showName, d.episodeTitle, d.author,
    subcat(r.category, r.subcategory).label, ...(d.genres || []), ...(d.platforms || [])
  ].filter(Boolean).join(' • '));
}

function test(r, st, key, ctx) {
  switch (key) {
    case 'persons': return !st.persons.length || r.personIds.some((id) => st.persons.includes(id));
    case 'subcats': return !st.subcats.length || st.subcats.includes(r.subcategory);
    case 'statuses': return !st.statuses.length || st.statuses.includes(r.status);
    case 'cities': return !st.cities.length || st.cities.some((c) => norm(c) === norm(cityOf(r)));
    case 'platforms': return !st.platforms.length || (r.details.platforms || []).some((p) => st.platforms.includes(p));
    case 'fav': return !st.fav || r.favorite;
    case 'minRating': return !st.minRating || (r.rating || 0) >= st.minRating;
    case 'q': {
      if (!ctx.words.length) return true;
      const h = haystack(r);
      return ctx.words.every((w) => h.includes(w));
    }
    case 'zone': {
      if (!st.zone || !ctx.bounds) return true;
      const { lat, lng } = r.details;
      const b = ctx.bounds;
      return lat != null && lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
    }
    default: return true;
  }
}

const allKeys = (tab) => [...TAB_CRITERIA[tab], 'q', 'zone'];

export function filterRecos(tab, st = getFilters(tab), ctx = {}) {
  const cat = CAT_OF[tab];
  const c = { ...ctx, words: norm(st.q).split(' ').filter(Boolean) };
  const keys = allKeys(tab);
  return allRecos().filter((r) => r.category === cat && keys.every((k) => test(r, st, k, c)));
}

export function sortRecos(items, sort = 'recent', ctx = {}) {
  const recent = (a, b) => b.recommendedAt.localeCompare(a.recommendedAt) || b.createdAt.localeCompare(a.createdAt);
  let cmp = recent;
  if (sort === 'oldest') cmp = (a, b) => a.recommendedAt.localeCompare(b.recommendedAt) || a.createdAt.localeCompare(b.createdAt);
  else if (sort === 'rating') cmp = (a, b) => (b.rating || 0) - (a.rating || 0) || recent(a, b);
  else if (sort === 'alpha') cmp = (a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base', numeric: true });
  else if (sort === 'most') cmp = (a, b) => b.personIds.length - a.personIds.length || recent(a, b);
  else if (sort === 'distance' && ctx.position) {
    const dist = new Map(items.map((r) => [r.id, r.details.lat == null ? Infinity : distanceKm(ctx.position, r.details)]));
    cmp = (a, b) => dist.get(a.id) - dist.get(b.id) || recent(a, b);
  }
  return [...items].sort((a, b) => Number(b.favorite) - Number(a.favorite) || cmp(a, b));
}

export const results = (tab, st = getFilters(tab), ctx = {}) => sortRecos(filterRecos(tab, st, ctx), st.sort, ctx);

/* ——— Facettes : nombre de résultats par valeur, avec les autres critères actifs ——— */

function valuesOf(r, key) {
  switch (key) {
    case 'persons': return r.personIds;
    case 'subcats': return [r.subcategory];
    case 'statuses': return [r.status];
    case 'cities': return cityOf(r) ? [norm(cityOf(r))] : [];
    case 'platforms': return r.details.platforms || [];
    case 'fav': return r.favorite ? ['1'] : [];
    case 'minRating': return r.rating ? Array.from({ length: r.rating }, (_, i) => String(i + 1)) : [];
    default: return [];
  }
}

export function facetCounts(tab, st, key, ctx = {}) {
  const cat = CAT_OF[tab];
  const c = { ...ctx, words: norm(st.q).split(' ').filter(Boolean) };
  const others = allKeys(tab).filter((k) => k !== key);
  const counts = new Map();
  for (const r of allRecos()) {
    if (r.category !== cat || !others.every((k) => test(r, st, k, c))) continue;
    for (const v of valuesOf(r, key)) counts.set(v, (counts.get(v) || 0) + 1);
  }
  return counts;
}

/* Valeurs proposées, déduites des données de la catégorie. */
export function optionsFor(tab, key) {
  const cat = CAT_OF[tab];
  const pool = allRecos().filter((r) => r.category === cat);
  if (key === 'persons') {
    const n = new Map();
    for (const r of pool) for (const id of r.personIds) n.set(id, (n.get(id) || 0) + 1);
    return [...n.entries()]
      .map(([id, total]) => ({ value: id, person: getPerson(id), total }))
      .filter((o) => o.person)
      .sort((a, b) => b.total - a.total || a.person.name.localeCompare(b.person.name, 'fr'));
  }
  if (key === 'cities') {
    const groups = new Map();
    for (const r of pool) {
      const c = cityOf(r);
      if (!c) continue;
      const k = norm(c);
      const g = groups.get(k) || { value: c, spellings: new Map(), total: 0 };
      g.spellings.set(c, (g.spellings.get(c) || 0) + 1);
      g.total++;
      groups.set(k, g);
    }
    return [...groups.entries()].map(([k, g]) => {
      const label = [...g.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return { value: label, key: k, total: g.total };
    }).sort((a, b) => b.total - a.total || a.value.localeCompare(b.value, 'fr'));
  }
  if (key === 'platforms') {
    const n = new Map();
    for (const r of pool) for (const p of r.details.platforms || []) n.set(p, (n.get(p) || 0) + 1);
    return [...n.entries()].map(([value, total]) => ({ value, total }))
      .sort((a, b) => b.total - a.total || a.value.localeCompare(b.value, 'fr'));
  }
  return [];
}

/* ——— Filtres actifs ——— */

/* Le badge compte les critères qui restreignent les résultats ; le statut ne
   compte pas quand il a son propre contrôle segmenté, déjà visible. */
export function activeCount(tab, st = getFilters(tab)) {
  let n = 0;
  for (const key of TAB_CRITERIA[tab]) {
    if (key === 'statuses' && hasStatusSegment(tab) && segmentOf(st) !== null) continue;
    if (key === 'fav') n += st.fav ? 1 : 0;
    else if (key === 'minRating') n += st.minRating ? 1 : 0;
    else n += st[key].length ? 1 : 0;
  }
  return n;
}

/* Segment correspondant au filtre de statut, ou null s'il n'y en a pas. */
export function segmentOf(st) {
  const s = [...st.statuses].sort().join(',');
  if (s === 'todo') return 'todo';
  if (s === 'done') return 'done';
  if (s === '') return 'all';
  return null;
}

/* Puces retirables sous l'en-tête (les sous-catégories ont déjà leur rangée). */
export function activeChips(tab, st = getFilters(tab)) {
  const cat = CAT_OF[tab];
  const chips = [];
  for (const id of st.persons) {
    const p = getPerson(id);
    chips.push({ key: 'persons', value: id, label: p ? p.name : 'Personne supprimée', person: p });
  }
  if (!hasStatusSegment(tab) || segmentOf(st) === null) {
    for (const s of st.statuses) chips.push({ key: 'statuses', value: s, label: STATUS[cat][s] });
  }
  for (const c of st.cities) chips.push({ key: 'cities', value: c, label: c, icon: 'map-pin' });
  for (const p of st.platforms) chips.push({ key: 'platforms', value: p, label: p, icon: 'tv' });
  if (st.fav) chips.push({ key: 'fav', value: true, label: 'Favoris', icon: 'star' });
  if (st.minRating) chips.push({ key: 'minRating', value: st.minRating, label: `${st.minRating}+`, icon: 'star' });
  return chips;
}

export function removeChip(tab, chip) {
  const st = getFilters(tab);
  if (chip.key === 'fav') setFilters(tab, { fav: false });
  else if (chip.key === 'minRating') setFilters(tab, { minRating: 0 });
  else setFilters(tab, { [chip.key]: st[chip.key].filter((v) => v !== chip.value) });
}

/* Une recommandation passe-t-elle les filtres de son onglet ? (toast « masqué par les filtres ») */
export function passesFilters(tab, reco, ctx = {}) {
  return filterRecos(tab, getFilters(tab), ctx).some((r) => r.id === reco.id);
}
