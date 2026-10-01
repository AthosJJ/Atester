/* Fiche d'une personne : statistiques, boutons ronds (ses lieux sur la carte,
   ajouter une recommandation de…, photo et couleur, plus), filtre de statut
   commun et trois sections repliables. Menu : renommer, fusionner, supprimer. */
import { icon } from '../components/icons.js';
import { avatar, personChip } from '../components/person-avatar.js';
import { recoRow } from '../components/reco-card.js';
import { bindSwipe, bindLongPress } from '../components/swipe.js';
import { swipeStatus, toggleFav, contextMenu } from '../components/reco-actions.js';
import { openSheet, actionSheet, confirmSheet, promptSheet } from '../components/bottom-sheet.js';
import { cropPhoto } from '../components/photo-crop.js';
import { toast } from '../components/toast.js';
import {
  getPerson, allPersons, personStats, renamePerson, setPersonColor, setPersonPhoto, mergePersons,
  soleRecos, deletePerson, restorePerson, searchPersons
} from '../store/persons.js';
import { on } from '../store/events.js';
import { recosByPerson } from '../store/recommendations.js';
import { sortRecos } from '../store/filters.js';
import { CATEGORIES, CATEGORY_KEYS, AVATAR_COLORS, SUBCAT_COLORS } from '../config.js';
import { esc, inkOn, relDate, fmtNumber, lsGet, lsSet, plural, haptic } from '../utils.js';
import { back, replaceRoute } from '../router.js';
import { lastPosition } from '../services/geo.js';

let section, navbar, wrap;
let personId = null;
let statusFilter = 'all';
const hooks = { add: null };
export const personHooks = hooks;

function folded(cat) { return Boolean(lsGet('fold:' + cat)); }

function render() {
  const p = getPerson(personId);
  if (!p) {
    wrap.innerHTML = `<div class="empty" style="padding-top:calc(var(--sat) + 90px)"><h3>Personne introuvable</h3><p>Elle a peut-être été fusionnée ou supprimée.</p></div>`;
    navbar.querySelector('.navbar-title').textContent = '';
    return;
  }
  const s = personStats(p.id);
  const all = recosByPerson(p.id);
  const shown = sortRecos(all.filter((r) => statusFilter === 'all' || r.status === statusFilter), 'recent');
  navbar.querySelector('.navbar-title').textContent = p.name;
  const segIdx = { all: 0, todo: 1, done: 2 }[statusFilter];
  const pos = lastPosition();

  const sections = CATEGORY_KEYS.map((cat) => {
    const items = shown.filter((r) => r.category === cat);
    const total = all.filter((r) => r.category === cat).length;
    if (!total) return '';
    const closed = folded(cat);
    return `
      <section class="fold${closed ? ' closed' : ''}" data-fold="${cat}">
        <button type="button" class="fold-head" data-act="fold" data-cat="${cat}" aria-expanded="${!closed}">
          <span class="bubble soft" style="--c:var(--accent)">${icon(CATEGORIES[cat].icon, { size: 18 })}</span>
          <h3>${esc(CATEGORIES[cat].label)}</h3>
          <span class="n">${items.length}${items.length !== total ? ` / ${total}` : ''}</span>
          <span class="chev-i">${icon('chevron-down', { size: 18 })}</span>
        </button>
        <div class="fold-body">
          ${items.length
            ? `<div class="list">${items.map((r, i) => recoRow(r, { i, position: pos })).join('')}</div>`
            : '<p class="hint" style="margin:0 8px 8px">Rien avec ce filtre.</p>'}
        </div>
      </section>`;
  }).join('');

  wrap.innerHTML = `
    <header class="phero">
      <button type="button" class="phero-pic" data-act="avatar" aria-label="${p.photo ? 'Changer la photo' : 'Ajouter une photo'} de ${esc(p.name)}">
        ${avatar(p, 104)}<span class="phero-cam" aria-hidden="true">${icon('camera', { size: 16, stroke: 2.4 })}</span>
      </button>
      <h1>${esc(p.name)}</h1>
      <p class="since">${s.last ? `Dernière recommandation ${esc(relDate(s.last))}` : 'Aucune recommandation pour l’instant'}</p>
    </header>
    <div class="stats">
      <div class="stat"><b>${s.total}</b><span>recommandation${s.total > 1 ? 's' : ''}</span></div>
      <div class="stat"><b>${s.done}</b><span>testée${s.done > 1 ? 's' : ''}</span></div>
      <div class="stat"><b>${s.avg != null ? fmtNumber(s.avg) : '–'}</b><span>note moyenne</span></div>
    </div>
    <div class="round-actions">
      <a class="ract" href="#/lieux?vue=carte&p=${encodeURIComponent(p.id)}" ${s.byCat.place ? '' : 'aria-disabled="true" style="opacity:.45;pointer-events:none"'}>
        <span class="rbtn">${icon('map-pin', { size: 22 })}</span>Ses lieux</a>
      <button type="button" class="ract primary" data-act="add" aria-label="Ajouter une recommandation de ${esc(p.name)}"><span class="rbtn">${icon('plus', { size: 24, stroke: 2.6 })}</span>Ajouter</button>
      <button type="button" class="ract" data-act="avatar"><span class="rbtn">${icon('camera', { size: 22 })}</span>Photo</button>
      <button type="button" class="ract" data-act="more"><span class="rbtn">${icon('ellipsis', { size: 22 })}</span>Plus</button>
    </div>
    ${all.length ? `
    <div class="seg" role="group" aria-label="Statut" style="--n:3;--i:${segIdx};margin-top:14px">
      <span class="seg-thumb" aria-hidden="true"></span>
      <button type="button" data-status="all" aria-pressed="${statusFilter === 'all'}">Tout</button>
      <button type="button" data-status="todo" aria-pressed="${statusFilter === 'todo'}">À tester</button>
      <button type="button" data-status="done" aria-pressed="${statusFilter === 'done'}">Testé</button>
    </div>` : ''}
    ${sections || `<div class="empty"><p>Ajoute une recommandation de ${esc(p.name)} avec le bouton +.</p></div>`}`;
}

/* Photo et couleur : choisir (photothèque ou appareil photo), recadrer,
   retirer ; la couleur reste utilisée pour ses étiquettes. */
function openAvatar(p) {
  const colors = [...new Set([...AVATAR_COLORS, ...SUBCAT_COLORS])];
  const s = openSheet({
    title: 'Photo et couleur',
    sub: p.name,
    body: `
      <div class="avatar-edit" data-r="prev"></div>
      <div class="photo-btns" data-r="btns"></div>
      <div class="field"><span class="field-label">Couleur</span>
        <div class="swatches even" data-r="swatches"></div></div>`,
    onClose: () => off()
  });
  const prev = s.body.querySelector('[data-r="prev"]');
  const btns = s.body.querySelector('[data-r="btns"]');
  const swatches = s.body.querySelector('[data-r="swatches"]');
  let shown;
  const paint = () => {
    const cur = getPerson(p.id);
    if (!cur) { s.close('code'); return; }
    prev.innerHTML = avatar(cur, 96);
    if (shown !== undefined && shown !== cur.photo) prev.firstElementChild.classList.add('pop');
    shown = cur.photo;
    btns.innerHTML = `
      <label class="btn btn-soft sm file-btn">${icon('camera', { size: 18 })}${cur.photo ? 'Changer la photo' : 'Choisir une photo'}
        <input type="file" accept="image/*" class="file-input" data-r="file"></label>
      ${cur.photo ? `<button type="button" class="btn btn-ghost sm" data-act="unphoto">${icon('trash-2', { size: 17 })}Retirer</button>` : ''}`;
    swatches.innerHTML = colors.map((c) => `
      <button type="button" class="swatch" data-color="${c}" style="--c:${c};--ci:${inkOn(c)}" aria-pressed="${c === cur.color}" aria-label="Couleur ${c}">
        ${c === cur.color ? icon('check', { size: 18, stroke: 3 }) : ''}</button>`).join('');
  };
  const off = on('change', paint);
  paint();
  s.body.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-r="file"]')) return;
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const photo = await cropPhoto(file);
    if (!photo) return;
    await setPersonPhoto(p.id, photo);
    haptic();
  });
  s.body.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-color]');
    if (c) { await setPersonColor(p.id, c.dataset.color); haptic(); return; }
    if (e.target.closest('[data-act="unphoto"]')) {
      const old = getPerson(p.id)?.photo;
      await setPersonPhoto(p.id, null);
      toast('Photo retirée', { icon: 'trash-2', action: { label: 'Annuler', run: () => setPersonPhoto(p.id, old) } });
    }
  });
}

async function rename(p) {
  const name = await promptSheet({
    title: 'Renommer', label: 'Prénom ou surnom', value: p.name, confirm: 'Renommer',
    validate: (v) => {
      if (!v) return 'Le prénom est vide.';
      const same = allPersons().find((x) => x.id !== p.id && x.name.toLowerCase() === v.toLowerCase());
      return same ? `« ${same.name} » existe déjà : utilise plutôt « Fusionner ».` : null;
    }
  });
  if (!name || name === p.name) return;
  try {
    await renamePerson(p.id, name);
    toast('Renommé', { icon: 'pencil' });
  } catch (err) {
    toast(err.message, { icon: 'triangle-alert' });
  }
}

/* Fusion : on choisit la personne qui reste (cas « Paul » et « Paulo »). */
function merge(p) {
  const others = allPersons().filter((x) => x.id !== p.id).sort((a, b) => personStats(b.id).total - personStats(a.id).total);
  if (!others.length) { toast('Aucune autre personne avec qui fusionner.'); return; }
  const close = searchPersons(p.name, { exclude: [p.id] }).slice(0, 3).map((x) => x.id);
  const ordered = [...others.filter((x) => close.includes(x.id)), ...others.filter((x) => !close.includes(x.id))];
  const s = openSheet({
    title: `Fusionner ${p.name} avec…`,
    sub: `Ses recommandations iront à la personne choisie, puis ${p.name} disparaîtra.`,
    body: `<div class="who-chips">${ordered.map((x) => personChip(x, { attrs: `data-target="${x.id}"` })).join('')}</div>`
  });
  s.body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-target]');
    if (!b) return;
    const target = getPerson(b.dataset.target);
    const n = personStats(p.id).total;
    const ok = await confirmSheet({
      title: `Fusionner « ${p.name} » dans « ${target.name} » ?`,
      message: `${plural(n, ['recommandation sera attribuée', 'recommandations seront attribuées'])} à ${target.name}.`,
      confirm: 'Fusionner', icon: 'git-merge'
    });
    if (!ok) return;
    await mergePersons(p.id, target.id);
    s.close('ok');
    replaceRoute(`#/personne/${encodeURIComponent(target.id)}`);
    toast(`Fusionné avec ${target.name}`, { icon: 'git-merge' });
  });
}

async function remove(p) {
  const sole = soleRecos(p.id);
  if (sole.length) {
    const v = await actionSheet({
      title: `Impossible de supprimer ${p.name}`,
      message: `${plural(sole.length, ['recommandation ne vient', 'recommandations ne viennent'])} que de cette personne. Fusionne-la plutôt avec quelqu’un d’autre.`,
      actions: [{ label: 'Fusionner avec…', value: 'merge', icon: 'git-merge', primary: true }]
    });
    if (v === 'merge') merge(p);
    return;
  }
  const ok = await confirmSheet({ title: `Supprimer ${p.name} ?`, message: 'Ses recommandations partagées avec d’autres personnes sont conservées.', confirm: 'Supprimer', danger: true, icon: 'trash-2' });
  if (!ok) return;
  const snap = await deletePerson(p.id);
  if (!snap) return;
  back('#/personnes');
  toast(`Personne supprimée : ${p.name}`, { icon: 'trash-2', action: { label: 'Annuler', run: () => restorePerson(snap) } });
}

async function more(p) {
  const actions = [{ label: 'Renommer', value: 'rename', icon: 'pencil' }];
  if (!p.isMe) {
    actions.push({ label: 'Fusionner avec une autre personne', value: 'merge', icon: 'git-merge' });
    actions.push({ label: 'Supprimer', value: 'delete', icon: 'trash-2', danger: true });
  }
  const v = await actionSheet({ title: p.name, actions });
  if (v === 'rename') rename(p);
  if (v === 'merge') merge(p);
  if (v === 'delete') remove(p);
}

function onScroll() {
  if (section.hidden) return;
  navbar.classList.toggle('solid', window.scrollY > 150);
}

export default {
  name: 'personne',
  mount(el) {
    section = el;
    section.innerHTML = `
      <nav class="navbar" aria-label="Navigation">
        <button type="button" class="rbtn glass" data-act="back" aria-label="Retour">${icon('chevron-left', { size: 22, stroke: 2.4 })}</button>
        <span class="navbar-title"></span>
        <button type="button" class="rbtn glass" data-act="more" aria-label="Plus d’actions">${icon('ellipsis', { size: 22 })}</button>
      </nav>
      <div class="vwrap"></div>`;
    navbar = section.querySelector('.navbar');
    wrap = section.querySelector('.vwrap');
    section.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act], [data-status]');
      if (!b) return;
      const p = getPerson(personId);
      if (b.dataset.status) { statusFilter = b.dataset.status; render(); return; }
      switch (b.dataset.act) {
        case 'back': back('#/personnes'); break;
        case 'more': if (p) more(p); break;
        case 'avatar': if (p) openAvatar(p); break;
        case 'add': if (p) hooks.add?.({ personId: p.id }); break;
        case 'fold': {
          const cat = b.dataset.cat;
          lsSet('fold:' + cat, !folded(cat) || null);
          const sec = b.closest('.fold');
          sec.classList.toggle('closed', folded(cat));
          b.setAttribute('aria-expanded', String(!folded(cat)));
          break;
        }
        default: break;
      }
    });
    bindSwipe(wrap, { onLeft: swipeStatus, onRight: toggleFav });
    bindLongPress(wrap, '.swipe', (x) => contextMenu(x.dataset.id));
    window.addEventListener('scroll', onScroll, { passive: true });
  },
  show(route) {
    if (route.id !== personId) statusFilter = 'all';
    personId = route.id;
    render();
    onScroll();
  },
  refresh() { render(); }
};
