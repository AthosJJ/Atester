/* Gestes sur les cartes : balayage horizontal (gauche / droite) et appui long. */
import { haptic } from '../utils.js';

let lastGesture = 0;
let press = null;

const cancelPress = () => {
  if (press) { clearTimeout(press.timer); press = null; }
};

/* Un clic qui suit un geste ne doit pas ouvrir la fiche. */
function swallowClicks(container) {
  if (container.dataset.swallow) return;
  container.dataset.swallow = '1';
  container.addEventListener('click', (e) => {
    if (Date.now() - lastGesture < 400) { e.stopPropagation(); e.preventDefault(); }
  }, true);
}

/* Cartes .swipe[data-id] > .row. onLeft / onRight reçoivent l'id. */
export function bindSwipe(container, { onLeft = null, onRight = null } = {}) {
  swallowClicks(container);
  let s = null;
  const threshold = (w) => Math.min(116, w * 0.3);

  container.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !e.isPrimary) return;
    const row = e.target.closest('.swipe > .row');
    if (!row || e.clientX < 26) return; // bord gauche : geste retour d'iOS
    s = { row, wrap: row.parentElement, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, active: false, armed: false };
  });

  container.addEventListener('pointermove', (e) => {
    if (!s || e.pointerId !== s.id) return;
    const mx = e.clientX - s.x0;
    const my = e.clientY - s.y0;
    if (!s.active) {
      if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
      if (Math.abs(mx) < Math.abs(my) * 1.3 || (mx > 0 && !onRight) || (mx < 0 && !onLeft)) { s = null; return; }
      s.active = true;
      cancelPress();
      s.row.classList.add('dragging');
      try { s.row.setPointerCapture(s.id); } catch { /* déjà capturé */ }
    }
    let dx = mx;
    if ((dx > 0 && !onRight) || (dx < 0 && !onLeft)) dx = 0;
    const th = threshold(s.row.offsetWidth);
    const abs = Math.abs(dx);
    s.dx = Math.sign(dx) * (abs > th ? th + (abs - th) * 0.35 : abs);
    s.row.style.transform = `translateX(${s.dx}px)`;
    s.wrap.classList.toggle('pull-left', s.dx < 0);
    s.wrap.classList.toggle('pull-right', s.dx > 0);
    const armed = abs > th;
    if (armed !== s.armed) {
      s.armed = armed;
      s.wrap.classList.toggle('armed', armed);
      if (armed) haptic();
    }
  });

  const finish = (e, cancelled) => {
    if (!s || e.pointerId !== s.id) return;
    const { row, wrap, active, armed, dx } = s;
    s = null;
    if (!active) return;
    lastGesture = Date.now();
    row.classList.remove('dragging');
    row.style.transform = '';
    setTimeout(() => wrap.classList.remove('pull-left', 'pull-right', 'armed'), 320);
    if (cancelled || !armed) return;
    const id = wrap.dataset.id;
    if (dx < 0) onLeft?.(id, wrap);
    else onRight?.(id, wrap);
  };
  container.addEventListener('pointerup', (e) => finish(e, false));
  container.addEventListener('pointercancel', (e) => finish(e, true));
}

/* Le doigt relevé après un appui long ne doit pas « cliquer » sur le menu
   qui vient de s'ouvrir sous lui : on avale le clic suivant, où qu'il tombe. */
function swallowNextClick() {
  const stop = (e) => { e.stopPropagation(); e.preventDefault(); };
  document.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => document.removeEventListener('click', stop, { capture: true }), 700);
}

/* Appui long (menu contextuel), et clic droit sur ordinateur. */
export function bindLongPress(container, selector, handler, ms = 480) {
  swallowClicks(container);
  let fired = 0;
  container.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.target.closest(selector);
    if (!el) return;
    cancelPress();
    press = {
      el, x0: e.clientX, y0: e.clientY,
      timer: setTimeout(() => {
        press = null;
        lastGesture = Date.now();
        fired = Date.now();
        swallowNextClick();
        haptic();
        handler(el);
      }, ms)
    };
  });
  // Empêche aussi le clic de compatibilité généré au lever du doigt.
  container.addEventListener('touchend', (e) => {
    if (Date.now() - fired < 1500 && e.cancelable) e.preventDefault();
  }, { passive: false });
  container.addEventListener('pointermove', (e) => {
    if (press && Math.hypot(e.clientX - press.x0, e.clientY - press.y0) > 10) cancelPress();
  });
  container.addEventListener('pointerup', cancelPress);
  container.addEventListener('pointercancel', cancelPress);
  container.addEventListener('contextmenu', (e) => {
    const el = e.target.closest(selector);
    if (!el) return;
    e.preventDefault();
    if (e.pointerType === 'touch' || e.button === -1) return; // déjà géré par l'appui long
    cancelPress();
    handler(el);
  });
}
