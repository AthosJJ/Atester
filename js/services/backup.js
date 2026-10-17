/* Sauvegarde et import. Les données vivent dans le compte (Firestore) ;
   l'export JSON reste une sauvegarde facultative. L'import, depuis un fichier
   JSON ou l'ancien stockage de l'appareil, fusionne sans créer de doublons :
   relancé, il n'ajoute rien. Il est ensuite vérifié en relisant le compte
   sur le serveur. Format décrit dans SPEC.md, section 2 « Format d'export JSON ». */
import { APP_ID, SCHEMA_VERSION, CATEGORY_KEYS } from '../config.js';
import { emit } from '../store/events.js';
import { commit, serverDocs } from '../store/cloud.js';
import { allRecos, normalizeReco, findDuplicate, cacheRecos, recoOps, deleteRecos } from '../store/recommendations.js';
import { allPersons, getPerson, findByName, me, ensureMe, cachePersons, personOps, deletePersons } from '../store/persons.js';
import { subcats, getMeta, setMeta, mergeSubcats, replaceSubcats } from '../store/settings.js';
import { isPhoto, shrinkPhoto } from './photo.js';
import { readLegacy } from './legacy.js';
import { localDateISO, nowISO, colorFromName, lsGet, lsSet, wait } from '../utils.js';

const HEX = /^#[0-9a-f]{6}$/i;
const validDate = (s) => (typeof s === 'string' && !isNaN(new Date(s)) ? s : null);
const SEND_TIMEOUT = 60000;

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
export const lastBackupAt = () => lsGet('lastBackupAt');

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
  lsSet('lastBackupAt', nowISO());
  return { ok: true, method, recos: data.recommendations.length, persons: data.persons.filter((p) => !p.isMe).length };
}

/* ——— Import ——— */

const validPerson = (p) => p && typeof p.id === 'string' && p.id && typeof p.name === 'string' && p.name.trim();
const validReco = (r) => r && typeof r.id === 'string' && r.id && CATEGORY_KEYS.includes(r.category)
  && typeof r.title === 'string' && r.title.trim() && Array.isArray(r.personIds);

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
  const badP = data.persons.filter((p) => !validPerson(p)).length;
  const badR = data.recommendations.filter((r) => !validReco(r)).length;
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
   image JPEG, PNG ou WebP en data URL ; elle est convertie avant l'envoi. */
function cleanPerson(p) {
  const name = p.name.trim().replace(/\s+/g, ' ').slice(0, 40);
  return {
    id: p.id,
    name,
    color: HEX.test(p.color || '') ? p.color : colorFromName(name),
    isMe: false,
    createdAt: validDate(p.createdAt) || nowISO(),
    ...(isPhoto(p.photo) ? { photo: p.photo } : {})
  };
}

/* Fusion, sans rien écrire : pour un même id, la version la plus récente
   (updatedAt) gagne ; les personnes de même nom sont rapprochées ; une même
   œuvre ou un même lieu déjà présent est réuni (personnes cumulées). */
function plan(data) {
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
  const recoIdMap = new Map(); // id du fichier → id dans le compte
  let added = 0, updated = 0;
  const union = (a, b) => [...new Set([...a, ...b])];

  for (const raw of data.recommendations) {
    const ids = [...new Set(raw.personIds.map((id) => idMap.get(id)).filter(Boolean))];
    const inc = normalizeReco({ ...raw, personIds: ids.length ? ids : [myId] });
    if (index.has(inc.id)) {
      recoIdMap.set(raw.id, inc.id);
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
      recoIdMap.set(raw.id, dup.id);
      const base = inc.updatedAt > dup.updatedAt ? { ...inc, id: dup.id, createdAt: dup.createdAt } : { ...dup };
      base.personIds = union(dup.personIds, inc.personIds);
      if (inc.updatedAt > dup.updatedAt || base.personIds.length !== dup.personIds.length) {
        pool[index.get(dup.id)] = base;
        toPut.set(base.id, base);
        updated++;
      }
      continue;
    }
    recoIdMap.set(raw.id, inc.id);
    index.set(inc.id, pool.length);
    pool.push(inc);
    toPut.set(inc.id, inc);
    added++;
  }
  return { idMap, recoIdMap, newPersons, withPhoto, toPut, added, updated };
}

/* Les photos passent au format du compte (200 px, 30 Ko au plus). */
async function convertPhotos(persons) {
  for (const p of persons) {
    if (!p.photo) continue;
    const small = await shrinkPhoto(p.photo);
    if (small) p.photo = small;
    else delete p.photo;
  }
}

export class ImportError extends Error {
  constructor(kind) {
    super(kind);
    this.kind = kind; // 'offline' | 'empty'
  }
}

/* Fusionne les données dans le compte, attend que le serveur ait tout reçu,
   puis relit le compte sur le serveur pour vérifier que chaque élément
   importé y est bien. */
export async function importMerge(data, { onStep } = {}) {
  if (!navigator.onLine) throw new ImportError('offline');
  await ensureMe();
  const p = plan(data);
  onStep?.('photos');
  const persons = [...p.newPersons, ...p.withPhoto.values()];
  await convertPhotos(persons);
  const recos = [...p.toPut.values()];

  cachePersons(persons);
  cacheRecos(recos);
  if (data.subcategories) await mergeSubcats(data.subcategories);
  emit('change', { type: 'import' });

  onStep?.('send');
  const sent = commit([...personOps(persons), ...recoOps(recos)]);
  const done = await Promise.race([sent.then(() => true), wait(SEND_TIMEOUT).then(() => false)]);
  const res = { added: p.added, updated: p.updated, persons: p.newPersons.length, idMap: p.idMap, recoIdMap: p.recoIdMap };
  if (!done) return { ...res, verified: false, pending: true };

  onStep?.('verify');
  const [srvRecos, srvPersons] = await Promise.all([serverDocs('recommendations'), serverDocs('persons')]);
  const missing = [...new Set(p.recoIdMap.values())].filter((id) => !srvRecos.has(id)).length
    + [...new Set(p.idMap.values())].filter((id) => !srvPersons.has(id)).length;
  return { ...res, verified: missing === 0, missing };
}

/* Ancien stockage de l'appareil (versions 1.x) → compte. Les exemples
   éventuels restent marqués comme tels (« Retirer les exemples »). */
export async function importLocal(opts) {
  const legacy = await readLegacy();
  if (!legacy) throw new ImportError('empty');
  const data = migrate({
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    persons: legacy.persons.filter(validPerson),
    recommendations: legacy.recommendations.filter(validReco),
    subcategories: legacy.subcategories
  });
  const res = await importMerge(data, opts);
  if (legacy.demo && (legacy.demo.recos?.length || legacy.demo.persons?.length)) {
    const cur = getMeta('demo', null) || { recos: [], persons: [] };
    const recos = (legacy.demo.recos || []).map((id) => res.recoIdMap.get(id)).filter(Boolean);
    const persons = (legacy.demo.persons || []).map((id) => res.idMap.get(id)).filter((id) => id && id !== me().id);
    await setMeta('demo', { recos: [...new Set([...cur.recos, ...recos])], persons: [...new Set([...cur.persons, ...persons])] }, true);
  }
  if (res.verified) lsSet('legacy-imported', nowISO());
  return res;
}

/* Zone dangereuse : efface les recommandations et les personnes du compte,
   sur tous les appareils. « Moi » reste. */
export async function wipeAll() {
  await deleteRecos(allRecos().map((r) => r.id), { silent: true });
  await deletePersons(allPersons().filter((p) => !p.isMe).map((p) => p.id), { silent: true });
  await replaceSubcats(null);
  await setMeta('demo', null, true);
  await ensureMe();
  emit('change', { type: 'wipe' });
}
