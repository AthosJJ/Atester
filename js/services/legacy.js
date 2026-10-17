/* Ancien stockage (versions 1.x) : la base IndexedDB « a-tester » créée avec
   Dexie, lue ici directement pour l'import dans le compte, puis supprimée à
   la demande. Elle n'est jamais modifiée : tant qu'on ne la vide pas, les
   données restent intactes sur l'appareil. */
import { lsGet, lsSet } from '../utils.js';

const NAME = 'a-tester';
const STORES = ['recommendations', 'persons', 'meta'];

/* Ouvre la base si elle existe, sans jamais la créer. */
function open() {
  return new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(NAME); } catch { resolve(null); return; }
    req.onupgradeneeded = (e) => {
      if (e.oldVersion === 0) req.transaction.abort(); // n'existait pas
    };
    req.onsuccess = () => {
      const idb = req.result;
      if (!STORES.every((s) => idb.objectStoreNames.contains(s))) { idb.close(); resolve(null); return; }
      resolve(idb);
    };
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function readAll(idb, store) {
  return new Promise((resolve, reject) => {
    const req = idb.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/* Contenu de l'ancienne base, ou null si elle est absente ou vide. */
export async function readLegacy() {
  const idb = await open();
  if (!idb) return null;
  try {
    const [recommendations, persons, metaRows] = await Promise.all(STORES.map((s) => readAll(idb, s)));
    const meta = Object.fromEntries(metaRows.map((r) => [r.key, r.value]));
    // Les préférences de l'appareil (carte, itinéraire) passent dans localStorage.
    if (meta.prefs && !lsGet('prefs')) lsSet('prefs', meta.prefs);
    const others = persons.filter((p) => !p.isMe);
    if (!recommendations.length && !others.length) return null;
    return {
      recommendations,
      persons,
      subcategories: meta.subcategories || null,
      demo: meta.demo || null
    };
  } catch {
    return null;
  } finally {
    idb.close();
  }
}

export async function legacySummary() {
  const data = await readLegacy();
  if (!data) return null;
  return { recos: data.recommendations.length, persons: data.persons.filter((p) => !p.isMe).length };
}

/* Supprime l'ancienne base de cet appareil. */
export function deleteLegacy() {
  return new Promise((resolve) => {
    let req;
    try { req = indexedDB.deleteDatabase(NAME); } catch { resolve(false); return; }
    req.onsuccess = () => resolve(true);
    req.onerror = () => resolve(false);
    req.onblocked = () => resolve(false);
  });
}
