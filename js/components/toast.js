/* Notifications discrètes au-dessus de la barre d'onglets (3 à 5 s),
   avec une action facultative (« Voir », « Annuler »). */
import { icon } from './icons.js';
import { esc } from '../utils.js';

let el = null;
let timer = null;
let action = null;

function ensure() {
  if (el) return el;
  el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('.t-act');
    if (!btn || !action) return;
    const run = action.run;
    hideToast();
    run();
  });
  document.body.appendChild(el);
  return el;
}

export function toast(message, { action: act = null, icon: ico = null, tone = '', duration } = {}) {
  const t = ensure();
  action = act;
  t.innerHTML = `
    ${ico ? `<span class="t-ico ${tone}">${icon(ico, { size: 15, stroke: 2.6 })}</span>` : ''}
    <span class="t-msg">${esc(message)}</span>
    ${act ? `<button type="button" class="t-act">${esc(act.label)}</button>` : ''}`;
  t.style.paddingRight = act ? '' : '18px';
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(timer);
  const ms = duration ?? (act ? 5000 : Math.min(5000, Math.max(3000, message.length * 60)));
  timer = setTimeout(hideToast, ms);
}

export function hideToast() {
  clearTimeout(timer);
  action = null;
  el?.classList.remove('show');
}

/* Bandeau « Nouvelle version disponible — Recharger ». */
let banner = null;
export function showUpdateBanner(onReload) {
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'update-banner';
    banner.setAttribute('role', 'alert');
    banner.innerHTML = `${icon('sparkles', { size: 18 })}<span>Nouvelle version disponible</span>
      <button type="button" class="btn btn-primary">Recharger</button>`;
    document.body.appendChild(banner);
    banner.querySelector('button').addEventListener('click', () => onReload());
  }
  requestAnimationFrame(() => banner.classList.add('show'));
}
