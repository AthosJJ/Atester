/* États vides illustrés : trois bulles flottantes aux couleurs de la catégorie. */
import { icon } from '../components/icons.js';
import { subcats } from '../store/settings.js';
import { allRecos } from '../store/recommendations.js';
import { EMPTY, CATEGORIES } from '../config.js';
import { esc, inkOn } from '../utils.js';

function art(cat) {
  const list = cat ? subcats(cat) : [];
  const main = { color: 'var(--accent-strong)', ink: 'var(--on-accent)', icon: cat ? CATEGORIES[cat].icon : 'users' };
  const a = list[0] || { color: '#3A7BD5', icon: 'star' };
  const b = list[1] || { color: '#3E9B5F', icon: 'heart' };
  const bubble = (s, cls) => `<span class="bubble ${cls}" style="--c:${s.color};--ci:${s.ink || inkOn(s.color)}">${icon(s.icon, { size: cls === 'b1' ? 30 : 20 })}</span>`;
  return `<div class="empty-art" aria-hidden="true">${bubble(a, 'b2')}${bubble(main, 'b1')}${bubble(b, 'b3')}</div>`;
}

/* État vide d'un onglet. Si l'app est encore vierge, propose les exemples. */
export function emptyState(cat) {
  const e = cat ? EMPTY[cat] : EMPTY.persons;
  const virgin = allRecos().length === 0;
  const addLabel = cat === 'place' ? 'Ajouter un lieu' : cat === 'screen' ? 'Ajouter un film ou une série' : cat === 'podcast' ? 'Ajouter un podcast' : 'Ajouter une recommandation';
  return `
    <div class="empty">
      ${art(cat)}
      <h3>${esc(e.title)}</h3>
      <p>${esc(e.text)}</p>
      <div class="actions">
        <button type="button" class="btn btn-primary sm" data-act="add"${cat ? ` data-cat="${cat}"` : ''}>${icon('plus', { size: 18, stroke: 2.6 })}${esc(addLabel)}</button>
        ${virgin ? `<button type="button" class="btn btn-secondary sm" data-act="demo">${icon('sparkles', { size: 18 })}Voir des exemples</button>` : ''}
      </div>
    </div>`;
}

export function filteredEmpty() {
  return `
    <div class="empty">
      <div class="empty-art" aria-hidden="true">
        <span class="bubble b1" style="--c:var(--bg-3);--ci:var(--muted)">${icon('search', { size: 30 })}</span>
      </div>
      <h3>${esc(EMPTY.filtered.title)}</h3>
      <p>${esc(EMPTY.filtered.text)}</p>
      <div class="actions">
        <button type="button" class="btn btn-soft sm" data-act="reset">${icon('rotate-ccw', { size: 17 })}Effacer les filtres</button>
      </div>
    </div>`;
}
