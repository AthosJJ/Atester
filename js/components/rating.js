/* Notes de 1 à 5 étoiles : affichage et saisie (toucher la même étoile efface la note). */
import { icon } from './icons.js';
import { haptic } from '../utils.js';

export function starsInline(n, size = 13) {
  return `<span class="stars-inline" role="img" aria-label="${n} sur 5">${[1, 2, 3, 4, 5]
    .map((i) => icon('star', { size, cls: i <= n ? '' : 'off' })).join('')}</span>`;
}

export const ratingPill = (n) => `<span class="rating-pill" aria-label="Noté ${n} sur 5">${icon('star', { size: 12 })}${n}</span>`;

export function starInput(value = 0, { small = false, label = 'Note sur 5' } = {}) {
  return `<div class="stars${small ? ' sm' : ''}" role="radiogroup" aria-label="${label}">${[1, 2, 3, 4, 5].map((i) => `
    <button type="button" class="star-btn${i <= value ? ' on' : ''}" role="radio" aria-checked="${i === value}" aria-label="${i} étoile${i > 1 ? 's' : ''}" data-v="${i}">${icon('star')}</button>`).join('')}
  </div>`;
}

export function bindStarInput(root, { value = 0, onChange = null } = {}) {
  let v = value;
  const paint = (animate) => {
    root.querySelectorAll('.star-btn').forEach((b, i) => {
      const on = i < v;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(i + 1 === v));
      if (animate && on) {
        b.classList.remove('pop');
        void b.offsetWidth;
        b.style.animationDelay = `${i * 45}ms`;
        b.classList.add('pop');
      }
    });
  };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('.star-btn');
    if (!b) return;
    const n = Number(b.dataset.v);
    v = n === v ? 0 : n;
    paint(true);
    haptic();
    onChange?.(v);
  });
  return { get: () => v, set: (n) => { v = n; paint(false); } };
}
