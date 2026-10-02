/* Itinéraire : choix entre Plans, Google Maps et Waze, ou lien direct vers
   l'app choisie dans Réglages › Carte et itinéraire. */
import { actionSheet } from './bottom-sheet.js';
import { icon } from './icons.js';
import { directionsUrl } from '../services/map.js';
import { getPref } from '../store/settings.js';
import { NAV_APPS } from '../config.js';
import { esc } from '../utils.js';

export function directionsButton(reco, { cls = 'btn btn-soft', size = 18 } = {}) {
  const app = getPref('navApp', 'ask');
  const inner = `${icon('navigation', { size })}Itinéraire`;
  if (NAV_APPS.some((a) => a.key === app)) {
    return `<a class="${cls}" href="${esc(directionsUrl(reco, app))}" target="_blank" rel="noopener">${inner}</a>`;
  }
  return `<button type="button" class="${cls}" data-act="directions" data-id="${esc(reco.id)}" aria-haspopup="dialog">${inner}</button>`;
}

/* Chaque choix est un vrai lien : iOS ouvre l'app directement, sans blocage. */
export function chooseDirections(reco) {
  return actionSheet({
    title: 'Itinéraire avec…',
    message: 'Tu peux choisir une app par défaut dans Réglages › Carte et itinéraire.',
    actions: NAV_APPS.map((a) => ({ label: a.label, icon: a.icon, value: a.key, href: directionsUrl(reco, a.key) }))
  });
}
