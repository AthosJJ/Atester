/* Extrait les icônes Lucide utilisées par l'app dans js/components/icons.js.
   Usage : npm pack lucide-static && tar -xzf lucide-static-*.tgz
           node tools/extract-icons.mjs package/icons
   Ajouter une icône = l'ajouter à NAMES puis relancer le script. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = process.argv[2];
if (!SRC) {
  console.error('Usage : node tools/extract-icons.mjs <dossier icons de lucide-static>');
  process.exit(1);
}

const NAMES = [
  // Navigation et interface
  'map-pin', 'clapperboard', 'headphones', 'users', 'plus', 'settings', 'search', 'sliders-horizontal',
  'x', 'check', 'star', 'heart', 'chevron-left', 'chevron-right', 'chevron-down', 'ellipsis', 'pencil',
  'trash-2', 'share', 'download', 'upload', 'calendar', 'link', 'sun', 'moon', 'sun-moon', 'rotate-ccw',
  'undo-2', 'clock', 'circle-check', 'thumbs-down', 'eye', 'eye-off', 'key-round', 'sparkles', 'git-merge',
  'user', 'user-plus', 'info', 'triangle-alert', 'wifi-off', 'refresh-cw', 'arrow-down-up', 'map', 'list',
  'layout-grid', 'locate-fixed', 'navigation', 'copy', 'external-link', 'grip-vertical', 'image',
  'square-plus', 'database', 'shield', 'move-horizontal', 'circle-x', 'minus', 'quote', 'scan-search',
  'history', 'badge-check', 'party-popper', 'wand-sparkles', 'palette', 'tag', 'loader-circle',
  'file-json', 'cloud-off', 'maximize', 'compass', 'circle-dot', 'message-circle',
  // Sous-catégories par défaut
  'utensils', 'wine', 'coffee', 'croissant', 'landmark', 'trees', 'shopping-bag', 'bed',
  'film', 'tv', 'video', 'scroll-text', 'flask-conical', 'briefcase', 'laugh', 'trophy', 'sprout', 'mic',
  // Choix supplémentaires pour les sous-catégories personnalisées
  'pizza', 'soup', 'fish', 'ice-cream-cone', 'cake-slice', 'beer', 'martini', 'chef-hat', 'sandwich',
  'castle', 'church', 'ticket', 'drama', 'music', 'camera', 'book-open', 'library', 'mountain', 'waves',
  'tent', 'bike', 'footprints', 'sailboat', 'shirt', 'gem', 'gift', 'flower-2', 'hotel', 'house', 'store',
  'popcorn', 'monitor-play', 'gamepad-2', 'radio', 'podcast', 'globe', 'newspaper', 'brain', 'baby', 'dog',
  'car', 'plane', 'train-front', 'dumbbell', 'heart-pulse', 'leaf', 'binoculars', 'compass'
];

const unique = [...new Set(NAMES)];
const entries = unique.map((name) => {
  const svg = readFileSync(join(SRC, name + '.svg'), 'utf8');
  const inner = svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>[\s\S]*$/, '')
    .replace(/\s*\n\s*/g, '')
    .replace(/\s*\/>/g, '/>')
    .trim();
  return `  '${name}': '${inner.replace(/'/g, "\\'")}'`;
});

const version = JSON.parse(readFileSync(join(SRC, '..', 'package.json'), 'utf8')).version;
const out = `/* Icônes Lucide v${version} (https://lucide.dev, licence ISC), trait de 2 px.
   Fichier généré par tools/extract-icons.mjs : ne pas modifier à la main. */

export const ICONS = {
${entries.join(',\n')}
};

/* SVG inline : la couleur suit currentColor. */
export function icon(name, { size = 20, cls = '', stroke = 2 } = {}) {
  const body = ICONS[name] || ICONS['circle-dot'];
  return \`<svg class="i\${cls ? ' ' + cls : ''}" width="\${size}" height="\${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="\${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">\${body}</svg>\`;
}
`;

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'js', 'components', 'icons.js');
writeFileSync(target, out);
console.log(`${unique.length} icônes écrites dans ${target}`);
