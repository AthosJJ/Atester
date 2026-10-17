/* Personnes : cache mémoire alimenté par Firestore (store/cloud.js). Le
   prénom est unique sans tenir compte de la casse ; les statistiques sont
   toujours calculées, jamais stockées. « Moi » a un identifiant fixe, pour
   que deux appareils ne le créent pas chacun de leur côté. */
import { emit } from './events.js';
import { register, put, patch, commit, DELETE, fromServer } from './cloud.js';
import { allRecos, cacheRecos, recoOps } from './recommendations.js';
import { uid, nowISO, norm, colorFromName, levenshtein, sameData } from '../utils.js';

export const ME_ID = 'me';
const ME_COLOR = '#C2553B';
const HEX = /^#[0-9a-f]{6}$/i;

let list = [];
const byId = new Map();

/* Forme garantie d'une personne lue dans Firestore. */
function clean(data, id) {
  const name = String(data.name || '').trim() || 'Sans nom';
  const isMe = Boolean(data.isMe);
  const p = {
    id,
    name,
    color: HEX.test(data.color || '') ? data.color : isMe ? ME_COLOR : colorFromName(name),
    isMe,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : '1970-01-01T00:00:00.000Z'
  };
  if (typeof data.photo === 'string' && data.photo.startsWith('data:image/')) p.photo = data.photo;
  return p;
}

register('persons', (snap, first) => {
  if (first) { list = []; byId.clear(); }
  const ids = [];
  for (const ch of snap.docChanges()) {
    const id = ch.doc.id;
    if (ch.type === 'removed') {
      if (byId.has(id)) { drop(id); ids.push(id); }
      continue;
    }
    const p = clean(ch.doc.data(), id);
    if (!sameData(byId.get(id), p)) { keep(p); ids.push(id); }
  }
  if (ids.length) emit('change', { type: 'person', ids });
  // Compte tout neuf (confirmé par le serveur) : on crée « Moi ».
  if (fromServer('persons') && !me()) ensureMe();
});

export const allPersons = () => list;
export const getPerson = (id) => byId.get(id) || null;
export const me = () => list.find((p) => p.isMe) || null;

const nameKey = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const cleanName = (s) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, 40);

export const findByName = (name) => list.find((p) => nameKey(p.name) === nameKey(name)) || null;

function keep(p) {
  if (!byId.has(p.id)) list.push(p);
  else list[list.findIndex((x) => x.id === p.id)] = p;
  byId.set(p.id, p);
}

function drop(id) {
  byId.delete(id);
  list = list.filter((p) => p.id !== id);
}

export async function ensureMe() {
  if (me()) return;
  const p = { id: ME_ID, name: 'Moi', color: ME_COLOR, isMe: true, createdAt: nowISO() };
  keep(p);
  if (fromServer('persons')) put('persons', ME_ID, p); // le serveur confirme : pas encore de « Moi »
  // Sans confirmation (hors ligne) : fusion, pour garder la photo ou la
  // couleur d'un « Moi » déjà créé sur un autre appareil.
  else commit([{ type: 'set', col: 'persons', id: ME_ID, data: { id: ME_ID, name: 'Moi', isMe: true }, merge: true }]);
  emit('change', { type: 'person', ids: [ME_ID] });
}

export async function createPerson(name, { color, silent = false } = {}) {
  const cleaned = cleanName(name);
  if (!cleaned) throw new Error('Le prénom est vide.');
  const existing = findByName(cleaned);
  if (existing) return existing;
  const p = { id: uid(), name: cleaned, color: color || colorFromName(cleaned), isMe: false, createdAt: nowISO() };
  keep(p);
  put('persons', p.id, p);
  if (!silent) emit('change', { type: 'person', ids: [p.id] });
  return p;
}

/* Suggestions d'autocomplétion, tolérantes aux accents et aux fautes légères
   (« Paulo » propose « Paul » : c'est souvent la même personne). */
export function searchPersons(q, { exclude = [] } = {}) {
  const k = norm(q);
  if (!k) return [];
  const scored = [];
  for (const p of list) {
    if (exclude.includes(p.id)) continue;
    const n = norm(p.name);
    let score = -1;
    if (n === k) score = 100;
    else if (n.startsWith(k)) score = 80;
    else if (n.split(/[\s-]/).some((w) => w.startsWith(k))) score = 60;
    else if (k.length >= 2 && n.includes(k)) score = 40;
    else if (k.length >= 3 && levenshtein(n, k) <= (k.length >= 6 ? 2 : 1)) score = 20;
    if (score >= 0) scored.push([score, p]);
  }
  return scored
    .sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name, 'fr'))
    .map(([, p]) => p);
}

export async function renamePerson(id, name) {
  const cleaned = cleanName(name);
  if (!cleaned) throw new Error('Le prénom est vide.');
  const other = findByName(cleaned);
  if (other && other.id !== id) {
    const err = new Error(`« ${other.name} » existe déjà.`);
    err.conflict = other;
    throw err;
  }
  const p = { ...byId.get(id), name: cleaned };
  keep(p);
  patch('persons', id, { name: cleaned });
  emit('change', { type: 'person', ids: [id] });
  return p;
}

export async function setPersonColor(id, color) {
  const p = { ...byId.get(id), color };
  keep(p);
  patch('persons', id, { color });
  emit('change', { type: 'person', ids: [id] });
}

/* Photo : data URL JPEG carrée de 200 px, 30 Ko au plus (services/photo.js),
   rangée dans la fiche de la personne ; null pour la retirer. */
export async function setPersonPhoto(id, photo) {
  if (!byId.has(id)) return;
  const p = { ...byId.get(id) };
  if (photo) p.photo = photo;
  else delete p.photo;
  keep(p);
  patch('persons', id, { photo: photo || DELETE });
  emit('change', { type: 'person', ids: [id] });
}

/* Remplace la source par la cible dans toutes les recommandations, puis supprime la source. */
export async function mergePersons(sourceId, targetId) {
  const src = byId.get(sourceId);
  const dst = byId.get(targetId);
  if (!src || !dst || sourceId === targetId || src.isMe) return 0;
  const now = nowISO();
  const affected = allRecos()
    .filter((r) => r.personIds.includes(sourceId))
    .map((r) => ({ ...r, personIds: [...new Set(r.personIds.map((id) => (id === sourceId ? targetId : id)))], updatedAt: now }));
  cacheRecos(affected);
  drop(sourceId);
  commit([...recoOps(affected), { type: 'delete', col: 'persons', id: sourceId }]);
  emit('change', { type: 'merge', ids: [targetId] });
  return affected.length;
}

/* Recommandations qui n'ont que cette personne : la supprimer les rendrait orphelines. */
export const soleRecos = (id) => allRecos().filter((r) => r.personIds.length === 1 && r.personIds[0] === id);

export async function deletePerson(id) {
  const p = byId.get(id);
  if (!p || p.isMe || soleRecos(id).length) return null;
  const before = allRecos().filter((r) => r.personIds.includes(id));
  const now = nowISO();
  const after = before.map((r) => ({ ...r, personIds: r.personIds.filter((x) => x !== id), updatedAt: now }));
  cacheRecos(after);
  drop(id);
  commit([...recoOps(after), { type: 'delete', col: 'persons', id }]);
  emit('change', { type: 'person-delete', ids: [id] });
  return { person: p, recos: before };
}

export async function restorePerson(snapshot) {
  keep(snapshot.person);
  cacheRecos(snapshot.recos);
  commit([...personOps([snapshot.person]), ...recoOps(snapshot.recos)]);
  emit('change', { type: 'person', ids: [snapshot.person.id] });
}

/* Écritures en bloc (exemples). */
export async function putPersons(persons, { silent = false } = {}) {
  if (!persons.length) return;
  persons.forEach(keep);
  commit(personOps(persons));
  if (!silent) emit('change', { type: 'person', ids: persons.map((p) => p.id) });
}

export async function deletePersons(ids, { silent = false } = {}) {
  if (!ids.length) return;
  ids.forEach(drop);
  commit(ids.map((id) => ({ type: 'delete', col: 'persons', id })));
  if (!silent) emit('change', { type: 'person-delete', ids });
}

export const personOps = (persons) => persons.map((p) => ({ type: 'set', col: 'persons', id: p.id, data: p }));

/* Met à jour le cache après un lot écrit ailleurs (import). */
export function cachePersons(persons) { persons.forEach(keep); }
export function uncachePersons(ids) { ids.forEach(drop); }

export function personStats(id) {
  const byCat = { place: 0, screen: 0, podcast: 0 };
  let total = 0, done = 0, sum = 0, rated = 0, last = null;
  for (const r of allRecos()) {
    if (!r.personIds.includes(id)) continue;
    total++;
    byCat[r.category]++;
    if (r.status === 'done') {
      done++;
      if (r.rating) { sum += r.rating; rated++; }
    }
    if (!last || r.recommendedAt > last) last = r.recommendedAt;
  }
  return { total, byCat, done, avg: rated ? sum / rated : null, rated, last };
}

/* Les personnes utilisées le plus récemment (pour les puces de l'ajout rapide). */
export function recentPersons(n = 6) {
  const lastUse = new Map();
  for (const r of allRecos()) {
    for (const pid of r.personIds) {
      if (!lastUse.has(pid) || r.createdAt > lastUse.get(pid)) lastUse.set(pid, r.createdAt);
    }
  }
  return list
    .filter((p) => !p.isMe)
    .sort((a, b) => (lastUse.get(b.id) || b.createdAt).localeCompare(lastUse.get(a.id) || a.createdAt))
    .slice(0, n);
}

export const personsOf = (reco) => reco.personIds.map(getPerson).filter(Boolean);
