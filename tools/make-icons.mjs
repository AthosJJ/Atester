/* Génère les icônes PWA et les écrans de lancement iOS, sans dépendance.
   Usage : node tools/make-icons.mjs
   Motif : bulle de conversation crème (« on m'a conseillé ») et coche
   corail (« testé »), sur un dégradé encre (palette « Encre »). Rendu par
   champs de distance signée, avec anticrénelage. */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'icons');
mkdirSync(join(OUT, 'splash'), { recursive: true });

/* — Encodeur PNG minimal (RGB 8 bits) — */
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodePNG(w, h, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RGB
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* — Outils — */
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = clamp01((pax * bax + pay * bay) / (bax * bax + bay * bay));
  return Math.hypot(pax - bax * h, pay - bay * h);
}
/* Triangle (distance exacte, d'après I. Quilez). */
function sdTriangle(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const e0 = [bx - ax, by - ay], e1 = [cx - bx, cy - by], e2 = [ax - cx, ay - cy];
  const v0 = [px - ax, py - ay], v1 = [px - bx, py - by], v2 = [px - cx, py - cy];
  const proj = (v, e) => {
    const t = clamp01((v[0] * e[0] + v[1] * e[1]) / (e[0] * e[0] + e[1] * e[1]));
    return [v[0] - e[0] * t, v[1] - e[1] * t];
  };
  const pq0 = proj(v0, e0), pq1 = proj(v1, e1), pq2 = proj(v2, e2);
  const s = Math.sign(e0[0] * e2[1] - e0[1] * e2[0]);
  const d0 = [pq0[0] ** 2 + pq0[1] ** 2, s * (v0[0] * e0[1] - v0[1] * e0[0])];
  const d1 = [pq1[0] ** 2 + pq1[1] ** 2, s * (v1[0] * e1[1] - v1[1] * e1[0])];
  const d2 = [pq2[0] ** 2 + pq2[1] ** 2, s * (v2[0] * e2[1] - v2[1] * e2[0])];
  const dmin = Math.min(d0[0], d1[0], d2[0]);
  const smin = Math.min(d0[1], d1[1], d2[1]);
  return -Math.sqrt(dmin) * Math.sign(smin);
}

const BG_A = hex('#4E433C');
const BG_B = hex('#1A1512');
const WHITE = hex('#FFF8F2');
const CHECK = hex('#E8846A');

/* Couleur d'un point du glyphe (coordonnées normalisées 0–1), s = taille en px. */
function glyph(u, v, s, scale = 1) {
  // Recentrage pour le mode « maskable » (glyphe plus petit).
  const x = 0.5 + (u - 0.5) / scale;
  const y = 0.5 + (v - 0.5) / scale;
  const px = 1 / (s * scale); // un pixel en unités normalisées

  // Fond : dégradé diagonal + halo clair en haut à gauche
  const t = clamp01((u * 0.55 + v * 0.8) / 1.25);
  let col = mix(BG_A, BG_B, t);
  const glow = Math.max(0, 1 - Math.hypot(u - 0.2, v - 0.12) / 0.75);
  col = mix(col, [120, 98, 86], glow * 0.35);

  // Bulle : rectangle arrondi + queue
  const body = sdRoundRect(x, y, 0.5, 0.46, 0.285, 0.215, 0.14);
  const tail = sdTriangle(x, y, [0.335, 0.58], [0.285, 0.775], [0.5, 0.64]) - 0.012;
  const bubble = Math.min(body, tail);

  // Ombre douce sous la bulle
  const shadowD = Math.min(
    sdRoundRect(x, y - 0.03, 0.5, 0.46, 0.285, 0.215, 0.14),
    sdTriangle(x, y - 0.03, [0.335, 0.58], [0.285, 0.775], [0.5, 0.64]) - 0.012
  );
  const shadow = (1 - smooth(-0.02, 0.07, shadowD)) * 0.45;
  col = mix(col, [8, 6, 5], shadow);

  const aBubble = clamp01(0.5 - bubble / px);
  col = mix(col, WHITE, aBubble);

  // Coche
  const th = 0.047;
  const dCheck = Math.min(
    sdSegment(x, y, 0.385, 0.465, 0.47, 0.545),
    sdSegment(x, y, 0.47, 0.545, 0.635, 0.38)
  ) - th;
  const aCheck = clamp01(0.5 - dCheck / px) * aBubble;
  col = mix(col, CHECK, aCheck);
  return col;
}

function renderIcon(size, scale = 1) {
  const rgb = Buffer.alloc(size * size * 3);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      // 4 échantillons par pixel pour lisser le fond et l'ombre
      let r = 0, g = 0, b = 0;
      for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const c = glyph((i + ox) / size, (j + oy) / size, size, scale);
        r += c[0]; g += c[1]; b += c[2];
      }
      const o = (j * size + i) * 3;
      rgb[o] = Math.round(r / 4); rgb[o + 1] = Math.round(g / 4); rgb[o + 2] = Math.round(b / 4);
    }
  }
  return encodePNG(size, size, rgb);
}

/* Écran de lancement : fond crème, icône arrondie au centre. */
function renderSplash(w, h) {
  const BG = hex('#FAF6F1');
  const rgb = Buffer.alloc(w * h * 3);
  const size = Math.round(Math.min(w, h) * 0.24);
  const x0 = Math.round((w - size) / 2);
  const y0 = Math.round((h - size) / 2 - h * 0.04);
  const radius = size * 0.225;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const o = (j * w + i) * 3;
      let col = BG;
      if (i >= x0 - 2 && i < x0 + size + 2 && j >= y0 - 2 && j < y0 + size + 2) {
        const u = (i + 0.5 - x0) / size;
        const v = (j + 0.5 - y0) / size;
        const d = sdRoundRect(u, v, 0.5, 0.5, 0.5, 0.5, radius / size) * size;
        const a = clamp01(0.5 - d);
        if (a > 0) col = mix(BG, glyph(u, v, size), a);
      }
      rgb[o] = Math.round(col[0]); rgb[o + 1] = Math.round(col[1]); rgb[o + 2] = Math.round(col[2]);
    }
  }
  return encodePNG(w, h, rgb);
}

const ICONS = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.86],
  ['apple-touch-icon.png', 180, 1],
  ['favicon-64.png', 64, 1]
];
for (const [name, size, scale] of ICONS) {
  writeFileSync(join(OUT, name), renderIcon(size, scale));
  console.log('✓', name);
}

/* Tailles d'écran des iPhone récents (portrait, pixels physiques). */
export const SPLASH = [
  [750, 1334, 375, 667, 2], [1242, 2208, 414, 736, 3], [1125, 2436, 375, 812, 3],
  [828, 1792, 414, 896, 2], [1242, 2688, 414, 896, 3], [1080, 2340, 360, 780, 3],
  [1170, 2532, 390, 844, 3], [1179, 2556, 393, 852, 3], [1284, 2778, 428, 926, 3],
  [1290, 2796, 430, 932, 3], [1206, 2622, 402, 874, 3], [1320, 2868, 440, 956, 3]
];
if (!process.argv.includes('--no-splash')) {
  for (const [w, h] of SPLASH) {
    writeFileSync(join(OUT, 'splash', `splash-${w}x${h}.png`), renderSplash(w, h));
    console.log('✓', `splash-${w}x${h}.png`);
  }
}
