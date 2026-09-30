/* Onglet Podcasts : liste avec pochette carrée de 56 px, émission, épisode,
   « par Marie ». Balayage : gauche = écouté, droite = favori. */
import { createHeader, listMeta } from './content-tab.js';
import { emptyState, filteredEmpty } from './empty.js';
import { swipeHint } from './hints.js';
import { recoRow } from '../components/reco-card.js';
import { bindSwipe, bindLongPress } from '../components/swipe.js';
import { swipeStatus, toggleFav, contextMenu } from '../components/reco-actions.js';
import { getFilters, setFilters, results, facetCounts, segmentOf, STATUS_PRESETS } from '../store/filters.js';
import { recosOf } from '../store/recommendations.js';

const TAB = 'podcasts';
let section = null;
let header = null;
let body = null;
let newId = null;

function render() {
  header.sync();
  if (!recosOf('podcast').length) { body.innerHTML = emptyState('podcast'); return; }
  const items = results(TAB, getFilters(TAB));
  if (!items.length) { body.innerHTML = listMeta(TAB, 0) + filteredEmpty(); return; }
  body.innerHTML = listMeta(TAB, items.length) + swipeHint('podcast')
    + `<div class="list">${items.map((r, i) => recoRow(r, { i, newId })).join('')}</div>`;
  newId = null;
}

export default {
  name: TAB,
  tab: true,
  mount(el) {
    section = el;
    section.innerHTML = '<div class="vwrap"><div class="vbody"></div></div>';
    body = section.querySelector('.vbody');
    header = createHeader(section, {
      tab: TAB,
      title: 'Podcasts',
      getCtx: () => ({}),
      segment: {
        label: 'Statut',
        items: [{ key: 'todo', label: 'À écouter' }, { key: 'done', label: 'Écouté' }, { key: 'all', label: 'Tout' }],
        get: (st) => segmentOf(st),
        set: (k) => setFilters(TAB, { statuses: STATUS_PRESETS[k] }),
        counts: () => {
          const c = facetCounts(TAB, getFilters(TAB), 'statuses');
          return { todo: c.get('todo') || 0, done: c.get('done') || 0, all: [...c.values()].reduce((a, b) => a + b, 0) };
        }
      }
    });
    bindSwipe(body, { onLeft: swipeStatus, onRight: toggleFav });
    bindLongPress(body, '.swipe', (el) => contextMenu(el.dataset.id));
  },
  show() { render(); },
  refresh() { render(); },
  highlight(id) { newId = id; }
};
