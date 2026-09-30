/* Géolocalisation : demandée seulement après un geste (« Me localiser »,
   « Je suis devant »), jamais au lancement. Si l'autorisation est déjà
   accordée, la position est relue en silence pour afficher les distances. */
import { emit } from '../store/events.js';

let last = null;

export const lastPosition = () => last;

function remember(pos) {
  last = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: Date.now() };
  emit('position', last);
  return last;
}

export function getPosition({ timeout = 12000, maxAge = 30000, highAccuracy = true } = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) { reject(Object.assign(new Error('unsupported'), { code: 0 })); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(remember(pos)),
      (err) => reject(err),
      { enableHighAccuracy: highAccuracy, timeout, maximumAge: maxAge }
    );
  });
}

export async function silentPosition() {
  try {
    if (!navigator.permissions?.query) return null;
    const status = await navigator.permissions.query({ name: 'geolocation' });
    if (status.state !== 'granted') return null;
    return await getPosition({ highAccuracy: false, maxAge: 120000 });
  } catch {
    return null;
  }
}

export function geoErrorMessage(err) {
  if (err && err.code === 1) return 'Localisation refusée : autorise-la dans Réglages › Confidentialité › Service de localisation.';
  if (err && err.code === 3) return 'Position trop longue à obtenir, réessaie.';
  return 'Position indisponible pour le moment.';
}
