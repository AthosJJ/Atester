/* Barre d'onglets flottante : Lieux · Films & séries · [ + ] · Podcasts · Personnes.
   Une bulle suit l'onglet actif avec un effet ressort. */
import { TABS } from '../config.js';
import { icon } from './icons.js';

let bar = null;
let current = null;

const tabHtml = (t) => `
  <a class="tab" href="#/${t.route}" data-tab="${t.route}" aria-label="${t.label}">
    ${icon(t.icon, { size: 24 })}<span class="tab-label" aria-hidden="true">${t.label}</span>
  </a>`;

export function renderTabbar(el, { onAdd }) {
  bar = el;
  el.innerHTML = `
    <span class="tab-blob" aria-hidden="true"></span>
    ${TABS.slice(0, 2).map(tabHtml).join('')}
    <button type="button" class="fab" id="fab-add" aria-label="Ajouter une recommandation">${icon('plus', { size: 30, stroke: 2.6 })}</button>
    ${TABS.slice(2).map(tabHtml).join('')}`;
  el.querySelector('#fab-add').addEventListener('click', onAdd);
  window.addEventListener('resize', () => moveBlob(false));
}

function moveBlob(animate = true) {
  if (!bar) return;
  const blob = bar.querySelector('.tab-blob');
  const tab = current && bar.querySelector(`.tab[data-tab="${current}"]`);
  if (!tab) { blob.style.opacity = '0'; return; }
  const x = tab.offsetLeft + tab.offsetWidth / 2 - blob.offsetWidth / 2;
  if (!animate) blob.style.transition = 'none';
  blob.style.opacity = '1';
  blob.style.setProperty('--x', `${x}px`);
  if (!animate) { void blob.offsetWidth; blob.style.transition = ''; }
}

export function setActiveTab(route) {
  if (!bar) return;
  const first = current === null;
  current = route;
  bar.querySelectorAll('.tab').forEach((a) => {
    if (a.dataset.tab === route) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  moveBlob(!first);
}

export function showTabbar(show) {
  bar?.classList.toggle('hide', !show);
}

export function setFabInvite(on) {
  bar?.querySelector('#fab-add')?.classList.toggle('invite', on);
}

export function setFabOpen(open) {
  bar?.querySelector('#fab-add')?.classList.toggle('open', open);
}
