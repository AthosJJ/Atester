/* Carte : Leaflet + markercluster copiés dans vendor/, chargés à la première
   ouverture de la carte. Tuiles OpenStreetMap (cache limité dans le service worker). */
import { loadScript, inkOn } from '../utils.js';
import { icon } from '../components/icons.js';
import { OSM_TILES, OSM_ATTRIBUTION } from '../config.js';

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

export function osmLayer(L) {
  return L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION, className: 'osm-tiles' });
}

const STAR = '<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><path fill="currentColor" d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/></svg>';

/* Épingle : pastille ronde de la couleur de la sous-catégorie, icône contrastée. */
export function pinIcon(L, sub, { status = 'todo', favorite = false, delay = 0 } = {}) {
  const cls = ['pin', status === 'done' ? 'is-done' : '', status === 'dropped' ? 'is-dropped' : ''].filter(Boolean).join(' ');
  return L.divIcon({
    className: cls,
    html: `<span class="pin-dot" style="--c:${sub.color};--ci:${inkOn(sub.color)};--d:${delay}ms">${icon(sub.icon, { size: 17, stroke: 2.2 })}</span>${favorite ? `<span class="pin-fav">${STAR}</span>` : ''}`,
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

/* Itinéraire dans Plans (Apple Maps). */
export function directionsUrl(reco) {
  const d = reco.details || {};
  if (d.lat != null && d.lng != null) {
    return `https://maps.apple.com/?daddr=${d.lat},${d.lng}&q=${encodeURIComponent(reco.title)}`;
  }
  const where = [reco.title, d.address, d.city].filter(Boolean).join(', ');
  return `https://maps.apple.com/?daddr=${encodeURIComponent(where)}`;
}
