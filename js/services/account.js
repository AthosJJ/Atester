/* Compte : création, connexion, mot de passe oublié et déconnexion, par
   e-mail et mot de passe uniquement (Firebase Authentication). À la
   déconnexion, tout ce que l'appareil garde du compte est effacé : cache
   Firestore, filtres, brouillon, position de la carte, images en cache. */
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';
import { auth } from './firebase.js';
import { wipeLocalCache } from '../store/cloud.js';

export const MIN_PASSWORD = 8;

export const watchAuth = (fn) => onAuthStateChanged(auth, fn);
export const currentUser = () => auth.currentUser;

const cleanEmail = (s) => String(s || '').trim();

export async function signIn(email, password) {
  await signInWithEmailAndPassword(auth, cleanEmail(email), password);
}

export async function signUp(email, password) {
  if (String(password || '').length < MIN_PASSWORD) {
    const err = new Error('weak');
    err.code = 'auth/weak-password';
    throw err;
  }
  await createUserWithEmailAndPassword(auth, cleanEmail(email), password);
}

/* L'e-mail contient un lien de retour vers l'app (domaine autorisé dans Firebase). */
export async function resetPassword(email) {
  const url = new URL('./', location.href).href;
  try {
    await sendPasswordResetEmail(auth, cleanEmail(email), { url });
  } catch (err) {
    // Adresse de retour refusée (domaine non autorisé) : l'e-mail part sans lien de retour.
    if (err?.code !== 'auth/unauthorized-continue-uri' && err?.code !== 'auth/invalid-continue-uri') throw err;
    await sendPasswordResetEmail(auth, cleanEmail(email));
  }
}

/* Clés de localStorage liées au compte (le thème et les préférences de
   l'appareil restent). */
const ACCOUNT_KEYS = /^a-tester:(filters:|fold:|draft$|lastTab$|map:view$|lastBackupAt$|legacy-imported$)/;
const ACCOUNT_CACHES = ['a-tester-images', 'a-tester-tiles-ofm', 'a-tester-map'];

/* Une seule déconnexion à la fois (bouton des réglages ou session expirée). */
let ending = null;
export function logout() {
  if (!ending) {
    ending = (async () => {
      await wipeLocalCache();
      await signOut(auth).catch(() => {});
      try {
        for (const k of Object.keys(localStorage)) if (ACCOUNT_KEYS.test(k)) localStorage.removeItem(k);
      } catch { /* stockage indisponible */ }
      try {
        if (window.caches) await Promise.all(ACCOUNT_CACHES.map((name) => caches.delete(name)));
      } catch { /* rien */ }
    })();
  }
  return ending;
}

export function authMessage(err) {
  switch (err?.code) {
    case 'auth/invalid-email': return 'Cette adresse e-mail n’est pas valide.';
    case 'auth/missing-email': return 'Indique ton adresse e-mail.';
    case 'auth/missing-password': return 'Indique ton mot de passe.';
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found': return 'Adresse e-mail ou mot de passe incorrect.';
    case 'auth/email-already-in-use': return 'Un compte existe déjà avec cette adresse : connecte-toi.';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements': return `Choisis un mot de passe d’au moins ${MIN_PASSWORD} caractères.`;
    case 'auth/too-many-requests': return 'Trop d’essais : patiente quelques minutes avant de recommencer.';
    case 'auth/network-request-failed': return 'Pas de connexion : vérifie le réseau et réessaie.';
    case 'auth/user-disabled': return 'Ce compte a été désactivé.';
    case 'auth/operation-not-allowed': return 'La connexion par e-mail n’est pas activée pour cette app.';
    default: return 'Ça n’a pas marché. Réessaie dans un instant.';
  }
}
