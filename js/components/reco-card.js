/* Cartes de recommandation : ligne de liste (lieux, podcasts, fiche personne)
   et tuile d'affiche (grille des films et séries). */
import { icon } from './icons.js';
import { avatarStack, namesText, initialsText } from './person-avatar.js';
import { ratingPill } from './rating.js';
import { subcat } from '../store/settings.js';
import { personsOf } from '../store/persons.js';
import { STATUS } from '../config.js';
import { esc, inkOn, relDate, fmtDistance, distanceKm, initials } from '../utils.js';
import { posterUrl } from '../services/tmdb.js';

export function subBubble(sub, size = 44, iconSize = Math.round(size * 0.46)) {
  return `<span class="bubble" style="--c:${sub.color};--ci:${inkOn(sub.color)};width:${size}px;height:${size}px">${icon(sub.icon, { size: iconSize })}</span>`;
}

export function imageOf(reco, size = 'w342') {
  const d = reco.details || {};
  if (reco.category === 'screen' && d.posterPath) return posterUrl(d.posterPath, size);
  if (reco.category === 'podcast' && d.artworkUrl) return d.artworkUrl;
  return '';
}

/* <img> avec vignette colorée de remplacement si l'image est introuvable. */
export function img(src, reco, cls = '', short = false) {
  const sub = subcat(reco.category, reco.subcategory);
  return `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" decoding="async" draggable="false"
    data-ph-color="${sub.color}" data-ph-title="${esc(short ? initials(reco.title) : reco.title)}">`;
}

export function placeholder(reco, { withIcon = false, iconSize = 22, short = false } = {}) {
  const sub = subcat(reco.category, reco.subcategory);
  const text = short ? initials(reco.title) : reco.title;
  return `<span class="ph" style="--c:${sub.color}">${withIcon ? icon(sub.icon, { size: iconSize }) : ''}<span>${esc(text)}</span></span>`;
}

/* Vignette : pastille (lieux), affiche (films), pochette (podcasts). */
export function thumb(reco, size = 56) {
  const sub = subcat(reco.category, reco.subcategory);
  if (reco.category === 'place') return subBubble(sub, 48);
  const src = imageOf(reco, 'w185');
  const cls = reco.category === 'screen' ? 'thumb poster' : 'thumb';
  const style = reco.category === 'podcast' ? ` style="width:${size}px;height:${size}px"` : '';
  return `<span class="${cls}"${style}>${src ? img(src, reco, '', true) : placeholder(reco, { short: true })}</span>`;
}

export function statusBadge(reco) {
  const label = STATUS[reco.category][reco.status];
  if (reco.status === 'done') return `<span class="status done">${icon('check', { size: 13, stroke: 3 })}${esc(label)}</span>`;
  return `<span class="status ${reco.status}">${esc(label)}</span>`;
}

export function subline(reco) {
  const sub = subcat(reco.category, reco.subcategory);
  const d = reco.details || {};
  const parts = [];
  if (reco.category === 'place') {
    if (d.city) parts.push(d.city);
    parts.push(sub.label);
  } else if (reco.category === 'screen') {
    if (d.year) parts.push(d.year);
    parts.push(sub.label);
    if (d.platforms?.length) parts.push(d.platforms[0]);
  } else {
    parts.push(d.episodeTitle || d.author || sub.label);
    if (d.episodeTitle || d.author) parts.push(sub.label);
  }
  return parts.join(' · ');
}

/* Action révélée en balayant vers la gauche : marquer testé, ou remettre à tester. */
export function leftAction(reco) {
  const S = STATUS[reco.category];
  return reco.status === 'todo'
    ? { label: S.done, icon: 'check', color: 'var(--ok)' }
    : { label: S.todo, icon: 'rotate-ccw', color: 'var(--info)' };
}

export function recoRow(reco, { i = 0, position = null, newId = null, swipe = true } = {}) {
  const sub = subcat(reco.category, reco.subcategory);
  const persons = personsOf(reco);
  const d = reco.details || {};
  const noPos = reco.category === 'place' && d.lat == null;
  const dist = reco.category === 'place' && position && d.lat != null ? fmtDistance(distanceKm(position, d)) : '';
  const left = leftAction(reco);
  const label = `${reco.title}, ${sub.label}, ${STATUS[reco.category][reco.status]}`;
  const row = `
    <button type="button" class="row is-${reco.status}${reco.id === newId ? ' is-new' : ''}" data-open="${reco.id}" aria-label="${esc(label)}">
      ${thumb(reco)}
      <span class="row-main">
        <span class="row-title">${reco.favorite ? icon('star', { size: 15, cls: 'fav' }) : ''}<span>${esc(reco.title)}</span></span>
        <span class="row-sub">${esc(subline(reco))}</span>
        ${persons.length ? `<span class="row-people">${avatarStack(persons, { size: 22 })}<span class="names">${esc(namesText(persons))} · ${esc(relDate(reco.recommendedAt))}</span></span>` : ''}
      </span>
      <span class="row-end">
        ${statusBadge(reco)}
        ${noPos ? `<span class="tag-warn">${icon('map-pin', { size: 12, stroke: 2.4 })}Position à ajouter</span>` : ''}
        ${dist ? `<span class="dist">${dist}</span>` : ''}
        ${reco.status === 'done' && reco.rating ? ratingPill(reco.rating) : ''}
      </span>
    </button>`;
  if (!swipe) return `<div class="card-in" style="--d:${Math.min(i * 32, 320)}ms">${row}</div>`;
  return `
    <div class="swipe card-in" data-id="${reco.id}" style="--d:${Math.min(i * 32, 320)}ms;--act-c:${left.color}">
      <div class="swipe-act left" aria-hidden="true"><span class="act-inner">${esc(left.label)}${icon(left.icon, { size: 22, stroke: 2.6 })}</span></div>
      <div class="swipe-act right" aria-hidden="true"><span class="act-inner">${icon('star', { size: 22, stroke: 2.4 })}${reco.favorite ? 'Retirer' : 'Favori'}</span></div>
      ${row}
    </div>`;
}

export function posterTile(reco, { i = 0, newId = null } = {}) {
  const sub = subcat(reco.category, reco.subcategory);
  const persons = personsOf(reco);
  const src = imageOf(reco, 'w342');
  const meta = [reco.details?.year, initialsText(persons)].filter(Boolean).join(' · ');
  const badge = reco.status === 'done'
    ? (reco.rating
      ? `<span class="tile-rating">${icon('star', { size: 12 })}${reco.rating}</span>`
      : `<span class="tile-seen">${icon('check', { size: 14, stroke: 3 })}</span>`)
    : '';
  const label = `${reco.title}${reco.details?.year ? ' (' + reco.details.year + ')' : ''}, ${STATUS[reco.category][reco.status]}`;
  return `
    <button type="button" class="tile tile-in is-${reco.status}${reco.id === newId ? ' is-new' : ''}" data-open="${reco.id}" data-id="${reco.id}"
      style="--d:${Math.min(i * 28, 360)}ms" aria-label="${esc(label)}">
      <span class="tile-poster">
        ${src ? img(src, reco) : `<span class="ph" style="--c:${sub.color}">${icon(sub.icon, { size: 22 })}<span>${esc(reco.title)}</span></span>`}
        ${badge}
        ${reco.favorite ? `<span class="tile-fav">${icon('star', { size: 14 })}</span>` : ''}
      </span>
      <span class="tile-title">${esc(reco.title)}</span>
      <span class="tile-meta">${esc(meta)}</span>
    </button>`;
}
