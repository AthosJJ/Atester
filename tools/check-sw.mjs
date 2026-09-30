/* Vérifie que tous les fichiers servis sont pré-cachés par sw.js, et que
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

let ok = true;
if (missing.length) { ok = false; console.log('Absents de SHELL :\n  ' + missing.join('\n  ')); }
if (extra.length) { ok = false; console.log('Listés mais introuvables :\n  ' + extra.join('\n  ')); }
if (cacheVersion !== appVersion) { ok = false; console.log(`Versions différentes : sw.js ${cacheVersion} / config.js ${appVersion}`); }
console.log(ok ? `OK : ${listed.size} fichiers pré-cachés, version ${appVersion}` : 'À corriger.');
process.exit(ok ? 0 : 1);
