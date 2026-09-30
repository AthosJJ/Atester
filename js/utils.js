/* Petits utilitaires partagés : DOM, texte, dates, couleurs, stockage local. */
import { AVATAR_COLORS } from './config.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

export const uid = () => (crypto.randomUUID
  ? crypto.randomUUID()
  : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));

export const nowISO = () => new Date().toISOString();

/* Date du jour en heure locale (toISOString donnerait la veille après minuit en été). */
export function localDateISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ——— Texte ——— */

/* Minuscules, sans accents ni ligatures : « Café » et « cafe » se valent. */
export function norm(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/ß/g, 'ss')
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/* Clé de comparaison des titres (doublons) : lettres et chiffres seulement. */
export const titleKey = (s) => norm(s).replace(/[^a-z0-9]+/g, '');

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function initials(name) {
  const words = String(name || '').trim().split(/[\s\-_.]+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (!words.length) return '?';
  if (words.length === 1) return [...words[0]][0].toUpperCase();
  return ([...words[0]][0] + [...words[1]][0]).toUpperCase();
}

/* « 1 lieu », « 0 lieu », « 3 lieux » */
export const plural = (n, [one, many]) => `${n} ${n > 1 ? many : one}`;

export const fmtNumber = (n, digits = 1) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: digits });

export function listFr(items) {
  const a = items.filter(Boolean);
  if (a.length <= 1) return a.join('');
  return a.slice(0, -1).join(', ') + ' et ' + a[a.length - 1];
}

/* Ajoute https:// à « instagram.com/xyz » ; refuse les schémas exotiques. */
export function safeUrl(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return '';
  return 'https://' + u.replace(/^\/+/, '');
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

/* ——— Dates ——— */

export function parseDate(iso) {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d, 12);
  }
  const d = new Date(iso);
  return isNaN(d) ? null : d;
}

export function daysAgo(iso) {
  const d = parseDate(iso);
  if (!d) return null;
  const t = new Date();
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((b - a) / 86400000);
}

export function shortDate(iso) {
  const d = parseDate(iso);
  if (!d) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function longDate(iso) {
  const d = parseDate(iso);
  return d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
}

/* « aujourd'hui », « hier », « il y a 3 jours », puis « 12 sept. » au-delà d'un mois. */
export function relDate(iso) {
  const n = daysAgo(iso);
  if (n === null) return '';
  if (n < 0) return shortDate(iso);
  if (n === 0) return 'aujourd’hui';
  if (n === 1) return 'hier';
  if (n <= 30) return `il y a ${n} jours`;
  return shortDate(iso);
}

/* ——— Couleurs ——— */

export function hexToRgb(hex) {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (isNaN(n) || h.length !== 6) return [138, 143, 152];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance(hex) {
  const c = hexToRgb(hex).map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const DARK_INK = '#1E1A16';

/* Couleur d'encre lisible sur une pastille : blanc dès que possible
   (≥ 3:1 pour une icône, meilleur des deux pour du texte). */
export function inkOn(hex, { text = false } = {}) {
  const w = contrast(hex, '#FFFFFF');
  if (text) return w >= contrast(hex, DARK_INK) ? '#FFFFFF' : DARK_INK;
  return w >= 3 ? '#FFFFFF' : DARK_INK;
}

export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function hashString(s) {
  let h = 2166136261;
  for (const c of norm(s)) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export const colorFromName = (name) => AVATAR_COLORS[hashString(name) % AVATAR_COLORS.length];

/* ——— Divers ——— */

export function debounce(fn, ms) {
  let t = null;
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => { t = null; fn(...args); }, ms); };
  d.cancel = () => { clearTimeout(t); t = null; };
  return d;
}

/* Distance à vol d'oiseau (formule de haversine), en km. */
export function distanceKm(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function fmtDistance(km) {
  if (km == null || !isFinite(km)) return '';
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  if (km < 10) return `${fmtNumber(km, 1)} km`;
  return `${Math.round(km)} km`;
}

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

export const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* localStorage peut être indisponible (navigation privée) : jamais bloquant. */
export function lsGet(key, fallback = null) {
  try {
    const v = localStorage.getItem('a-tester:' + key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
export function lsSet(key, value) {
  try {
    if (value === undefined || value === null) localStorage.removeItem('a-tester:' + key);
    else localStorage.setItem('a-tester:' + key, JSON.stringify(value));
  } catch { /* stockage plein ou interdit */ }
}

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Chargement impossible : ' + src));
    document.head.appendChild(s);
  });
}

export function loadCss(href) {
  if ($(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  document.head.appendChild(l);
}

/* Retour haptique léger : Safari iOS 18+ vibre quand on bascule un
   <input switch>. Sans effet ailleurs. */
let hapticLabel = null;
export function haptic() {
  try {
    if (!IS_IOS) return;
    if (!hapticLabel) {
      hapticLabel = document.createElement('label');
      hapticLabel.setAttribute('aria-hidden', 'true');
      hapticLabel.style.cssText = 'position:fixed;left:-99px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      hapticLabel.appendChild(input);
      document.body.appendChild(hapticLabel);
    }
    hapticLabel.click();
  } catch { /* rien */ }
}

/* Copie dans le presse-papiers, avec repli pour les vieux Safari. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-100px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}
