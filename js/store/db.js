/* Schéma IndexedDB (Dexie 4).
   Pour faire évoluer le modèle : ajouter db.version(2).stores({...}).upgrade(tx => ...)
   sans jamais modifier la version 1, et incrémenter SCHEMA_VERSION dans config.js. */
import Dexie from '../../vendor/dexie/dexie.min.mjs';

export const db = new Dexie('a-tester');

db.version(1).stores({
  recommendations: 'id, category, status, *personIds, recommendedAt, [category+status]',
  persons: 'id, &name',
  meta: 'key'
});

export default db;
