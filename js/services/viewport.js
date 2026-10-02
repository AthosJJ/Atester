/* Clavier et viewport sur iPhone.
   --kb    : hauteur du clavier pendant la saisie (les panneaux remontent au-dessus).
   --vvh   : hauteur visible (panneaux plein écran).
   --vv-shift : décalage à compenser quand iOS place le bas de mise en page
   au-dessus du vrai bas de l'écran ; la barre d'onglets, la barre d'action,
   les panneaux, les messages et la carte redescendent d'autant. Deux causes :
   - après le clavier ou un retour dans l'app, le viewport visuel reste décalé
     (bug WebKit connu) : on compare le bas visible au repère « bottom: 0 » ;
   - au lancement d'une web app installée sous iOS 26, le viewport de mise en
     page, innerHeight et 100dvh sont trop courts de la hauteur de la barre
     d'état, jusqu'à la première interaction ; seul 100lvh donne la vraie
     hauteur : on compare un repère de 100lvh au repère « bottom: 0 ».
   Un défilement nul relance aussi le recalage d'iOS. */
import { isStandalone, IS_IOS } from '../utils.js';

let bottomProbe = null;
let largeProbe = null;
let lastScroll = 0;
let frame = 0;
let nudgeTimer = 0;
const timers = [];
const current = {};

function setVar(name, value) {
  if (current[name] === value) return; // pas de recalcul de style inutile
  current[name] = value;
  document.documentElement.style.setProperty(name, value);
}

/* Un champ qui ouvre le clavier a le focus. */
export function typing() {
  const a = document.activeElement;
  if (!a || a === document.body) return false;
  if (a.isContentEditable || a.tagName === 'TEXTAREA') return true;
  return a.tagName === 'INPUT' && !/^(checkbox|radio|range|file|button|submit|reset|color|date|time)$/.test(a.type);
}

function probe(cls) {
  const el = document.createElement('div');
  el.className = cls;
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  return el;
}

/* Hauteur perdue au lancement (iOS 26, web app installée, portrait). Le test
   de vraisemblance (écran − 100lvh = une barre d'état) écarte un 100lvh faux. */
function launchGap(layoutBottom) {
  if (!IS_IOS || !isStandalone() || window.innerWidth > window.innerHeight) return 0;
  const large = largeProbe.offsetHeight;
  const screenH = Math.max(window.screen.width, window.screen.height);
  const statusBar = screenH - large;
  if (statusBar < 18 || statusBar > 70) return 0;
  const gap = Math.round(large - layoutBottom);
  return gap > 1 && gap <= 80 ? gap : 0;
}

export function syncViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  if (!bottomProbe) {
    bottomProbe = probe('vv-probe');        // posé à « bottom: 0 » : le bas selon iOS
    largeProbe = probe('vv-probe-large');   // 100lvh : la vraie hauteur de l'app
  }
  const visualBottom = vv.offsetTop + vv.height;
  const kb = Math.round(window.innerHeight - visualBottom);
  const keyboard = typing() && kb > 60;
  setVar('--kb', `${keyboard ? kb : 0}px`);
  setVar('--vvh', `${Math.round(vv.height)}px`);
  let shift = 0;
  if (!keyboard && vv.scale < 1.05) {
    const layoutBottom = bottomProbe.offsetTop;
    const gap = Math.round(visualBottom - layoutBottom);
    shift = Math.max(gap > 1 ? gap : 0, launchGap(layoutBottom));
  }
  setVar('--vv-shift', `${shift}px`);
}

function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = 0; syncViewport(); });
}

/* Mesures répétées juste après le lancement ou le retour dans l'app : iOS
   corrige ses valeurs en retard, parfois sans prévenir. */
function settle(delays) {
  timers.splice(0).forEach(clearTimeout);
  for (const d of delays) timers.push(setTimeout(syncViewport, d));
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
  window.addEventListener('pageshow', () => { nudge(0); settle([150, 500, 1500]); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    nudge(150);
    settle([0, 400, 1200, 2500]);
  });
  // Le premier toucher suffit souvent à iOS pour se corriger : on suit.
  document.addEventListener('pointerdown', schedule, { capture: true, passive: true });
  document.addEventListener('pointerup', () => settle([60, 400]), { capture: true, passive: true });
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
  // Filet de sécurité : une mesure par seconde tant que l'app est à l'écran.
  setInterval(() => { if (!document.hidden) syncViewport(); }, 1000);
  syncViewport();
  settle([100, 300, 700, 1200, 2500, 5000]);
}
