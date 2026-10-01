/* Export et import JSON : la seule vraie sauvegarde (les données vivent sur l'iPhone).
   Format décrit dans SPEC.md, section 2 « Format d'export JSON ». */
import { APP_ID, SCHEMA_VERSION, CATEGORY_KEYS } from '../config.js';
import { db } from '../store/db.js';
import { emit } from '../store/events.js';
import { allRecos, normalizeReco, findDuplicate, loadRecos } from '../store/recommendations.js';
import { allPersons, getPerson, findByName, me, loadPersons, ensureMe } from '../store/persons.js';
import { subcats, getMeta, setMeta, mergeSubcats, replaceSubcats } from '../store/settings.js';
import { isPhoto } from './photo.js';
import { localDateISO, nowISO, uid, colorFromName } from '../utils.js';

const HEX = /^#[0-9a-f]{6}$/i;
const validDate = (s) => (typeof s === 'string' && !isNaN(new Date(s)) ? s : null);

export function buildExport() {
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowISO(),
    persons: allPersons().map(({ id, name, color, isMe, createdAt, photo }) => ({
      id, name, color, isMe: Boolean(isMe), createdAt, ...(photo ? { photo } : {})
    })),
    recommendations: allRecos(),
    subcategories: { place: subcats('place'), screen: subcats('screen'), podcast: subcats('podcast') }
  };
}

export const exportFileName = () => `${APP_ID}-sauvegarde-${localDateISO()}.json`;

/* Partage natif sur iPhone (« Enregistrer dans Fichiers », iCloud Drive),
   téléchargement classique ailleurs. À appeler directement depuis un tap. */
export async function exportBackup() {
  const data = buildExport();
  const name = exportFileName();
  const json = JSON.stringify(data, null, 2);
  const file = new File([json], name, { type: 'application/json' });
  let method = 'download';
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Sauvegarde À tester' });
      method = 'share';
    } catch (err) {
      if (err.name === 'AbortError') return { ok: false, cancelled: true };
    }
  }
  if (method === 'download') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  await setMeta('lastBackupAt', nowISO());
  return { ok: true, method, recos: data.recommendations.length, persons: data.persons.filter((p) => !p.isMe).length };
}

/* ——— Rappel de sauvegarde : plus de 14 jours et des ajouts depuis ——— */
export function backupDue(days = 14) {
  const recos = allRecos();
  if (!recos.length) return false;
  const since = getMeta('lastBackupAt') || getMeta('firstLaunchAt') || recos.reduce((m, r) => (r.createdAt < m ? r.createdAt : m), nowISO());
  const age = (Date.now() - new Date(since).getTime()) / 86400000;
  if (age < days) return false;
  const demo = new Set(getMeta('demo', {})?.recos || []);
  return recos.some((r) => !demo.has(r.id) && (r.createdAt > since || r.updatedAt > since));
}

/* ——— Import ——— */

/* Vérifie le fichier sans rien modifier. Renvoie { data } ou { error }. */
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { error: 'Ce fichier n’est pas un JSON valide.' }; }
  if (!data || typeof data !== 'object') return { error: 'Le fichier est vide ou illisible.' };
  if (data.app !== APP_ID) return { error: 'Ce fichier ne vient pas de l’app « À tester ».' };
  if (!Number.isInteger(data.schemaVersion) || data.schemaVersion < 1) return { error: 'Version de sauvegarde inconnue.' };
  if (data.schemaVersion > SCHEMA_VERSION) return { error: 'Cette sauvegarde vient d’une version plus récente de l’app : mets l’app à jour d’abord.' };
  if (!Array.isArray(data.persons) || !Array.isArray(data.recommendations)) {
    return { error: 'Structure incorrecte : la liste des personnes ou des recommandations manque.' };
  }
  const badP = data.persons.filter((p) => !p || typeof p.id !== 'string' || !p.id || typeof p.name !== 'string' || !p.name.trim()).length;
  const badR = data.recommendations.filter((r) => !r || typeof r.id !== 'string' || !r.id
    || !CATEGORY_KEYS.includes(r.category) || typeof r.title !== 'string' || !r.title.trim() || !Array.isArray(r.personIds)).length;
  if (badP || badR) {
    return { error: `Structure incorrecte : ${badR} recommandation(s) et ${badP} personne(s) illisibles. Rien n’a été modifié.` };
  }
  return { data: migrate(data) };
}

/* Point d'entrée des migrations quand schemaVersion évoluera. */
function migrate(data) {
  return data;
}

/* La photo (champ optionnel ajouté en 1.1) n'est gardée que si c'est bien une
   petite image JPEG, PNG ou WebP en data URL. */
function cleanPerson(p) {
  const name = p.name.trim().replace(/\s+/g, ' ').slice(0, 40);
  return {
    id: p.id,
    name,
    color: HEX.test(p.color || '') ? p.color : colorFromName(name),
    isMe: Boolean(p.isMe),
    createdAt: validDate(p.createdAt) || nowISO(),
    ...(isPhoto(p.photo) ? { photo: p.photo } : {})
  };
}

/* Remplace toutes les données par celles du fichier. */
export async function importReplace(data) {
  const persons = [];
  const idMap = new Map();
  const byName = new Map();
  for (const raw of data.persons) {
    const p = cleanPerson(raw);
    const key = p.name.toLowerCase();
    if (byName.has(key)) { idMap.set(raw.id, byName.get(key).id); continue; }
    persons.push(p);
    byName.set(key, p);
    idMap.set(raw.id, p.id);
  }
  let mine = persons.filter((p) => p.isMe);
  mine.slice(1).forEach((p) => { p.isMe = false; });
  if (!mine.length) {
    const named = byName.get('moi');
    if (named) named.isMe = true;
    else persons.push({ id: uid(), name: 'Moi', color: '#C2553B', isMe: true, createdAt: nowISO() });
  }
  const myId = persons.find((p) => p.isMe).id;
  const recos = data.recommendations.map((r) => {
    const ids = [...new Set(r.personIds.map((id) => idMap.get(id)).filter(Boolean))];
    return normalizeReco({ ...r, personIds: ids.length ? ids : [myId] });
  });
  await db.transaction('rw', db.recommendations, db.persons, async () => {
    await db.recommendations.clear();
    await db.persons.clear();
    await db.persons.bulkPut(persons);
    await db.recommendations.bulkPut(recos);
  });
  await replaceSubcats(data.subcategories);
  await setMeta('demo', null, true);
  await loadPersons();
  await loadRecos();
  emit('change', { type: 'import' });
  return { added: recos.length, updated: 0, persons: persons.filter((p) => !p.isMe).length };
}

/* Ajoute les éléments absents ; pour un même id, garde le plus récent (updatedAt).
   Les personnes de même nom sont rapprochées ; une même œuvre ou un même lieu
   saisi sur un autre appareil est fusionné (personnes réunies), sans doublon. */
export async function importMerge(data) {
  await ensureMe();
  const myId = me().id;
  const idMap = new Map();
  const newPersons = [];
  const withPhoto = new Map(); // personnes existantes sans photo qui en reçoivent une
  const adoptPhoto = (local, raw) => {
    if (!local.photo && !withPhoto.has(local.id) && isPhoto(raw.photo)) withPhoto.set(local.id, { ...local, photo: raw.photo });
  };
  for (const raw of data.persons) {
    if (raw.isMe) { idMap.set(raw.id, myId); adoptPhoto(me(), raw); continue; }
    if (getPerson(raw.id)) { idMap.set(raw.id, raw.id); adoptPhoto(getPerson(raw.id), raw); continue; }
    const p = cleanPerson(raw);
    const known = findByName(p.name);
    if (known) { idMap.set(raw.id, known.id); adoptPhoto(known, raw); continue; }
    const fresh = newPersons.find((n) => n.name.toLowerCase() === p.name.toLowerCase());
    if (fresh) { idMap.set(raw.id, fresh.id); if (!fresh.photo && p.photo) fresh.photo = p.photo; continue; }
    newPersons.push(p);
    idMap.set(raw.id, p.id);
  }

  const pool = [...allRecos()];
  const index = new Map(pool.map((r, i) => [r.id, i]));
  const toPut = new Map();
  let added = 0, updated = 0;
  const union = (a, b) => [...new Set([...a, ...b])];

  for (const raw of data.recommendations) {
    const ids = [...new Set(raw.personIds.map((id) => idMap.get(id)).filter(Boolean))];
    const inc = normalizeReco({ ...raw, personIds: ids.length ? ids : [myId] });
    if (index.has(inc.id)) {
      const cur = pool[index.get(inc.id)];
      if (inc.updatedAt > cur.updatedAt) {
        pool[index.get(inc.id)] = inc;
        toPut.set(inc.id, inc);
        updated++;
      }
      continue;
    }
    const dup = findDuplicate(inc, { pool });
    if (dup) {
      const base = inc.updatedAt > dup.updatedAt ? { ...inc, id: dup.id, createdAt: dup.createdAt } : { ...dup };
      base.personIds = union(dup.personIds, inc.personIds);
      if (inc.updatedAt > dup.updatedAt || base.personIds.length !== dup.personIds.length) {
        pool[index.get(dup.id)] = base;
        toPut.set(base.id, base);
        updated++;
      }
      continue;
    }
    index.set(inc.id, pool.length);
    pool.push(inc);
    toPut.set(inc.id, inc);
    added++;
  }

  await db.transaction('rw', db.recommendations, db.persons, async () => {
    if (newPersons.length || withPhoto.size) await db.persons.bulkPut([...newPersons, ...withPhoto.values()]);
    if (toPut.size) await db.recommendations.bulkPut([...toPut.values()]);
  });
  await mergeSubcats(data.subcategories);
  await loadPersons();
  await loadRecos();
  emit('change', { type: 'import' });
  return { added, updated, persons: newPersons.length };
}

/* Zone dangereuse : efface recommandations et personnes. Les réglages de
   l'appareil (thème, clé TMDB) sont conservés. */
export async function wipeAll() {
  await db.transaction('rw', db.recommendations, db.persons, async () => {
    await db.recommendations.clear();
    await db.persons.clear();
  });
  await replaceSubcats(null);
  await setMeta('demo', null, true);
  await setMeta('filters', null, true);
  await loadPersons();
  await loadRecos();
  await ensureMe();
  emit('change', { type: 'wipe' });
}
