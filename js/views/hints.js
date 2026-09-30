/* Astuce affichée une fois au-dessus des listes : le balayage des cartes. */
import { icon } from '../components/icons.js';
import { lsGet, lsSet } from '../utils.js';
import { STATUS } from '../config.js';

export function swipeHint(cat) {
  if (lsGet('hint:swipe')) return '';
  const done = STATUS[cat].done.toLowerCase();
  return `<p class="list-hint" data-hint="swipe">${icon('move-horizontal', { size: 16 })}
    <span>Glisse une carte : à gauche « ${done} », à droite favori</span>
    <button type="button" class="x" data-act="hide-hint" aria-label="Masquer l’astuce">${icon('x', { size: 14 })}</button></p>`;
}

export function hideSwipeHint() {
  lsSet('hint:swipe', true);
  document.querySelectorAll('[data-hint="swipe"]').forEach((el) => el.remove());
}
