/* Panneau de filtres commun aux trois onglets de contenu. Les changements
   s'appliquent en direct (la liste derrière se met à jour) et le compteur
   « Voir 12 résultats » suit. Les valeurs sans résultat sont grisées. */
import { openSheet } from './bottom-sheet.js';
import { personChip } from './person-avatar.js';
import { subBubble } from './reco-card.js';
import { starInput, bindStarInput } from './rating.js';
import { toast } from './toast.js';
import { icon } from './icons.js';
import { on } from '../store/events.js';
import { getFilters, setFilters, resetFilters, toggleValue, facetCounts, optionsFor, results } from '../store/filters.js';
import { subcats } from '../store/settings.js';
import { getPerson } from '../store/persons.js';
import { getPosition, geoErrorMessage } from '../services/geo.js';
import { CAT_OF, STATUS, SORTS } from '../config.js';
import { esc, inkOn, norm } from '../utils.js';

const STATUS_COLORS = { todo: '#6F675E', done: '#2E8B57', dropped: '#8A8F98' };
const STATUS_ICONS = { todo: 'clock', done: 'circle-check', dropped: 'thumbs-down' };

function chip(k, v, label, { color = null, lead = '', count = true } = {}) {
  const style = color ? ` style="--chip-c:${color};--chip-ink:${inkOn(color, { text: true })}"` : '';
  return `<button type="button" class="chip${lead ? '' : ' plain'}" data-k="${k}" data-v="${esc(v)}" aria-pressed="false"${style}>
    ${lead}<span>${esc(label)}</span>${count ? '<span class="count"></span>' : ''}</button>`;
}

const section = (title, inner, extra = '') =>
  `<section class="fsec"><h3 class="field-label"><span>${title}</span>${extra}</h3>${inner}</section>`;

export function openFilterSheet(tab, getCtx) {
  const cat = CAT_OF[tab];
  const st0 = getFilters(tab);
  const persons = optionsFor(tab, 'persons');
  for (const id of st0.persons) {
    if (!persons.some((o) => o.value === id) && getPerson(id)) persons.push({ value: id, person: getPerson(id), total: 0 });
  }
  const cities = cat === 'place' ? optionsFor(tab, 'cities') : [];
  const platforms = cat === 'screen' ? optionsFor(tab, 'platforms') : [];
  const sorts = SORTS.filter((s) => !s.only || s.only === cat);

  const body = [
    section('Trier par', `<div class="chips-wrap">${sorts.map((s) => chip('sort', s.key, s.label, { count: false })).join('')}</div>`),
    persons.length
      ? section('Personne', `<div class="chips-wrap">${persons.map((o) => personChip(o.person, { count: 0, attrs: `data-k="persons" data-v="${o.value}"` })).join('')}</div>`)
      : '',
    section(cat === 'podcast' ? 'Thème' : 'Sous-catégorie', `<div class="chips-wrap">${subcats(cat)
      .map((s) => chip('subcats', s.key, s.label, { color: s.color, lead: subBubble(s, 28, 15) })).join('')}</div>`),
    section('Statut', `<div class="chips-wrap">${['todo', 'done', 'dropped']
      .map((k) => chip('statuses', k, STATUS[cat][k], { color: STATUS_COLORS[k], lead: `<span class="bubble soft" style="--c:${STATUS_COLORS[k]};width:28px;height:28px">${icon(STATUS_ICONS[k], { size: 15 })}</span>` })).join('')}</div>`),
    cities.length ? section('Ville', `<div class="chips-wrap">${cities.map((c) => chip('cities', c.value, c.value)).join('')}</div>`) : '',
    platforms.length
      ? section('Plateforme', `<div class="chips-wrap">${platforms.map((p) => chip('platforms', p.value, p.value)).join('')}</div><p class="hint">Disponibilités en France : JustWatch, via TMDB.</p>`)
      : '',
    section('Favoris', `<button type="button" class="switch-row" data-k="fav" style="width:100%">
      <span>${icon('star', { size: 18 })}</span><span style="flex:1;text-align:left">Favoris uniquement</span><span class="switch" role="switch" aria-checked="false"></span></button>`),
    section('Note minimale', starInput(0, { small: true, label: 'Note minimale' }), '<span class="opt" data-min></span>')
  ].join('');

  const s = openSheet({
    title: 'Filtres',
    body,
    foot: `<button type="button" class="btn btn-ghost" data-reset>Réinitialiser</button>
           <button type="button" class="btn btn-primary grow" data-apply>Voir</button>`
  });

  const stars = bindStarInput(s.body.querySelector('.stars'), {
    value: st0.minRating,
    onChange: (v) => setFilters(tab, { minRating: v })
  });

  const update = () => {
    const st = getFilters(tab);
    const ctx = getCtx();
    const counts = {};
    for (const k of ['persons', 'subcats', 'statuses', 'cities', 'platforms']) counts[k] = facetCounts(tab, st, k, ctx);
    s.body.querySelectorAll('[data-k]').forEach((el) => {
      const { k, v } = el.dataset;
      if (k === 'sort') {
        const sel = st.sort === v;
        el.setAttribute('aria-pressed', String(sel));
        el.classList.toggle('on', sel);
        if (v === 'distance') el.classList.toggle('off', !ctx.position && !sel);
        return;
      }
      if (k === 'fav') {
        el.querySelector('.switch').setAttribute('aria-checked', String(st.fav));
        return;
      }
      const sel = k === 'cities' ? st.cities.some((c) => norm(c) === norm(v)) : st[k].includes(v);
      const n = k === 'cities' ? (counts.cities.get(norm(v)) || 0) : (counts[k].get(v) || 0);
      el.setAttribute('aria-pressed', String(sel));
      if (el.classList.contains('chip')) el.classList.toggle('on', sel);
      el.classList.toggle('off', !sel && n === 0);
      const c = el.querySelector('.count');
      if (c) c.textContent = String(n);
    });
    stars.set(st.minRating);
    s.body.querySelector('[data-min]').textContent = st.minRating ? `${st.minRating} étoile${st.minRating > 1 ? 's' : ''} et plus` : '';
    const n = results(tab, st, ctx).length;
    s.foot.querySelector('[data-apply]').textContent = n ? `Voir ${n} résultat${n > 1 ? 's' : ''}` : 'Aucun résultat';
  };

  s.body.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-k]');
    if (!el) return;
    const { k, v } = el.dataset;
    if (k === 'sort') {
      if (v === 'distance' && !getCtx().position) {
        try { await getPosition(); } catch (err) { toast(geoErrorMessage(err), { icon: 'locate-fixed' }); return; }
      }
      setFilters(tab, { sort: v });
    } else if (k === 'fav') {
      setFilters(tab, { fav: !getFilters(tab).fav });
    } else if (k === 'cities') {
      const st = getFilters(tab);
      const has = st.cities.some((c) => norm(c) === norm(v));
      setFilters(tab, { cities: has ? st.cities.filter((c) => norm(c) !== norm(v)) : [...st.cities, v] });
    } else {
      toggleValue(tab, k, v);
    }
  });

  const off = on('filters', ({ tab: t }) => { if (t === tab) update(); });
  const offData = on('change', update);
  s.onClose = () => { off(); offData(); };
  s.foot.querySelector('[data-reset]').addEventListener('click', () => resetFilters(tab));
  s.foot.querySelector('[data-apply]').addEventListener('click', () => s.close('apply'));
  update();
  return s;
}
