/* Personnes : cache mémoire + IndexedDB. Le prénom est unique sans tenir
   compte de la casse ; les statistiques sont toujours calculées, jamais stockées. */
import { db } from './db.js';
import { emit } from './events.js';
import { allRecos, cacheRecos } from './recommendations.js';
import { uid, nowISO, norm, colorFromName, levenshtein } from '../utils.js';

let list = [];
const byId = new Map();

export async function loadPersons() {
  list = await db.persons.toArray();
  byId.clear();
  for (const p of list) byId.set(p.id, p);
}

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
  if (!me()) await createPerson('Moi', { isMe: true, color: '#C2553B', silent: true });
}

export async function createPerson(name, { isMe = false, color, silent = false } = {}) {
  const clean = cleanName(name);
  if (!clean) throw new Error('Le prénom est vide.');
  const existing = findByName(clean);
  if (existing) return existing;
  const p = { id: uid(), name: clean, color: color || colorFromName(clean), isMe, createdAt: nowISO() };
  await db.persons.put(p);
  keep(p);
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
  const clean = cleanName(name);
  if (!clean) throw new Error('Le prénom est vide.');
  const other = findByName(clean);
  if (other && other.id !== id) {
    const err = new Error(`« ${other.name} » existe déjà.`);
    err.conflict = other;
    throw err;
  }
  const p = { ...byId.get(id), name: clean };
  await db.persons.put(p);
  keep(p);
  emit('change', { type: 'person', ids: [id] });
  return p;
}

export async function setPersonColor(id, color) {
  const p = { ...byId.get(id), color };
  await db.persons.put(p);
  keep(p);
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
  await db.transaction('rw', db.recommendations, db.persons, async () => {
    if (affected.length) await db.recommendations.bulkPut(affected);
    await db.persons.delete(sourceId);
  });
  cacheRecos(affected);
  drop(sourceId);
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
  await db.transaction('rw', db.recommendations, db.persons, async () => {
    if (after.length) await db.recommendations.bulkPut(after);
    await db.persons.delete(id);
  });
  cacheRecos(after);
  drop(id);
  emit('change', { type: 'person-delete', ids: [id] });
  return { person: p, recos: before };
}

export async function restorePerson(snapshot) {
  await db.transaction('rw', db.recommendations, db.persons, async () => {
    await db.persons.put(snapshot.person);
    if (snapshot.recos.length) await db.recommendations.bulkPut(snapshot.recos);
  });
  keep(snapshot.person);
  cacheRecos(snapshot.recos);
  emit('change', { type: 'person', ids: [snapshot.person.id] });
}

/* Écritures en bloc (import, exemples). */
export async function putPersons(persons, { silent = false } = {}) {
  if (!persons.length) return;
  await db.persons.bulkPut(persons);
  persons.forEach(keep);
  if (!silent) emit('change', { type: 'person', ids: persons.map((p) => p.id) });
}

export async function deletePersons(ids, { silent = false } = {}) {
  if (!ids.length) return;
  await db.persons.bulkDelete(ids);
  ids.forEach(drop);
  if (!silent) emit('change', { type: 'person-delete', ids });
}

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
