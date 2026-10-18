# À tester

PWA pour iPhone et Android qui garde les recommandations qu'on te fait (**lieux**, **films et séries**, **podcasts**) avec la personne qui te les a conseillées. On les retrouve par personne, par catégorie ou sur une carte. Chacun se connecte avec son e-mail et retrouve ses données sur tous ses appareils ; l'app fonctionne hors connexion et se synchronise au retour du réseau. HTML, CSS et JavaScript vanilla, sans étape de build, hébergé sur GitHub Pages ; comptes et données avec Firebase (forfait gratuit Spark).

Cahier des charges : [SPEC.md](SPEC.md) · Améliorations ergonomiques intégrées : [AMELIORATIONS.md](AMELIORATIONS.md)

## Fonctionnalités

- **Ajout rapide en un écran** (bouton + central) : catégorie pré-sélectionnée, le clavier s'ouvre quand on touche « Quoi », suggestions dès 3 caractères (lieux via Photon/OpenStreetMap, films et séries via TMDB, podcasts via iTunes), « Je suis devant » (position GPS et adresse), personnes récentes en un tap, sous-catégorie devinée, détection des doublons (« Déjà recommandé par Paul — ajouter Marie ? »), brouillon conservé.
- **Lieux** : carte sur fond vectoriel OpenFreeMap, sans clé ni compte (épingles colorées par sous-catégorie, groupes au-delà de 30, recadrage automatique, aperçu flottant, « Me localiser »), repli automatique sur les tuiles OpenStreetMap, zoom à un doigt comme dans Plans (toucher deux fois puis glisser), ou liste avec distances, « Zone de la carte ». Itinéraire au choix dans Plans, Google Maps ou Waze, ou directement dans l'app choisie en Réglages.
- **Films et séries** : grille d'affiches 2:3, plateformes en France (JustWatch via TMDB), « Actualiser les plateformes ».
- **Podcasts** : pochettes, épisode précis, « Ouvrir dans Podcasts ».
- **Personnes** : photo facultative (photothèque ou appareil photo, recadrage dans un cercle), compteurs par catégorie, note moyenne, fiche avec « Ses lieux sur la carte », « Ajouter une recommandation de… », renommer, couleur, fusionner, supprimer.
- **Filtres** communs (personne, sous-catégorie, statut, ville, plateforme, favoris, note minimale) combinables, compteur en direct, valeurs sans résultat grisées, puces retirables, recherche sans accents, tri ; tout est gardé dans l'URL et sur l'appareil.
- **Statuts** : balayage à gauche pour « testé » (note et avis facultatifs), à droite pour favori ; appui long pour les actions rapides ; annulation partout.
- **Compte** : création, connexion, mot de passe oublié, déconnexion (l'appareil efface alors tout ce qu'il gardait du compte). Données synchronisées entre appareils, cache local pour le hors-ligne.
- **Passage depuis la 1.x** : « Importer mes données locales » envoie l'ancien stockage de l'appareil dans le compte, sans doublons, vérifie que tout y est puis propose de vider l'ancien stockage.
- **Sauvegarde facultative** : export JSON par la feuille de partage (Enregistrer dans Fichiers, iCloud Drive), photos des personnes comprises ; import d'un fichier JSON par fusion, sans doublons.
- **Confort** : thèmes clair, sombre ou automatique (palette « Encre »), boutons ronds animés, respect de « Réduire les animations », cibles de 44 px, exemples chargeables et retirables en un geste.

## Déploiement sur GitHub Pages

Tous les chemins sont relatifs : l'app fonctionne servie depuis un sous-dossier.

1. Dans le dépôt : **Settings › Pages › Build and deployment** : *Deploy from a branch*, branche `main`, dossier `/ (root)`.
2. Ouvrir `https://<utilisateur>.github.io/Atester/` en HTTPS.

## Firebase (comptes et données)

Projet Firebase `athos-apps`, forfait gratuit Spark. La configuration web est dans `js/services/firebase.js` : elle est publique par nature, ce sont les règles qui protègent les données.

- **Authentication** : fournisseur « Adresse e-mail/Mot de passe » activé ; `athosjj.github.io` dans les domaines autorisés.
- **Firestore** (région Europe) : données sous `users/{uid}/apps/atester` (document de l'app, sous-collections `recommendations` et `persons`). Lecture utilisera `users/{uid}/apps/lecture`.
- **Règles** : contenu de [`firestore.rules`](firestore.rules), à coller dans Firestore Database › Règles, puis Publier.
- **Clé TMDB** : document `config/tmdb`, champ `apiKey` (chaîne), créé dans la console. Sans ce document, les films et séries s'ajoutent à la main.

### Publier une mise à jour

1. Incrémenter `CACHE_VERSION` dans `sw.js` **et** `APP_VERSION` dans `js/config.js` (même numéro).
2. Vérifier : `node tools/check-sw.mjs` (tous les fichiers servis sont pré-cachés, versions identiques).
3. Pousser sur `main`. Au prochain lancement en ligne, l'app affiche « Nouvelle version disponible — Recharger ». Réglages › « Rechercher une mise à jour » force la vérification.

## Installation sur iPhone

1. Ouvrir l'URL dans **Safari** (l'app l'explique une fois au premier passage).
2. Partager › **Sur l'écran d'accueil**.
3. L'app s'ouvre en plein écran, on se connecte une fois, puis elle fonctionne hors ligne.

## Installation sur Android

1. Ouvrir l'URL dans **Chrome**, menu ⋮ › **Ajouter à l'écran d'accueil** › **Installer** (ou directement **Installer l'application**). Pas « Créer un raccourci » : le raccourci ouvre l'app dans Chrome, avec sa barre d'adresse.
2. Chrome installe l'app en quelques secondes. Elle apparaît dans la liste des applications ; selon le lanceur, il faut l'en faire glisser vers l'écran d'accueil.
3. L'app installée partage la session de Chrome : pas besoin de se reconnecter.

## Structure

```
index.html              coquille, écrans de lancement iOS
manifest.webmanifest    manifeste (chemins relatifs, sans « id » : chaque adresse a sa propre identité d'app)
sw.js                   service worker : coquille et SDK Firebase versionnés ; carte (style, polices, 500 tuiles) et pochettes (300) en cache
firestore.rules         règles de sécurité Firestore (à publier dans la console Firebase)
css/tokens.css          couleurs et thèmes clair / sombre
css/app.css             composants et animations
js/app.js               démarrage (connexion, synchronisation), thème, clavier iOS, mises à jour
js/router.js            routes par hash (#/lieux, #/reco/:id…)
js/config.js            catégories, sous-catégories par défaut, palettes, version
js/utils.js             texte, dates relatives, couleurs, stockage local
js/store/               synchronisation Firestore (cloud), recommandations, personnes, filtres, réglages, événements
js/services/            Firebase, compte, ancien stockage, Photon, TMDB, iTunes, sauvegarde, géolocalisation, carte, photos, clavier et viewport iOS, exemples, HTTP
js/views/               connexion, Lieux, Films & séries, Podcasts, Personnes, fiches, ajout, réglages
js/components/          barre d'onglets, panneaux, filtres, cartes, avatars, recadrage photo, itinéraire, notes, toasts, gestes, icônes
vendor/                 Leaflet 1.9, Leaflet.markercluster 1.5, MapLibre GL 6, maplibre-gl-leaflet (hors ligne, sans CDN ; le SDK Firebase vient du CDN officiel et est gardé par le service worker)
icons/                  icônes 64, 180, 192, 512, maskable et écrans de lancement
tools/                  make-icons.mjs, extract-icons.mjs, check-sw.mjs
```

## Crédits

Carte : données © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), fonds de carte [OpenFreeMap](https://openfreemap.org) (© [OpenMapTiles](https://www.openmaptiles.org/)), affichés avec Leaflet et MapLibre GL ; recherche de lieux Photon (komoot). Films et séries : [TMDB](https://www.themoviedb.org) ; ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB (This product uses the TMDB API but is not endorsed or certified by TMDB) ; plateformes : JustWatch. Podcasts : API iTunes Search d'Apple. Comptes et données : Firebase (SDK Apache 2.0). Icônes Lucide (ISC). Leaflet et Leaflet.markercluster (BSD / MIT), MapLibre GL JS (BSD-3) et maplibre-gl-leaflet (ISC), licences dans `vendor/`.
