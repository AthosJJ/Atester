/* À tester — démarrage : connexion au compte, synchronisation Firestore,
   vues, routeur, thème, clavier iOS, service worker et bandeau de mise à jour. */
import { on } from './store/events.js';
import { startSync, pendingWipe, lastSyncError } from './store/cloud.js';
import { allRecos, getReco } from './store/recommendations.js';
import { me, ensureMe } from './store/persons.js';
import { watchAuth, logout } from './services/account.js';
import { loadKey } from './services/tmdb.js';
import { legacySummary } from './services/legacy.js';
import { showLogin, hideLogin } from './views/login.js';
import {
  CONTENT_TABS, hasFilterParams, fromParams, replaceFilters, toQuery, resetFilters
} from './store/filters.js';
import { initRouter, parseHash, go, back, replaceQuiet, TAB_ROUTES } from './router.js';
import { renderTabbar, setActiveTab, showTabbar, setFabInvite } from './components/tabbar.js';
import { toast, showUpdateBanner } from './components/toast.js';
import { openSheet, closeAllSheets, closeTopSheet, openSheets } from './components/bottom-sheet.js';
import { hooks as recoHooks } from './components/reco-actions.js';
import { chooseDirections } from './components/directions.js';
import { icon } from './components/icons.js';
import { silentPosition } from './services/geo.js';
import { initViewport } from './services/viewport.js';
import { refreshBaseLayers } from './services/map.js';
import { loadDemo } from './services/demo.js';
import { openAdd, openEdit, addHooks } from './views/add.js';
import { personHooks } from './views/person-detail.js';
import { settingsHooks } from './views/settings.js';
import { hideSwipeHint } from './views/hints.js';
import placesView from './views/places.js';
import screensView from './views/screens.js';
import podcastsView from './views/podcasts.js';
import personsView from './views/persons.js';
import personDetailView from './views/person-detail.js';
import recoDetailView from './views/reco-detail.js';
import settingsView from './views/settings.js';
import { CAT_OF, TAB_OF } from './config.js';
import { $, esc, lsGet, lsSet, isStandalone, IS_IOS } from './utils.js';

const VIEWS = {
  lieux: placesView,
  ecrans: screensView,
  podcasts: podcastsView,
  personnes: personsView,
  reco: recoDetailView,
  personne: personDetailView,
  reglages: settingsView
};

let current = null;
const scrolls = new Map();

/* ════════ Thème ════════ */
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme(pref = lsGet('theme') || 'auto') {
  const root = document.documentElement;
  if (pref === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  const dark = pref === 'dark' || (pref === 'auto' && darkQuery.matches);
  root.setAttribute('data-scheme', dark ? 'dark' : 'light');
  // La barre d'état suit la couleur de fond (un thème forcé l'emporte sur celui du système).
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const forLight = (m.getAttribute('media') || '').includes('light');
    const color = pref === 'auto' ? (forLight ? '#F2F2F7' : '#13110F') : (dark ? '#13110F' : '#F2F2F7');
    m.setAttribute('content', color);
  });
  refreshBaseLayers();
}

function setTheme(pref) {
  lsSet('theme', pref === 'auto' ? null : pref);
  applyTheme(pref);
}

darkQuery.addEventListener?.('change', () => applyTheme());

/* ════════ Navigation ════════ */

function show(name, route, dir) {
  const view = VIEWS[name];
  const key = name + (route.id ? '/' + route.id : '');
  const prev = current;
  const same = prev && prev.key === key;
  if (prev && !same) {
    scrolls.set(prev.key, window.scrollY);
    if (prev.name !== name) {
      prev.view.hide?.();
      prev.view.el.hidden = true;
    }
  }
  view.el.hidden = false;
  current = { name, key, view, route };

  const isTab = TAB_ROUTES.includes(name);
  showTabbar(isTab);
  document.documentElement.classList.toggle('on-push', !isTab);
  if (isTab) {
    setActiveTab(name);
    lsSet('lastTab', name);
  }

  const wrap = view.el.querySelector('.vwrap');
  if (!same && wrap) {
    wrap.classList.remove('enter-tab', 'enter-push', 'enter-pop');
    void wrap.offsetWidth;
    wrap.classList.add(dir === 'back' ? 'enter-pop' : isTab ? 'enter-tab' : 'enter-push');
  }
  document.documentElement.classList.toggle('no-anim', same);
  view.show(route, { dir });

  if (same && dir === 'replace' && isTab) {
    window.scrollTo({ top: 0, behavior: 'smooth' }); // toucher l'onglet actif remonte en haut
  } else if (!same) {
    window.scrollTo(0, dir === 'back' || isTab ? (scrolls.get(key) || 0) : 0);
  }
}

function onRoute(route, { dir }) {
  if (route.name !== 'ajout') closeAllSheets();

  if (!route.name || !(route.name in VIEWS || route.name === 'ajout')) {
    go('#/' + (lsGet('lastTab') || 'lieux'), { replace: true });
    return;
  }

  if (route.name === 'ajout') {
    const cat = route.params.cat;
    const tab = TAB_OF[cat] || (current && TAB_ROUTES.includes(current.name) ? current.name : (lsGet('lastTab') || 'lieux'));
    replaceQuiet('#/' + tab);
    onRoute(parseHash(), { dir: 'replace' });
    openAdd({ category: cat || null, personId: route.params.p || null });
    return;
  }

  if (CONTENT_TABS.includes(route.name)) {
    const tab = route.name;
    if (route.query && (hasFilterParams(route.params) || 'vue' in route.params)) {
      replaceFilters(tab, fromParams(tab, route.params), { silent: true });
    }
    replaceQuiet(tabHash(tab));
  }

  show(route.name, route, dir);
}

function tabHash(tab) {
  const q = toQuery(tab);
  return `#/${tab}${q ? '?' + q : ''}`;
}

function currentCategory() {
  return current ? (CAT_OF[current.name] || null) : null;
}

/* ════════ Service worker et mises à jour ════════ */
let swReg = null;
let swAsked = false;
let reloadAsked = false;

function offerUpdate(worker) {
  if (!navigator.serviceWorker.controller) return; // première installation : rien à recharger
  showUpdateBanner(() => {
    reloadAsked = true;
    worker.postMessage({ type: 'SKIP_WAITING' });
    setTimeout(() => location.reload(), 2500);
  });
}

async function registerSW() {
  if (swAsked || !('serviceWorker' in navigator) || location.protocol === 'file:') return;
  swAsked = true;
  try {
    swReg = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
  } catch {
    return;
  }
  if (!swReg) return;
  if (swReg.waiting) offerUpdate(swReg.waiting);
  swReg.addEventListener('updatefound', () => {
    const w = swReg.installing;
    w?.addEventListener('statechange', () => { if (w.state === 'installed') offerUpdate(w); });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadAsked) location.reload();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') swReg.update().catch(() => {});
  });
}

async function checkUpdate() {
  if (!swReg) { toast('Mises à jour gérées par le navigateur ici', { icon: 'info' }); return; }
  if (!navigator.onLine) { toast('Hors ligne : réessaie plus tard', { icon: 'wifi-off' }); return; }
  toast('Recherche d’une mise à jour…', { icon: 'refresh-cw' });
  try {
    await swReg.update();
  } catch {
    toast('Impossible de vérifier pour l’instant', { icon: 'cloud-off' });
    return;
  }
  if (swReg.waiting) offerUpdate(swReg.waiting);
  else if (swReg.installing) toast('Nouvelle version en cours de téléchargement…', { icon: 'download' });
  else toast('Tu as déjà la dernière version', { icon: 'check', tone: 'ok' });
}

/* ════════ Installation (Safari, une seule fois) ════════ */
function openInstall() {
  openSheet({
    title: 'Installer À tester',
    body: `
      <div class="app-mark">${icon('check', { size: 40, stroke: 3 })}</div>
      <p class="hint" style="text-align:center;margin-bottom:14px">Ajoute l’app à ton écran d’accueil : elle s’ouvrira en plein écran, même hors ligne.</p>
      <div class="steps">
        <div class="step"><span class="bubble" style="--c:#3A7BD5">${icon('share', { size: 20 })}</span><span>Touche <b>Partager</b> dans la barre de Safari</span></div>
        <div class="step"><span class="bubble" style="--c:var(--accent-strong);--ci:var(--on-accent)">${icon('square-plus', { size: 20 })}</span><span>Choisis <b>Sur l’écran d’accueil</b></span></div>
        <div class="step"><span class="bubble" style="--c:#2E8B57">${icon('check', { size: 20 })}</span><span>Ouvre <b>À tester</b> depuis son icône</span></div>
      </div>`,
    foot: '<button type="button" class="btn btn-primary block" data-close>J’ai compris</button>'
  });
}

/* ════════ Démarrage ════════ */

function fatal(err) {
  console.error(err);
  const splash = $('#splash');
  if (!splash) return;
  splash.classList.remove('gone');
  splash.innerHTML = `<div style="max-width:320px;text-align:center;padding:24px">
    <h2 style="font:700 22px/1.2 var(--font-title);margin-bottom:10px">Démarrage impossible</h2>
    <p class="muted">L’app n’a pas pu ouvrir tes données (${esc(String(err && err.message || err))}). Ferme-la puis rouvre-la ; en navigation privée, ouvre-la dans un onglet normal.</p></div>`;
}

/* L'écran de démarrage reste dans la page : il revient le temps de charger
   les données juste après la connexion. */
function hideSplash() { $('#splash')?.classList.add('gone'); }
function showSplash() { $('#splash')?.classList.remove('gone'); }

/* Déconnexion (bouton des réglages, ou session expirée) : tout ce que
   l'appareil garde du compte est effacé, puis l'app repart de zéro. */
async function endSession() {
  await logout();
  location.reload();
}

function wire() {
  recoHooks.edit = (id) => openEdit(id);
  recoHooks.open = (id) => go(`#/reco/${encodeURIComponent(id)}`);
  recoHooks.afterDelete = (id) => {
    if (current?.name === 'reco' && current.route.id === id) back('#/' + (lsGet('lastTab') || 'lieux'));
  };
  addHooks.saved = (r, { open = false } = {}) => {
    if (open) { go(`#/reco/${encodeURIComponent(r.id)}`); return; }
    if (current?.name === 'personne') return; // on reste sur la fiche de la personne
    const tab = TAB_OF[r.category];
    VIEWS[tab].highlight?.(r.id);
    if (current?.name === tab) {
      document.documentElement.classList.add('no-anim');
      current.view.refresh?.({ source: 'data' });
    } else {
      go('#/' + tab, { replace: Boolean(current && TAB_ROUTES.includes(current.name)) });
    }
  };
  personHooks.add = ({ personId }) => openAdd({ personId });
  settingsHooks.setTheme = setTheme;
  settingsHooks.getTheme = () => lsGet('theme') || 'auto';
  settingsHooks.checkUpdate = checkUpdate;
  settingsHooks.openInstall = openInstall;
  settingsHooks.logout = endSession;

  on('change', (evt) => {
    document.documentElement.classList.add('no-anim');
    current?.view.refresh?.({ source: 'data', ...evt });
    setFabInvite(allRecos().length === 0);
  });
  on('filters', ({ tab }) => {
    if (current?.name !== tab) return;
    const typing = document.activeElement?.type === 'search';
    document.documentElement.classList.toggle('no-anim', typing);
    current.view.refresh?.({ source: 'filters' });
    replaceQuiet(tabHash(tab));
  });
  on('meta', (key) => {
    if (['subcategories', 'tmdb', 'demo', 'prefs'].includes(key)) {
      document.documentElement.classList.add('no-anim');
      current?.view.refresh?.({ source: 'meta' });
    }
  });
  on('sync-error', ({ code, message }) => {
    toast(message, { icon: 'cloud-off', duration: 6000 });
    if (code === 'unauthenticated') endSession();
  });

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-open], [data-act="add"], [data-act="demo"], [data-act="reset"], [data-act="hide-hint"], [data-act="directions"]');
    if (!t) return;
    if (t.dataset.open) { go(`#/reco/${encodeURIComponent(t.dataset.open)}`); return; }
    switch (t.dataset.act) {
      case 'directions': {
        const r = getReco(t.dataset.id);
        if (r) chooseDirections(r);
        break;
      }
      case 'add': openAdd({ category: t.dataset.cat || currentCategory() }); break;
      case 'demo':
        loadDemo().then((n) => toast(`${n} exemples chargés`, { icon: 'sparkles' }));
        break;
      case 'reset':
        if (current && CONTENT_TABS.includes(current.name)) resetFilters(current.name);
        break;
      case 'hide-hint': hideSwipeHint(); break;
      default: break;
    }
  });

  // Image introuvable : vignette colorée avec le titre ; initiales pour un avatar.
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (img.parentElement?.classList.contains('avatar')) { img.parentElement.classList.remove('has-photo'); img.remove(); return; }
    if (!img.dataset.phColor) return;
    const ph = document.createElement('span');
    ph.className = 'ph';
    ph.style.setProperty('--c', img.dataset.phColor);
    ph.textContent = img.dataset.phTitle || '';
    img.replaceWith(ph);
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openSheets()) closeTopSheet('escape');
  });

  // Pas de zoom accidentel de la page (le pincement de la carte reste actif).
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });

  window.addEventListener('online', () => document.documentElement.classList.remove('offline'));
  window.addEventListener('offline', () => document.documentElement.classList.add('offline'));
}

/* Données de l'ancienne version encore sur l'appareil : on le signale une
   fois par lancement, l'import se fait depuis les réglages. */
async function offerLegacyImport() {
  const sum = await legacySummary();
  if (!sum || lsGet('legacy-imported')) return;
  setTimeout(() => {
    if (openSheets() || current?.name === 'reglages') return;
    const n = sum.recos;
    toast(n ? `${n} recommandation${n > 1 ? 's' : ''} de l’ancienne version ${n > 1 ? 'sont' : 'est'} sur cet appareil.` : 'Des données de l’ancienne version sont sur cet appareil.', {
      icon: 'cloud-upload', duration: 8000, action: { label: 'Importer', run: () => go('#/reglages') }
    });
  }, 1200);
}

/* Connecté : les données du compte arrivent (cache local d'abord, serveur
   ensuite), puis les vues se montent. */
async function startApp(user) {
  await startSync(user.uid);
  if (!me()) await ensureMe();

  for (const [name, view] of Object.entries(VIEWS)) {
    view.el = document.getElementById('view-' + name);
    view.mount(view.el);
  }
  renderTabbar($('#tabbar'), { onAdd: () => openAdd({ category: currentCategory() }) });
  wire();
  initRouter(onRoute);
  setFabInvite(allRecos().length === 0);
  hideSplash();
  // Refus du serveur pendant le chargement (règles non publiées, quota) : on le dit.
  const err = lastSyncError();
  if (err) toast(err.message, { icon: 'cloud-off', duration: 6000 });

  registerSW();
  loadKey();
  silentPosition();
  offerLegacyImport();

  if (IS_IOS && !isStandalone() && !lsGet('installShown')) {
    setTimeout(() => {
      if (openSheets()) return;
      lsSet('installShown', true);
      openInstall();
    }, 1800);
  }
}

let started = false;

async function boot() {
  applyTheme();
  initViewport();
  await pendingWipe();
  watchAuth((user) => {
    if (user) {
      if (started) return;
      started = true;
      showSplash();
      hideLogin();
      startApp(user).catch(fatal);
    } else if (started) {
      endSession(); // session fermée ailleurs ou expirée
    } else {
      hideSplash();
      showLogin();
      registerSW();
    }
  });
}

boot();
