/* Recadrage d'une photo de personne : glisser pour placer le visage dans le
   cercle, pincer (ou le curseur) pour zoomer, comme dans Contacts. Renvoie la
   photo carrée prête à enregistrer (data URL JPEG), ou null si on annule. */
import { icon } from './icons.js';
import { openSheet } from './bottom-sheet.js';
import { toast } from './toast.js';
import { loadPhotoFile, squarePhoto } from '../services/photo.js';
import { clamp } from '../utils.js';

const MAX_ZOOM = 4;

export async function cropPhoto(file) {
  let pic;
  try {
    pic = await loadPhotoFile(file);
  } catch {
    toast('Impossible d’ouvrir cette image. Essaie une autre photo.', { icon: 'triangle-alert' });
    return null;
  }
  const { el, w, h } = pic;
  const short = Math.min(w, h);
  // Départ : zoom minimal, centré ; un peu plus haut sur un portrait (visage).
  const st = { z: 1, cx: w / 2, cy: h > w ? short / 2 + (h - short) * 0.3 : h / 2 };

  return new Promise((resolve) => {
    let result = null;
    const s = openSheet({
      title: 'Recadrer la photo',
      sub: 'Fais glisser pour placer le visage dans le cercle, pince pour zoomer.',
      body: `
        <div class="crop no-drag" data-r="crop" tabindex="0" aria-label="Recadrage : flèches pour déplacer, plus et moins pour zoomer">
          <span class="crop-ring" aria-hidden="true"></span>
        </div>
        <div class="crop-zoom">
          ${icon('image', { size: 15 })}
          <input type="range" min="1" max="${MAX_ZOOM}" step="0.01" value="1" aria-label="Zoom" data-r="zoom">
          ${icon('image', { size: 22 })}
        </div>`,
      foot: `<button type="button" class="btn btn-primary block" data-save>${icon('check', { size: 20, stroke: 2.6 })}Utiliser cette photo</button>`,
      onClose: () => { pic.dispose(); resolve(result); }
    });
    const box = s.body.querySelector('[data-r="crop"]');
    const zoom = s.body.querySelector('[data-r="zoom"]');
    el.className = 'crop-src';
    el.setAttribute('aria-hidden', 'true');
    el.draggable = false;
    box.prepend(el);

    const view = () => box.clientWidth || 280;
    const unit = () => view() / short; // pixels d'écran par pixel source, au zoom 1

    function paint() {
      st.z = clamp(st.z, 1, MAX_ZOOM);
      const half = short / (2 * st.z);
      st.cx = clamp(st.cx, half, w - half);
      st.cy = clamp(st.cy, half, h - half);
      const v = view(), u = unit(), k = u * st.z;
      el.style.width = `${w * u}px`;
      el.style.height = `${h * u}px`;
      el.style.transform = `translate3d(${v / 2 - st.cx * k}px, ${v / 2 - st.cy * k}px, 0) scale(${st.z})`;
      zoom.value = String(st.z);
      zoom.style.setProperty('--p', `${((st.z - 1) / (MAX_ZOOM - 1)) * 100}%`);
    }

    function pan(dx, dy) {
      const k = unit() * st.z;
      st.cx -= dx / k;
      st.cy -= dy / k;
      paint();
    }

    /* Zoom autour d'un point du cadre : ce qui est sous le doigt y reste. */
    function zoomAt(z, px, py) {
      const v = view();
      const k = unit() * st.z;
      const sx = st.cx + (px - v / 2) / k;
      const sy = st.cy + (py - v / 2) / k;
      st.z = clamp(z, 1, MAX_ZOOM);
      const k2 = unit() * st.z;
      st.cx = sx - (px - v / 2) / k2;
      st.cy = sy - (py - v / 2) / k2;
      paint();
    }

    const pts = new Map();
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) || 1;

    box.addEventListener('pointerdown', (e) => {
      if (pts.size >= 2) return;
      try { box.setPointerCapture(e.pointerId); } catch { /* rien */ }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      box.classList.add('grabbing');
    });
    box.addEventListener('pointermove', (e) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const next = { x: e.clientX, y: e.clientY };
      if (pts.size === 1) {
        pts.set(e.pointerId, next);
        pan(next.x - prev.x, next.y - prev.y);
        return;
      }
      const [a, b] = [...pts.keys()];
      const before = [pts.get(a), pts.get(b)];
      pts.set(e.pointerId, next);
      const after = [pts.get(a), pts.get(b)];
      const r = box.getBoundingClientRect();
      const m0 = mid(...before), m1 = mid(...after);
      zoomAt(st.z * (dist(...after) / dist(...before)), m0.x - r.left, m0.y - r.top);
      pan(m1.x - m0.x, m1.y - m0.y);
    });
    const lift = (e) => {
      pts.delete(e.pointerId);
      if (!pts.size) box.classList.remove('grabbing');
    };
    box.addEventListener('pointerup', lift);
    box.addEventListener('pointercancel', lift);
    box.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = box.getBoundingClientRect();
      zoomAt(st.z * Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    box.addEventListener('keydown', (e) => {
      const step = 12;
      const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      if (moves[e.key]) pan(...moves[e.key]);
      else if (e.key === '+' || e.key === '=') zoomAt(st.z * 1.15, view() / 2, view() / 2);
      else if (e.key === '-') zoomAt(st.z / 1.15, view() / 2, view() / 2);
      else return;
      e.preventDefault();
    });
    zoom.addEventListener('input', () => zoomAt(Number(zoom.value), view() / 2, view() / 2));

    s.foot.querySelector('[data-save]').addEventListener('click', () => {
      paint();
      const side = short / st.z;
      const sx = clamp(st.cx - side / 2, 0, w - side);
      const sy = clamp(st.cy - side / 2, 0, h - side);
      try {
        result = squarePhoto(el, sx, sy, side);
      } catch {
        toast('La photo n’a pas pu être préparée. Essaie une autre image.', { icon: 'triangle-alert' });
      }
      s.close('ok');
    });

    paint();
    requestAnimationFrame(paint); // taille définitive du panneau
  });
}
