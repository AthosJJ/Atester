/* Onglet Personnes : triées par nombre de recommandations, avec compteurs
   par catégorie et note moyenne de leurs recommandations testées. */
import { icon } from '../components/icons.js';
import { avatar } from '../components/person-avatar.js';
import { emptyState } from './empty.js';
import { allPersons, personStats } from '../store/persons.js';
import { backupDue } from '../services/backup.js';
import { TEXT_DEBOUNCE } from '../config.js';
import { esc, norm, debounce, fmtNumber } from '../utils.js';
import { go } from '../router.js';

let section, head, body, input, clearBtn, topbar;
let q = '';

function row(p, s, i) {
  const counts = [['place', 'map-pin'], ['screen', 'clapperboard'], ['podcast', 'headphones']]
    .filter(([k]) => s.byCat[k])
    .map(([k, ico]) => `<span>${icon(ico, { size: 14, stroke: 2.2 })}${s.byCat[k]}</span>`).join('');
  const label = `${p.name}, ${s.total} recommandation${s.total > 1 ? 's' : ''}`;
  return `
    <div class="card-in" style="--d:${Math.min(i * 30, 300)}ms">
      <a class="row prow" href="#/personne/${encodeURIComponent(p.id)}" aria-label="${esc(label)}">
        ${avatar(p, 48)}
        <span class="row-main">
          <span class="row-title"><span>${esc(p.name)}</span>${p.isMe ? '<em class="me-tag">mes découvertes</em>' : ''}</span>
          <span class="pcounts">${counts || '<span>Aucune recommandation</span>'}</span>
        </span>
        <span class="row-end" style="flex-direction:row;align-items:center;gap:8px">
          ${s.avg != null ? `<span class="avg">${icon('star', { size: 14 })}${fmtNumber(s.avg)}</span>` : ''}
          <span class="chev">${icon('chevron-right', { size: 18 })}</span>
        </span>
      </a>
    </div>`;
}

function render() {
  head.querySelector('.dot').hidden = !backupDue();
  const k = norm(q);
  const people = allPersons()
    .map((p) => ({ p, s: personStats(p.id) }))
    .filter(({ p, s }) => !(p.isMe && s.total === 0))
    .filter(({ p }) => !k || norm(p.name).includes(k))
    .sort((a, b) => b.s.total - a.s.total || a.p.name.localeCompare(b.p.name, 'fr'));
  const hasAny = allPersons().some((p) => !p.isMe) || allPersons().some((p) => p.isMe && personStats(p.id).total);
  head.querySelector('[data-act="psearch"]').hidden = !hasAny;
  if (!hasAny) { body.innerHTML = emptyState(null); return; }
  if (!people.length) {
    body.innerHTML = `<div class="empty"><h3>Personne ne s’appelle « ${esc(q)} »</h3><p>Vérifie l’orthographe, ou ajoute une recommandation avec ce prénom.</p></div>`;
    return;
  }
  body.innerHTML = `<p class="list-meta"><span class="count">${people.length} personne${people.length > 1 ? 's' : ''}</span></p>
    <div class="list">${people.map(({ p, s }, i) => row(p, s, i)).join('')}</div>`;
}

const pushQuery = debounce((v) => { q = v; render(); }, TEXT_DEBOUNCE);

export default {
  name: 'personnes',
  tab: true,
  mount(el) {
    section = el;
    section.innerHTML = `
      <div class="vwrap">
        <div class="vhead">
          <div class="title-row">
            <h1 class="large-title">Personnes</h1>
            <div class="head-actions">
              <button type="button" class="rbtn" data-act="psearch" aria-label="Rechercher une personne">${icon('search')}</button>
              <button type="button" class="rbtn" data-act="settings" aria-label="Réglages">${icon('settings')}<span class="dot" hidden></span></button>
            </div>
          </div>
          <div class="search-row">
            <label class="search-field">${icon('search', { size: 18 })}
              <input type="search" placeholder="Un prénom…" aria-label="Rechercher une personne" enterkeyhint="search" autocomplete="off" autocorrect="off">
              <button type="button" class="search-clear" data-act="pclear" aria-label="Effacer" hidden>${icon('x', { size: 16, stroke: 2.6 })}</button>
            </label>
            <button type="button" class="text-btn" data-act="pcancel">Annuler</button>
          </div>
        </div>
        <div class="vbody"></div>
      </div>
      <div class="topbar"><span class="spacer"></span><span class="topbar-title">Personnes</span><span class="spacer"></span></div>`;
    head = section.querySelector('.vhead');
    body = section.querySelector('.vbody');
    input = head.querySelector('input');
    clearBtn = head.querySelector('[data-act="pclear"]');
    topbar = section.querySelector('.topbar');

    section.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'psearch') { head.classList.add('searching'); input.focus(); }
      if (act === 'pcancel') { input.value = ''; clearBtn.hidden = true; q = ''; head.classList.remove('searching'); input.blur(); render(); }
      if (act === 'pclear') { input.value = ''; clearBtn.hidden = true; q = ''; render(); input.focus(); }
      if (act === 'settings') go('#/reglages');
    });
    input.addEventListener('input', () => { clearBtn.hidden = !input.value; pushQuery(input.value); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });

    let titleVisible = true;
    new IntersectionObserver((entries) => {
      titleVisible = entries.some((en) => en.isIntersecting);
      topbar.classList.toggle('show', !titleVisible && !section.hidden);
    }, { rootMargin: '-60px 0px 0px 0px' }).observe(head);
  },
  show() { render(); },
  refresh() { render(); }
};
