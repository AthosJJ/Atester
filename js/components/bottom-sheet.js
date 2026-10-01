/* Panneaux glissants depuis le bas : poignée visible, fermeture par glissement
   vers le bas, tap sur le fond ou Échap. Empilables (un panneau peut en ouvrir
   un autre). Contient aussi les feuilles d'actions (confirmations) et la saisie
   d'un texte court. */
import { icon } from './icons.js';
import { hideToast } from './toast.js';
import { esc } from '../utils.js';

const stack = [];

export const openSheets = () => stack.length;
export const topSheet = () => stack[stack.length - 1] || null;

function lock() { document.documentElement.classList.add('lock'); }
function unlockIfIdle() { if (!stack.length) document.documentElement.classList.remove('lock'); }

function nextZ() { return String(100 + stack.length * 10); }

export function openSheet({
  title = '', sub = '', body = '', foot = '', cls = '', label = '', tall = false,
  showClose = true, closeLabel = 'Fermer', headExtra = '', onClose = null
} = {}) {
  const layer = document.createElement('div');
  layer.className = 'layer';
  layer.style.setProperty('--z', nextZ());
  layer.innerHTML = `
    <div class="backdrop"></div>
    <section class="sheet ${cls}${tall ? ' tall' : ''}" role="dialog" aria-modal="true" aria-label="${esc(label || title || 'Panneau')}" tabindex="-1">
      <header class="sheet-head">
        <div class="sheet-handle" aria-hidden="true"></div>
        <div class="sheet-title-row">
          <h2 class="sheet-title">${esc(title)}</h2>
          ${headExtra}
          ${showClose ? `<button type="button" class="rbtn sm" data-close aria-label="${esc(closeLabel)}">${icon('x', { size: 18, stroke: 2.4 })}</button>` : ''}
        </div>
        ${sub ? `<p class="sheet-sub">${esc(sub)}</p>` : ''}
      </header>
      <div class="sheet-body">${body}</div>
      ${foot ? `<footer class="sheet-foot">${foot}</footer>` : ''}
    </section>`;
  document.body.appendChild(layer);
  hideToast(); // un ancien message ne doit pas masquer le panneau
  const el = layer.querySelector('.sheet');
  const ctrl = {
    layer, el,
    head: el.querySelector('.sheet-head'),
    body: el.querySelector('.sheet-body'),
    foot: el.querySelector('.sheet-foot'),
    closed: false,
    beforeClose: null,
    onClose,
    close: (reason = 'code') => closeSheet(ctrl, reason)
  };
  stack.push(ctrl);
  lock();
  void el.offsetHeight; // position de départ avant l'animation
  layer.classList.add('open');
  layer.querySelector('.backdrop').addEventListener('click', () => ctrl.close('backdrop'));
  layer.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => ctrl.close('button')));
  bindDrag(ctrl);
  return ctrl;
}

function closeSheet(ctrl, reason) {
  if (ctrl.closed) return;
  if (ctrl.beforeClose && ctrl.beforeClose(reason) === false) return;
  ctrl.closed = true;
  const i = stack.indexOf(ctrl);
  if (i >= 0) stack.splice(i, 1);
  if (ctrl.layer.contains(document.activeElement)) document.activeElement.blur();
  ctrl.layer.classList.add('closing');
  ctrl.layer.classList.remove('open');
  ctrl.el.style.transform = '';
  const backdrop = ctrl.layer.querySelector('.backdrop');
  if (backdrop) backdrop.style.opacity = '';
  setTimeout(() => ctrl.layer.remove(), 360);
  unlockIfIdle();
  try { ctrl.onClose?.(reason); } catch (err) { console.error(err); }
}

export function closeTopSheet(reason = 'escape') {
  const top = topSheet();
  if (top) top.close(reason);
  return Boolean(top);
}

export function closeAllSheets() {
  [...stack].reverse().forEach((s) => s.close('code'));
}

/* Glisser vers le bas pour fermer : depuis l'en-tête, ou depuis le contenu
   quand il est tout en haut (hors champs de saisie et zones défilantes). */
function bindDrag(ctrl) {
  const { el: sheet, layer } = ctrl;
  const backdrop = layer.querySelector('.backdrop');
  let g = null;
  sheet.addEventListener('touchstart', (e) => {
    g = null;
    if (e.touches.length !== 1 || ctrl.closed) return;
    const t = e.target;
    const fromHead = Boolean(t.closest('.sheet-head'));
    if (!fromHead && (ctrl.body.scrollTop > 0 || t.closest('input, textarea, select, .no-drag, .chip-row, .leaflet-container'))) return;
    g = { y0: e.touches[0].clientY, x0: e.touches[0].clientX, t0: Date.now(), dy: 0, fromHead, active: false, decided: false };
  }, { passive: true });

  sheet.addEventListener('touchmove', (e) => {
    if (!g) return;
    const dy = e.touches[0].clientY - g.y0;
    const dx = e.touches[0].clientX - g.x0;
    if (!g.decided) {
      if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
      g.decided = true;
      g.active = dy > 0 && Math.abs(dy) > Math.abs(dx) && (g.fromHead || ctrl.body.scrollTop <= 0);
      if (!g.active) { g = null; return; }
      sheet.classList.add('dragging');
      if (document.activeElement && sheet.contains(document.activeElement)) document.activeElement.blur();
    }
    e.preventDefault();
    g.dy = Math.max(0, dy);
    sheet.style.transform = `translateY(${g.dy}px)`;
    backdrop.style.opacity = String(Math.max(0.1, 1 - g.dy / Math.max(1, sheet.offsetHeight)));
  }, { passive: false });

  const end = () => {
    if (!g) return;
    const { active, dy, t0 } = g;
    g = null;
    if (!active) return;
    sheet.classList.remove('dragging');
    const speed = dy / Math.max(1, Date.now() - t0);
    if (dy > 120 || (dy > 40 && speed > 0.5)) {
      ctrl.close('drag');
    } else {
      sheet.style.transform = '';
      backdrop.style.opacity = '';
    }
  };
  sheet.addEventListener('touchend', end);
  sheet.addEventListener('touchcancel', end);
}

/* ——— Feuille d'actions : renvoie la valeur choisie, ou null ——— */
export function actionSheet({ title = '', message = '', actions = [], cancel = 'Annuler' } = {}) {
  return new Promise((resolve) => {
    const layer = document.createElement('div');
    layer.className = 'layer';
    layer.style.setProperty('--z', nextZ());
    layer.innerHTML = `
      <div class="backdrop"></div>
      <div class="asheet" role="alertdialog" aria-modal="true" aria-label="${esc(title || 'Actions')}">
        <div class="asheet-group">
          ${title || message ? `<div class="asheet-head">${title ? `<h3>${esc(title)}</h3>` : ''}${message ? `<p>${esc(message)}</p>` : ''}</div>` : ''}
          ${actions.map((a, i) => {
            const cls = `asheet-btn${a.danger ? ' danger' : ''}${a.primary ? ' primary' : ''}${a.checked ? ' check' : ''}`;
            const inner = `${a.icon ? icon(a.icon, { size: 20 }) : ''}<span>${esc(a.label)}</span>`;
            // Un choix avec href est un vrai lien (ouverture d'une autre app depuis le geste).
            return a.href
              ? `<a class="${cls}" data-i="${i}" href="${esc(a.href)}" target="_blank" rel="noopener">${inner}</a>`
              : `<button type="button" class="${cls}" data-i="${i}">${inner}</button>`;
          }).join('')}
        </div>
        <div class="asheet-group">
          <button type="button" class="asheet-btn cancel" data-i="-1">${esc(cancel)}</button>
        </div>
      </div>`;
    document.body.appendChild(layer);
    hideToast();
    const ctrl = { layer, el: layer.querySelector('.asheet'), closed: false, close: () => finish(null) };
    stack.push(ctrl);
    lock();

    function finish(value) {
      if (ctrl.closed) return;
      ctrl.closed = true;
      const i = stack.indexOf(ctrl);
      if (i >= 0) stack.splice(i, 1);
      layer.classList.add('closing');
      layer.classList.remove('open');
      setTimeout(() => layer.remove(), 320);
      unlockIfIdle();
      resolve(value);
    }

    layer.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b) {
        const i = Number(b.dataset.i);
        finish(i < 0 ? null : (actions[i].value !== undefined ? actions[i].value : i));
      } else if (e.target.classList.contains('backdrop')) {
        finish(null);
      }
    });
    void layer.offsetHeight;
    layer.classList.add('open');
    layer.querySelector('.asheet-btn')?.focus({ preventScroll: true });
  });
}

export async function confirmSheet({ title = '', message = '', confirm = 'Confirmer', danger = false, icon: ico } = {}) {
  const v = await actionSheet({ title, message, actions: [{ label: confirm, value: true, danger, primary: !danger, icon: ico }] });
  return v === true;
}

/* Saisie d'un texte court (renommer…). validate(v) renvoie un message d'erreur ou rien. */
export function promptSheet({ title, label = '', value = '', placeholder = '', confirm = 'Valider', validate = null, maxlength = 40 } = {}) {
  return new Promise((resolve) => {
    let result = null;
    const s = openSheet({
      title,
      body: `
        <label class="field">
          ${label ? `<span class="field-label">${esc(label)}</span>` : ''}
          <input class="input" type="text" value="${esc(value)}" placeholder="${esc(placeholder)}" maxlength="${maxlength}"
            autocomplete="off" autocapitalize="words" enterkeyhint="done">
          <p class="need-msg" hidden></p>
        </label>`,
      foot: `<button type="button" class="btn btn-primary block" data-ok>${esc(confirm)}</button>`,
      onClose: () => resolve(result)
    });
    const input = s.body.querySelector('input');
    const msg = s.body.querySelector('.need-msg');
    input.focus();
    input.select();
    const submit = async () => {
      const v = input.value.trim();
      const err = validate ? await validate(v) : (v ? null : 'Ce champ est vide.');
      if (err) {
        msg.textContent = err;
        msg.hidden = false;
        input.classList.remove('shake');
        void input.offsetWidth;
        input.classList.add('shake');
        return;
      }
      result = v;
      s.close('ok');
    };
    s.foot.querySelector('[data-ok]').addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  });
}
