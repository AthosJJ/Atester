/* Firebase, forfait gratuit Spark : comptes (Authentication, e-mail et mot de
   passe) et données (Cloud Firestore, cache local persistant pour le hors
   ligne). Le SDK modulaire vient du CDN officiel, à une version figée : le
   service worker garde ces trois fichiers pour que l'app s'ouvre sans réseau
   (sw.js, liste SDK ; tools/check-sw.mjs vérifie que les versions concordent).
   La configuration web est publique par nature : ce sont les règles
   (firestore.rules) qui protègent les données de chacun. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js';
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, connectAuthEmulator
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';

export const FIREBASE_VERSION = '13.0.0';

const firebaseConfig = {
  apiKey: 'AIzaSyCjyLBNqjRcoesW6PYQSywUaNUSIGTpRZs',
  authDomain: 'athos-apps.firebaseapp.com',
  projectId: 'athos-apps',
  storageBucket: 'athos-apps.firebasestorage.app',
  messagingSenderId: '204338794492',
  appId: '1:204338794492:web:6a9c60749b4ff3ea3dec79'
};

export const app = initializeApp(firebaseConfig);

/* La session reste ouverte d'une ouverture à l'autre (IndexedDB, repli
   localStorage). Pas de connexion par lien ni par Google : sur iPhone, elles
   s'ouvrent dans Safari et ne connectent pas l'app de l'écran d'accueil. */
export const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
auth.languageCode = 'fr';

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true
});

/* Tests automatisés uniquement : émulateurs Firebase sur la machine locale. */
if (location.hostname === 'localhost') {
  try {
    const emu = JSON.parse(localStorage.getItem('a-tester:emulators') || 'null');
    if (emu) {
      connectAuthEmulator(auth, `http://127.0.0.1:${emu.auth}`, { disableWarnings: true });
      connectFirestoreEmulator(db, '127.0.0.1', emu.firestore);
    }
  } catch { /* pas d'émulateur */ }
}
