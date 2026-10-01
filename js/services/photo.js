/* Photo d'une personne : carré de 320 px en JPEG (environ 30 Ko), stocké en
   data URL avec la personne, donc inclus dans la sauvegarde JSON. L'affichage
   passe par des URL blob mises en cache (une par personne), pour ne pas
   recopier la photo dans chaque rendu. */

export const PHOTO_SIZE = 320;
export const PHOTO_MAX_LENGTH = 400000; // au-delà, la photo d'un import est ignorée
const SOURCE_MAX = 2048;                 // côté maximal gardé en mémoire (canvas iOS)
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

export const isPhoto = (s) => typeof s === 'string' && s.length <= PHOTO_MAX_LENGTH && DATA_URL.test(s);

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

/* Découpe le carré (sx, sy, côté) de la source et le réduit par moitiés
   successives jusqu'à 320 px : net, sans moiré. */
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
  const data = c.toDataURL('image/jpeg', 0.82);
  free(c);
  return data;
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
