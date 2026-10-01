/* Carte : Leaflet (+ markercluster) pour les épingles et les gestes, copiés dans
   vendor/ et chargés à la première ouverture. Le fond vectoriel OpenFreeMap
   (sans clé ni compte) est dessiné par MapLibre GL sous les épingles ; sans
   WebGL, ou si OpenFreeMap ne répond pas, on se replie sur les tuiles
   OpenStreetMap. Le fond suit le thème et le style choisi ; le service worker
   garde les tuiles déjà vues pour le hors-ligne. */
import { loadScript, loadCss, inkOn, reducedMotion } from '../utils.js';
import { icon } from '../components/icons.js';
import { MAP_STYLES, MAP_ATTRIBUTION, OSM_TILES, OSM_ATTRIBUTION, MAP_MAX_ZOOM } from '../config.js';
import { getPref } from '../store/settings.js';
import { on } from '../store/events.js';

let loading = null;

export function loadLeaflet() {
  if (window.L && window.L.MarkerClusterGroup) return Promise.resolve(window.L);
  if (!loading) {
    loading = loadScript('./vendor/leaflet/leaflet.js')
      .then(() => loadScript('./vendor/leaflet.markercluster/leaflet.markercluster.js'))
      .then(() => window.L)
      .catch((err) => { loading = null; throw err; });
  }
  return loading;
}

/* ——— MapLibre GL et la liaison Leaflet (chargés à la demande) ——— */
let glLoading = null;
let glBroken = null; // WebGL absent ou refusé : inutile de réessayer

function webglMissing() {
  if (glBroken === null) {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      glBroken = !gl;
      gl?.getExtension('WEBGL_lose_context')?.loseContext(); // libère tout de suite ce contexte d'essai
    } catch {
      glBroken = true;
    }
  }
  return glBroken;
}

function loadGL() {
  if (webglMissing()) return Promise.reject(new Error('webgl'));
  if (!glLoading) {
    glLoading = (async () => {
      loadCss('./vendor/maplibre/maplibre-gl.css');
      const ml = await import('../../vendor/maplibre/maplibre-gl.mjs');
      window.maplibregl = ml; // la liaison Leaflet attend la variable globale
      await loadScript('./vendor/maplibre-gl-leaflet/leaflet-maplibre-gl.js');
      if (!window.L?.maplibreGL) throw new Error('liaison Leaflet absente');
      return ml;
    })().catch((err) => { glLoading = null; throw err; });
  }
  return glLoading;
}

/* ——— Styles OpenFreeMap ——— */
const styles = new Map();

async function getJSON(url) {
  // fetch direct (et non fetchJSON) : hors ligne, le service worker répond depuis son cache.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, { credentials: 'omit', signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/* Libellés en français quand OpenStreetMap les connaît (« Londres »,
   « Espagne »), sinon le nom local : les styles d'origine affichent l'anglais. */
function frenchName(expr) {
  if (typeof expr === 'string') {
    return /^\{name(_en|:en|:latin)?\}$/.test(expr) ? ['coalesce', ['get', 'name:fr'], ['get', 'name']] : expr;
  }
  if (!Array.isArray(expr)) return expr;
  if (expr[0] === 'get' && expr.length === 2) {
    if (expr[1] === 'name_en' || expr[1] === 'name:en') return ['coalesce', ['get', 'name:fr'], ['get', 'name']];
    if (expr[1] === 'name:latin') return ['coalesce', ['get', 'name:fr'], ['get', 'name:latin']];
  }
  return expr.map(frenchName);
}

/* Le style, sa source de tuiles intégrée (moins d'allers-retours, et rien
   d'inconnu une fois chargé), les points d'intérêt retirés : nos épingles
   restent seules à l'écran (on garde les stations de transport). */
export async function loadStyle(key) {
  if (styles.has(key)) return styles.get(key);
  const style = await getJSON(MAP_STYLES[key].url);
  for (const [id, src] of Object.entries(style.sources || {})) {
    if (src.type === 'vector' && src.url && !src.tiles) {
      const tj = await getJSON(src.url);
      if (!Array.isArray(tj.tiles) || !tj.tiles.length) throw new Error('TileJSON sans tuiles');
      style.sources[id] = {
        type: 'vector', tiles: tj.tiles,
        minzoom: tj.minzoom ?? 0, maxzoom: tj.maxzoom ?? 14,
        ...(tj.bounds ? { bounds: tj.bounds } : {})
      };
    }
  }
  style.layers = (style.layers || [])
    .filter((l) => l['source-layer'] !== 'poi' || /transit/.test(l.id))
    .map((l) => (l.layout && l.layout['text-field'] ? { ...l, layout: { ...l.layout, 'text-field': frenchName(l.layout['text-field']) } } : l));
  styles.set(key, style);
  return style;
}

/* ——— Fond de carte ——— */
const live = new Set();

export function baseStyleKey() {
  if (document.documentElement.dataset.scheme === 'dark') return 'dark';
  return getPref('mapStyle') === 'positron' ? 'positron' : 'liberty';
}

function rasterLayer(L) {
  return L.tileLayer(OSM_TILES, {
    maxZoom: MAP_MAX_ZOOM, maxNativeZoom: 19, attribution: OSM_ATTRIBUTION, className: 'osm-tiles'
  });
}

function vectorLayer(L, style) {
  return L.maplibreGL({
    style,
    attributionControl: { customAttribution: MAP_ATTRIBUTION },
    fadeDuration: reducedMotion() ? 0 : 200,
    className: 'map-gl'
  });
}

function swap(entry, layer, kind) {
  const old = entry.layer;
  try {
    layer.addTo(entry.map);
  } catch (err) {
    // Création du contexte WebGL refusée : on retire la couche à moitié posée.
    layer.getContainer?.()?.remove();
    delete entry.map._layers?.[entry.L.stamp(layer)];
    throw err;
  }
  entry.layer = layer;
  entry.kind = kind;
  if (old) entry.map.removeLayer(old);
}

/* Pose (ou remplace) le fond d'une carte : vectoriel si possible, sinon OSM. */
async function setBase(entry) {
  const key = baseStyleKey();
  const ticket = ++entry.ticket;
  entry.key = key;
  try {
    const [, style] = await Promise.all([loadGL(), loadStyle(key)]);
    if (ticket !== entry.ticket || !live.has(entry)) return;
    const layer = vectorLayer(entry.L, style);
    swap(entry, layer, 'gl');
    // Tuile absente hors ligne, requête annulée au zoom : rien à signaler.
    layer.getMaplibreMap()?.on('error', () => {});
  } catch (err) {
    if (ticket !== entry.ticket || !live.has(entry)) return;
    if (/webgl|WebGL/.test(String(err?.message))) glBroken = true;
    if (entry.kind !== 'osm') swap(entry, rasterLayer(entry.L), 'osm');
  }
}

/* Ajoute le fond à une carte ; il sera remplacé si le thème ou le style change. */
export function attachBaseLayer(L, map) {
  const entry = { L, map, key: null, kind: null, layer: null, ticket: 0 };
  live.add(entry);
  map.on('unload', () => live.delete(entry));
  setBase(entry);
  return entry;
}

/* Thème ou style changés, ou réseau revenu (on retente le fond vectoriel). */
export function refreshBaseLayers({ retry = false } = {}) {
  const key = baseStyleKey();
  for (const e of live) {
    if (e.key !== key || (retry && e.kind === 'osm' && !glBroken)) setBase(e);
  }
}

on('meta', (k) => { if (k === 'prefs') refreshBaseLayers(); });
window.addEventListener('online', () => refreshBaseLayers({ retry: true }));

const STAR = '<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><path fill="currentColor" d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/></svg>';

/* Épingle : pastille ronde de la couleur de la sous-catégorie, icône contrastée. */
export function pinIcon(L, sub, { status = 'todo', favorite = false, delay = 0 } = {}) {
  const cls = ['pin', status === 'done' ? 'is-done' : '', status === 'dropped' ? 'is-dropped' : ''].filter(Boolean).join(' ');
  return L.divIcon({
    className: cls,
    html: `<span class="pin-dot" style="--c:${sub.color};--ci:${inkOn(sub.color)};--d:${delay}ms">${icon(sub.icon, { size: 15, stroke: 2.2 })}</span>${favorite ? `<span class="pin-fav">${STAR}</span>` : ''}`,
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });
}

/* Groupe : anneau aux couleurs des sous-catégories qu'il contient. */
export function clusterIcon(L, cluster) {
  const markers = cluster.getAllChildMarkers();
  const total = markers.length;
  const counts = new Map();
  for (const m of markers) {
    const c = m.options.pinColor || '#8A8F98';
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  let acc = 0;
  const stops = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => {
    const from = (acc / total) * 360;
    acc += n;
    return `${c} ${from.toFixed(1)}deg ${((acc / total) * 360).toFixed(1)}deg`;
  });
  const size = total < 10 ? 46 : total < 50 ? 54 : 62;
  return L.divIcon({
    className: 'cluster',
    html: `<span class="cluster-ring" style="background:conic-gradient(${stops.join(',')})"><span class="cluster-core">${total}</span></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

export function userIcon(L) {
  return L.divIcon({ className: 'me-pin', html: '<span class="me-halo"></span><span class="me-dot"></span>', iconSize: [24, 24], iconAnchor: [12, 12] });
}

/* Itinéraire : Plans (Apple), Google Maps ou Waze. Liens universels : l'app
   s'ouvre si elle est installée, son site sinon. */
export function directionsUrl(reco, app = 'apple') {
  const d = reco.details || {};
  const has = d.lat != null && d.lng != null;
  const where = encodeURIComponent([reco.title, d.address, d.city].filter(Boolean).join(', '));
  if (app === 'google') {
    return `https://www.google.com/maps/dir/?api=1&destination=${has ? `${d.lat},${d.lng}` : where}`;
  }
  if (app === 'waze') {
    return has ? `https://waze.com/ul?ll=${d.lat},${d.lng}&navigate=yes` : `https://waze.com/ul?q=${where}&navigate=yes`;
  }
  return has
    ? `https://maps.apple.com/?daddr=${d.lat},${d.lng}&q=${encodeURIComponent(reco.title)}`
    : `https://maps.apple.com/?daddr=${where}`;
}
