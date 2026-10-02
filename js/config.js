/* Configuration : catégories, sous-catégories par défaut, libellés, palettes.
   APP_VERSION doit suivre CACHE_VERSION de sw.js (a-tester-vX.Y.Z). */

export const APP_VERSION = '1.3.0';
export const APP_ID = 'a-tester';
export const SCHEMA_VERSION = 1;

export const API_TIMEOUT = 8000;        // délai maximal d'un appel externe
export const SEARCH_DEBOUNCE = 350;     // suggestions de l'ajout rapide
export const TEXT_DEBOUNCE = 200;       // recherche texte des listes
export const BACKUP_REMINDER_DAYS = 14;
export const CLUSTER_THRESHOLD = 30;    // au-delà, les épingles se regroupent

export const CATEGORY_KEYS = ['place', 'screen', 'podcast'];

export const CATEGORIES = {
  place: {
    key: 'place', tab: 'lieux', label: 'Lieux', one: 'Lieu', icon: 'map-pin',
    noun: ['lieu', 'lieux'], placeholder: 'Nom du lieu, et la ville si besoin'
  },
  screen: {
    key: 'screen', tab: 'ecrans', label: 'Films & séries', one: 'Film ou série', icon: 'clapperboard',
    noun: ['titre', 'titres'], placeholder: 'Titre du film ou de la série'
  },
  podcast: {
    key: 'podcast', tab: 'podcasts', label: 'Podcasts', one: 'Podcast', icon: 'headphones',
    noun: ['podcast', 'podcasts'], placeholder: "Nom de l'émission"
  }
};

export const TABS = [
  { route: 'lieux', category: 'place', label: 'Lieux', icon: 'map-pin' },
  { route: 'ecrans', category: 'screen', label: 'Films & séries', icon: 'clapperboard' },
  { route: 'podcasts', category: 'podcast', label: 'Podcasts', icon: 'headphones' },
  { route: 'personnes', category: null, label: 'Personnes', icon: 'users' }
];

export const TAB_OF = { place: 'lieux', screen: 'ecrans', podcast: 'podcasts' };
export const CAT_OF = { lieux: 'place', ecrans: 'screen', podcasts: 'podcast' };

/* Les libellés de statut s'adaptent à la catégorie. */
export const STATUS = {
  place: { todo: 'À tester', done: 'Testé', dropped: 'Pas pour moi', mark: 'Marquer comme testé', back: 'Remettre à tester', cheer: 'Testé !' },
  screen: { todo: 'À voir', done: 'Vu', dropped: 'Pas pour moi', mark: 'Marquer comme vu', back: 'Remettre à voir', cheer: 'Vu !' },
  podcast: { todo: 'À écouter', done: 'Écouté', dropped: 'Pas pour moi', mark: 'Marquer comme écouté', back: 'Remettre à écouter', cheer: 'Écouté !' }
};
export const STATUS_KEYS = ['todo', 'done', 'dropped'];

export const DEFAULT_SUBCATEGORIES = {
  place: [
    { key: 'restaurant', label: 'Restaurant', icon: 'utensils', color: '#E4572E' },
    { key: 'bar', label: 'Bar', icon: 'wine', color: '#8E5CC4' },
    { key: 'cafe', label: 'Café', icon: 'coffee', color: '#9C6644' },
    { key: 'boulangerie', label: 'Boulangerie & pâtisserie', icon: 'croissant', color: '#E9A23B' },
    { key: 'expo', label: 'Expo & musée', icon: 'landmark', color: '#3A7BD5' },
    { key: 'balade', label: 'Balade & nature', icon: 'trees', color: '#3E9B5F' },
    { key: 'boutique', label: 'Boutique', icon: 'shopping-bag', color: '#D6518C' },
    { key: 'hebergement', label: 'Hébergement', icon: 'bed', color: '#4F6D7A' },
    { key: 'other', label: 'Autre', icon: 'map-pin', color: '#8A8F98' }
  ],
  screen: [
    { key: 'film', label: 'Film', icon: 'film', color: '#D1495B' },
    { key: 'serie', label: 'Série', icon: 'tv', color: '#5B6CE0' },
    { key: 'documentaire', label: 'Documentaire', icon: 'video', color: '#2E9C8F' },
    { key: 'other', label: 'Autre', icon: 'clapperboard', color: '#8A8F98' }
  ],
  podcast: [
    { key: 'societe', label: 'Société', icon: 'users', color: '#D9694A' },
    { key: 'culture', label: 'Culture', icon: 'palette', color: '#9B5DE5' },
    { key: 'histoire', label: 'Histoire', icon: 'scroll-text', color: '#A47148' },
    { key: 'sciences', label: 'Sciences', icon: 'flask-conical', color: '#2F8FD8' },
    { key: 'business', label: 'Business', icon: 'briefcase', color: '#3D8B5A' },
    { key: 'humour', label: 'Humour', icon: 'laugh', color: '#E3A21A' },
    { key: 'sport', label: 'Sport', icon: 'trophy', color: '#E4572E' },
    { key: 'dev-perso', label: 'Développement perso', icon: 'sprout', color: '#58A55C' },
    { key: 'other', label: 'Autre', icon: 'headphones', color: '#8A8F98' }
  ]
};

/* Avatars : 10 teintes où les initiales blanches restent lisibles (≥ 4,5:1),
   et qui se détachent aussi sur le fond sombre. */
export const AVATAR_COLORS = [
  '#C2553B', '#2F7D5B', '#3F6FD1', '#8A55C0', '#9A6210',
  '#C0406F', '#1F7F8C', '#8C5A3C', '#5B6B7C', '#6A5ACD'
];

/* Nuancier proposé pour les sous-catégories. */
export const SUBCAT_COLORS = [
  '#E4572E', '#D1495B', '#D6518C', '#8E5CC4', '#9B5DE5', '#5B6CE0', '#3A7BD5', '#2F8FD8',
  '#2E9C8F', '#3E9B5F', '#58A55C', '#E3A21A', '#E9A23B', '#A47148', '#9C6644', '#4F6D7A', '#8A8F98'
];

/* Icônes proposées pour les sous-catégories personnalisées. */
export const PICKER_ICONS = [
  'utensils', 'pizza', 'soup', 'fish', 'sandwich', 'chef-hat', 'ice-cream-cone', 'cake-slice', 'croissant',
  'coffee', 'wine', 'beer', 'martini', 'landmark', 'castle', 'church', 'ticket', 'drama', 'music', 'camera',
  'palette', 'book-open', 'library', 'trees', 'mountain', 'waves', 'tent', 'bike', 'footprints', 'sailboat',
  'binoculars', 'compass', 'shopping-bag', 'store', 'shirt', 'gem', 'gift', 'flower-2', 'bed', 'hotel', 'house',
  'map-pin', 'film', 'tv', 'video', 'clapperboard', 'popcorn', 'monitor-play', 'gamepad-2', 'headphones', 'mic',
  'radio', 'podcast', 'users', 'scroll-text', 'flask-conical', 'brain', 'briefcase', 'newspaper', 'globe',
  'laugh', 'trophy', 'dumbbell', 'heart-pulse', 'sprout', 'leaf', 'baby', 'dog', 'car', 'plane', 'train-front',
  'heart', 'star', 'sparkles'
];

export const SORTS = [
  { key: 'recent', label: 'Plus récent' },
  { key: 'oldest', label: 'Plus ancien' },
  { key: 'rating', label: 'Meilleure note' },
  { key: 'alpha', label: 'Alphabétique' },
  { key: 'distance', label: 'Distance', only: 'place' },
  { key: 'most', label: 'Le plus recommandé' }
];

export const EMPTY = {
  place: { title: 'Aucun lieu pour l’instant', text: 'La prochaine fois qu’on te conseille une adresse, ajoute-la avec +' },
  screen: { title: 'Rien à voir pour l’instant', text: 'Ajoute la prochaine série qu’on te conseille' },
  podcast: { title: 'Aucun podcast', text: 'Personne ne t’a encore conseillé de podcast' },
  persons: { title: 'Personne pour l’instant', text: 'Les personnes apparaissent ici dès ta première recommandation' },
  filtered: { title: 'Aucun résultat avec ces filtres', text: 'Essaie d’en retirer un ou deux.' }
};

/* Fonds de carte OpenFreeMap : données OpenStreetMap, gratuits, sans clé ni
   compte. Dessinés en vectoriel par MapLibre (nets sur écran Retina), libellés
   en français. « liberty » : couleurs douces ; « positron » : épuré ; « dark »
   en thème sombre. */
const OFM = 'https://tiles.openfreemap.org';
export const MAP_STYLES = {
  liberty: { label: 'Couleurs douces', url: `${OFM}/styles/liberty` },
  positron: { label: 'Épuré', url: `${OFM}/styles/positron` },
  dark: { label: 'Sombre', url: `${OFM}/styles/dark` }
};
export const MAP_ATTRIBUTION = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
/* Repli (pas de WebGL, OpenFreeMap injoignable) : tuiles OpenStreetMap classiques. */
export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
export const MAP_MAX_ZOOM = 20;

/* Applications d'itinéraire proposées (on ne peut pas savoir lesquelles sont installées). */
export const NAV_APPS = [
  { key: 'apple', label: 'Plans', icon: 'map' },
  { key: 'google', label: 'Google Maps', icon: 'map-pin' },
  { key: 'waze', label: 'Waze', icon: 'navigation' }
];
export const DEFAULT_MAP_VIEW = { lat: 46.6, lng: 2.4, zoom: 5 }; // France entière
