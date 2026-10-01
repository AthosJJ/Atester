/* Clavier et viewport sur iPhone.
   --kb    : hauteur du clavier pendant la saisie (les panneaux remontent au-dessus).
   --vvh   : hauteur visible (panneaux plein écran).
   --vv-shift : dans une web app installée, iOS laisse parfois le viewport de
   mise en page plus court ou décalé que l'écran, après le clavier ou un retour
   dans l'app (bug WebKit connu, encore présent sous iOS 26) : tout ce qui est
   fixé en bas remonte. On mesure l'écart avec le bas réellement visible et on
   redescend la barre d'onglets, les panneaux et les messages d'autant. Un
   défilement nul relance aussi le recalage d'iOS. */

let probe = null;
let lastScroll = 0;
let frame = 0;
let nudgeTimer = 0;

/* Un champ qui ouvre le clavier a le focus. */
export function typing() {
  const a = document.activeElement;
  if (!a || a === document.body) return false;
  if (a.isContentEditable || a.tagName === 'TEXTAREA') return true;
  return a.tagName === 'INPUT' && !/^(checkbox|radio|range|file|button|submit|reset|color|date|time)$/.test(a.type);
}

export function syncViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  if (!probe) {
    // Repère invisible posé à « bottom: 0 » : là où iOS place vraiment le bas.
    probe = document.createElement('div');
    probe.className = 'vv-probe';
    probe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(probe);
  }
  const st = document.documentElement.style;
  const visualBottom = vv.offsetTop + vv.height;
  const kb = Math.round(window.innerHeight - visualBottom);
  const keyboard = typing() && kb > 60;
  st.setProperty('--kb', `${keyboard ? kb : 0}px`);
  st.setProperty('--vvh', `${Math.round(vv.height)}px`);
  const gap = Math.round(visualBottom - probe.offsetTop);
  const shift = !keyboard && vv.scale < 1.05 && gap > 1 ? gap : 0;
  st.setProperty('--vv-shift', `${shift}px`);
}

function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = 0; syncViewport(); });
}

/* Contournement documenté : un défilement nul force iOS à recaler ses
   viewports. Jamais pendant une saisie ni en plein défilement (il couperait
   l'élan du doigt). */
function nudge(delay = 320) {
  clearTimeout(nudgeTimer);
  nudgeTimer = setTimeout(() => {
    if (typing() || Date.now() - lastScroll < 250) { syncViewport(); return; }
    window.scrollTo(window.scrollX, window.scrollY);
    syncViewport();
    schedule();
  }, delay);
}

export function initViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  window.addEventListener('scroll', () => { lastScroll = Date.now(); schedule(); }, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', () => nudge(400));
  window.addEventListener('pageshow', () => nudge(0));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) nudge(150); });
  document.addEventListener('focusin', schedule);
  // Clavier refermé (sauf si le focus passe juste à un autre champ).
  document.addEventListener('focusout', () => nudge());
  // Panneau refermé : le verrouillage du défilement vient d'être levé.
  let locked = false;
  new MutationObserver(() => {
    const now = /\b(map-)?lock\b/.test(document.documentElement.className);
    if (locked && !now) nudge(80);
    locked = now;
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  syncViewport();
}
