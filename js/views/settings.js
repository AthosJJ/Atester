/* Réglages : sauvegarde (rappel à 14 jours), sous-catégories (ajout, renommage,
   couleur, icône, ordre par glisser), clé TMDB, thème, carte et itinéraire,
   exemples, mise à jour, à propos et attributions, zone dangereuse (double
   confirmation). */
import { icon } from '../components/icons.js';
import { subBubble } from '../components/reco-card.js';
import { openSheet, actionSheet, confirmSheet } from '../components/bottom-sheet.js';
import { toast } from '../components/toast.js';
import {
  getMeta, setMeta, getPref, setPref, subcats, subcat, addSubcat, updateSubcat, removeSubcat, reorderSubcats
} from '../store/settings.js';
import { allRecos, reassignSubcat } from '../store/recommendations.js';
import { getFilters, setFilters } from '../store/filters.js';
import { exportBackup, parseBackup, importMerge, importReplace, backupDue, wipeAll } from '../services/backup.js';
import { getKey, saveKey, testKey, keyStatus } from '../services/tmdb.js';
import { loadDemo, removeDemo, hasDemo } from '../services/demo.js';
import { APP_VERSION, CATEGORIES, CATEGORY_KEYS, TAB_OF, SUBCAT_COLORS, PICKER_ICONS, MAP_STYLES, NAV_APPS } from '../config.js';
import { esc, inkOn, relDate, longDate, clamp, haptic, isStandalone, IS_IOS } from '../utils.js';
import { back } from '../router.js';

export const settingsHooks = { setTheme: null, getTheme: () => 'auto', checkUpdate: null, openInstall: null };

let section, navbar, wrap;
let subCat = 'place';

function row({ act, ico, color = '#5B6B7C', title, sub = '', val = '', danger = false, chevron = false, tag = 'button', attrs = '' }) {
  return `<${tag} ${tag === 'button' ? 'type="button"' : ''} class="srow${danger ? ' danger' : ''}" ${act ? `data-act="${act}"` : ''} ${attrs}>
    <span class="bubble" style="--c:${color};--ci:${inkOn(color)}">${icon(ico, { size: 18 })}</span>
    <span class="grow">${esc(title)}${sub ? `<span class="sub">${sub}</span>` : ''}</span>
    ${val ? `<span class="val">${val}</span>` : ''}
    ${chevron ? `<span class="chev">${icon('chevron-right', { size: 18 })}</span>` : ''}
  </${tag}>`;
}

function subList() {
  return subcats(subCat).map((s) => `
    <div class="srow" data-key="${esc(s.key)}">
      ${subBubble(s, 34, 17)}
      <button type="button" class="grow" data-act="edit-sub" data-key="${esc(s.key)}" style="text-align:left;font-weight:600;min-height:40px">${esc(s.label)}</button>
      ${s.key !== 'other'
        ? `<span class="grip" aria-label="Réordonner ${esc(s.label)}" role="button">${icon('grip-vertical', { size: 20 })}</span>`
        : '<span class="val" style="font-size:13px">toujours en dernier</span>'}
    </div>`).join('');
}

function render() {
  const last = getMeta('lastBackupAt');
  const due = backupDue();
  const theme = settingsHooks.getTheme();
  const status = keyStatus();
  const demo = hasDemo();
  const total = allRecos().length;
  const mapStyle = getPref('mapStyle', 'liberty');
  const navApp = getPref('navApp', 'ask');
  const navChoices = [{ key: 'ask', short: 'Demander' }, ...NAV_APPS.map((a) => ({ key: a.key, short: a.key === 'google' ? 'Google' : a.label }))];

  wrap.innerHTML = `
    <h1 class="settings-title">Réglages</h1>

    ${due ? `<div class="backup-banner" role="status">
      <span class="bubble" style="--c:#E9A23B;--ci:#1E1A16;width:40px;height:40px">${icon('shield', { size: 20 })}</span>
      <span class="grow"><b>Pense à sauvegarder</b>${last ? `Dernière sauvegarde ${esc(relDate(last))}.` : 'Aucune sauvegarde pour l’instant.'} Des ajouts n’y sont pas.</span>
      <button type="button" class="btn btn-primary sm" data-act="export">Exporter</button>
    </div>` : ''}

    <section class="sgroup">
      <h2 class="sgroup-title">Sauvegarde</h2>
      <div class="scard">
        ${row({ act: 'export', ico: 'download', color: '#2E8B57', title: 'Exporter une sauvegarde', sub: last ? `Dernière : ${esc(longDate(last))}` : 'Jamais sauvegardé', chevron: true })}
        ${row({ act: 'import', ico: 'upload', color: '#3A7BD5', title: 'Importer une sauvegarde', sub: 'Fusionner ou tout remplacer', chevron: true })}
      </div>
      <p class="hint">Tes données restent sur cet appareil. ${IS_IOS ? 'Sur iPhone, choisis « Enregistrer dans Fichiers » ou iCloud Drive.' : ''} ${total} recommandation${total > 1 ? 's' : ''} au total.</p>
      <input type="file" accept="application/json,.json" data-r="file" hidden>
    </section>

    <section class="sgroup">
      <h2 class="sgroup-title">Sous-catégories</h2>
      <div class="seg" role="group" aria-label="Catégorie" style="--n:3;--i:${CATEGORY_KEYS.indexOf(subCat)}">
        <span class="seg-thumb" aria-hidden="true"></span>
        ${CATEGORY_KEYS.map((c) => `<button type="button" data-subcat="${c}" aria-pressed="${c === subCat}">${esc(CATEGORIES[c].label)}</button>`).join('')}
      </div>
      <div class="scard" data-r="sublist">${subList()}</div>
      <button type="button" class="btn btn-soft sm" data-act="add-sub" style="margin-top:10px">${icon('plus', { size: 17, stroke: 2.6 })}Ajouter une sous-catégorie</button>
    </section>

    <section class="sgroup">
      <h2 class="sgroup-title">Films & séries — TMDB</h2>
      <div class="scard" style="padding:16px">
        <label class="field" style="margin-bottom:12px">
          <span class="field-label"><span>Clé API TMDB</span>${status === 'ok' ? '<span class="opt ok-text">valide</span>' : status === 'invalid' ? '<span class="opt error-text">refusée</span>' : ''}</span>
          <span class="input-wrap">
            <input class="input" type="password" data-r="tmdb" value="${esc(getKey())}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Clé v3 ou jeton de lecture v4">
            <button type="button" class="rbtn" data-act="toggle-key" aria-label="Afficher la clé">${icon('eye', { size: 18 })}</button>
          </span>
        </label>
        <button type="button" class="btn btn-soft sm" data-act="test-key">${icon('key-round', { size: 17 })}Tester la clé</button>
        <p class="hint" data-r="tmdb-status" role="status">${status === 'invalid' ? '<span class="error-text">TMDB refuse cette clé : la recherche de films est désactivée.</span>' : ''}</p>
        <p class="hint">Gratuite pour un usage personnel : crée un compte sur <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">themoviedb.org › Paramètres › API</a>, puis colle la clé ici. Elle reste sur cet appareil et n’est jamais exportée. Sans clé, l’ajout de films reste possible en saisie libre.</p>
      </div>
    </section>

    <section class="sgroup">
      <h2 class="sgroup-title">Apparence</h2>
      <div class="seg" role="group" aria-label="Thème" style="--n:3;--i:${['auto', 'light', 'dark'].indexOf(theme)}">
        <span class="seg-thumb" aria-hidden="true"></span>
        <button type="button" data-theme-set="auto" aria-pressed="${theme === 'auto'}">${icon('sun-moon', { size: 16 })}Auto</button>
        <button type="button" data-theme-set="light" aria-pressed="${theme === 'light'}">${icon('sun', { size: 16 })}Clair</button>
        <button type="button" data-theme-set="dark" aria-pressed="${theme === 'dark'}">${icon('moon', { size: 16 })}Sombre</button>
      </div>
    </section>

    <section class="sgroup">
      <h2 class="sgroup-title">Carte et itinéraire</h2>
      <p class="hint" style="margin:0 8px 8px">Style de la carte (elle passe en sombre avec le thème sombre)</p>
      <div class="seg" role="group" aria-label="Style de la carte" style="--n:2;--i:${mapStyle === 'positron' ? 1 : 0}">
        <span class="seg-thumb" aria-hidden="true"></span>
        <button type="button" data-mapstyle="liberty" aria-pressed="${mapStyle !== 'positron'}">${icon('palette', { size: 16 })}${esc(MAP_STYLES.liberty.label)}</button>
        <button type="button" data-mapstyle="positron" aria-pressed="${mapStyle === 'positron'}">${icon('map', { size: 16 })}${esc(MAP_STYLES.positron.label)}</button>
      </div>
      <p class="hint" style="margin:4px 8px 8px">Itinéraire avec</p>
      <div class="seg" role="group" aria-label="Application d’itinéraire" style="--n:4;--i:${Math.max(0, navChoices.findIndex((c) => c.key === navApp))}">
        <span class="seg-thumb" aria-hidden="true"></span>
        ${navChoices.map((c) => `<button type="button" data-navapp="${c.key}" aria-pressed="${c.key === navApp}">${esc(c.short)}</button>`).join('')}
      </div>
      <p class="hint">${navApp === 'ask' ? 'Le bouton Itinéraire te demandera Plans, Google Maps ou Waze.' : `Le bouton Itinéraire ouvre directement ${esc(NAV_APPS.find((a) => a.key === navApp).label)}.`}</p>
    </section>

    <section class="sgroup">
      <h2 class="sgroup-title">Exemples</h2>
      <div class="scard">
        ${demo
          ? row({ act: 'demo-off', ico: 'trash-2', color: '#8A8F98', title: 'Retirer les exemples', sub: 'Tes propres recommandations ne sont pas touchées' })
          : row({ act: 'demo-on', ico: 'sparkles', color: '#9B5DE5', title: 'Charger des exemples', sub: '4 personnes et 15 recommandations, retirables en un geste' })}
      </div>
    </section>

    <section class="sgroup">
      <h2 class="sgroup-title">Application</h2>
      <div class="scard">
        ${!isStandalone() ? row({ act: 'install', ico: 'square-plus', color: '#5B6B7C', title: 'Installer sur l’écran d’accueil', chevron: true }) : ''}
        ${row({ act: 'update', ico: 'refresh-cw', color: '#2F8FD8', title: 'Rechercher une mise à jour', val: `v${APP_VERSION}` })}
      </div>
    </section>

    <section class="sgroup">
      <h2 class="sgroup-title">À propos</h2>
      <div class="scard about">
        <p><b style="color:var(--ink)">À tester</b> · version ${APP_VERSION}. Tes recommandations, avec la personne qui te les a faites. 100 % local : pas de compte, pas de serveur.</p>
        <p>Sur iPhone, iOS peut dans certains cas effacer les données d’un site web ou d’une app web peu utilisée. <b>L’export JSON est ta vraie sauvegarde</b> : pense à en faire un de temps en temps.</p>
        <p>Carte : données <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>, fonds de carte <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> (<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a>), affichée avec Leaflet et MapLibre. Recherche de lieux : Photon (komoot), données OpenStreetMap.</p>
        <p>Films et séries : <a href="https://www.themoviedb.org" target="_blank" rel="noopener">TMDB</a>. Ce produit utilise l’API TMDB mais n’est ni approuvé ni certifié par TMDB. Plateformes de streaming : JustWatch.</p>
        <p>Podcasts : API iTunes Search d’Apple. Icônes : Lucide (ISC). Base locale : Dexie.</p>
      </div>
    </section>

    <section class="sgroup">
      <h2 class="sgroup-title">Zone dangereuse</h2>
      <div class="scard">
        ${row({ act: 'wipe', ico: 'triangle-alert', color: '#D64532', title: 'Tout effacer', sub: 'Recommandations et personnes de cet appareil', danger: true })}
      </div>
    </section>`;
  bindReorder(wrap.querySelector('[data-r="sublist"]'));
}

/* ——— Sous-catégories ——— */

function openSubEditor(cat, key) {
  const base = key ? subcat(cat, key) : { key: null, label: '', icon: PICKER_ICONS[0], color: SUBCAT_COLORS[0] };
  const st = { ...base };
  const count = key ? allRecos().filter((r) => r.category === cat && r.subcategory === key).length : 0;
  const s = openSheet({
    title: key ? 'Modifier la sous-catégorie' : 'Nouvelle sous-catégorie',
    sub: CATEGORIES[cat].label,
    tall: true,
    body: `
      <div class="preview-sub" data-r="prev"></div>
      <label class="field"><span class="field-label">Nom</span>
        <input class="input" data-r="label" type="text" maxlength="30" autocomplete="off" autocapitalize="sentences" placeholder="Ex. Glacier, Brocante…" value="${esc(st.label)}">
        <p class="need-msg" hidden>Donne-lui un nom.</p></label>
      <div class="field"><span class="field-label">Couleur</span>
        <div class="swatches">${SUBCAT_COLORS.map((c) => `<button type="button" class="swatch" data-color="${c}" style="--c:${c};--ci:${inkOn(c)}" aria-label="Couleur ${c}" aria-pressed="false"></button>`).join('')}</div></div>
      <div class="field"><span class="field-label">Icône</span>
        <div class="icon-grid">${PICKER_ICONS.map((i) => `<button type="button" class="icon-opt" data-icon="${i}" aria-label="Icône ${i}" aria-pressed="false">${icon(i, { size: 20 })}</button>`).join('')}</div></div>
      ${key && key !== 'other' ? `<button type="button" class="btn btn-danger block" data-act="del">${icon('trash-2', { size: 18 })}Supprimer${count ? ` (${count} élément${count > 1 ? 's' : ''} passeront dans « Autre »)` : ''}</button>` : ''}`,
    foot: `<button type="button" class="btn btn-primary block" data-save>${icon('check', { size: 20, stroke: 2.6 })}Enregistrer</button>`
  });
  const paint = () => {
    s.body.querySelector('[data-r="prev"]').innerHTML = `<span class="chip on" style="--chip-c:${st.color};--chip-ink:${inkOn(st.color, { text: true })};animation:none">${subBubble(st, 28, 15)}<span>${esc(st.label || 'Aperçu')}</span></span>`;
    s.body.querySelectorAll('[data-color]').forEach((b) => {
      const on = b.dataset.color === st.color;
      b.setAttribute('aria-pressed', String(on));
      b.innerHTML = on ? icon('check', { size: 18, stroke: 3 }) : '';
    });
    s.body.querySelectorAll('[data-icon]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.icon === st.icon));
      b.style.setProperty('--c', st.color);
      b.style.setProperty('--ci', inkOn(st.color));
    });
  };
  paint();
  const input = s.body.querySelector('[data-r="label"]');
  input.addEventListener('input', () => { st.label = input.value; paint(); });
  s.body.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-color]');
    const i = e.target.closest('[data-icon]');
    if (c) { st.color = c.dataset.color; paint(); haptic(); return; }
    if (i) { st.icon = i.dataset.icon; paint(); haptic(); return; }
    if (e.target.closest('[data-act="del"]')) {
      const ok = await confirmSheet({
        title: `Supprimer « ${base.label} » ?`,
        message: count ? `${count} élément${count > 1 ? 's' : ''} passeront dans « Autre ».` : 'Aucun élément ne l’utilise.',
        confirm: 'Supprimer', danger: true, icon: 'trash-2'
      });
      if (!ok) return;
      await reassignSubcat(cat, key, 'other');
      await removeSubcat(cat, key);
      const tab = TAB_OF[cat];
      const fst = getFilters(tab);
      if (fst.subcats.includes(key)) setFilters(tab, { subcats: fst.subcats.filter((x) => x !== key) });
      s.close('ok');
      toast('Sous-catégorie supprimée', { icon: 'trash-2' });
    }
  });
  s.foot.querySelector('[data-save]').addEventListener('click', async () => {
    const label = input.value.trim();
    if (!label) {
      s.body.querySelector('.need-msg').hidden = false;
      input.focus();
      return;
    }
    if (key) await updateSubcat(cat, key, { label, icon: st.icon, color: st.color });
    else await addSubcat(cat, { label, icon: st.icon, color: st.color });
    s.close('ok');
    toast(key ? 'Sous-catégorie modifiée' : 'Sous-catégorie ajoutée', { icon: 'check', tone: 'ok' });
  });
}

/* Glisser la poignée pour réordonner (« Autre » reste en dernier). */
function bindReorder(list) {
  let d = null;
  list.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.grip');
    if (!grip) return;
    e.preventDefault();
    const rowEl = grip.closest('.srow');
    const rows = [...list.querySelectorAll('.srow[data-key]')].filter((r) => r.dataset.key !== 'other');
    const idx = rows.indexOf(rowEl);
    if (idx < 0) return;
    d = { rowEl, rows, idx, target: idx, y0: e.clientY, h: rowEl.offsetHeight, id: e.pointerId };
    rowEl.classList.add('drag-ghost');
    rows.forEach((r) => { if (r !== rowEl) r.classList.add('shift'); });
    try { grip.setPointerCapture(e.pointerId); } catch { /* rien */ }
    haptic();
  });
  list.addEventListener('pointermove', (e) => {
    if (!d || e.pointerId !== d.id) return;
    const dy = e.clientY - d.y0;
    const minDy = -d.idx * d.h;
    const maxDy = (d.rows.length - 1 - d.idx) * d.h;
    d.rowEl.style.transform = `translateY(${clamp(dy, minDy - 10, maxDy + 10)}px)`;
    const target = clamp(d.idx + Math.round(dy / d.h), 0, d.rows.length - 1);
    if (target === d.target) return;
    d.target = target;
    d.rows.forEach((r, i) => {
      if (r === d.rowEl) return;
      let shift = 0;
      if (d.idx < target && i > d.idx && i <= target) shift = -d.h;
      if (d.idx > target && i < d.idx && i >= target) shift = d.h;
      r.style.transform = shift ? `translateY(${shift}px)` : '';
    });
    haptic();
  });
  const end = async (e) => {
    if (!d || e.pointerId !== d.id) return;
    const { rows, idx, target } = d;
    d = null;
    rows.forEach((r) => { r.style.transform = ''; r.classList.remove('shift', 'drag-ghost'); });
    if (target === idx) return;
    const keys = rows.map((r) => r.dataset.key);
    const [k] = keys.splice(idx, 1);
    keys.splice(target, 0, k);
    await reorderSubcats(subCat, keys);
  };
  list.addEventListener('pointerup', end);
  list.addEventListener('pointercancel', end);
}

/* ——— Sauvegarde ——— */

async function doExport() {
  try {
    const res = await exportBackup();
    if (res.cancelled) return;
    toast(`Sauvegarde exportée (${res.recos} recommandation${res.recos > 1 ? 's' : ''})`, { icon: 'download', tone: 'ok' });
    render();
  } catch (err) {
    toast('Export impossible : ' + err.message, { icon: 'triangle-alert' });
  }
}

async function doImport(file) {
  const text = await file.text();
  const parsed = parseBackup(text);
  if (parsed.error) {
    await actionSheet({ title: 'Import impossible', message: parsed.error + ' Aucune donnée n’a été modifiée.', actions: [], cancel: 'OK' });
    return;
  }
  const { data } = parsed;
  const n = data.recommendations.length;
  const p = data.persons.filter((x) => !x.isMe).length;
  const mode = await actionSheet({
    title: `Importer ${n} recommandation${n > 1 ? 's' : ''} et ${p} personne${p > 1 ? 's' : ''} ?`,
    message: `Sauvegarde du ${longDate(data.exportedAt)}.`,
    actions: [
      { label: 'Fusionner avec mes données', value: 'merge', primary: true, icon: 'git-merge' },
      { label: 'Remplacer tout', value: 'replace', danger: true, icon: 'triangle-alert' }
    ]
  });
  if (!mode) return;
  if (mode === 'replace') {
    const ok = await confirmSheet({
      title: 'Remplacer toutes tes données ?',
      message: `Les ${allRecos().length} recommandations actuelles seront remplacées par celles du fichier. Cette action est définitive.`,
      confirm: 'Remplacer tout', danger: true
    });
    if (!ok) return;
  }
  try {
    const res = mode === 'merge' ? await importMerge(data) : await importReplace(data);
    const parts = [`${res.added} recommandation${res.added > 1 ? 's' : ''} importée${res.added > 1 ? 's' : ''}`];
    if (res.updated) parts.push(`${res.updated} mise${res.updated > 1 ? 's' : ''} à jour`);
    parts.push(`${res.persons} personne${res.persons > 1 ? 's' : ''} ajoutée${res.persons > 1 ? 's' : ''}`);
    await actionSheet({ title: 'Import terminé', message: parts.join(', ') + '.', actions: [], cancel: 'Parfait' });
    render();
  } catch (err) {
    toast('Import interrompu : ' + err.message, { icon: 'triangle-alert' });
  }
}

async function wipe() {
  const first = await confirmSheet({
    title: 'Tout effacer ?',
    message: `${allRecos().length} recommandations et toutes les personnes seront supprimées de cet appareil. Exporte une sauvegarde avant si besoin.`,
    confirm: 'Continuer', danger: true, icon: 'triangle-alert'
  });
  if (!first) return;
  const second = await confirmSheet({
    title: 'Vraiment tout effacer ?',
    message: 'Dernière confirmation : cette action ne peut pas être annulée. Tes réglages (thème, clé TMDB) sont conservés.',
    confirm: 'Oui, tout effacer', danger: true, icon: 'trash-2'
  });
  if (!second) return;
  await wipeAll();
  toast('Toutes les données ont été effacées', { icon: 'trash-2' });
  render();
}

function onScroll() {
  if (section.hidden) return;
  navbar.classList.toggle('solid', window.scrollY > 40);
}

export default {
  name: 'reglages',
  mount(el) {
    section = el;
    section.innerHTML = `
      <nav class="navbar" aria-label="Navigation">
        <button type="button" class="rbtn glass" data-act="back" aria-label="Retour">${icon('chevron-left', { size: 22, stroke: 2.4 })}</button>
        <span class="navbar-title">Réglages</span>
        <span style="width:42px"></span>
      </nav>
      <div class="vwrap"></div>`;
    navbar = section.querySelector('.navbar');
    wrap = section.querySelector('.vwrap');

    section.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-act], [data-subcat], [data-theme-set], [data-mapstyle], [data-navapp]');
      if (!t) return;
      if (t.dataset.subcat) { subCat = t.dataset.subcat; render(); return; }
      if (t.dataset.mapstyle) { await setPref('mapStyle', t.dataset.mapstyle); return; }
      if (t.dataset.navapp) { await setPref('navApp', t.dataset.navapp); return; }
      if (t.dataset.themeSet) { settingsHooks.setTheme?.(t.dataset.themeSet); render(); return; }
      switch (t.dataset.act) {
        case 'back': back('#/lieux'); break;
        case 'export': doExport(); break;
        case 'import': wrap.querySelector('[data-r="file"]').click(); break;
        case 'edit-sub': openSubEditor(subCat, t.dataset.key); break;
        case 'add-sub': openSubEditor(subCat, null); break;
        case 'toggle-key': {
          const input = wrap.querySelector('[data-r="tmdb"]');
          input.type = input.type === 'password' ? 'text' : 'password';
          t.innerHTML = icon(input.type === 'password' ? 'eye' : 'eye-off', { size: 18 });
          break;
        }
        case 'test-key': {
          const input = wrap.querySelector('[data-r="tmdb"]');
          const out = wrap.querySelector('[data-r="tmdb-status"]');
          const key = input.value.trim();
          if (!key) { out.innerHTML = '<span class="error-text">Colle d’abord ta clé.</span>'; return; }
          await saveKey(key);
          out.innerHTML = '<span class="spin" style="display:inline-block;vertical-align:-3px"></span> Test en cours…';
          const res = await testKey(key);
          if (res.ok) {
            await setMeta('tmdbKeyStatus', 'ok');
            toast('Clé TMDB valide', { icon: 'check', tone: 'ok' });
          } else if (res.reason === 'invalid') {
            await setMeta('tmdbKeyStatus', 'invalid');
          }
          render();
          const msg = wrap.querySelector('[data-r="tmdb-status"]');
          msg.innerHTML = res.ok
            ? '<span class="ok-text">Clé valide : les affiches et plateformes sont activées.</span>'
            : res.reason === 'invalid'
              ? '<span class="error-text">TMDB refuse cette clé. Vérifie-la (clé d’API v3 ou jeton de lecture v4).</span>'
              : '<span class="error-text">Impossible de joindre TMDB pour l’instant (hors ligne ?). La clé est enregistrée.</span>';
          break;
        }
        case 'demo-on': {
          const n = await loadDemo();
          toast(`${n} exemples chargés`, { icon: 'sparkles' });
          render();
          break;
        }
        case 'demo-off': {
          const n = await removeDemo();
          toast(`${n} exemples retirés`, { icon: 'trash-2' });
          render();
          break;
        }
        case 'install': settingsHooks.openInstall?.(); break;
        case 'update': settingsHooks.checkUpdate?.(); break;
        case 'wipe': wipe(); break;
        default: break;
      }
    });
    section.addEventListener('change', async (e) => {
      if (e.target.matches('[data-r="file"]')) {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (file) doImport(file);
      }
      if (e.target.matches('[data-r="tmdb"]')) {
        await saveKey(e.target.value);
        const out = wrap.querySelector('[data-r="tmdb-status"]');
        if (out) out.textContent = e.target.value.trim() ? 'Clé enregistrée sur cet appareil. Touche « Tester la clé » pour vérifier.' : 'Clé supprimée.';
      }
    });
    window.addEventListener('scroll', onScroll, { passive: true });
  },
  show() { render(); onScroll(); },
  refresh() {
    // Ne pas reconstruire pendant une saisie (clé TMDB).
    if (section.contains(document.activeElement) && document.activeElement.matches('input')) return;
    render();
  }
};
