/* En-tête commun aux onglets Lieux, Films & séries et Podcasts :
   grand titre, boutons ronds (recherche, filtres, réglages), rangée de puces
   des sous-catégories, contrôle segmenté, puces des filtres actifs, et barre
   compacte quand le titre sort de l'écran. L'en-tête n'est jamais reconstruit :
   seules ses parties dynamiques sont synchronisées (le clavier reste ouvert). */
import { icon } from '../components/icons.js';
import { subBubble } from '../components/reco-card.js';
import { avatar } from '../components/person-avatar.js';
import { openFilterSheet } from '../components/filter-sheet.js';
import { actionSheet } from '../components/bottom-sheet.js';
import { toast } from '../components/toast.js';
import {
  getFilters, setFilters, toggleValue, activeCount, activeChips, removeChip, resetFilters
} from '../store/filters.js';
import { subcats } from '../store/settings.js';
import { recosOf } from '../store/recommendations.js';
import { getPosition, geoErrorMessage } from '../services/geo.js';
import { backupDue } from '../services/backup.js';
import { CAT_OF, CATEGORIES, SORTS, TEXT_DEBOUNCE } from '../config.js';
import { esc, inkOn, debounce, plural } from '../utils.js';
import { go } from '../router.js';

export function sortLabel(key) {
  return (SORTS.find((s) => s.key === key) || SORTS[0]).label;
}

export async function openSortMenu(tab, getCtx) {
  const cat = CAT_OF[tab];
  const st = getFilters(tab);
  const v = await actionSheet({
    title: 'Trier par',
    actions: SORTS.filter((s) => !s.only || s.only === cat).map((s) => ({ label: s.label, value: s.key, checked: s.key === st.sort }))
  });
  if (!v) return;
  if (v === 'distance' && !getCtx().position) {
    try { await getPosition(); } catch (err) { toast(geoErrorMessage(err), { icon: 'locate-fixed' }); return; }
  }
  setFilters(tab, { sort: v });
}

/* « 12 lieux · Plus récent ⌄ » */
export function listMeta(tab, count, extra = '') {
  const cat = CAT_OF[tab];
  const st = getFilters(tab);
  return `<div class="list-meta">
    <span class="count">${esc(plural(count, CATEGORIES[cat].noun))}</span>
    ${extra}
    <button type="button" class="sort-btn" data-act="sort" aria-label="Trier : ${esc(sortLabel(st.sort))}">
      ${icon('arrow-down-up', { size: 14, stroke: 2.4 })}${esc(sortLabel(st.sort))}${icon('chevron-down', { size: 14, stroke: 2.4 })}
    </button>
  </div>`;
}

export function createHeader(section, { tab, title, segment, getCtx }) {
  const cat = CAT_OF[tab];
  const wrap = section.querySelector('.vwrap');
  const head = document.createElement('div');
  head.className = 'vhead';
  head.innerHTML = `
    <div class="title-row">
      <h1 class="large-title">${esc(title)}</h1>
      <div class="head-actions">
        <button type="button" class="rbtn" data-act="search" aria-label="Rechercher">${icon('search')}</button>
        <button type="button" class="rbtn" data-act="filters" aria-label="Filtres">${icon('sliders-horizontal')}<span class="badge" hidden></span></button>
        <button type="button" class="rbtn" data-act="settings" aria-label="Réglages">${icon('settings')}<span class="dot" hidden></span></button>
      </div>
    </div>
    <div class="search-row">
      <label class="search-field">
        ${icon('search', { size: 18 })}
        <input type="search" placeholder="Rechercher dans ${esc(title.toLowerCase())}" aria-label="Rechercher"
          enterkeyhint="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
        <button type="button" class="search-clear" data-act="clear" aria-label="Effacer la recherche" hidden>${icon('x', { size: 16, stroke: 2.6 })}</button>
      </label>
      <button type="button" class="text-btn" data-act="search-cancel">Annuler</button>
    </div>
    <div class="chip-row" role="toolbar" aria-label="${cat === 'podcast' ? 'Thèmes' : 'Sous-catégories'}"></div>
    ${segment ? `<div class="seg" role="group" aria-label="${esc(segment.label)}" style="--n:${segment.items.length}">
      <span class="seg-thumb" aria-hidden="true"></span>
      ${segment.items.map((it) => `<button type="button" data-seg="${it.key}" aria-pressed="false">${it.icon ? icon(it.icon, { size: 16 }) : ''}<span>${esc(it.label)}</span><span class="n"></span></button>`).join('')}
    </div>` : ''}
    <div class="active-row" hidden></div>`;
  wrap.prepend(head);

  const topbar = document.createElement('div');
  topbar.className = 'topbar';
  topbar.innerHTML = `
    <span class="spacer"></span>
    <span class="topbar-title">${esc(title)}</span>
    <button type="button" class="rbtn sm" data-act="filters" aria-label="Filtres">${icon('sliders-horizontal')}<span class="badge" hidden></span></button>`;
  section.appendChild(topbar);

  const input = head.querySelector('input');
  const clearBtn = head.querySelector('[data-act="clear"]');
  const chipRow = head.querySelector('.chip-row');
  const seg = head.querySelector('.seg');
  const activeRow = head.querySelector('.active-row');
  let chipSig = '';

  const pushQuery = debounce((q) => setFilters(tab, { q }), TEXT_DEBOUNCE);

  function openSearch() {
    head.classList.add('searching');
    input.focus();
  }
  function closeSearch() {
    pushQuery.cancel();
    input.value = '';
    clearBtn.hidden = true;
    head.classList.remove('searching');
    input.blur();
    if (getFilters(tab).q) setFilters(tab, { q: '' });
  }

  const onClick = (e) => {
    const el = e.target.closest('[data-act], [data-sub], [data-seg], [data-chip]');
    if (!el) return;
    if (el.dataset.sub !== undefined) {
      if (el.dataset.sub === '*') setFilters(tab, { subcats: [] });
      else toggleValue(tab, 'subcats', el.dataset.sub);
      return;
    }
    if (el.dataset.seg) { segment.set(el.dataset.seg); return; }
    if (el.dataset.chip !== undefined) {
      const chips = activeChips(tab);
      if (el.dataset.chip === 'all') resetFilters(tab);
      else removeChip(tab, chips[Number(el.dataset.chip)]);
      return;
    }
    switch (el.dataset.act) {
      case 'search': openSearch(); break;
      case 'search-cancel': closeSearch(); break;
      case 'clear':
        pushQuery.cancel();
        input.value = '';
        clearBtn.hidden = true;
        setFilters(tab, { q: '' });
        input.focus();
        break;
      case 'filters': openFilterSheet(tab, getCtx); break;
      case 'settings': go('#/reglages'); break;
      case 'sort': openSortMenu(tab, getCtx); break;
      default: break;
    }
  };
  section.addEventListener('click', onClick);

  input.addEventListener('input', () => {
    clearBtn.hidden = !input.value;
    pushQuery(input.value);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); pushQuery.cancel(); setFilters(tab, { q: input.value }); input.blur(); }
    if (e.key === 'Escape') closeSearch();
  });

  /* Barre compacte quand le grand titre sort de l'écran (hors mode carte). */
  let titleVisible = true;
  const io = new IntersectionObserver((entries) => {
    titleVisible = entries.some((en) => en.isIntersecting);
    syncTopbar();
  }, { rootMargin: '-60px 0px 0px 0px' });
  io.observe(head.querySelector('.title-row'));
  io.observe(head.querySelector('.search-row'));
  function syncTopbar() {
    const show = !titleVisible && !section.classList.contains('map-mode') && !section.hidden && window.scrollY > 40;
    topbar.classList.toggle('show', show);
  }
  window.addEventListener('scroll', () => { if (!section.hidden) syncTopbar(); }, { passive: true });

  function renderChips(pool, st) {
    const used = new Set(pool.map((r) => r.subcategory));
    const list = subcats(cat).filter((s) => used.has(s.key) || st.subcats.includes(s.key));
    const sig = list.map((s) => s.key + s.label + s.color + s.icon).join('|');
    if (sig !== chipSig) {
      chipSig = sig;
      chipRow.innerHTML = `
        <button type="button" class="chip plain" data-sub="*" aria-pressed="false">Tous</button>
        ${list.map((s) => `
          <button type="button" class="chip" data-sub="${esc(s.key)}" aria-pressed="false" style="--chip-c:${s.color};--chip-ink:${inkOn(s.color, { text: true })}">
            ${subBubble(s, 28, 15)}<span>${esc(s.label)}</span>
          </button>`).join('')}`;
    }
    chipRow.querySelectorAll('[data-sub]').forEach((b) => {
      const on = b.dataset.sub === '*' ? !st.subcats.length : st.subcats.includes(b.dataset.sub);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function renderSeg(st) {
    if (!seg) return;
    const cur = segment.get(st);
    const idx = segment.items.findIndex((it) => it.key === cur);
    seg.style.setProperty('--i', String(Math.max(0, idx)));
    seg.classList.toggle('none', idx < 0);
    const counts = segment.counts ? segment.counts() : null;
    seg.querySelectorAll('[data-seg]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.seg === cur));
      const n = b.querySelector('.n');
      n.textContent = counts && counts[b.dataset.seg] != null ? String(counts[b.dataset.seg]) : '';
    });
  }

  function renderActive() {
    const chips = activeChips(tab);
    activeRow.hidden = !chips.length;
    activeRow.innerHTML = chips.map((c, i) => `
      <button type="button" class="fchip" data-chip="${i}" aria-label="Retirer le filtre ${esc(c.label)}">
        ${c.person ? avatar(c.person, 24) : (c.icon ? icon(c.icon, { size: 14, stroke: 2.4 }) : '')}
        <span>${esc(c.label)}</span><span class="x">${icon('x', { size: 13, stroke: 2.8 })}</span>
      </button>`).join('') + (chips.length > 1 ? '<button type="button" class="fchip clear-all" data-chip="all">Tout effacer</button>' : '');
  }

  function sync() {
    const st = getFilters(tab);
    const pool = recosOf(cat);
    const empty = pool.length === 0;
    chipRow.hidden = empty;
    if (seg) seg.hidden = empty && !segment.alwaysShow;
    head.querySelector('[data-act="search"]').hidden = empty;
    head.querySelector('[data-act="filters"]').hidden = empty;
    if (!empty) renderChips(pool, st);
    renderSeg(st);
    renderActive();
    const n = activeCount(tab, st);
    section.querySelectorAll('[data-act="filters"] .badge').forEach((b) => { b.hidden = !n; b.textContent = String(n); });
    head.querySelector('[data-act="search"]').classList.toggle('on', Boolean(st.q));
    head.querySelector('.dot').hidden = !backupDue();
    if (st.q && document.activeElement !== input) {
      input.value = st.q;
      clearBtn.hidden = false;
      head.classList.add('searching');
    } else if (!st.q && document.activeElement !== input && head.classList.contains('searching') && !input.value) {
      head.classList.remove('searching');
    }
    syncTopbar();
  }

  return { head, sync, openSearch, syncTopbar };
}
