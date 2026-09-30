/* Table meta : sous-catégories, préférences, clé TMDB, dates de sauvegarde.
   Tout est gardé en mémoire après le chargement : lecture synchrone. */
import { db } from './db.js';
import { emit } from './events.js';
import { DEFAULT_SUBCATEGORIES, CATEGORY_KEYS, SCHEMA_VERSION } from '../config.js';
import { norm, nowISO } from '../utils.js';

const cache = new Map();

export async function loadMeta() {
  const rows = await db.meta.toArray();
  cache.clear();
  for (const r of rows) cache.set(r.key, r.value);
  if (!cache.has('subcategories')) await setMeta('subcategories', structuredClone(DEFAULT_SUBCATEGORIES), true);
  if (!cache.has('schemaVersion')) await setMeta('schemaVersion', SCHEMA_VERSION, true);
  if (!cache.has('firstLaunchAt')) await setMeta('firstLaunchAt', nowISO(), true);
}

export const getMeta = (key, fallback = null) => (cache.has(key) ? cache.get(key) : fallback);

export async function setMeta(key, value, silent = false) {
  if (value === undefined || value === null) {
    cache.delete(key);
    await db.meta.delete(key);
  } else {
    cache.set(key, value);
    await db.meta.put({ key, value });
  }
  if (!silent) emit('meta', key);
}

/* ——— Préférences ——— */
export const getPref = (key, fallback = null) => (getMeta('prefs', {})[key] ?? fallback);
export async function setPref(key, value) {
  await setMeta('prefs', { ...getMeta('prefs', {}), [key]: value });
}

/* ——— Sous-catégories ——— */
const OTHER = {
  place: { key: 'other', label: 'Autre', icon: 'map-pin', color: '#8A8F98' },
  screen: { key: 'other', label: 'Autre', icon: 'clapperboard', color: '#8A8F98' },
  podcast: { key: 'other', label: 'Autre', icon: 'headphones', color: '#8A8F98' }
};

export function subcats(cat) {
  const list = getMeta('subcategories', DEFAULT_SUBCATEGORIES)[cat] || DEFAULT_SUBCATEGORIES[cat];
  // « Autre » existe toujours, en dernier.
  const others = list.filter((s) => s.key !== 'other');
  const other = list.find((s) => s.key === 'other') || OTHER[cat];
  return [...others, other];
}

export function subcat(cat, key) {
  const list = subcats(cat);
  return list.find((s) => s.key === key) || list[list.length - 1];
}

async function saveSubcats(cat, list) {
  const all = { ...getMeta('subcategories', DEFAULT_SUBCATEGORIES) };
  all[cat] = list;
  await setMeta('subcategories', all);
}

function slug(label) {
  return norm(label).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sc';
}

export async function addSubcat(cat, { label, icon, color }) {
  const list = subcats(cat);
  let key = slug(label);
  if (key === 'other' || list.some((s) => s.key === key)) {
    let i = 2;
    while (list.some((s) => s.key === `${key}-${i}`)) i++;
    key = `${key}-${i}`;
  }
  const item = { key, label: label.trim(), icon, color };
  await saveSubcats(cat, [...list.slice(0, -1), item, list[list.length - 1]]);
  return item;
}

export async function updateSubcat(cat, key, patch) {
  await saveSubcats(cat, subcats(cat).map((s) => (s.key === key ? { ...s, ...patch, key } : s)));
}

export async function removeSubcat(cat, key) {
  if (key === 'other') return;
  await saveSubcats(cat, subcats(cat).filter((s) => s.key !== key));
}

export async function reorderSubcats(cat, keys) {
  const list = subcats(cat);
  const byKey = new Map(list.map((s) => [s.key, s]));
  const ordered = keys.map((k) => byKey.get(k)).filter((s) => s && s.key !== 'other');
  const rest = list.filter((s) => s.key !== 'other' && !keys.includes(s.key));
  await saveSubcats(cat, [...ordered, ...rest, byKey.get('other') || OTHER[cat]]);
}

/* Fusion à l'import : ajoute les sous-catégories absentes. */
export async function mergeSubcats(incoming) {
  if (!incoming || typeof incoming !== 'object') return;
  const all = { ...getMeta('subcategories', DEFAULT_SUBCATEGORIES) };
  for (const cat of CATEGORY_KEYS) {
    const list = subcats(cat);
    const add = (Array.isArray(incoming[cat]) ? incoming[cat] : [])
      .filter((s) => s && s.key && s.label && !list.some((x) => x.key === s.key));
    if (add.length) all[cat] = [...list.slice(0, -1), ...add, list[list.length - 1]];
  }
  await setMeta('subcategories', all);
}

export async function replaceSubcats(incoming) {
  const all = {};
  for (const cat of CATEGORY_KEYS) {
    const list = Array.isArray(incoming?.[cat]) ? incoming[cat].filter((s) => s && s.key && s.label) : [];
    all[cat] = list.length ? list : structuredClone(DEFAULT_SUBCATEGORIES[cat]);
  }
  await setMeta('subcategories', all);
}
