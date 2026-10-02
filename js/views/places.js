/* Onglet Lieux : carte (par défaut) ou liste, mêmes filtres.
   Carte : épingles colorées par sous-catégorie, regroupées au-delà de 30,
   recadrage automatique sur les résultats (sauf déplacement manuel récent),
   aperçu flottant au tap, « Me localiser ». */
import { createHeader, listMeta } from './content-tab.js';
import { emptyState, filteredEmpty } from './empty.js';
import { swipeHint } from './hints.js';
import { icon } from '../components/icons.js';
import { recoRow, subBubble, statusBadge } from '../components/reco-card.js';
import { avatarStack, namesText } from '../components/person-avatar.js';
import { bindSwipe, bindLongPress } from '../components/swipe.js';
import { swipeStatus, toggleFav, contextMenu, openDoneSheet } from '../components/reco-actions.js';
import { toast } from '../components/toast.js';
import { on } from '../store/events.js';
import { getFilters, setFilters, results, resetFilters } from '../store/filters.js';
import { recosOf, getReco } from '../store/recommendations.js';
import { personsOf } from '../store/persons.js';
import { subcat } from '../store/settings.js';
import { loadLeaflet, attachBaseLayer, oneFingerZoom, pinIcon, clusterIcon, userIcon } from '../services/map.js';
import { directionsButton } from '../components/directions.js';
import { lastPosition, getPosition, geoErrorMessage } from '../services/geo.js';
import { STATUS, CLUSTER_THRESHOLD, DEFAULT_MAP_VIEW, EMPTY, MAP_MAX_ZOOM } from '../config.js';
import { esc, plural, fmtDistance, distanceKm, lsGet, lsSet, reducedMotion } from '../utils.js';

const TAB = 'lieux';
let section, header, mapWrap, mapEl, listWrap, countEl, previewEl, overlayEl, loadingEl, ctlEl;
let L = null;
let map = null;
let initPromise = null;
let layer = null;
let meMarker = null;
const markers = new Map();
let bounds = null;
let lastUserMove = 0;
let selectedId = null;
let visible = false;
let newId = null;
let animatePins = true;
let lastSig = '';

const getCtx = () => {
  const st = getFilters(TAB);
  return { position: lastPosition(), bounds: st.zone && st.view === 'liste' ? bounds : null };
};

/* ——— Liste ——— */
function renderList() {
  const st = getFilters(TAB);
  if (!recosOf('place').length) { listWrap.innerHTML = emptyState('place'); return; }
  const ctx = getCtx();
  const items = results(TAB, st, ctx);
  const zone = bounds
    ? `<button type="button" class="zone-toggle" data-act="zone" aria-pressed="${st.zone}">${icon('map', { size: 14, stroke: 2.4 })}Zone de la carte</button>`
    : '';
  if (!items.length) { listWrap.innerHTML = listMeta(TAB, 0, zone) + filteredEmpty(); return; }
  listWrap.innerHTML = listMeta(TAB, items.length, zone) + swipeHint('place')
    + `<div class="list">${items.map((r, i) => recoRow(r, { i, position: ctx.position, newId })).join('')}</div>`;
  newId = null;
}

/* ——— Carte ——— */
function initMap() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    L = await loadLeaflet();
    const saved = lsGet('map:view') || DEFAULT_MAP_VIEW;
    map = L.map(mapEl, { zoomControl: false, minZoom: 2, maxZoom: MAP_MAX_ZOOM, zoomSnap: 0.5, worldCopyJump: true, fadeAnimation: !reducedMotion(), zoomAnimation: !reducedMotion(), markerZoomAnimation: !reducedMotion() });
    map.attributionControl.setPrefix(false);
    attachBaseLayer(L, map);
    map.setView([saved.lat, saved.lng], saved.zoom, { animate: false });
    mapEl.addEventListener('touchstart', () => { lastUserMove = Date.now(); }, { passive: true });
    oneFingerZoom(L, map, { onStart: () => { lastUserMove = Date.now(); } });
    mapEl.addEventListener('wheel', () => { lastUserMove = Date.now(); }, { passive: true });
    map.on('dragstart', () => { lastUserMove = Date.now(); });
    map.on('moveend', () => {
      const b = map.getBounds();
      bounds = { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
      const c = map.getCenter();
      lsSet('map:view', { lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), zoom: map.getZoom() });
    });
    map.on('click', () => closePreview());
    loadingEl.hidden = true;
    const pos = lastPosition();
    if (pos) showMe(pos);
  })().catch((err) => {
    initPromise = null;
    loadingEl.innerHTML = `<p class="muted">Carte indisponible (${esc(err.message)})</p>`;
    throw err;
  });
  return initPromise;
}

function showMe(pos) {
  if (!map) return;
  if (!meMarker) {
    meMarker = L.marker([pos.lat, pos.lng], { icon: userIcon(L), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map);
  } else {
    meMarker.setLatLng([pos.lat, pos.lng]);
  }
}

function fitResults(force = false) {
  if (!map) return;
  if (!force && Date.now() - lastUserMove < 10000) return;
  const pts = [...markers.values()].map((m) => m.getLatLng());
  if (!pts.length) return;
  const anim = !reducedMotion();
  const opts = { paddingTopLeft: [40, 70], paddingBottomRight: [40, 150], maxZoom: 16, animate: anim };
  if (pts.length === 1) map.setView(pts[0], Math.max(map.getZoom(), 15), { animate: anim });
  else map.fitBounds(L.latLngBounds(pts), opts);
}

function updateMarkers({ fit = true } = {}) {
  if (!map) return;
  const prevCount = markers.size;
  const st = getFilters(TAB);
  const all = results(TAB, { ...st, zone: false }, { position: lastPosition() });
  const items = all.filter((r) => r.details.lat != null);
  const withoutPos = all.length - items.length;

  if (layer) map.removeLayer(layer);
  markers.clear();
  layer = items.length > CLUSTER_THRESHOLD
    ? L.markerClusterGroup({
      maxClusterRadius: 50, showCoverageOnHover: false, spiderfyOnMaxZoom: true,
      animate: !reducedMotion(), iconCreateFunction: (c) => clusterIcon(L, c)
    })
    : L.layerGroup();
  items.forEach((r, i) => {
    const sub = subcat('place', r.subcategory);
    const m = L.marker([r.details.lat, r.details.lng], {
      icon: pinIcon(L, sub, { status: r.status, favorite: r.favorite, delay: animatePins ? Math.min(i * 22, 420) : 0 }),
      pinColor: sub.color,
      title: r.title,
      alt: r.title,
      riseOnHover: true,
      zIndexOffset: r.status === 'todo' ? 100 : 0
    });
    m.on('click', (e) => { L.DomEvent.stopPropagation(e); openPreview(r.id); });
    markers.set(r.id, m);
    layer.addLayer(m);
  });
  layer.addTo(map);
  mapEl.classList.toggle('no-anim', !animatePins);
  animatePins = true;

  countEl.hidden = !recosOf('place').length;
  countEl.innerHTML = `${icon('map-pin', { size: 15 })}<span>${plural(items.length, ['lieu', 'lieux'])}</span>`
    + (withoutPos ? ` · <span class="warn">${withoutPos} sans position</span>` : '');

  renderOverlay(items.length, all.length);
  if (fit) fitResults();
  else if (!prevCount && items.length) fitResults(true); // premiers lieux : on les montre
  if (selectedId) {
    if (markers.has(selectedId)) openPreview(selectedId, { silent: true });
    else closePreview();
  }
}

function renderOverlay(onMap, matching) {
  let html = '';
  if (!recosOf('place').length) {
    html = emptyState('place');
  } else if (!matching) {
    html = filteredEmpty();
  } else if (!onMap) {
    html = `<div class="empty">
      <h3>Aucun lieu localisé</h3>
      <p>${plural(matching, ['lieu', 'lieux'])} sans position. Ajoute leur adresse depuis leur fiche.</p>
      <div class="actions"><button type="button" class="btn btn-soft sm" data-seg="liste">${icon('list', { size: 17 })}Voir la liste</button></div>
    </div>`;
  }
  overlayEl.hidden = !html;
  overlayEl.innerHTML = html;
}

/* ——— Aperçu d'une épingle ——— */
function openPreview(id, { silent = false } = {}) {
  const r = getReco(id);
  if (!r) return;
  selectedId = id;
  markers.forEach((m, mid) => m._icon?.classList.toggle('selected', mid === id));
  const sub = subcat('place', r.subcategory);
  const persons = personsOf(r);
  const pos = lastPosition();
  const dist = pos && r.details.lat != null ? fmtDistance(distanceKm(pos, r.details)) : '';
  const S = STATUS.place;
  previewEl.innerHTML = `
    <div class="${silent ? '' : 'swap'}">
      <div class="preview-top">
        ${subBubble(sub, 50)}
        <div class="grow">
          <h3>${esc(r.title)}</h3>
          <p class="row-sub">${esc([sub.label, r.details.city, dist].filter(Boolean).join(' · '))}</p>
          ${persons.length ? `<div class="row-people">${avatarStack(persons, { size: 22 })}<span class="names">Recommandé par ${esc(namesText(persons))}</span></div>` : ''}
        </div>
        <div class="row-end">
          <button type="button" class="rbtn sm" data-act="close-preview" aria-label="Fermer l’aperçu">${icon('x', { size: 16, stroke: 2.6 })}</button>
          ${statusBadge(r)}
        </div>
      </div>
      <div class="preview-actions">
        ${directionsButton(r, { cls: 'btn btn-soft' })}
        <button type="button" class="btn btn-primary" data-open="${r.id}">Voir la fiche</button>
        ${r.status === 'todo' ? `<button type="button" class="rbtn accent" data-act="preview-done" data-id="${r.id}" aria-label="${esc(S.mark)}">${icon('check', { stroke: 2.6 })}</button>` : ''}
      </div>
    </div>`;
  previewEl.classList.add('open');
  previewEl.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => {
    ctlEl.style.setProperty('--lift', `${previewEl.offsetHeight + 12}px`);
    ctlEl.classList.add('lifted');
    // Les messages s'affichent au-dessus de l'aperçu.
    document.documentElement.style.setProperty('--toast-lift', `${previewEl.offsetHeight - 6}px`);
  });
}

function closePreview() {
  if (!selectedId && !previewEl.classList.contains('open')) return;
  selectedId = null;
  markers.forEach((m) => m._icon?.classList.remove('selected'));
  previewEl.classList.remove('open');
  previewEl.setAttribute('aria-hidden', 'true');
  ctlEl.classList.remove('lifted');
  document.documentElement.style.removeProperty('--toast-lift');
}

function bindPreviewDrag() {
  let g = null;
  previewEl.addEventListener('touchstart', (e) => {
    if (e.target.closest('button, a')) { g = null; return; }
    g = { y0: e.touches[0].clientY, dy: 0, t0: Date.now() };
    previewEl.classList.add('dragging');
  }, { passive: true });
  previewEl.addEventListener('touchmove', (e) => {
    if (!g) return;
    g.dy = Math.max(0, e.touches[0].clientY - g.y0);
    previewEl.style.transform = `translateY(${g.dy}px)`;
  }, { passive: true });
  const end = () => {
    if (!g) return;
    const { dy, t0 } = g;
    g = null;
    previewEl.classList.remove('dragging');
    previewEl.style.transform = '';
    if (dy > 70 || (dy > 30 && dy / (Date.now() - t0) > 0.5)) closePreview();
  };
  previewEl.addEventListener('touchend', end);
  previewEl.addEventListener('touchcancel', end);
}

async function locate(btn) {
  btn.classList.add('busy');
  try {
    const pos = await getPosition();
    await initMap();
    showMe(pos);
    map.setView([pos.lat, pos.lng], Math.max(map.getZoom(), 15), { animate: !reducedMotion() });
    lastUserMove = Date.now();
    btn.classList.add('on');
  } catch (err) {
    toast(geoErrorMessage(err), { icon: 'locate-fixed' });
  } finally {
    btn.classList.remove('busy');
  }
}

/* ——— Rendu ——— */
async function render({ fit = true } = {}) {
  header.sync();
  const st = getFilters(TAB);
  const isMap = st.view === 'carte';
  section.classList.toggle('map-mode', isMap);
  document.documentElement.classList.toggle('map-lock', isMap && visible);
  mapWrap.hidden = !isMap;
  listWrap.hidden = isMap;
  if (!isMap) { closePreview(); renderList(); return; }
  try {
    await initMap();
  } catch {
    return;
  }
  map.invalidateSize({ animate: false });
  // Revenir sur l'onglet avec les mêmes filtres garde le cadrage de l'utilisateur.
  const crit = { ...getFilters(TAB) };
  delete crit.view;
  delete crit.zone;
  const sig = JSON.stringify(crit);
  if (fit && sig === lastSig && markers.size) fit = false;
  lastSig = sig;
  updateMarkers({ fit });
}

export default {
  name: TAB,
  tab: true,
  mount(el) {
    section = el;
    section.innerHTML = `
      <div class="vwrap">
        <div class="map-wrap" hidden>
          <div class="map" role="application" aria-label="Carte des lieux recommandés"></div>
          <button type="button" class="map-count" data-seg="liste" aria-label="Voir en liste" hidden></button>
          <div class="map-ctl">
            <button type="button" class="rbtn" data-act="fit" aria-label="Recadrer sur les résultats">${icon('maximize')}</button>
            <button type="button" class="rbtn" data-act="locate" aria-label="Me localiser">${icon('locate-fixed')}</button>
          </div>
          <div class="map-loading"><span class="spin" aria-label="Chargement de la carte"></span></div>
          <div class="map-empty" hidden></div>
          <div class="preview" aria-hidden="true"></div>
        </div>
        <div class="list-wrap vbody" hidden></div>
      </div>`;
    mapWrap = section.querySelector('.map-wrap');
    mapEl = section.querySelector('.map');
    listWrap = section.querySelector('.list-wrap');
    countEl = section.querySelector('.map-count');
    previewEl = section.querySelector('.preview');
    overlayEl = section.querySelector('.map-empty');
    loadingEl = section.querySelector('.map-loading');
    ctlEl = section.querySelector('.map-ctl');
    header = createHeader(section, {
      tab: TAB,
      title: 'Lieux',
      getCtx,
      segment: {
        label: 'Affichage',
        alwaysShow: true,
        items: [{ key: 'carte', label: 'Carte', icon: 'map' }, { key: 'liste', label: 'Liste', icon: 'list' }],
        get: (st) => st.view,
        set: (k) => setFilters(TAB, { view: k })
      }
    });

    section.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const act = el.dataset.act;
      if (act === 'fit') { lastUserMove = 0; fitResults(true); }
      else if (act === 'locate') locate(el);
      else if (act === 'close-preview') closePreview();
      else if (act === 'preview-done') openDoneSheet(el.dataset.id);
      else if (act === 'zone') setFilters(TAB, { zone: !getFilters(TAB).zone });
    });
    bindPreviewDrag();
    bindSwipe(listWrap, { onLeft: swipeStatus, onRight: toggleFav });
    bindLongPress(listWrap, '.swipe', (el2) => contextMenu(el2.dataset.id));

    on('position', (pos) => {
      if (map) showMe(pos);
      if (visible && getFilters(TAB).view === 'liste') renderList();
    });
  },
  show() {
    visible = true;
    render();
  },
  hide() {
    visible = false;
    document.documentElement.classList.remove('map-lock');
    closePreview();
  },
  refresh(evt) {
    // Données ou réglages modifiés : on garde le cadrage et on ne rejoue pas la chute des épingles.
    const data = evt && (evt.source === 'data' || evt.source === 'meta');
    const bulk = data && ['demo', 'demo-remove', 'import', 'wipe'].includes(evt.type);
    if (data && !bulk) animatePins = false;
    if (bulk) lastSig = '';
    render({ fit: !data || bulk });
  },
  highlight(id) {
    newId = id;
    const r = getReco(id);
    if (r && r.details.lat != null && getFilters(TAB).view === 'carte') {
      setTimeout(() => {
        if (!map || !markers.has(id)) return;
        map.setView([r.details.lat, r.details.lng], Math.max(map.getZoom(), 15), { animate: !reducedMotion() });
        lastUserMove = Date.now();
        openPreview(id);
      }, 350);
    }
  },
  resetFilters() { resetFilters(TAB); },
  emptyText: EMPTY.place
};
