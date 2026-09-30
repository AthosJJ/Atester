/* Routes par hash (compatibles GitHub Pages) : #/lieux, #/ecrans, #/podcasts,
   #/personnes, #/personne/:id, #/reco/:id, #/ajout?cat=place, #/reglages.
   L'historique suit une profondeur pour savoir si « Retour » peut revenir
   en arrière dans l'app ; changer d'onglet remplace l'entrée courante. */
import { parseQuery } from './store/filters.js';

export const TAB_ROUTES = ['lieux', 'ecrans', 'podcasts', 'personnes'];

let handler = null;
let depth = 0;
let lastHash = null;

export function parseHash(hash = location.hash) {
  const h = String(hash || '').replace(/^#\/?/, '');
  const qi = h.indexOf('?');
  const path = qi < 0 ? h : h.slice(0, qi);
  const query = qi < 0 ? '' : h.slice(qi + 1);
  const parts = path.split('/').filter(Boolean).map((p) => {
    try { return decodeURIComponent(p); } catch { return p; }
  });
  return { name: parts[0] || '', id: parts[1] || null, query, params: parseQuery(query) };
}

function dispatch(dir) {
  lastHash = location.hash;
  handler(parseHash(), { dir });
}

export function initRouter(onRoute) {
  handler = onRoute;
  depth = Number(history.state?.depth) || 0;
  history.replaceState({ depth }, '', location.href);

  window.addEventListener('popstate', (e) => {
    const d = Number(e.state?.depth) || 0;
    const dir = d < depth ? 'back' : 'forward';
    depth = d;
    dispatch(dir);
  });
  // Filet de sécurité : un changement de hash sans popstate (saisie manuelle).
  window.addEventListener('hashchange', () => {
    if (location.hash !== lastHash) dispatch('forward');
  });

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href^="#/"]');
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute('href');
    const target = parseHash(href).name;
    const cur = parseHash().name;
    go(href, { replace: TAB_ROUTES.includes(target) && TAB_ROUTES.includes(cur) });
  });

  dispatch('none');
}

export function go(hash, { replace = false } = {}) {
  if (replace) {
    history.replaceState({ depth }, '', hash);
  } else {
    depth += 1;
    history.pushState({ depth }, '', hash);
  }
  dispatch(replace ? 'replace' : 'forward');
}

export const replaceRoute = (hash) => go(hash, { replace: true });

/* Met l'URL à jour (filtres) sans relancer le rendu. */
export function replaceQuiet(hash) {
  if (hash === location.hash) return;
  history.replaceState({ depth }, '', hash);
  lastHash = location.hash;
}

export function back(fallback = '#/lieux') {
  if (depth > 0) history.back();
  else go(fallback, { replace: true });
}
