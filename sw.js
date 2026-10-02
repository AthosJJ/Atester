/* À tester — service worker.
   Coquille pré-cachée et versionnée ; carte (OpenFreeMap, repli OpenStreetMap)
   et affiches en cache limité ; appels API (Photon, TMDB, iTunes) toujours sur
   le réseau.
   Publier une version = incrémenter CACHE_VERSION (et APP_VERSION dans js/config.js).
   Vérifier la liste : node tools/check-sw.mjs */
const CACHE_VERSION = 'a-tester-v1.4.0';
const TILE_CACHE = 'a-tester-tiles-ofm'; // 1.2 : tuiles OpenFreeMap et OSM (l'ancien cache CARTO est purgé)
const MAP_CACHE = 'a-tester-map';        // styles, polices et icônes de la carte
const MAP_HOST = 'tiles.openfreemap.org';
const IMG_CACHE = 'a-tester-images';
const MAX_TILES = 500;
const MAX_IMAGES = 300;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/app.css',
  './js/app.js',
  './js/config.js',
  './js/router.js',
  './js/utils.js',
  './js/store/db.js',
  './js/store/events.js',
  './js/store/filters.js',
  './js/store/persons.js',
  './js/store/recommendations.js',
  './js/store/settings.js',
  './js/services/backup.js',
  './js/services/demo.js',
  './js/services/geo.js',
  './js/services/http.js',
  './js/services/itunes.js',
  './js/services/map.js',
  './js/services/photo.js',
  './js/services/photon.js',
  './js/services/tmdb.js',
  './js/services/viewport.js',
  './js/views/add.js',
  './js/views/content-tab.js',
  './js/views/empty.js',
  './js/views/hints.js',
  './js/views/person-detail.js',
  './js/views/persons.js',
  './js/views/places.js',
  './js/views/podcasts.js',
  './js/views/reco-detail.js',
  './js/views/screens.js',
  './js/views/settings.js',
  './js/components/bottom-sheet.js',
  './js/components/celebrate.js',
  './js/components/directions.js',
  './js/components/filter-sheet.js',
  './js/components/icons.js',
  './js/components/person-avatar.js',
  './js/components/photo-crop.js',
  './js/components/rating.js',
  './js/components/reco-actions.js',
  './js/components/reco-card.js',
  './js/components/swipe.js',
  './js/components/tabbar.js',
  './js/components/toast.js',
  './vendor/dexie/dexie.min.mjs',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/layers-2x.png',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-icon-2x.png',
  './vendor/leaflet/images/marker-shadow.png',
  './vendor/leaflet.markercluster/leaflet.markercluster.js',
  './vendor/leaflet.markercluster/MarkerCluster.css',
  './vendor/maplibre/maplibre-gl.mjs',
  './vendor/maplibre/maplibre-gl-shared.mjs',
  './vendor/maplibre/maplibre-gl-worker.mjs',
  './vendor/maplibre/maplibre-gl.css',
  './vendor/maplibre-gl-leaflet/leaflet-maplibre-gl.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-64.png'
];

self.addEventListener('install', (event) => {
  // cache:'reload' contourne le cache HTTP : jamais d'ancien fichier dans le nouveau cache.
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
  );
  // Pas de skipWaiting ici : l'app affiche « Nouvelle version disponible — Recharger ».
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith('a-tester-') && ![CACHE_VERSION, TILE_CACHE, MAP_CACHE, IMG_CACHE].includes(k))
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isOsmTile = (host) => host === 'tile.openstreetmap.org';
const isImage = (host) => host === 'image.tmdb.org' || host.endsWith('.mzstatic.com');

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    event.respondWith(fromShell(req));
  } else if (url.hostname === MAP_HOST) {
    // Style et TileJSON changent (nouvelles tuiles chaque semaine) : réseau d'abord.
    if (url.pathname.startsWith('/styles/') || url.pathname === '/planet') event.respondWith(networkFirst(req, MAP_CACHE));
    else if (/^\/(fonts|sprites)\//.test(url.pathname)) event.respondWith(cacheFirst(req, MAP_CACHE, 400));
    else event.respondWith(cacheFirst(req, TILE_CACHE, MAX_TILES));
  } else if (isOsmTile(url.hostname)) {
    event.respondWith(cacheFirst(req, TILE_CACHE, MAX_TILES));
  } else if (isImage(url.hostname)) {
    event.respondWith(cacheFirst(req, IMG_CACHE, MAX_IMAGES));
  }
  // Tout le reste (API Photon, TMDB, iTunes) : réseau uniquement, jamais en cache.
});

async function fromShell(req) {
  if (req.mode === 'navigate') {
    const page = await caches.match('./index.html', { cacheName: CACHE_VERSION });
    if (page) return page;
    return fetch(req);
  }
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
    }
    return res;
  } catch {
    return Response.error();
  }
}

/* Réseau d'abord (délai court), copie de secours pour le hors-ligne. */
async function networkFirst(req, name) {
  const cache = await caches.open(name);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(req.url, { mode: 'cors', credentials: 'omit', signal: ctrl.signal });
    if (res.ok) {
      await cache.put(req.url, res.clone());
      return res;
    }
    return (await cache.match(req.url)) || res;
  } catch {
    return (await cache.match(req.url)) || Response.error();
  } finally {
    clearTimeout(timer);
  }
}

/* Cache d'abord ; au-delà de la limite, les entrées les plus anciennes partent. */
async function cacheFirst(req, name, max) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  let res;
  try {
    res = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
  } catch {
    // Hôte sans CORS : on affiche quand même (réponse opaque), sans la garder.
    try { return await fetch(req); } catch { return Response.error(); }
  }
  if (res.ok) {
    const copy = res.clone();
    cache.put(req, copy).then(() => trim(cache, name, max)).catch(() => {});
  }
  return res;
}

const trimming = {};
async function trim(cache, name, max) {
  if (trimming[name]) return;
  trimming[name] = true;
  try {
    const keys = await cache.keys();
    if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
  } finally {
    trimming[name] = false;
  }
}
