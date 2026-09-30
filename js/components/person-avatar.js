/* Avatars : cercle aux initiales sur la couleur de la personne (« Moi » a son icône). */
import { icon } from './icons.js';
import { esc, initials, inkOn, listFr } from '../utils.js';

export const displayName = (p) => (p ? p.name : 'Inconnu');

export function avatar(p, size = 32) {
  if (!p) return `<span class="avatar" style="--s:${size}px" aria-hidden="true">?</span>`;
  const inner = p.isMe ? icon('user', { size: Math.round(size * 0.55), stroke: 2.4 }) : esc(initials(p.name));
  return `<span class="avatar" style="--s:${size}px;--c:${p.color};--ci:${inkOn(p.color, { text: true })}" aria-hidden="true">${inner}</span>`;
}

export function avatarStack(persons, { size = 24, max = 3 } = {}) {
  const shown = persons.slice(0, max);
  const more = persons.length - shown.length;
  return `<span class="avatars" aria-hidden="true">${shown.map((p) => avatar(p, size)).join('')}${more > 0 ? `<span class="avatar more" style="--s:${size}px">+${more}</span>` : ''}</span>`;
}

/* « Paul », « Paul et Marie », « Paul, Marie et 2 autres » */
export function namesText(persons, max = 2) {
  const names = persons.map(displayName);
  if (names.length <= max) return listFr(names);
  const rest = names.length - max;
  return `${names.slice(0, max).join(', ')} et ${rest} autre${rest > 1 ? 's' : ''}`;
}

/* Initiales sous les affiches : « P · M » */
export const initialsText = (persons) => persons.map((p) => (p.isMe ? 'Moi' : initials(p.name))).join(' · ');

export function personChip(p, { pressed = false, count = null, off = false, attrs = '' } = {}) {
  return `<button type="button" class="pchip${off ? ' off' : ''}" aria-pressed="${pressed}" style="--c:${p.color};--ci:${inkOn(p.color, { text: true })}" ${attrs}>
    ${avatar(p, 32)}<span>${esc(displayName(p))}</span>${count != null ? `<span class="count">${count}</span>` : ''}${icon('check', { size: 16, cls: 'check', stroke: 3 })}
  </button>`;
}
