/* Onglet Films & séries : grille d'affiches sur 3 colonnes (ratio 2:3),
   contrôle À voir / Vu / Tout. Appui long sur une affiche : actions rapides. */
import { createHeader, listMeta } from './content-tab.js';
import { emptyState, filteredEmpty } from './empty.js';
import { posterTile } from '../components/reco-card.js';
import { bindLongPress } from '../components/swipe.js';
import { contextMenu } from '../components/reco-actions.js';
import { getFilters, setFilters, results, facetCounts, segmentOf, STATUS_PRESETS } from '../store/filters.js';
import { recosOf } from '../store/recommendations.js';

const TAB = 'ecrans';
let section = null;
let header = null;
let body = null;
let newId = null;

function render() {
  header.sync();
  if (!recosOf('screen').length) { body.innerHTML = emptyState('screen'); return; }
  const items = results(TAB, getFilters(TAB));
  if (!items.length) { body.innerHTML = listMeta(TAB, 0) + filteredEmpty(); return; }
  body.innerHTML = listMeta(TAB, items.length)
    + `<div class="poster-grid">${items.map((r, i) => posterTile(r, { i, newId })).join('')}</div>`;
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
      title: 'Films & séries',
      getCtx: () => ({}),
      segment: {
        label: 'Statut',
        items: [{ key: 'todo', label: 'À voir' }, { key: 'done', label: 'Vu' }, { key: 'all', label: 'Tout' }],
        get: (st) => segmentOf(st),
        set: (k) => setFilters(TAB, { statuses: STATUS_PRESETS[k] }),
        counts: () => {
          const c = facetCounts(TAB, getFilters(TAB), 'statuses');
          return { todo: c.get('todo') || 0, done: c.get('done') || 0, all: [...c.values()].reduce((a, b) => a + b, 0) };
        }
      }
    });
    bindLongPress(body, '.tile', (tile) => contextMenu(tile.dataset.id));
  },
  show() { render(); },
  refresh() { render(); },
  highlight(id) { newId = id; }
};
