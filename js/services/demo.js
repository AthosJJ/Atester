/* Jeu d'exemples (4 personnes, 15 recommandations), chargeable et retirable
   en un geste sans toucher aux vraies données : les identifiants créés sont
   notés dans meta.demo. */
import { getMeta, setMeta } from '../store/settings.js';
import { allRecos, normalizeReco, putRecos, deleteRecos } from '../store/recommendations.js';
import { allPersons, findByName, me, putPersons, deletePersons, ensureMe } from '../store/persons.js';
import { emit } from '../store/events.js';
import { uid, nowISO, localDateISO, colorFromName } from '../utils.js';

const ago = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localDateISO(d);
};

const ITEMS = [
  // Lieux
  { category: 'place', subcategory: 'restaurant', title: 'Le Bouchon des Filles', who: ['Paul'], days: 3, theirNote: 'Prendre la quenelle',
    details: { address: '20 rue Sergent Blandan', city: 'Lyon', lat: 45.7686, lng: 4.8290, source: 'manual' } },
  { category: 'place', subcategory: 'expo', title: 'Musée des Confluences', who: ['Marie'], days: 40, status: 'done', rating: 4,
    theirNote: 'L’expo permanente, puis le toit-terrasse', myReview: 'Superbe bâtiment, prévoir 3 h.',
    details: { address: '86 quai Perrache', city: 'Lyon', lat: 45.7326, lng: 4.8180, source: 'manual' } },
  { category: 'place', subcategory: 'balade', title: 'Parc de la Tête d’Or', who: ['Léa', 'Paul'], days: 12, favorite: true,
    theirNote: 'Le tour du lac au coucher du soleil', details: { address: 'Boulevard des Belges', city: 'Lyon', lat: 45.7772, lng: 4.8554, source: 'manual' } },
  { category: 'place', subcategory: 'cafe', title: 'Café des Pentes', who: ['Moi'], days: 1, theirNote: 'Repéré en passant : flat white et cookies',
    details: { address: 'Montée de la Grande-Côte', city: 'Lyon', lat: 45.7712, lng: 4.8318, source: 'manual' } },
  { category: 'place', subcategory: 'boutique', title: 'Les Halles Paul Bocuse', who: ['Marie'], days: 20, theirNote: 'Les fromages et les huîtres le dimanche',
    details: { address: '102 cours Lafayette', city: 'Lyon', lat: 45.7630, lng: 4.8506, source: 'manual' } },
  { category: 'place', subcategory: 'hebergement', title: 'Maison d’hôtes Les Oliviers', who: ['Léa'], days: 60, theirNote: 'Chambres magnifiques, petit-déjeuner au jardin',
    details: { address: '', city: 'Arles' } },
  // Films et séries
  { category: 'screen', subcategory: 'serie', title: 'The Bear', who: ['Paul'], days: 5, theirNote: 'À partir de la saison 2',
    details: { year: '2022', genres: ['Drame', 'Comédie'], platforms: ['Disney Plus'], overview: 'Un jeune chef reprend la sandwicherie familiale à Chicago.' } },
  { category: 'screen', subcategory: 'film', title: 'Anatomie d’une chute', who: ['Marie'], days: 70, status: 'done', rating: 5,
    theirNote: 'Sandra Hüller est incroyable', myReview: 'Deux heures et demie qui passent en un souffle.',
    details: { year: '2023', genres: ['Drame', 'Thriller'] } },
  { category: 'screen', subcategory: 'serie', title: 'Le Bureau des légendes', who: ['Karim', 'Paul'], days: 30, theirNote: 'La meilleure série française',
    details: { year: '2015', genres: ['Drame'], platforms: ['Canal+'] } },
  { category: 'screen', subcategory: 'film', title: 'Past Lives', who: ['Léa'], days: 8, favorite: true, theirNote: 'À voir en VO',
    details: { year: '2023', genres: ['Drame', 'Romance'] } },
  { category: 'screen', subcategory: 'documentaire', title: 'Free Solo', who: ['Karim'], days: 90, status: 'done', rating: 4,
    theirNote: 'Vertigineux', details: { year: '2018', genres: ['Documentaire'] } },
  // Podcasts
  { category: 'podcast', subcategory: 'histoire', title: 'Affaires sensibles', who: ['Marie'], days: 2, theirNote: 'Idéal pour les trajets',
    details: { showName: 'Affaires sensibles', author: 'France Inter' } },
  { category: 'podcast', subcategory: 'societe', title: 'Les Pieds sur terre', who: ['Léa'], days: 45, status: 'done', rating: 4,
    theirNote: 'Des histoires vraies, en une demi-heure', details: { showName: 'Les Pieds sur terre', author: 'France Culture' } },
  { category: 'podcast', subcategory: 'sciences', title: 'La Méthode scientifique', who: ['Karim'], days: 15, theirNote: 'Clair et passionnant',
    details: { showName: 'La Méthode scientifique', author: 'France Culture' } },
  { category: 'podcast', subcategory: 'business', title: 'Génération Do It Yourself', who: ['Paul'], days: 100, status: 'dropped',
    theirNote: 'Les interviews d’entrepreneurs', details: { showName: 'Génération Do It Yourself', author: 'Matthieu Stefani' } }
];

export function hasDemo() {
  const ids = new Set(getMeta('demo', null)?.recos || []);
  return ids.size > 0 && allRecos().some((r) => ids.has(r.id));
}

export async function loadDemo() {
  await ensureMe();
  const created = [];
  const people = new Map([['Moi', me()]]);
  for (const name of ['Paul', 'Marie', 'Léa', 'Karim']) {
    const existing = findByName(name);
    if (existing) { people.set(name, existing); continue; }
    const p = { id: uid(), name, color: colorFromName(name), isMe: false, createdAt: nowISO() };
    created.push(p);
    people.set(name, p);
  }
  await putPersons(created, { silent: true });

  const now = Date.now();
  const recos = ITEMS.map((it, i) => {
    const at = new Date(now - (it.days * 86400000) - i * 60000).toISOString();
    return normalizeReco({
      ...it,
      id: uid(),
      personIds: it.who.map((n) => people.get(n).id),
      recommendedAt: ago(it.days),
      createdAt: at,
      updatedAt: at,
      doneAt: it.status === 'done' ? at : null
    });
  });
  await putRecos(recos, { silent: true });
  const prev = getMeta('demo', null) || { recos: [], persons: [] };
  await setMeta('demo', { recos: [...prev.recos, ...recos.map((r) => r.id)], persons: [...prev.persons, ...created.map((p) => p.id)] }, true);
  emit('change', { type: 'demo' });
  return recos.length;
}

/* Retire les exemples ; une personne d'exemple réutilisée dans une vraie
   recommandation est gardée. */
export async function removeDemo() {
  const demo = getMeta('demo', null);
  if (!demo) return 0;
  const ids = new Set(demo.recos);
  const toDelete = allRecos().filter((r) => ids.has(r.id)).map((r) => r.id);
  await deleteRecos(toDelete, { silent: true });
  const still = new Set(allRecos().flatMap((r) => r.personIds));
  const persons = allPersons().filter((p) => demo.persons.includes(p.id) && !still.has(p.id)).map((p) => p.id);
  await deletePersons(persons, { silent: true });
  await setMeta('demo', null, true);
  emit('change', { type: 'demo-remove' });
  return toDelete.length;
}
