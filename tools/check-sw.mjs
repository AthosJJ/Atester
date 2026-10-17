/* Vérifie que tous les fichiers servis sont pré-cachés par sw.js, que le SDK
   Firebase importé par l'app (CDN) l'est aussi, à la même version, et que
   CACHE_VERSION (sw.js) et APP_VERSION (js/config.js) concordent.
   Usage : node tools/check-sw.mjs */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
const listed = new Set([...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const served = ['index.html', 'manifest.webmanifest',
  ...['css', 'js', 'vendor', 'icons'].flatMap((d) => walk(join(ROOT, d)).map((p) => relative(ROOT, p)))]
  .filter((p) => /\.(html|webmanifest|css|m?js|png)$/.test(p) && !p.startsWith('icons/splash/'));

const missing = served.filter((p) => !listed.has(p));
const extra = [...listed].filter((p) => !existsSync(join(ROOT, p)));
const cacheVersion = (sw.match(/CACHE_VERSION = 'a-tester-v([^']+)'/) || [])[1];
const appVersion = (readFileSync(join(ROOT, 'js', 'config.js'), 'utf8').match(/APP_VERSION = '([^']+)'/) || [])[1];

/* SDK Firebase : chaque URL importée par l'app est pré-cachée, une seule version. */
const SDK_URL = /'(https:\/\/www\.gstatic\.com\/firebasejs\/[^']+)'/g;
const sdkListed = new Set([...sw.matchAll(SDK_URL)].map((m) => m[1]));
const sdkUsed = new Set(walk(join(ROOT, 'js')).filter((p) => p.endsWith('.js'))
  .flatMap((p) => [...readFileSync(p, 'utf8').matchAll(/from (['"])(https:\/\/www\.gstatic\.com\/firebasejs\/[^'"]+)\1/g)].map((m) => m[2])));
const sdkMissing = [...sdkUsed].filter((u) => !sdkListed.has(u));
const sdkExtra = [...sdkListed].filter((u) => !sdkUsed.has(u));
const fbVersion = (readFileSync(join(ROOT, 'js', 'services', 'firebase.js'), 'utf8').match(/FIREBASE_VERSION = '([^']+)'/) || [])[1];
const sdkVersions = new Set([...sdkUsed, ...sdkListed].map((u) => u.split('/')[4]));

let ok = true;
if (missing.length) { ok = false; console.log('Absents de SHELL :\n  ' + missing.join('\n  ')); }
if (sdkMissing.length) { ok = false; console.log('SDK importé mais absent de SDK :\n  ' + sdkMissing.join('\n  ')); }
if (sdkExtra.length) { ok = false; console.log('SDK pré-caché mais jamais importé :\n  ' + sdkExtra.join('\n  ')); }
if (sdkVersions.size > 1 || (sdkVersions.size && !sdkVersions.has(fbVersion))) {
  ok = false;
  console.log(`Versions du SDK différentes : ${[...sdkVersions].join(', ')} / FIREBASE_VERSION ${fbVersion}`);
}
if (extra.length) { ok = false; console.log('Listés mais introuvables :\n  ' + extra.join('\n  ')); }
if (cacheVersion !== appVersion) { ok = false; console.log(`Versions différentes : sw.js ${cacheVersion} / config.js ${appVersion}`); }
console.log(ok ? `OK : ${listed.size} fichiers et ${sdkListed.size} fichiers du SDK Firebase ${fbVersion} pré-cachés, version ${appVersion}` : 'À corriger.');
process.exit(ok ? 0 : 1);
