/* Fiche détail : visuel (affiche, pochette ou mini-carte), qui l'a recommandé,
   ce qu'on m'en a dit, infos propres à la catégorie, mon avis, et l'action
   principale « Marquer comme testé » dans la zone du pouce. */
import { icon } from '../components/icons.js';
import { avatar } from '../components/person-avatar.js';
import { subBubble, statusBadge, imageOf, img, placeholder } from '../components/reco-card.js';
import { starInput, bindStarInput } from '../components/rating.js';
import { actionSheet } from '../components/bottom-sheet.js';
import { toast } from '../components/toast.js';
import { openDoneSheet, markTodo, markDropped, toggleFav, deleteWithUndo } from '../components/reco-actions.js';
import { getReco, updateReco } from '../store/recommendations.js';
import { personsOf } from '../store/persons.js';
import { subcat } from '../store/settings.js';
import { loadLeaflet, attachBaseLayer, pinIcon, directionsUrl } from '../services/map.js';
import { directionsButton } from '../components/directions.js';
import { fetchDetails, hasUsableKey } from '../services/tmdb.js';
import { errorMessage } from '../services/http.js';
import { openEdit } from './add.js';
import { STATUS, CATEGORIES } from '../config.js';
import { esc, relDate, shortDate, daysAgo, safeUrl, hostOf, copyText, IS_IOS } from '../utils.js';
import { back } from '../router.js';

let section, navbar, heroEl, bodyEl, bar;
let recoId = null;
let heroSig = '';
let miniMap = null;
let synopsisOpen = false;

const hasExternal = (r) => Boolean(
  (r.category === 'place' && r.details.osmId) || (r.category === 'screen' && r.details.tmdbId) || (r.category === 'podcast' && r.details.itunesId)
);

function destroyMiniMap() {
  if (miniMap) { miniMap.remove(); miniMap = null; }
}

function heroHtml(r, sub) {
  const d = r.details;
  if (r.category === 'place') {
    if (d.lat != null) return '<div class="hero-map"><div class="map" aria-label="Mini-carte"></div></div>';
    return `<div class="hero hero-tint">
      <div class="hero-bg tint" style="background:linear-gradient(160deg, color-mix(in srgb, ${sub.color} 30%, var(--bg)), var(--bg))"></div>
      <div class="hero-visual">${subBubble(sub, 104, 46).replace('class="bubble"', 'class="bubble hero-bubble"')}</div>
    </div>`;
  }
  const src = imageOf(r, 'w500');
  const bg = src
    ? `<div class="hero-bg" style="background-image:url('${esc(src)}')"></div>`
    : `<div class="hero-bg tint" style="background:linear-gradient(160deg, color-mix(in srgb, ${sub.color} 34%, var(--bg)), var(--bg))"></div>`;
  const visual = r.category === 'screen'
    ? `<div class="hero-poster">${src ? img(src, r) : placeholder(r, { withIcon: true, iconSize: 30 })}</div>`
    : `<div class="hero-poster hero-art">${src ? img(src, r) : placeholder(r, { withIcon: true, iconSize: 34 })}</div>`;
  return `<div class="hero">${bg}<div class="hero-visual">${visual}</div></div>`;
}

async function initMiniMap(r) {
  const el = heroEl.querySelector('.hero-map .map');
  if (!el) return;
  try {
    const L = await loadLeaflet();
    if (!el.isConnected || recoId !== r.id) return;
    destroyMiniMap();
    miniMap = L.map(el, {
      zoomControl: false, dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false,
      boxZoom: false, keyboard: false, tap: false, fadeAnimation: false
    });
    miniMap.attributionControl.setPrefix(false);
    attachBaseLayer(L, miniMap);
    miniMap.setView([r.details.lat, r.details.lng], 15, { animate: false });
    L.marker([r.details.lat, r.details.lng], {
      icon: pinIcon(L, subcat('place', r.subcategory), { status: 'todo', favorite: r.favorite }), interactive: false, keyboard: false
    }).addTo(miniMap);
  } catch {
    el.innerHTML = '<p class="hint" style="padding:calc(var(--sat) + 80px) 20px 0;text-align:center">Carte indisponible hors ligne.</p>';
  }
}

function whenText(iso) {
  const rel = relDate(iso);
  const n = daysAgo(iso);
  return n != null && n >= 0 && n <= 30 ? `${rel} · ${shortDate(iso)}` : rel;
}

function infoBlock(r) {
  const d = r.details;
  if (r.category === 'place') {
    const hasAddr = d.address || d.city;
    return `<section class="dblock">
      <h2 class="block-title">${icon('map-pin', { size: 16 })}Adresse</h2>
      ${hasAddr ? `<p class="v" style="font-weight:700;font-size:16px">${esc(d.address || d.city)}</p>${d.address && d.city ? `<p class="muted">${esc(d.city)}</p>` : ''}` : '<p class="muted">Pas encore d’adresse.</p>'}
      <div class="addr-actions">
        ${directionsButton(r, { cls: 'btn btn-primary sm', size: 17 })}
        ${hasAddr ? `<button type="button" class="btn btn-soft sm" data-act="copy-address">${icon('copy', { size: 17 })}Copier l’adresse</button>` : ''}
      </div>
      ${d.lat == null ? `<button type="button" class="btn btn-ghost sm block" data-act="edit-position" style="margin-top:10px">${icon('map-pin', { size: 17 })}Ajouter la position</button>` : ''}
    </section>`;
  }
  if (r.category === 'screen') {
    const facts = [
      d.year ? ['Année', d.year] : null,
      ['Type', subcat('screen', r.subcategory).label],
      d.seasons ? ['Saisons', d.seasons] : null
    ].filter(Boolean);
    return `<section class="dblock">
      <h2 class="block-title">${icon('clapperboard', { size: 16 })}Infos</h2>
      <div class="facts">${facts.map(([k, v]) => `<div><span class="k">${k}</span><b>${esc(v)}</b></div>`).join('')}</div>
      ${d.genres?.length ? `<div class="tags" style="margin-top:12px">${d.genres.map((g) => `<span class="tag">${esc(g)}</span>`).join('')}</div>` : ''}
      <h3 class="block-title" style="margin-top:16px">${icon('tv', { size: 16 })}Où le voir</h3>
      ${d.platforms?.length
        ? `<div class="tags">${d.platforms.map((p) => `<span class="tag platform">${esc(p)}</span>`).join('')}</div>`
        : `<p class="muted" style="font-size:14px">${d.tmdbId ? 'Pas disponible en streaming par abonnement en France pour l’instant.' : 'Plateformes inconnues : utilise « Compléter les infos ».'}</p>`}
      ${d.tmdbId ? `<button type="button" class="btn btn-ghost sm" data-act="refresh-platforms" style="margin-top:12px">${icon('refresh-cw', { size: 16 })}Actualiser les plateformes</button>
        <p class="credit">Plateformes : JustWatch · Données : TMDB</p>` : ''}
      ${d.overview ? `<h3 class="block-title" style="margin-top:16px">Synopsis</h3>
        <p class="synopsis${synopsisOpen ? '' : ' clamp'}">${esc(d.overview)}</p>
        ${d.overview.length > 220 && !synopsisOpen ? '<button type="button" class="text-btn" data-act="more-synopsis">Lire la suite</button>' : ''}` : ''}
    </section>`;
  }
  return `<section class="dblock">
    <h2 class="block-title">${icon('headphones', { size: 16 })}Émission</h2>
    ${d.showName && d.showName !== r.title ? `<div class="info-row"><span class="grow"><span class="k">Émission</span><br><span class="v">${esc(d.showName)}</span></span></div>` : ''}
    ${d.author ? `<div class="info-row"><span class="grow"><span class="k">Par</span><br><span class="v">${esc(d.author)}</span></span></div>` : ''}
    ${d.episodeTitle ? `<div class="info-row"><span class="grow"><span class="k">Épisode conseillé</span><br><span class="v">${esc(d.episodeTitle)}</span></span></div>` : ''}
    ${!d.author && !d.episodeTitle && !(d.showName && d.showName !== r.title) ? '<p class="muted">Pas d’autres infos pour l’instant.</p>' : ''}
    ${d.appleUrl ? `<a class="btn btn-primary sm block" style="margin-top:12px" href="${esc(safeUrl(d.appleUrl))}" target="_blank" rel="noopener">${icon('podcast', { size: 18 })}Ouvrir dans Podcasts</a>` : ''}
  </section>`;
}

function render() {
  const r = getReco(recoId);
  if (!r) {
    destroyMiniMap();
    heroSig = '';
    heroEl.innerHTML = '';
    bodyEl.innerHTML = `<div class="empty" style="padding-top:calc(var(--sat) + 90px)"><h3>Recommandation introuvable</h3><p>Elle a peut-être été supprimée.</p></div>`;
    bar.hidden = true;
    return;
  }
  const sub = subcat(r.category, r.subcategory);
  const S = STATUS[r.category];
  const persons = personsOf(r);
  const sig = [r.id, r.category, r.details.lat, r.details.lng, r.details.posterPath, r.details.artworkUrl, r.subcategory, r.favorite].join('|');
  if (sig !== heroSig) {
    heroSig = sig;
    destroyMiniMap();
    heroEl.innerHTML = heroHtml(r, sub);
    if (r.category === 'place' && r.details.lat != null) initMiniMap(r);
  }
  navbar.querySelector('.navbar-title').textContent = r.title;

  bodyEl.innerHTML = `
    <h1 class="dtitle">${esc(r.title)}</h1>
    <div class="dmeta">
      <span class="pill" style="--c:${sub.color}">${subBubble(sub, 22, 13)}${esc(sub.label)}</span>
      ${statusBadge(r)}
      ${r.favorite ? `<span class="pill plain" style="color:var(--fav)">${icon('star', { size: 14 })}<span style="color:var(--ink-2)">Favori</span></span>` : ''}
    </div>

    <section class="dblock">
      <h2 class="block-title">${icon('users', { size: 16 })}Recommandé par</h2>
      <div class="who-line">${persons.map((p) => `<a class="person-link" href="#/personne/${encodeURIComponent(p.id)}">${avatar(p, 30)}${esc(p.name)}</a>`).join('') || '<span class="muted">Personne</span>'}</div>
      <p class="when">${esc(whenText(r.recommendedAt))}</p>
    </section>

    ${r.theirNote ? `<section class="dblock">
      <h2 class="block-title">${icon('quote', { size: 16 })}Ce qu’on m’en a dit</h2>
      <p class="quote">${esc(r.theirNote)}</p>
    </section>` : ''}

    ${infoBlock(r)}

    ${r.link ? `<a class="dblock link-row" href="${esc(safeUrl(r.link))}" target="_blank" rel="noopener">
      ${icon('link', { size: 18 })}<span class="grow ellipsis">${esc(hostOf(safeUrl(r.link)))}</span>${icon('external-link', { size: 16 })}</a>` : ''}

    ${r.status === 'done' ? `<section class="dblock">
      <h2 class="block-title">${icon('star', { size: 16 })}Mon avis<span class="grow"></span>
        <button type="button" class="text-btn" data-act="edit-review" style="padding:0">Modifier</button></h2>
      ${starInput(r.rating || 0, { small: true, label: 'Ma note' })}
      <p class="review${r.myReview ? '' : ' empty-review'}">${esc(r.myReview) || 'Pas encore d’avis écrit.'}</p>
      ${r.doneAt ? `<p class="when">${esc(S.done)} ${esc(relDate(r.doneAt))}</p>` : ''}
    </section>` : ''}

    ${r.status === 'dropped' ? `<section class="dblock"><h2 class="block-title">${icon('thumbs-down', { size: 16 })}Pas pour moi</h2>
      <p class="muted" style="font-size:14.5px">Classé comme « Pas pour moi ». Tu peux toujours le remettre dans ta liste.</p></section>` : ''}

    ${!hasExternal(r) ? `<button type="button" class="btn btn-soft block" data-act="complete" style="margin-bottom:14px">${icon('wand-sparkles', { size: 18 })}Compléter les infos</button>` : ''}

    <p class="credit" style="text-align:center">Ajouté ${esc(relDate(r.createdAt))}${r.updatedAt !== r.createdAt ? ` · modifié ${esc(relDate(r.updatedAt))}` : ''}</p>`;

  const starsEl = bodyEl.querySelector('.stars');
  if (starsEl) bindStarInput(starsEl, { value: r.rating || 0, onChange: (v) => updateReco(r.id, { rating: v || null }) });

  bar.hidden = false;
  bar.innerHTML = `
    <button type="button" class="rbtn lg fav-btn" data-act="fav" aria-pressed="${r.favorite}" aria-label="${r.favorite ? 'Retirer des favoris' : 'Épingler en favori'}">${icon('star', { size: 22 })}</button>
    ${r.status === 'todo'
      ? `<button type="button" class="btn btn-primary" data-act="done">${icon('check', { size: 20, stroke: 2.8 })}${esc(S.mark)}</button>`
      : `<button type="button" class="btn btn-secondary" data-act="todo">${icon('rotate-ccw', { size: 19 })}${esc(S.back)}</button>`}`;
}

async function refreshPlatforms(r, btn) {
  if (!hasUsableKey()) { toast('Ajoute une clé TMDB dans les réglages.', { icon: 'key-round' }); return; }
  btn?.classList.add('busy');
  try {
    const d = await fetchDetails(r.details.tmdbType, r.details.tmdbId);
    await updateReco(r.id, { details: { platforms: d.platforms, seasons: d.seasons, genres: d.genres.length ? d.genres : r.details.genres, overview: r.details.overview || d.overview, posterPath: r.details.posterPath || d.posterPath } });
    toast(d.platforms.length ? `Disponible sur ${d.platforms.join(', ')}` : 'Aucune plateforme par abonnement en France', { icon: 'tv' });
  } catch (err) {
    toast(errorMessage(err), { icon: 'wifi-off' });
  }
}

async function share(r) {
  const d = r.details;
  const persons = personsOf(r).map((p) => p.name);
  const lines = [r.title];
  if (r.category === 'place' && (d.address || d.city)) lines.push([d.address, d.city].filter(Boolean).join(', '));
  if (r.category === 'screen' && d.year) lines.push(`${subcat('screen', r.subcategory).label} · ${d.year}`);
  if (r.category === 'podcast' && d.author) lines.push(`Podcast · ${d.author}`);
  if (r.theirNote) lines.push(`« ${r.theirNote} »`);
  if (persons.length) lines.push(`Conseillé par ${persons.join(', ')}`);
  const url = r.link ? safeUrl(r.link) : (r.category === 'podcast' && d.appleUrl ? d.appleUrl : (r.category === 'place' ? directionsUrl(r) : ''));
  const text = lines.join('\n');
  try {
    if (navigator.share) { await navigator.share({ title: r.title, text, ...(url ? { url } : {}) }); return; }
  } catch (err) {
    if (err.name === 'AbortError') return;
  }
  const ok = await copyText(text + (url ? '\n' + url : ''));
  toast(ok ? 'Copié dans le presse-papiers' : 'Partage indisponible', { icon: 'copy' });
}

async function more(r) {
  const S = STATUS[r.category];
  const actions = [];
  if (r.status !== 'todo') actions.push({ label: S.back, value: 'todo', icon: 'rotate-ccw' });
  if (r.status !== 'dropped') actions.push({ label: 'Pas pour moi', value: 'dropped', icon: 'thumbs-down' });
  if (!hasExternal(r)) actions.push({ label: 'Compléter les infos', value: 'complete', icon: 'wand-sparkles' });
  if (r.category === 'screen' && r.details.tmdbId) actions.push({ label: 'Actualiser les plateformes', value: 'platforms', icon: 'refresh-cw' });
  actions.push({ label: IS_IOS ? 'Partager' : 'Partager ou copier', value: 'share', icon: 'share' });
  actions.push({ label: 'Modifier', value: 'edit', icon: 'pencil' });
  actions.push({ label: 'Supprimer', value: 'delete', icon: 'trash-2', danger: true });
  const v = await actionSheet({ title: r.title, message: CATEGORIES[r.category].one, actions });
  if (v === 'todo') markTodo(r.id);
  else if (v === 'dropped') markDropped(r.id);
  else if (v === 'complete') openEdit(r.id, { research: true });
  else if (v === 'platforms') refreshPlatforms(r);
  else if (v === 'share') share(r);
  else if (v === 'edit') openEdit(r.id);
  else if (v === 'delete') deleteWithUndo(r.id);
}

function onScroll() {
  if (section.hidden) return;
  navbar.classList.toggle('solid', window.scrollY > 180);
}

export default {
  name: 'reco',
  mount(el) {
    section = el;
    section.innerHTML = `
      <nav class="navbar" aria-label="Navigation">
        <button type="button" class="rbtn glass" data-act="back" aria-label="Retour">${icon('chevron-left', { size: 22, stroke: 2.4 })}</button>
        <span class="navbar-title"></span>
        <div class="group">
          <button type="button" class="rbtn glass" data-act="edit" aria-label="Modifier">${icon('pencil', { size: 19 })}</button>
          <button type="button" class="rbtn glass" data-act="more" aria-label="Plus d’actions">${icon('ellipsis', { size: 22 })}</button>
        </div>
      </nav>
      <div class="vwrap"><div class="d-hero"></div><div class="d-body"></div></div>
      <div class="action-bar" hidden></div>`;
    navbar = section.querySelector('.navbar');
    heroEl = section.querySelector('.d-hero');
    bodyEl = section.querySelector('.d-body');
    bar = section.querySelector('.action-bar');
    section.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const r = getReco(recoId);
      if (b.dataset.act === 'back') { back('#/lieux'); return; }
      if (!r) return;
      switch (b.dataset.act) {
        case 'edit': openEdit(r.id); break;
        case 'more': more(r); break;
        case 'fav': toggleFav(r.id); break;
        case 'done': openDoneSheet(r.id); break;
        case 'todo': markTodo(r.id); break;
        case 'edit-review': openDoneSheet(r.id); break;
        case 'complete': openEdit(r.id, { research: true }); break;
        case 'edit-position': openEdit(r.id, { focus: 'position' }); break;
        case 'refresh-platforms': refreshPlatforms(r, b); break;
        case 'more-synopsis': synopsisOpen = true; render(); break;
        case 'copy-address': {
          const ok = await copyText([r.details.address, r.details.city].filter(Boolean).join(', '));
          toast(ok ? 'Adresse copiée' : 'Copie impossible', { icon: 'copy' });
          break;
        }
        default: break;
      }
    });
    window.addEventListener('scroll', onScroll, { passive: true });
  },
  show(route) {
    if (route.id !== recoId) { synopsisOpen = false; heroSig = ''; }
    recoId = route.id;
    render();
    onScroll();
  },
  hide() {
    destroyMiniMap();
    heroSig = '';
  },
  refresh() { render(); },
  currentId: () => recoId
};
