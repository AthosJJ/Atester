/* Photo d'une personne : carré de 200 px en JPEG compressé, 30 Ko au plus,
   rangé en data URL dans la fiche Firestore de la personne (pas de Cloud
   Storage), donc inclus dans la sauvegarde JSON. L'affichage passe par des
   URL blob mises en cache (une par personne), pour ne pas recopier la photo
   dans chaque rendu. */

export const PHOTO_SIZE = 200;
export const PHOTO_MAX = 30000;          // taille maximale enregistrée (data URL, en caractères)
const IMPORT_MAX = 400000;               // au-delà, la photo d'un import est ignorée
const SOURCE_MAX = 2048;                 // côté maximal gardé en mémoire (canvas iOS)
const QUALITIES = [0.82, 0.74, 0.66, 0.58, 0.5, 0.42];
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

export const isPhoto = (s) => typeof s === 'string' && s.length <= IMPORT_MAX && DATA_URL.test(s);

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function free(c) { c.width = 0; c.height = 0; } // libère la mémoire tout de suite (iOS)

/* Ouvre le fichier choisi (iOS convertit les photos HEIC en JPEG). Les très
   grandes photos sont d'abord réduites à 2048 px de côté. Renvoie la source à
   afficher et à découper, ou une erreur si l'image est illisible. */
export function loadPhotoFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) { URL.revokeObjectURL(url); reject(new Error('empty')); return; }
      const k = SOURCE_MAX / Math.max(w, h);
      if (k >= 1) { resolve({ el: img, w, h, dispose: () => URL.revokeObjectURL(url) }); return; }
      const c = canvas(Math.round(w * k), Math.round(h * k));
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve({ el: c, w: c.width, h: c.height, dispose: () => free(c) });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
    img.src = url;
  });
}

/* JPEG le plus net qui tienne dans 30 Ko : la qualité baisse par paliers,
   puis le côté si besoin. */
function encode(c) {
  let data = '';
  for (const q of QUALITIES) {
    data = c.toDataURL('image/jpeg', q);
    if (data.length <= PHOTO_MAX) return data;
  }
  if (c.width < 64) return data;
  const small = canvas(Math.round(c.width * 0.8));
  const ctx = small.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c, 0, 0, small.width, small.height);
  const smaller = encode(small);
  free(small);
  return smaller;
}

/* Découpe le carré (sx, sy, côté) de la source et le réduit par moitiés
   successives jusqu'à 200 px : net, sans moiré. */
export function squarePhoto(src, sx, sy, side, size = PHOTO_SIZE) {
  let n = size;
  while (n * 2 <= Math.min(side, SOURCE_MAX)) n *= 2;
  let c = canvas(n);
  let ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; // fond des images transparentes (le JPEG n'a pas d'alpha)
  ctx.fillRect(0, 0, n, n);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, side, side, 0, 0, n, n);
  while (n > size) {
    const next = canvas(n / 2);
    ctx = next.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(c, 0, 0, n, n, 0, 0, n / 2, n / 2);
    free(c);
    c = next;
    n /= 2;
  }
  const data = encode(c);
  free(c);
  return data;
}

/* Photo venue d'un import (ancien stockage, fichier JSON) : recadrée au
   centre et convertie au même format. null si elle est illisible. */
export function shrinkPhoto(data) {
  if (!isPhoto(data)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) { resolve(null); return; }
      const side = Math.min(w, h);
      try { resolve(squarePhoto(img, (w - side) / 2, (h - side) / 2, side)); } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = data;
  });
}

/* ——— Affichage : data URL → URL blob, une par personne ——— */
const urls = new Map();

function toBlob(data) {
  const comma = data.indexOf(',');
  const type = data.slice(5, data.indexOf(';'));
  const bin = atob(data.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export function photoUrl(id, data) {
  if (!data) return null;
  const hit = urls.get(id);
  if (hit && hit.data === data) return hit.url;
  let url;
  try { url = URL.createObjectURL(toBlob(data)); } catch { return null; }
  // L'ancienne URL peut encore être affichée le temps d'un rendu.
  if (hit) setTimeout(() => URL.revokeObjectURL(hit.url), 10000);
  urls.set(id, { data, url });
  return url;
}
