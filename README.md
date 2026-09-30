# À tester

PWA pour iPhone qui garde les recommandations qu'on te fait — **lieux**, **films et séries**, **podcasts** — avec la personne qui te les a conseillées. On les retrouve par personne, par catégorie ou sur une carte. 100 % local : pas de compte, pas de serveur, fonctionne hors ligne. HTML, CSS et JavaScript vanilla, sans étape de build.

Cahier des charges : [SPEC.md](SPEC.md) · Améliorations ergonomiques intégrées : [AMELIORATIONS.md](AMELIORATIONS.md)

## Fonctionnalités

- **Ajout rapide en un écran** (bouton + central) : catégorie pré-sélectionnée, clavier ouvert sur « Quoi », suggestions dès 3 caractères (lieux via Photon/OpenStreetMap, films et séries via TMDB, podcasts via iTunes), « Je suis devant » (position GPS et adresse), personnes récentes en un tap, sous-catégorie devinée, détection des doublons (« Déjà recommandé par Paul — ajouter Marie ? »), brouillon conservé.
- **Lieux** : carte Leaflet (épingles colorées par sous-catégorie, groupes au-delà de 30, recadrage automatique, aperçu flottant, itinéraire dans Plans, « Me localiser ») ou liste avec distances, « Zone de la carte ».
- **Films et séries** : grille d'affiches 2:3, plateformes en France (JustWatch via TMDB), « Actualiser les plateformes ».
- **Podcasts** : pochettes, épisode précis, « Ouvrir dans Podcasts ».
- **Personnes** : compteurs par catégorie, note moyenne, fiche avec « Ses lieux sur la carte », « Ajouter une recommandation de… », renommer, couleur, fusionner, supprimer.
- **Filtres** communs (personne, sous-catégorie, statut, ville, plateforme, favoris, note minimale) combinables, compteur en direct, valeurs sans résultat grisées, puces retirables, recherche sans accents, tri ; tout est gardé dans l'URL et sur l'appareil.
- **Statuts** : balayage à gauche pour « testé » (note et avis facultatifs), à droite pour favori ; appui long pour les actions rapides ; annulation partout.
- **Sauvegarde** : export JSON par la feuille de partage (Enregistrer dans Fichiers, iCloud Drive), import en fusion ou remplacement, rappel au-delà de 14 jours.
- **Confort** : thèmes clair, sombre ou automatique, boutons ronds animés, respect de « Réduire les animations », cibles de 44 px, exemples chargeables et retirables en un geste.

## Déploiement sur GitHub Pages

Tous les chemins sont relatifs : l'app fonctionne servie depuis un sous-dossier.

1. Dans le dépôt : **Settings › Pages › Build and deployment** : *Deploy from a branch*, branche `main`, dossier `/ (root)`.
2. Ouvrir `https://<utilisateur>.github.io/Atester/` en HTTPS.

### Publier une mise à jour

1. Incrémenter `CACHE_VERSION` dans `sw.js` **et** `APP_VERSION` dans `js/config.js` (même numéro).
2. Vérifier : `node tools/check-sw.mjs` (tous les fichiers servis sont pré-cachés, versions identiques).
3. Pousser sur `main`. Au prochain lancement en ligne, l'app affiche « Nouvelle version disponible — Recharger ». Réglages › « Rechercher une mise à jour » force la vérification.

## Installation sur iPhone

1. Ouvrir l'URL dans **Safari** (l'app l'explique une fois au premier passage).
2. Partager › **Sur l'écran d'accueil**.
3. L'app s'ouvre en plein écran et fonctionne hors ligne.

## Clé TMDB (facultative)

Sans clé, les films et séries s'ajoutent en saisie libre. Pour les affiches, années, genres et plateformes : crée un compte gratuit sur [themoviedb.org](https://www.themoviedb.org/settings/api), puis colle la clé d'API (v3) ou le jeton de lecture (v4) dans Réglages › Films & séries. Elle reste sur l'appareil et n'est jamais exportée.

> Les données vivent dans IndexedDB sur l'iPhone. iOS peut, dans certains cas, effacer les données d'une app web peu utilisée : l'export JSON est la vraie sauvegarde.

## Structure

```
index.html              coquille, écrans de lancement iOS
manifest.webmanifest    manifeste (chemins relatifs)
sw.js                   service worker : coquille versionnée, tuiles (500) et affiches (300) en cache
css/tokens.css          couleurs et thèmes clair / sombre
css/app.css             composants et animations
js/app.js               démarrage, thème, clavier iOS, mises à jour
js/router.js            routes par hash (#/lieux, #/reco/:id…)
js/config.js            catégories, sous-catégories par défaut, palettes, version
js/utils.js             texte, dates relatives, couleurs, stockage local
js/store/               Dexie (db), recommandations, personnes, filtres, réglages (meta), événements
js/services/            Photon, TMDB, iTunes, sauvegarde, géolocalisation, carte, exemples, HTTP
js/views/               Lieux, Films & séries, Podcasts, Personnes, fiches, ajout, réglages
js/components/          barre d'onglets, panneaux, filtres, cartes, avatars, notes, toasts, gestes, icônes
vendor/                 Dexie 4, Leaflet 1.9, Leaflet.markercluster 1.5 (hors ligne, sans CDN)
icons/                  icônes 64, 180, 192, 512, maskable et écrans de lancement
tools/                  make-icons.mjs, extract-icons.mjs, check-sw.mjs
```

## Crédits

Carte © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), Leaflet ; recherche de lieux Photon (komoot). Films et séries : [TMDB](https://www.themoviedb.org) — ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB ; plateformes : JustWatch. Podcasts : API iTunes Search d'Apple. Icônes Lucide (ISC). Dexie (Apache 2.0), Leaflet et Leaflet.markercluster (BSD / MIT), licences dans `vendor/`.
