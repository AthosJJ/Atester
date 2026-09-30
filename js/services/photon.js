/* Recherche de lieux et géocodage inverse avec Photon (komoot), basé sur OpenStreetMap.
   https://github.com/komoot/photon */
import { fetchJSON } from './http.js';

const BASE = 'https://photon.komoot.io';

/* Sous-catégorie devinée depuis les étiquettes OSM. */
export function guessPlaceSubcat(key, value) {
  const k = String(key || ''), v = String(value || '');
  if (k === 'amenity' && ['restaurant', 'fast_food', 'food_court'].includes(v)) return 'restaurant';
  if (k === 'amenity' && ['bar', 'pub', 'biergarten', 'nightclub'].includes(v)) return 'bar';
  if (k === 'amenity' && v === 'cafe') return 'cafe';
  if (k === 'shop' && ['bakery', 'pastry', 'confectionery', 'chocolate'].includes(v)) return 'boulangerie';
  if ((k === 'tourism' && ['museum', 'gallery'].includes(v)) || (k === 'amenity' && v === 'arts_centre')) return 'expo';
  if (k === 'tourism' && ['hotel', 'guest_house', 'hostel', 'motel', 'apartment', 'chalet', 'camp_site'].includes(v)) return 'hebergement';
  if (k === 'shop') return 'boutique';
  if ((k === 'leisure' && ['park', 'garden', 'nature_reserve'].includes(v)) || k === 'natural'
    || (k === 'tourism' && v === 'viewpoint')) return 'balade';
  return null;
}

function toPlace(f) {
  const p = f.properties || {};
  const [lng, lat] = f.geometry?.coordinates || [];
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const city = p.city || p.town || p.village || p.locality || p.district || p.county || '';
  const osmId = p.osm_type && p.osm_id ? `${p.osm_type}${p.osm_id}` : null;
  return {
    name: p.name || street || city || '',
    street,
    city,
    postcode: p.postcode || '',
    country: p.country || '',
    lat: typeof lat === 'number' ? lat : null,
    lng: typeof lng === 'number' ? lng : null,
    osmId,
    osmKey: p.osm_key || '',
    osmValue: p.osm_value || '',
    subcat: guessPlaceSubcat(p.osm_key, p.osm_value)
  };
}

export async function searchPlaces(q, { lat, lng, signal } = {}) {
  const params = new URLSearchParams({ q, lang: 'fr', limit: '8' });
  if (lat != null && lng != null) {
    params.set('lat', lat.toFixed(4));
    params.set('lon', lng.toFixed(4));
  }
  const data = await fetchJSON(`${BASE}/api/?${params}`, { signal });
  const seen = new Set();
  return (data.features || []).map(toPlace).filter((p) => {
    const k = p.osmId || `${p.name}|${p.street}|${p.city}`;
    if (!p.name || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function reverseGeocode(lat, lng, { signal } = {}) {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lng), lang: 'fr' });
  const data = await fetchJSON(`${BASE}/reverse?${params}`, { signal });
  const f = (data.features || [])[0];
  return f ? toPlace(f) : null;
}
