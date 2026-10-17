/* Réglages. Ceux du compte (sous-catégories, exemples) vivent dans le
   document de l'app sur Firestore et suivent la personne d'un appareil à
   l'autre ; ceux de l'appareil (style de carte, appli d'itinéraire, dernière
   catégorie) restent dans localStorage. Tout est lu de façon synchrone. */
import { emit } from './events.js';
import { register, setApp, DELETE } from './cloud.js';
import { DEFAULT_SUBCATEGORIES, CATEGORY_KEYS, SCHEMA_VERSION } from '../config.js';
import { norm, lsGet, lsSet, sameData } from '../utils.js';

const cache = new Map();

register('app', (snap, first) => {
  const data = snap.exists() ? snap.data() : {};
  if (first) cache.clear();
  const keys = new Set([...cache.keys(), ...Object.keys(data)]);
  for (const key of keys) {
    const value = data[key] ?? null;
    if (sameData(cache.get(key) ?? null, value)) continue;
    if (value === null) cache.delete(key);
    else cache.set(key, value);
    emit('meta', key);
  }
});

export const getMeta = (key, fallback = null) => (cache.has(key) ? cache.get(key) : fallback);

export async function setMeta(key, value, silent = false) {
  if (value === undefined || value === null) {
    cache.delete(key);
    setApp({ [key]: DELETE });
  } else {
    cache.set(key, value);
    setApp({ [key]: value, schemaVersion: SCHEMA_VERSION });
  }
  if (!silent) emit('meta', key);
}

/* ——— Préférences de l'appareil ——— */
export const getPref = (key, fallback = null) => (lsGet('prefs', {})?.[key] ?? fallback);
export async function setPref(key, value) {
  lsSet('prefs', { ...lsGet('prefs', {}), [key]: value });
  emit('meta', 'prefs');
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
