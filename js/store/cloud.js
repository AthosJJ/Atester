/* Synchronisation avec Cloud Firestore. Les données du compte connecté vivent
   sous users/{uid}/apps/atester : le document de l'app (sous-catégories,
   exemples) et ses sous-collections recommendations et persons. Lecture
   utilisera users/{uid}/apps/lecture, sans mélange.
   Trois écouteurs en temps réel alimentent les caches mémoire des stores ; le
   cache local persistant de Firestore sert l'app hors ligne. Une écriture
   s'applique tout de suite en mémoire et part vers Firestore sans être
   attendue : hors ligne, elle patiente et part au retour du réseau. */
import {
  doc, collection, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch, deleteField,
  waitForPendingWrites, getDocsFromServer, terminate, clearIndexedDbPersistence
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';
import { db } from '../services/firebase.js';
import { emit } from './events.js';
import { lsGet, lsSet, wait } from '../utils.js';

export const APP_KEY = 'atester';
export const DELETE = deleteField();

const SOURCES = ['app', 'persons', 'recommendations'];
const BATCH_OPS = 400;            // limite Firestore : 500 opérations par lot
const BATCH_BYTES = 4_000_000;    // et 10 Mo par requête (photos comprises)

let refs = null;
let uid = null;
const unsubs = new Map();
const handlers = {};
const state = {};

/* Chaque store déclare sa fonction de mise à jour : (instantané, premier ?). */
export function register(name, fn) { handlers[name] = fn; }

export const currentUid = () => uid;

/* L'instantané reçu vient-il du serveur (et pas seulement du cache local) ? */
export const fromServer = (name) => state[name]?.fromServer === true;

function listen(name, onFirst) {
  const target = refs[name];
  let first = true;
  const unsub = onSnapshot(target, { includeMetadataChanges: true }, (snap) => {
    if (!state[name]?.fromServer) state[name] = { fromServer: !snap.metadata.fromCache };
    handlers[name]?.(snap, first);
    if (first) { first = false; onFirst(); }
  }, (err) => {
    unsubs.delete(name);
    report(err);
    if (first) { first = false; onFirst(); }
    // Quota du jour épuisé ou serveur indisponible : nouvel essai plus tard.
    if (refs && ['resource-exhausted', 'unavailable', 'internal'].includes(err.code)) {
      setTimeout(() => { if (refs && !unsubs.has(name)) listen(name, () => {}); }, 60000);
    }
  });
  unsubs.set(name, unsub);
}

/* Démarre les écouteurs du compte. Se résout au premier instantané des trois
   sources (cache local ou serveur), ou après le délai : l'app s'affiche avec
   ce qu'elle a et se complète ensuite. */
export function startSync(userId, { timeout = 8000 } = {}) {
  stopSync();
  uid = userId;
  const app = doc(db, 'users', userId, 'apps', APP_KEY);
  refs = { app, persons: collection(app, 'persons'), recommendations: collection(app, 'recommendations') };
  return new Promise((resolve) => {
    let left = SOURCES.length;
    const timer = setTimeout(resolve, timeout);
    const one = () => { if (--left === 0) { clearTimeout(timer); resolve(); } };
    SOURCES.forEach((name) => listen(name, one));
  });
}

export function stopSync() {
  for (const unsub of unsubs.values()) unsub();
  unsubs.clear();
  refs = null;
  uid = null;
  for (const k of Object.keys(state)) delete state[k];
}

/* ——— Erreurs : un message par type, pas une avalanche ——— */
const reported = new Map();
let lastError = null;
function report(err) {
  console.error('[firestore]', err);
  const code = err?.code || 'unknown';
  lastError = { code, message: syncMessage(code) };
  if (Date.now() - (reported.get(code) || 0) < 30000) return;
  reported.set(code, Date.now());
  emit('sync-error', lastError);
}

/* Dernière erreur, pour la signaler une fois l'app affichée. */
export const lastSyncError = () => lastError;

export function syncMessage(code) {
  if (code === 'permission-denied') return 'Le serveur refuse l’accès à tes données. Reconnecte-toi ou réessaie plus tard.';
  if (code === 'resource-exhausted') return 'Le serveur est très sollicité aujourd’hui : tes changements partiront un peu plus tard.';
  if (code === 'unauthenticated') return 'Ta session a expiré : reconnecte-toi.';
  return 'Synchronisation momentanément impossible. Tes changements sont gardés sur l’appareil.';
}

const track = (promise) => {
  promise.catch(report);
  return promise;
};

/* ——— Écritures ——— */
const ref = (col, id) => (col === 'app' ? refs.app : doc(refs[col], id));

export function put(col, id, data) { return refs ? track(setDoc(ref(col, id), data)) : Promise.resolve(); }
export function patch(col, id, fields) { return refs ? track(updateDoc(ref(col, id), fields)) : Promise.resolve(); }
export function remove(col, id) { return refs ? track(deleteDoc(ref(col, id))) : Promise.resolve(); }
export function setApp(fields) { return refs ? track(setDoc(refs.app, fields, { merge: true })) : Promise.resolve(); }

/* Écritures groupées (fusion de personnes, import, exemples) : appliquées
   ensemble en local, envoyées par lots. La promesse se résout quand le
   serveur a tout reçu (hors ligne : au retour du réseau). */
export function commit(ops) {
  if (!refs || !ops.length) return Promise.resolve();
  const batches = [];
  let batch = null, n = 0, bytes = 0;
  for (const op of ops) {
    const size = op.data ? JSON.stringify(op.data).length : 50;
    if (!batch || n >= BATCH_OPS || bytes + size > BATCH_BYTES) {
      batch = writeBatch(db);
      batches.push(batch);
      n = 0;
      bytes = 0;
    }
    const r = ref(op.col, op.id);
    if (op.type === 'delete') batch.delete(r);
    else if (op.type === 'update') batch.update(r, op.data);
    else if (op.merge) batch.set(r, op.data, { merge: true });
    else batch.set(r, op.data);
    n++;
    bytes += size;
  }
  return track(Promise.all(batches.map((b) => b.commit())));
}

/* Lecture directe sur le serveur (vérification d'un import). */
export async function serverDocs(col) {
  const snap = await getDocsFromServer(refs[col]);
  return new Map(snap.docs.map((d) => [d.id, d.data()]));
}

/* Tout est-il parti ? Faux si des écritures attendent encore le réseau. */
export async function flushed(ms = 2500) {
  try {
    return await Promise.race([waitForPendingWrites(db).then(() => true), wait(ms).then(() => false)]);
  } catch {
    return false;
  }
}

/* Déconnexion : arrête Firestore et efface son cache local. Si le cache est
   encore utilisé (autre onglet), l'effacement est refait au prochain lancement. */
export async function wipeLocalCache() {
  stopSync();
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
    return true;
  } catch {
    lsSet('wipe-cache', true);
    return false;
  }
}

/* Au lancement, avant toute utilisation de Firestore. */
export async function pendingWipe() {
  if (!lsGet('wipe-cache')) return;
  try {
    await clearIndexedDbPersistence(db);
    lsSet('wipe-cache', null);
  } catch { /* réessayé au prochain lancement */ }
}
