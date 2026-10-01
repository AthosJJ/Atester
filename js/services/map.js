/* Carte : Leaflet + markercluster copiés dans vendor/, chargés à la première
   ouverture de la carte. Fonds CARTO (données OpenStreetMap), en cache limité
   dans le service worker ; le fond suit le thème et le style choisi. */
import { loadScript, inkOn } from '../utils.js';
import { icon } from '../components/icons.js';
import { MAP_STYLES, MAP_ATTRIBUTION } from '../config.js';
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

/* ——— Fond de carte ——— */
const live = new Set();

export function baseStyleKey() {
  if (document.documentElement.dataset.scheme === 'dark') return 'dark';
  return getPref('mapStyle') === 'positron' ? 'positron' : 'voyager';
}

function makeLayer(L, key) {
  return L.tileLayer(MAP_STYLES[key].url, { subdomains: 'abcd', maxZoom: 20, attribution: MAP_ATTRIBUTION, className: 'map-tiles' });
}

/* Ajoute le fond à une carte ; il sera remplacé si le thème ou le style change. */
export function attachBaseLayer(L, map) {
  const key = baseStyleKey();
  const entry = { L, map, key, layer: makeLayer(L, key).addTo(map) };
  live.add(entry);
  map.on('unload', () => live.delete(entry));
  return entry;
}

export function refreshBaseLayers() {
  const key = baseStyleKey();
  for (const e of live) {
    if (e.key === key) continue;
    const next = makeLayer(e.L, key).addTo(e.map);
    e.map.removeLayer(e.layer);
    e.layer = next;
    e.key = key;
  }
}

on('meta', (k) => { if (k === 'prefs') refreshBaseLayers(); });

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
