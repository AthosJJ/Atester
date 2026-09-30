/* Ajout rapide (et édition) d'une recommandation, sur un seul écran :
   catégorie (trois boutons ronds, pré-sélectionnée), Quoi (clavier ouvert,
   suggestions dès 3 caractères), Qui (puces récentes + autocomplétion),
   sous-catégorie devinée, puis « Plus de détails » replié.
   Enregistrer tient en moins de 10 s, hors ligne compris. */
import { icon } from '../components/icons.js';
import { avatar, personChip, namesText } from '../components/person-avatar.js';
import { subBubble } from '../components/reco-card.js';
import { openSheet, actionSheet } from '../components/bottom-sheet.js';
import { toast } from '../components/toast.js';
import { deleteWithUndo } from '../components/reco-actions.js';
import { setFabOpen } from '../components/tabbar.js';
import {
  getReco, createReco, updateReco, addPersonsTo, findDuplicate, emptyDetails
} from '../store/recommendations.js';
import {
  getPerson, me, recentPersons, searchPersons, findByName, createPerson, personsOf
} from '../store/persons.js';
import { subcats, subcat, getPref, setPref } from '../store/settings.js';
import { passesFilters } from '../store/filters.js';
import { searchPlaces, reverseGeocode, guessPlaceSubcat } from '../services/photon.js';
import { searchTitles, fetchDetails, hasUsableKey, posterUrl } from '../services/tmdb.js';
import { searchShows, searchEpisodes } from '../services/itunes.js';
import { isAbort, errorMessage } from '../services/http.js';
import { getPosition, lastPosition, geoErrorMessage } from '../services/geo.js';
import { loadLeaflet, osmLayer, pinIcon } from '../services/map.js';
import { CATEGORIES, CATEGORY_KEYS, TAB_OF, SEARCH_DEBOUNCE, DEFAULT_MAP_VIEW } from '../config.js';
import { esc, inkOn, debounce, localDateISO, safeUrl, colorFromName, lsGet, lsSet, haptic, reducedMotion } from '../utils.js';

/* Branchés par app.js : navigation après l'enregistrement. */
export const addHooks = { saved: null, openSettings: null };

let sheet = null;
let f = null;          // état du formulaire
let sugg = [];         // suggestions affichées
let searchCtrl = null;
let searchSeq = 0;
let epCtrl = null;
let miniMap = null;

const DRAFT_TTL = 30 * 60 * 1000;
const POI_KEYS = ['amenity', 'shop', 'tourism', 'leisure', 'craft', 'historic', 'office'];

const isPending = (id) => String(id).startsWith('new:');
const pendingPerson = (name) => ({ id: 'new:' + name, name, color: colorFromName(name), isMe: false, pending: true });
const personFor = (id) => (isPending(id) ? pendingPerson(id.slice(4)) : getPerson(id));

function blankForm(category) {
  return {
    mode: 'add', id: null, category,
    title: '', subcat: 'other', subGuessed: false, subTouched: false,
    personIds: [], theirNote: '', recommendedAt: localDateISO(), link: '',
    details: emptyDetails(category), picked: null, detailsPromise: null,
    moreOpen: false
  };
}

/* ——— Ouverture ——— */

export function openAdd({ category = null, personId = null } = {}) {
  const cat = CATEGORY_KEYS.includes(category) ? category : (getPref('lastCategory') || 'place');
  f = blankForm(cat);
  let restored = false;
  const draft = lsGet('draft');
  const sameIntent = draft && draft.f && (!category || draft.f.category === category);
  if (!personId && sameIntent && Date.now() - draft.at < DRAFT_TTL && (draft.f.title || draft.f.personIds?.length)) {
    f = { ...blankForm(draft.f.category), ...draft.f, mode: 'add', id: null, detailsPromise: null };
    f.personIds = f.personIds.filter((id) => isPending(id) || getPerson(id));
    restored = true;
  }
  if (personId && getPerson(personId)) f.personIds = [personId];
  build({ restored });
}

export function openEdit(id, { research = false, focus = null } = {}) {
  const r = getReco(id);
  if (!r) return;
  f = {
    mode: 'edit', id, category: r.category,
    title: r.title, subcat: r.subcategory, subGuessed: false, subTouched: true,
    personIds: [...r.personIds], theirNote: r.theirNote, recommendedAt: r.recommendedAt, link: r.link,
    details: structuredClone(r.details), picked: null, detailsPromise: null, moreOpen: true
  };
  build({ research, focus });
}

function build({ restored = false, research = false, focus = null } = {}) {
  if (sheet && !sheet.closed) sheet.close('replace');
  const editing = f.mode === 'edit';
  sheet = openSheet({
    title: editing ? 'Modifier' : 'Nouvelle recommandation',
    label: editing ? 'Modifier la recommandation' : 'Ajouter une recommandation',
    closeLabel: 'Annuler',
    tall: editing,
    cls: 'add-sheet',
    body: `
      <div class="notice" data-r="draft" ${restored ? '' : 'hidden'}>${icon('history', { size: 18 })}
        <span class="grow">Brouillon restauré</span>
        <button type="button" class="text-btn" data-act="drop-draft" style="padding:4px">Effacer</button></div>

      <div class="cat-pick" role="group" aria-label="Catégorie">
        ${CATEGORY_KEYS.map((c) => `
          <button type="button" class="cat-btn" data-cat="${c}" aria-pressed="false">
            <span class="disc">${icon(CATEGORIES[c].icon, { size: 26 })}</span>${esc(CATEGORIES[c].one)}
          </button>`).join('')}
      </div>

      <div class="field" data-r="quoi-field">
        <span class="field-label"><span>Quoi ?</span><span class="opt" data-r="net"></span></span>
        <div class="quoi-wrap">
          <span class="lead">${icon('search', { size: 20 })}</span>
          <input class="input" data-r="quoi" type="text" autocomplete="off" autocorrect="off" spellcheck="false"
            enterkeyhint="done" maxlength="140" aria-autocomplete="list" aria-label="Quoi ?">
          <span class="spin" data-r="spin" hidden></span>
        </div>
        <div class="suggest" data-r="sugg" role="listbox" hidden></div>
        <div data-r="picked"></div>
        <button type="button" class="here-btn" data-act="here" hidden>${icon('locate-fixed', { size: 18 })}Je suis devant</button>
        <p class="need-msg" data-need="title" hidden>Qu’est-ce qu’on t’a conseillé ?</p>
      </div>

      <div class="field" data-r="qui-field">
        <span class="field-label"><span>Qui te l’a conseillé ?</span></span>
        <div class="who-chips" data-r="who"></div>
        <div class="quoi-wrap">
          <span class="lead">${icon('user-plus', { size: 20 })}</span>
          <input class="input" data-r="person" type="text" placeholder="Autre personne…" autocomplete="off"
            autocapitalize="words" autocorrect="off" enterkeyhint="done" maxlength="40" aria-label="Ajouter une personne">
        </div>
        <div class="suggest person-suggest" data-r="psugg" hidden></div>
        <p class="need-msg" data-need="persons" hidden>Indique qui te l’a conseillé (ou « Moi »).</p>
      </div>

      <div class="field">
        <span class="field-label"><span data-r="sub-label">Sous-catégorie</span>
          <span class="guess" data-r="guess" hidden>${icon('sparkles', { size: 12 })}devinée</span></span>
        <div class="sub-grid" data-r="subs"></div>
      </div>

      <button type="button" class="more-toggle" data-act="more" aria-expanded="false">${icon('chevron-down', { size: 18 })}<span>Plus de détails</span></button>
      <div class="more-panel" data-r="more" hidden>
        <label class="field">
          <span class="field-label">Ce qu’on m’en a dit</span>
          <textarea class="textarea" data-f="theirNote" rows="2" placeholder="« Prends la quenelle », « à partir de la saison 2 »…"></textarea>
        </label>
        <div class="field">
          <span class="field-label">Date de la recommandation</span>
          <div class="date-chips">
            <button type="button" class="chip plain" data-date="0">Aujourd’hui</button>
            <button type="button" class="chip plain" data-date="1">Hier</button>
          </div>
          <input class="input" type="date" data-f="recommendedAt" aria-label="Date de la recommandation">
        </div>
        <label class="field">
          <span class="field-label">Lien <span class="opt">site, Instagram, page…</span></span>
          <input class="input" type="url" data-f="link" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="https://">
        </label>
        <div data-r="cat-more"></div>
      </div>
      ${editing ? `<button type="button" class="btn btn-danger block" data-act="delete" style="margin-top:8px">${icon('trash-2', { size: 18 })}Supprimer</button>` : ''}`,
    foot: `<button type="button" class="btn btn-primary block" data-save>${icon(editing ? 'check' : 'plus', { size: 20, stroke: 2.6 })}<span>${editing ? 'Enregistrer' : 'Ajouter'}</span></button>`,
    onClose: onClose
  });
  const body = sheet.body;
  const q = (sel) => body.querySelector(sel);
  const quoi = q('[data-r="quoi"]');
  quoi.value = f.title;
  q('[data-f="theirNote"]').value = f.theirNote;
  q('[data-f="recommendedAt"]').value = f.recommendedAt;
  q('[data-f="recommendedAt"]').max = localDateISO();
  q('[data-f="link"]').value = f.link;
  setMore(f.moreOpen || Boolean(f.theirNote || f.link));

  renderCategory();
  renderWho();
  renderPicked();
  syncSave();
  bindEvents();
  setFabOpen(true);

  if (f.mode === 'add' && !restored) quoi.focus();
  if (research) {
    quoi.focus();
    const len = quoi.value.length;
    quoi.setSelectionRange(len, len);
    runSearch.cancel();
    doSearch();
  }
  if (focus === 'position') {
    setMore(true);
    setTimeout(() => body.querySelector('[data-r="minimap-wrap"]')?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }), 350);
  }
}

/* ——— Rendu ——— */

function $b(sel) { return sheet.body.querySelector(sel); }

function renderCategory() {
  sheet.body.querySelectorAll('[data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === f.category)));
  const quoi = $b('[data-r="quoi"]');
  quoi.placeholder = CATEGORIES[f.category].placeholder;
  $b('[data-act="here"]').hidden = f.category !== 'place';
  $b('[data-r="sub-label"]').textContent = f.category === 'podcast' ? 'Thème' : 'Sous-catégorie';
  renderNet();
  renderSubs();
  renderCatMore();
}

function renderNet() {
  const el = $b('[data-r="net"]');
  if (!el) return;
  if (!navigator.onLine) el.textContent = 'hors ligne : saisie libre';
  else if (f.category === 'screen' && !hasUsableKey()) el.textContent = 'sans clé TMDB : saisie libre';
  else el.textContent = '';
}

function renderSubs() {
  const list = subcats(f.category);
  if (!list.some((s) => s.key === f.subcat)) f.subcat = 'other';
  $b('[data-r="subs"]').innerHTML = list.map((s) => `
    <button type="button" class="chip${s.key === f.subcat ? ' on' : ''}" data-sub="${esc(s.key)}" aria-pressed="${s.key === f.subcat}"
      style="--chip-c:${s.color};--chip-ink:${inkOn(s.color, { text: true })}">${subBubble(s, 28, 15)}<span>${esc(s.label)}</span></button>`).join('');
  $b('[data-r="guess"]').hidden = !(f.subGuessed && !f.subTouched && f.subcat !== 'other');
}

function renderWho() {
  const recents = recentPersons(6);
  const selected = f.personIds.map(personFor).filter(Boolean);
  const mine = me();
  const seen = new Set();
  const list = [...selected.filter((p) => !p.isMe), ...recents, ...(mine ? [mine] : [])].filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  $b('[data-r="who"]').innerHTML = list.map((p) => personChip(p, { pressed: f.personIds.includes(p.id), attrs: `data-pid="${esc(p.id)}"` })).join('');
}

function renderPicked() {
  const el = $b('[data-r="picked"]');
  const p = f.picked;
  if (!p) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="picked">
      ${p.thumb || subBubble(subcat(f.category, f.subcat), 40)}
      <span class="sug-main">
        <span class="sug-title">${esc(p.title)}</span>
        <span class="sug-sub">${esc(p.sub || '')}</span>
      </span>
      <span class="ok">${icon('circle-check', { size: 20 })}</span>
      <button type="button" class="rbtn sm" data-act="unpick" aria-label="Retirer ces infos">${icon('x', { size: 16, stroke: 2.6 })}</button>
    </div>`;
}

function renderCatMore() {
  const el = $b('[data-r="cat-more"]');
  destroyMiniMap();
  if (f.category === 'place') {
    el.innerHTML = `
      <div class="field-row">
        <label class="field"><span class="field-label">Adresse</span>
          <input class="input" data-d="address" type="text" autocomplete="off" placeholder="20 rue…"></label>
        <label class="field" style="flex:.8"><span class="field-label">Ville</span>
          <input class="input" data-d="city" type="text" autocomplete="off" autocapitalize="words" placeholder="Lyon"></label>
      </div>
      ${f.mode === 'edit' ? `
      <div class="field" data-r="minimap-wrap">
        <span class="field-label"><span>Position</span><span class="opt" data-r="pos-hint"></span></span>
        <div class="edit-map"><div class="map" data-r="minimap"></div></div>
        <p class="hint">Fais glisser l’épingle, ou touche la carte pour la placer.</p>
      </div>` : ''}`;
    el.querySelector('[data-d="address"]').value = f.details.address || '';
    el.querySelector('[data-d="city"]').value = f.details.city || '';
    if (f.mode === 'edit' && f.moreOpen) initMiniMap();
  } else if (f.category === 'podcast') {
    el.innerHTML = `
      <div class="field">
        <span class="field-label">Épisode précis <span class="opt">facultatif</span></span>
        <div class="quoi-wrap">
          <span class="lead">${icon('mic', { size: 20 })}</span>
          <input class="input" data-d="episodeTitle" type="text" autocomplete="off" placeholder="Titre ou sujet de l’épisode">
        </div>
        <div class="suggest" data-r="esugg" hidden></div>
      </div>
      <label class="field"><span class="field-label">Par</span>
        <input class="input" data-d="author" type="text" autocomplete="off" placeholder="Auteur ou radio"></label>`;
    el.querySelector('[data-d="episodeTitle"]').value = f.details.episodeTitle || '';
    el.querySelector('[data-d="author"]').value = f.details.author || '';
  } else {
    el.innerHTML = `
      <label class="field"><span class="field-label">Année</span>
        <input class="input" data-d="year" type="text" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="2024"></label>`;
    el.querySelector('[data-d="year"]').value = f.details.year || '';
  }
}

function setMore(open) {
  f.moreOpen = open;
  const btn = $b('[data-act="more"]');
  btn.setAttribute('aria-expanded', String(open));
  $b('[data-r="more"]').hidden = !open;
  if (open && f.category === 'place' && f.mode === 'edit' && !miniMap) initMiniMap();
}

function syncSave() {
  const ok = f.title.trim() && f.personIds.length;
  sheet.foot.querySelector('[data-save]').classList.toggle('is-invalid', !ok);
}

/* ——— Mini-carte d'édition (épingle déplaçable) ——— */

function destroyMiniMap() {
  if (miniMap) { miniMap.map.remove(); miniMap = null; }
}

async function initMiniMap() {
  const el = sheet?.body.querySelector('[data-r="minimap"]');
  if (!el || miniMap) return;
  try {
    const L = await loadLeaflet();
    if (!el.isConnected) return;
    const d = f.details;
    const has = d.lat != null;
    const pos = lastPosition();
    const center = has ? [d.lat, d.lng] : pos ? [pos.lat, pos.lng] : [DEFAULT_MAP_VIEW.lat, DEFAULT_MAP_VIEW.lng];
    const map = L.map(el, { zoomControl: false, attributionControl: true, tap: false });
    map.attributionControl.setPrefix(false);
    osmLayer(L).addTo(map);
    map.setView(center, has ? 16 : pos ? 14 : DEFAULT_MAP_VIEW.zoom, { animate: false });
    const place = (latlng) => {
      f.details.lat = +latlng.lat.toFixed(6);
      f.details.lng = +latlng.lng.toFixed(6);
      f.details.source = 'manual';
      f.details.osmId = f.details.osmId || null;
      if (!miniMap.marker) {
        miniMap.marker = L.marker(latlng, { draggable: true, icon: pinIcon(L, subcat('place', f.subcat), {}), autoPan: true }).addTo(map);
        miniMap.marker.on('dragend', () => place(miniMap.marker.getLatLng()));
      } else {
        miniMap.marker.setLatLng(latlng);
      }
      const hint = sheet.body.querySelector('[data-r="pos-hint"]');
      if (hint) hint.textContent = 'position ajustée';
      haptic();
    };
    miniMap = { map, marker: null };
    if (has) {
      miniMap.marker = L.marker(center, { draggable: true, icon: pinIcon(L, subcat('place', f.subcat), {}), autoPan: true }).addTo(map);
      miniMap.marker.on('dragend', () => place(miniMap.marker.getLatLng()));
    } else {
      const hint = sheet.body.querySelector('[data-r="pos-hint"]');
      if (hint) hint.textContent = 'pas encore placée';
    }
    map.on('click', (e) => place(e.latlng));
    setTimeout(() => map.invalidateSize(), 400);
  } catch {
    el.innerHTML = '<p class="hint" style="padding:16px">Carte indisponible hors ligne.</p>';
  }
}

/* ——— Suggestions ——— */

function showSugg(html) {
  const el = $b('[data-r="sugg"]');
  el.innerHTML = html;
  el.hidden = !html;
}

function hideSugg() {
  runSearch.cancel();
  searchCtrl?.abort();
  $b('[data-r="spin"]').hidden = true;
  showSugg('');
}

function freeRow() {
  const t = f.title.trim();
  return `<button type="button" class="sug free" data-free>${icon('plus', { size: 20 })}
    <span class="sug-main"><span class="sug-title">Ajouter « ${esc(t)} » sans recherche</span></span></button>`;
}

function suggestionRow(it, i) {
  if (f.category === 'place') {
    const sub = subcat('place', it.subcat || 'other');
    return `<button type="button" class="sug" data-sug="${i}" role="option">${subBubble(sub, 38, 18)}
      <span class="sug-main"><span class="sug-title">${esc(it.name)}</span>
      <span class="sug-sub">${esc([it.street, it.postcode && it.city ? `${it.postcode} ${it.city}` : it.city].filter(Boolean).join(', ') || it.country)}</span></span></button>`;
  }
  if (f.category === 'screen') {
    const src = it.posterPath ? posterUrl(it.posterPath, 'w92') : '';
    const type = it.subcat === 'documentaire' ? 'Documentaire' : it.tmdbType === 'tv' ? 'Série' : 'Film';
    return `<button type="button" class="sug" data-sug="${i}" role="option">
      <span class="thumb poster">${src ? `<img src="${esc(src)}" alt="" loading="lazy" data-ph-color="#5B6CE0" data-ph-title="">` : `<span class="ph" style="--c:#5B6CE0">${icon('film', { size: 16 })}</span>`}</span>
      <span class="sug-main"><span class="sug-title">${esc(it.title)}</span>
      <span class="sug-sub">${esc([type, it.year].filter(Boolean).join(' · '))}${it.originalTitle && it.originalTitle !== it.title ? ` · ${esc(it.originalTitle)}` : ''}</span></span></button>`;
  }
  return `<button type="button" class="sug" data-sug="${i}" role="option">
    <span class="thumb">${it.artworkUrl ? `<img src="${esc(it.artworkUrl)}" alt="" loading="lazy" data-ph-color="#9B5DE5" data-ph-title="">` : `<span class="ph" style="--c:#9B5DE5">${icon('headphones', { size: 16 })}</span>`}</span>
    <span class="sug-main"><span class="sug-title">${esc(it.showName)}</span><span class="sug-sub">${esc(it.author)}</span></span></button>`;
}

function renderSugg(items, { loading = false, error = null, noKey = false } = {}) {
  sugg = items;
  let html = '';
  if (loading) html += '<div class="sug info"><span class="sug-main"><span class="sk" style="width:70%;margin-bottom:6px;display:block"></span><span class="sk" style="width:45%;display:block"></span></span></div>';
  html += items.map(suggestionRow).join('');
  if (noKey) html += `<button type="button" class="sug info link" data-act="tmdb-settings">${icon('key-round', { size: 18 })}Ajouter une clé TMDB pour les affiches</button>`;
  if (error) html += `<div class="sug info">${icon(error.kind === 'offline' ? 'wifi-off' : 'cloud-off', { size: 18 })}${esc(errorMessage(error))}</div>`;
  if (!loading && !error && !noKey && !items.length) html += `<div class="sug info">${icon('search', { size: 18 })}Aucune suggestion</div>`;
  html += freeRow();
  showSugg(html);
}

async function doSearch() {
  const q = f.title.trim();
  searchCtrl?.abort();
  if (q.length < 3) { showSugg(''); $b('[data-r="spin"]').hidden = true; return; }
  if (!navigator.onLine) { renderSugg([], { error: { kind: 'offline' } }); return; }
  if (f.category === 'screen' && !hasUsableKey()) { renderSugg([], { noKey: true }); return; }
  const token = ++searchSeq;
  searchCtrl = new AbortController();
  const { signal } = searchCtrl;
  $b('[data-r="spin"]').hidden = false;
  if (!sugg.length) renderSugg([], { loading: true });
  try {
    let items;
    if (f.category === 'place') {
      const pos = lastPosition() || lsGet('map:view');
      items = await searchPlaces(q, { lat: pos?.lat, lng: pos?.lng, signal });
    } else if (f.category === 'screen') {
      items = await searchTitles(q, { signal });
    } else {
      items = await searchShows(q, { signal });
    }
    if (token !== searchSeq || !sheet || sheet.closed) return;
    renderSugg(items);
  } catch (err) {
    if (isAbort(err) || token !== searchSeq || !sheet || sheet.closed) return;
    renderSugg([], { error: err, noKey: err.kind === 'auth' && f.category === 'screen' });
    renderNet();
  } finally {
    if (token === searchSeq && sheet && !sheet.closed) $b('[data-r="spin"]').hidden = true;
  }
}
const runSearch = debounce(doSearch, SEARCH_DEBOUNCE);

function setSubcatGuess(key) {
  if (!key || f.subTouched) return;
  if (!subcats(f.category).some((s) => s.key === key)) return;
  f.subcat = key;
  f.subGuessed = true;
  renderSubs();
}

function pick(i) {
  const it = sugg[i];
  if (!it) return;
  if (f.category === 'place') {
    f.title = it.name;
    f.details = { ...emptyDetails('place'), address: it.street, city: it.city, lat: it.lat, lng: it.lng, osmId: it.osmId, source: 'photon' };
    f.picked = { title: it.name, sub: [it.street, it.city].filter(Boolean).join(', ') };
    setSubcatGuess(it.subcat);
  } else if (f.category === 'screen') {
    f.title = it.title;
    f.details = { ...emptyDetails('screen'), tmdbId: it.tmdbId, tmdbType: it.tmdbType, year: it.year, posterPath: it.posterPath, overview: it.overview };
    const src = it.posterPath ? posterUrl(it.posterPath, 'w92') : '';
    f.picked = {
      title: it.title,
      sub: [it.tmdbType === 'tv' ? 'Série' : 'Film', it.year].filter(Boolean).join(' · '),
      thumb: src ? `<span class="thumb poster"><img src="${esc(src)}" alt=""></span>` : null
    };
    setSubcatGuess(it.subcat);
    const tmdbId = it.tmdbId;
    f.detailsPromise = fetchDetails(it.tmdbType, tmdbId).then((d) => {
      if (f && f.details.tmdbId === tmdbId) {
        mergeTmdb(f.details, d);
        if (d.documentary) setSubcatGuess('documentaire');
        if (f.picked && d.platforms.length) { f.picked.sub += ` · ${d.platforms.slice(0, 2).join(', ')}`; if (sheet && !sheet.closed) renderPicked(); }
        f.detailsMerged = true;
      }
      return d;
    }).catch(() => null);
  } else {
    f.title = it.showName;
    f.details = { ...emptyDetails('podcast'), itunesId: it.itunesId, showName: it.showName, author: it.author, artworkUrl: it.artworkUrl, appleUrl: it.appleUrl, feedUrl: it.feedUrl, episodeTitle: f.details.episodeTitle || '' };
    f.picked = { title: it.showName, sub: it.author, thumb: it.artworkUrl ? `<span class="thumb"><img src="${esc(it.artworkUrl)}" alt=""></span>` : null };
    setSubcatGuess(it.subcat);
  }
  $b('[data-r="quoi"]').value = f.title;
  hideSugg();
  $b('[data-r="quoi"]').blur();
  hideNeed('title');
  renderPicked();
  renderCatMore();
  syncSave();
  haptic();
}

function mergeTmdb(details, d) {
  details.genres = d.genres;
  details.platforms = d.platforms;
  details.seasons = d.seasons;
  if (!details.overview) details.overview = d.overview;
  if (!details.year) details.year = d.year;
  if (!details.posterPath) details.posterPath = d.posterPath;
}

function unpick() {
  f.picked = null;
  f.detailsPromise = null;
  const keepEpisode = f.details.episodeTitle;
  f.details = emptyDetails(f.category);
  if (f.category === 'podcast') f.details.episodeTitle = keepEpisode || '';
  if (!f.subTouched) { f.subcat = 'other'; f.subGuessed = false; renderSubs(); }
  renderPicked();
  renderCatMore();
}

/* « Je suis devant » : position GPS, adresse par géocodage inverse. */
async function iAmHere(btn) {
  btn.classList.add('busy');
  try {
    const pos = await getPosition();
    f.details = { ...emptyDetails('place'), ...f.details, lat: pos.lat, lng: pos.lng, source: 'gps', osmId: null };
    let label = `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`;
    if (navigator.onLine) {
      try {
        const r = await reverseGeocode(pos.lat, pos.lng);
        if (r) {
          f.details.address = r.street || f.details.address;
          f.details.city = r.city || f.details.city;
          label = [r.street, r.city].filter(Boolean).join(', ') || label;
          if (POI_KEYS.includes(r.osmKey) && r.name) {
            if (!f.title.trim()) {
              f.title = r.name;
              $b('[data-r="quoi"]').value = r.name;
              hideNeed('title');
            }
            f.details.osmId = r.osmId;
            setSubcatGuess(guessPlaceSubcat(r.osmKey, r.osmValue));
          }
        }
      } catch { /* adresse facultative */ }
    }
    f.picked = { title: 'Position actuelle', sub: label, thumb: `<span class="bubble" style="--c:#2F80ED;width:40px;height:40px">${icon('locate-fixed', { size: 18 })}</span>` };
    hideSugg();
    renderPicked();
    renderCatMore();
    syncSave();
    haptic();
  } catch (err) {
    toast(geoErrorMessage(err), { icon: 'locate-fixed' });
  } finally {
    btn.classList.remove('busy');
  }
}

/* ——— Personnes ——— */

function renderPersonSugg() {
  const input = $b('[data-r="person"]');
  const el = $b('[data-r="psugg"]');
  const qv = input.value.trim();
  if (!qv) { el.hidden = true; el.innerHTML = ''; return; }
  const matches = searchPersons(qv, { exclude: f.personIds }).slice(0, 5);
  const exact = findByName(qv) || f.personIds.filter(isPending).map(personFor).find((p) => p.name.toLowerCase() === qv.toLowerCase());
  let html = matches.map((p) => `<button type="button" class="sug" data-pick-person="${esc(p.id)}">${avatar(p, 34)}
    <span class="sug-main"><span class="sug-title">${esc(p.name)}</span></span></button>`).join('');
  if (!exact) {
    html += `<button type="button" class="sug free" data-create-person>${icon('user-plus', { size: 20 })}
      <span class="sug-main"><span class="sug-title">Créer « ${esc(qv)} »</span></span></button>`;
  } else if (f.personIds.includes(exact.id)) {
    html += `<div class="sug info">${esc(exact.name)} est déjà sélectionné</div>`;
  }
  el.innerHTML = html;
  el.hidden = !html;
}

function togglePerson(id) {
  f.personIds = f.personIds.includes(id) ? f.personIds.filter((x) => x !== id) : [...f.personIds, id];
  renderWho();
  syncSave();
  if (f.personIds.length) hideNeed('persons');
  haptic();
}

function addPersonByName(name) {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) return;
  const existing = findByName(clean);
  const id = existing ? existing.id : 'new:' + clean;
  if (!f.personIds.includes(id)) f.personIds = [...f.personIds, id];
  const input = $b('[data-r="person"]');
  input.value = '';
  renderPersonSugg();
  renderWho();
  syncSave();
  hideNeed('persons');
  haptic();
}

async function resolvePersons(ids) {
  const out = [];
  for (const id of ids) {
    if (isPending(id)) out.push((await createPerson(id.slice(4))).id);
    else if (getPerson(id)) out.push(id);
  }
  return [...new Set(out)];
}

/* ——— Champs requis ——— */

function showNeed(which) {
  const msg = sheet.body.querySelector(`[data-need="${which}"]`);
  msg.hidden = false;
  const field = msg.closest('.field');
  field.classList.remove('need');
  void field.offsetWidth;
  field.classList.add('need');
}
function hideNeed(which) {
  const msg = sheet?.body.querySelector(`[data-need="${which}"]`);
  if (msg) msg.hidden = true;
}

/* ——— Enregistrement ——— */

let saving = false;

async function save() {
  if (saving) return;
  f.title = $b('[data-r="quoi"]').value.trim();
  const missing = [];
  if (!f.title) missing.push('title');
  if (!f.personIds.length) missing.push('persons');
  if (missing.length) {
    missing.forEach(showNeed);
    const btn = sheet.foot.querySelector('[data-save]');
    btn.classList.remove('shake');
    void btn.offsetWidth;
    btn.classList.add('shake');
    sheet.body.querySelector(`[data-need="${missing[0]}"]`).closest('.field')
      .scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    haptic();
    return;
  }
  saving = true;
  try {
    readFields();
    const data = {
      category: f.category,
      subcategory: f.subcat,
      title: f.title,
      recommendedAt: f.recommendedAt || localDateISO(),
      theirNote: f.theirNote.trim(),
      link: safeUrl(f.link),
      details: f.details
    };
    if (f.mode === 'edit') {
      const pending = !f.detailsMerged ? f.detailsPromise : null;
      data.personIds = await resolvePersons(f.personIds);
      const r = await updateReco(f.id, data);
      if (pending) pending.then((d) => { if (d) { const det = { ...getReco(r.id).details }; mergeTmdb(det, d); updateReco(r.id, { details: det }); } });
      closeAfterSave();
      toast('Modifications enregistrées', { icon: 'check', tone: 'ok' });
      return;
    }

    // Doublon d'abord : les nouvelles personnes ne sont créées qu'une fois le choix fait.
    const dup = findDuplicate(data);
    if (dup) {
      const known = namesText(personsOf(dup));
      const fresh = f.personIds.filter((id) => isPending(id) || !dup.personIds.includes(id));
      if (fresh.length) {
        const who = namesText(fresh.map(personFor).filter(Boolean));
        const v = await actionSheet({
          title: `Déjà recommandé par ${known}`,
          message: `« ${dup.title} » est déjà dans ta liste.`,
          actions: [
            { label: `Ajouter ${who} à cette recommandation`, value: 'merge', primary: true, icon: 'user-plus' },
            { label: 'Créer quand même', value: 'create' }
          ]
        });
        if (v === 'merge') {
          await addPersonsTo(dup.id, await resolvePersons(fresh));
          if (data.theirNote && data.theirNote !== dup.theirNote) {
            await updateReco(dup.id, { theirNote: dup.theirNote ? `${dup.theirNote}\n${who} : ${data.theirNote}` : data.theirNote });
          }
          finishAdd(dup.id, `${who} ajouté${fresh.length > 1 ? 's' : ''} à « ${dup.title} »`);
          return;
        }
        if (v !== 'create') return;
      } else {
        const v = await actionSheet({
          title: 'Déjà dans ta liste',
          message: `« ${dup.title} » t’a déjà été recommandé par ${known}.`,
          actions: [{ label: 'Voir la fiche', value: 'open', primary: true, icon: 'eye' }, { label: 'Créer quand même', value: 'create' }]
        });
        if (v === 'open') {
          lsSet('draft', null);
          closeAfterSave();
          addHooks.saved?.(dup, { open: true });
          return;
        }
        if (v !== 'create') return;
      }
    }

    const pending = !f.detailsMerged ? f.detailsPromise : null;
    data.personIds = await resolvePersons(f.personIds);
    const reco = await createReco(data);
    if (pending) {
      pending.then((d) => {
        if (!d || !getReco(reco.id)) return;
        const det = { ...getReco(reco.id).details };
        mergeTmdb(det, d);
        const patch = { details: det };
        if (d.documentary && getReco(reco.id).subcategory === 'film') patch.subcategory = 'documentaire';
        updateReco(reco.id, patch);
      });
    }
    await setPref('lastCategory', f.category);
    finishAdd(reco.id, null);
  } finally {
    saving = false;
  }
}

function readFields() {
  const b = sheet.body;
  f.theirNote = b.querySelector('[data-f="theirNote"]').value;
  f.link = b.querySelector('[data-f="link"]').value.trim();
  f.recommendedAt = b.querySelector('[data-f="recommendedAt"]').value || localDateISO();
  b.querySelectorAll('[data-d]').forEach((el) => { f.details[el.dataset.d] = el.value.trim(); });
}

function finishAdd(id, message) {
  lsSet('draft', null);
  const r = getReco(id);
  closeAfterSave();
  const tab = TAB_OF[r.category];
  const hidden = !passesFilters(tab, r, { position: lastPosition() });
  addHooks.saved?.(r, { hidden });
  const text = message || (hidden ? 'Ajouté (masqué par tes filtres)' : 'Ajouté');
  toast(text, { icon: 'check', tone: 'ok', action: { label: 'Voir', run: () => addHooks.saved?.(r, { open: true }) } });
}

function closeAfterSave() {
  f.saved = true;
  sheet.close('saved');
}

function onClose(reason) {
  setFabOpen(false);
  destroyMiniMap();
  hideSuggSafe();
  if (f && f.mode === 'add' && !f.saved) {
    if (reason === 'button') lsSet('draft', null);
    else if (reason !== 'replace') {
      try { readFields(); } catch { /* feuille déjà vidée */ }
      if (f.title.trim() || f.personIds.length || f.theirNote.trim()) {
        const rest = { ...f, title: sheet.body.querySelector('[data-r="quoi"]').value };
        delete rest.detailsPromise;
        lsSet('draft', { at: Date.now(), f: rest });
      }
    }
  }
}

function hideSuggSafe() {
  runSearch.cancel();
  searchCtrl?.abort();
  epCtrl?.abort();
}

/* ——— Événements ——— */

function bindEvents() {
  const body = sheet.body;
  const quoi = body.querySelector('[data-r="quoi"]');
  const personInput = body.querySelector('[data-r="person"]');

  // Les boutons de catégorie ne volent pas le focus du champ (le clavier reste ouvert).
  body.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('mousedown', (e) => e.preventDefault()));

  body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-cat], [data-act], [data-sug], [data-free], [data-pid], [data-pick-person], [data-create-person], [data-sub], [data-date], [data-ep], [data-ep-free]');
    if (!t) return;
    if (t.dataset.cat) {
      const had = document.activeElement === quoi;
      if (t.dataset.cat !== f.category) {
        f.category = t.dataset.cat;
        f.details = emptyDetails(f.category);
        f.picked = null;
        f.detailsPromise = null;
        f.subcat = 'other';
        f.subGuessed = false;
        f.subTouched = false;
        sugg = [];
        renderCategory();
        renderPicked();
        haptic();
        if (f.title.trim().length >= 3) { runSearch.cancel(); doSearch(); }
      }
      if (had || f.mode === 'add') quoi.focus();
      return;
    }
    if (t.dataset.sug !== undefined) { pick(Number(t.dataset.sug)); return; }
    if (t.dataset.free !== undefined) { hideSugg(); quoi.blur(); return; }
    if (t.dataset.pid) { togglePerson(t.dataset.pid); return; }
    if (t.dataset.pickPerson) { addPersonByName(getPerson(t.dataset.pickPerson).name); personInput.blur(); return; }
    if (t.dataset.createPerson !== undefined) { addPersonByName(personInput.value); personInput.blur(); return; }
    if (t.dataset.sub) {
      f.subcat = t.dataset.sub;
      f.subTouched = true;
      renderSubs();
      haptic();
      return;
    }
    if (t.dataset.date !== undefined) {
      const d = new Date();
      d.setDate(d.getDate() - Number(t.dataset.date));
      body.querySelector('[data-f="recommendedAt"]').value = localDateISO(d);
      f.recommendedAt = localDateISO(d);
      return;
    }
    if (t.dataset.ep !== undefined) {
      const input = body.querySelector('[data-d="episodeTitle"]');
      input.value = t.dataset.ep;
      f.details.episodeTitle = t.dataset.ep;
      body.querySelector('[data-r="esugg"]').hidden = true;
      input.blur();
      return;
    }
    if (t.dataset.epFree !== undefined) {
      body.querySelector('[data-r="esugg"]').hidden = true;
      body.querySelector('[data-d="episodeTitle"]').blur();
      return;
    }
    switch (t.dataset.act) {
      case 'here': iAmHere(t); break;
      case 'unpick': unpick(); break;
      case 'more': setMore(!f.moreOpen); break;
      case 'drop-draft': {
        lsSet('draft', null);
        const cat = f.category;
        f = blankForm(cat);
        build({});
        break;
      }
      case 'tmdb-settings': addHooks.openSettings?.(); break;
      case 'delete': {
        const id = f.id;
        f.saved = true;
        sheet.close('delete');
        deleteWithUndo(id);
        break;
      }
      default: break;
    }
  });

  quoi.addEventListener('input', () => {
    f.title = quoi.value;
    if (f.mode === 'add' && f.picked) unpick();
    if (f.title.trim()) hideNeed('title');
    syncSave();
    if (f.title.trim().length >= 3) {
      if (!navigator.onLine || (f.category === 'screen' && !hasUsableKey())) doSearch();
      else runSearch();
    } else {
      hideSugg();
    }
  });
  quoi.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); hideSugg(); quoi.blur(); }
  });

  personInput.addEventListener('input', renderPersonSugg);
  personInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const qv = personInput.value.trim();
    if (!qv) { personInput.blur(); return; }
    const first = searchPersons(qv, { exclude: f.personIds })[0];
    const exact = findByName(qv);
    addPersonByName(exact ? exact.name : (first && first.name.toLowerCase().startsWith(qv.toLowerCase()) ? first.name : qv));
  });

  body.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.f) f[el.dataset.f] = el.value;
    if (el.dataset.d) {
      f.details[el.dataset.d] = el.value;
      if (el.dataset.d === 'episodeTitle') runEpisodes();
    }
  });

  sheet.foot.querySelector('[data-save]').addEventListener('click', save);
}

/* Épisode précis : suggestions iTunes dans l'émission choisie. */
const runEpisodes = debounce(async () => {
  const input = sheet?.body.querySelector('[data-d="episodeTitle"]');
  const box = sheet?.body.querySelector('[data-r="esugg"]');
  if (!input || !box) return;
  const qv = input.value.trim();
  epCtrl?.abort();
  if (qv.length < 3 || !navigator.onLine) { box.hidden = true; return; }
  epCtrl = new AbortController();
  try {
    const items = await searchEpisodes(qv, { showName: f.details.showName || f.title, itunesId: f.details.itunesId, signal: epCtrl.signal });
    if (!sheet || sheet.closed) return;
    box.innerHTML = items.slice(0, 6).map((ep) => `
      <button type="button" class="sug" data-ep="${esc(ep.title)}">${icon('mic', { size: 18 })}
        <span class="sug-main"><span class="sug-title">${esc(ep.title)}</span><span class="sug-sub">${esc([ep.showName, ep.date].filter(Boolean).join(' · '))}</span></span></button>`).join('')
      + `<button type="button" class="sug free" data-ep-free>${icon('check', { size: 18 })}<span class="sug-main"><span class="sug-title">Garder « ${esc(qv)} »</span></span></button>`;
    box.hidden = false;
  } catch (err) {
    if (!isAbort(err)) box.hidden = true;
  }
}, SEARCH_DEBOUNCE);

export const isAddOpen = () => Boolean(sheet && !sheet.closed);
