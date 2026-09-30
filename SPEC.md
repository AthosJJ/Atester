# À tester — Descriptif complet de la PWA

Sep 30, 2026 · @Jérôme

## 1. Objectif et périmètre

« À tester » est une PWA pour iPhone qui centralise les recommandations reçues (lieux, films et séries, podcasts) avec la personne qui les a faites. On les retrouve ensuite par personne, par catégorie ou sur une carte.

**Principes directeurs**

- **Saisie en moins de 10 secondes** : trois champs obligatoires seulement (quoi, catégorie, qui). Tout le reste se complète plus tard.
- **100 % local** : pas de compte ni de serveur. Les données restent sur l'appareil, avec export et import JSON.
- **Une seule base, plusieurs vues** : les trois catégories partagent le même modèle et le même système de filtres.
- **Enrichissement facultatif** : les API externes (carte, affiches, pochettes) améliorent l'app, mais tout fonctionne sans elles.
- **Mobile-first iPhone** : installable sur l'écran d'accueil, utilisable hors ligne.

**Inclus dans la V1**

- Quatre onglets : Lieux, Films & séries, Podcasts, Personnes.
- Ajout, édition, suppression, statut et notation des recommandations.
- Filtres par personne, catégorie, sous-catégorie, statut et ville, recherche texte et tri.
- Carte des lieux avec épingles filtrées et géolocalisation.
- Enrichissement automatique : position des lieux, affiches et plateformes des films, pochettes des podcasts.
- Export et import JSON, fonctionnement hors ligne.

**Hors périmètre V1** (pistes V2) : synchronisation entre appareils, partage d'une liste avec des amis, notifications, réception depuis le menu Partager d'iOS (non pris en charge pour les PWA par Safari iOS à ce jour), catégorie Livres (déjà couverte par l'app de lecture existante).

## 2. Modèle de données

Deux entités principales : **Recommandation** et **Personne**. Une recommandation peut avoir plusieurs personnes (deux amis qui conseillent la même série), et une personne a plusieurs recommandations.

### Recommandation — champs communs

| Champ | Type | Obligatoire | Description |
| --- | --- | --- | --- |
| id | string (UUID) | oui | Généré par `crypto.randomUUID()` |
| category | `place` \| `screen` \| `podcast` | oui | Lieux, Films & séries, Podcasts |
| subcategory | string | oui | Clé d'une sous-catégorie (voir plus bas), `other` par défaut |
| title | string | oui | Nom du lieu, du film, de la série ou du podcast |
| personIds | string\[\] | oui (≥ 1) | Personnes qui l'ont recommandé |
| recommendedAt | date ISO | oui | Date de la recommandation, aujourd'hui par défaut |
| status | `todo` \| `done` \| `dropped` | oui | À tester / Testé / Pas pour moi, `todo` par défaut |
| rating | 1–5 \| null | non | Ma note, seulement si `done` |
| theirNote | string | non | Ce que la personne en a dit (« le tiramisu », « à partir de la saison 2 ») |
| myReview | string | non | Mon avis après test |
| favorite | boolean | non | Épinglée en haut des listes |
| link | string (URL) | non | Site, Instagram, page de l'œuvre |
| createdAt, updatedAt, doneAt | date ISO | auto | Horodatages |

Les libellés de statut s'adaptent à la catégorie : « À tester / Testé » pour les lieux, « À voir / Vu » pour les films et séries, « À écouter / Écouté » pour les podcasts. « Pas pour moi » est commun aux trois.

### Champs spécifiques par catégorie

Ils sont regroupés dans un objet `details`, dont la forme dépend de `category`.

| Catégorie | Champs `details` |
| --- | --- |
| place | address, city, lat, lng (null tant que non localisé), osmId, source (`photon` \| `manual` \| `gps`) |
| screen | tmdbId, tmdbType (`movie` \| `tv`), year, posterPath, genres\[\], platforms\[\] (plateformes France), overview, seasons |
| podcast | itunesId, showName, author, artworkUrl, episodeTitle (si un épisode précis est conseillé), appleUrl, feedUrl |

### Personne

| Champ | Type | Description |
| --- | --- | --- |
| id | string (UUID) | Identifiant |
| name | string | Prénom ou surnom, unique (insensible à la casse) |
| color | string (hex) | Couleur de l'avatar, dérivée du nom par défaut |
| isMe | boolean | Personne spéciale « Moi » pour les découvertes personnelles, créée au premier lancement |
| createdAt | date ISO | Horodatage |

Le nombre de recommandations et la note moyenne d'une personne sont **calculés**, jamais stockés.

### Sous-catégories par défaut

Modifiables dans les réglages (ajout, renommage, couleur). Chaque sous-catégorie a une clé, un libellé, une icône et une couleur.

| Catégorie | Sous-catégories |
| --- | --- |
| Lieux | Restaurant, Bar, Café, Boulangerie & pâtisserie, Expo & musée, Balade & nature, Boutique, Hébergement, Autre |
| Films & séries | Film, Série, Documentaire, Autre |
| Podcasts | Société, Culture, Histoire, Sciences, Business, Humour, Sport, Développement perso, Autre |

### Format d'export JSON

```json
{
  "app": "a-tester",
  "schemaVersion": 1,
  "exportedAt": "2026-09-30T20:15:00Z",
  "persons": [
    { "id": "p-1", "name": "Paul", "color": "#E07A5F", "isMe": false, "createdAt": "2026-09-30T20:00:00Z" }
  ],
  "recommendations": [
    {
      "id": "r-1",
      "category": "place",
      "subcategory": "restaurant",
      "title": "Le Bouchon des Filles",
      "personIds": ["p-1"],
      "recommendedAt": "2026-09-28",
      "status": "todo",
      "rating": null,
      "theirNote": "Prendre la quenelle",
      "myReview": "",
      "favorite": false,
      "link": "",
      "details": { "address": "20 rue Sergent Blandan", "city": "Lyon", "lat": 45.768, "lng": 4.829, "osmId": null, "source": "photon" },
      "createdAt": "2026-09-30T20:05:00Z",
      "updatedAt": "2026-09-30T20:05:00Z",
      "doneAt": null
    }
  ],
  "subcategories": { "place": [], "screen": [], "podcast": [] }
}
```

`schemaVersion` permet de migrer les données si le modèle évolue. L'import refuse un fichier dont `app` ne vaut pas `a-tester`.

## 3. Navigation et écrans

La navigation repose sur une barre d'onglets fixe en bas, avec cinq emplacements : **Lieux · Films & séries · \[ + \] · Podcasts · Personnes**. Le bouton **+** central, plus grand et coloré, ouvre l'ajout rapide depuis n'importe quel onglet. Une icône engrenage en haut à droite de chaque onglet ouvre les réglages.

### Routes (hash, compatibles GitHub Pages)

| Route | Écran |
| --- | --- |
| `#/lieux` (`?vue=carte` ou `?vue=liste`) | Onglet Lieux |
| `#/ecrans` | Onglet Films & séries |
| `#/podcasts` | Onglet Podcasts |
| `#/personnes` | Liste des personnes |
| `#/personne/:id` | Fiche d'une personne |
| `#/reco/:id` | Fiche détail d'une recommandation |
| `#/ajout` (`?cat=place` optionnel) | Ajout rapide |
| `#/reglages` | Réglages |

Les filtres actifs sont aussi encodés dans l'URL (par exemple `#/lieux?vue=carte&p=ID&sc=restaurant`). Ainsi, le bouton « Voir sur la carte » d'une fiche personne n'est qu'un lien.

### Onglet Lieux

- **En-tête** : titre, champ de recherche, bouton Filtres avec un badge indiquant le nombre de filtres actifs.
- **Rangée de puces** défilante horizontalement : Tous, Restaurant, Bar, Café… (sélection multiple, raccourci du filtre sous-catégorie).
- **Bascule Carte / Liste** (contrôle segmenté), la carte par défaut.
- **Vue carte** : épingles colorées par sous-catégorie avec leur icône, regroupement en clusters au-delà de 30 épingles proches, cadrage automatique sur les résultats filtrés. Un bouton « Me localiser » centre la carte sur ma position. Les épingles « Testé » sont affichées en version atténuée.
- **Aperçu au tap sur une épingle** : panneau glissant depuis le bas avec le nom, la sous-catégorie, « Recommandé par Paul », le statut, et deux boutons : « Itinéraire » (ouvre Plans) et « Voir la fiche ».
- **Vue liste** : cartes avec nom, ville, sous-catégorie, personnes, statut et distance si la géolocalisation est autorisée. Une option « Limiter à la zone affichée » synchronise la liste avec le cadrage de la carte.
- **Lieux sans position** : ils apparaissent dans la liste avec un badge « Position à ajouter », jamais sur la carte.

### Onglet Films & séries

- Même en-tête (recherche, filtres) et rangée de puces : Tous, Film, Série, Documentaire.
- Contrôle segmenté **À voir / Vu / Tout**, « À voir » par défaut.
- **Grille d'affiches** sur 3 colonnes, ratio 2:3. Sous chaque affiche : titre, année, initiales de la ou des personnes. Pastille de note si vu.
- Sans affiche : vignette de couleur avec le titre en texte.

### Onglet Podcasts

- Même en-tête, puces de thèmes et contrôle **À écouter / Écouté / Tout**.
- **Liste** : pochette carrée de 56 px, nom de l'émission, titre de l'épisode s'il y en a un, « par Marie ».

### Onglet Personnes

- Liste triée par nombre de recommandations (décroissant), avec recherche.
- Chaque ligne : avatar (initiales sur la couleur de la personne), prénom, compteurs par catégorie avec icônes (par exemple : épingle 4 · clap 7 · casque 2, en icônes Lucide), note moyenne de ses recommandations testées.

### Fiche personne

- En-tête : grand avatar, prénom, statistiques (total, testées, note moyenne, « dernière recommandation il y a 12 jours »).
- Trois sections repliables : Lieux, Films & séries, Podcasts, avec leurs cartes. Filtre de statut commun en haut.
- Boutons : « Voir ses lieux sur la carte » (lien vers l'onglet Lieux avec le filtre personne appliqué), « Ajouter une recommandation de \[prénom\] » (ajout rapide avec la personne pré-remplie).
- Menu … : renommer, changer la couleur, **fusionner avec une autre personne** (cas « Paul » et « Paulo »), supprimer (uniquement si aucune recommandation ne dépend d'elle seule, sinon proposer la fusion).

### Fiche détail d'une recommandation

- **Visuel** : affiche (films), pochette (podcasts) ou mini-carte non interactive (lieux).
- Titre, puce de sous-catégorie, « Recommandé par » suivi des personnes cliquables, date relative (« il y a 3 jours »).
- Bloc « Ce qu'on m'en a dit » (theirNote).
- **Infos spécifiques** : adresse et boutons Itinéraire / Copier l'adresse (lieux) ; année, genres, plateformes, synopsis, nombre de saisons (films et séries) ; auteur et bouton « Ouvrir dans Podcasts » (podcasts).
- **Statut** : bouton principal « Marquer comme testé / vu / écouté », puis note en étoiles et « Mon avis ».
- Actions : épingler en favori, modifier, supprimer.

### Réglages

- Sous-catégories : ajouter, renommer, changer couleur et icône, réordonner.
- Clé API TMDB (champ masqué, stockée uniquement sur l'appareil) avec un bouton « Tester la clé ».
- Sauvegarde : Exporter, Importer (fusionner ou remplacer), date de la dernière sauvegarde.
- Thème : automatique, clair, sombre.
- À propos : version, crédits et attributions obligatoires (OpenStreetMap, TMDB, JustWatch).
- Zone dangereuse : tout effacer, avec double confirmation.

## 4. Filtres, recherche et tri

Un seul composant de filtres sert aux trois onglets de contenu, avec des critères communs et quelques critères propres à chaque catégorie. Les critères se combinent en **ET** entre eux et en **OU** à l'intérieur d'un même critère : « (Paul OU Marie) ET (Restaurant OU Bar) ET À tester ».

### Critères disponibles

| Critère | Lieux | Films & séries | Podcasts | Sélection |
| --- | --- | --- | --- | --- |
| Personne | oui | oui | oui | multiple |
| Sous-catégorie | oui | oui | oui (thème) | multiple |
| Statut | oui | oui | oui | multiple |
| Ville | oui | — | — | multiple |
| Plateforme | — | oui | — | multiple |
| Favoris uniquement | oui | oui | oui | case à cocher |
| Note minimale | oui | oui | oui | 1 à 5 étoiles |
| Recherche texte | oui | oui | oui | champ libre |

Les valeurs proposées pour Personne, Ville et Plateforme sont **déduites des données existantes** de la catégorie, chacune suivie de son nombre de résultats (« Paul (4) »). Une valeur qui donnerait zéro résultat avec les autres filtres actifs est grisée.

### Interface

- **Bouton Filtres** dans l'en-tête, avec un badge du nombre de filtres actifs. Il ouvre un panneau glissant depuis le bas, organisé en sections (Personne, Sous-catégorie, Statut, puis les critères propres à la catégorie).
- **Pied du panneau** : « Réinitialiser » à gauche, « Voir 12 résultats » à droite. Le compteur se met à jour en direct.
- **Puces de filtres actifs** sous l'en-tête, chacune avec une croix pour la retirer d'un tap.
- **Rangée de puces de sous-catégories** toujours visible, comme raccourci.
- **État vide filtré** : « Aucun résultat avec ces filtres » et un bouton « Effacer les filtres ».

### Recherche texte

Elle porte sur le titre, les notes (theirNote, myReview), le nom des personnes, la ville et le nom de l'émission. Elle ignore les accents et la casse (« cafe » trouve « Café »), avec un délai de 200 ms après la frappe.

### Tri

| Option | Onglets | Par défaut |
| --- | --- | --- |
| Plus récent (recommendedAt) | tous | oui |
| Plus ancien | tous | — |
| Meilleure note | tous | — |
| Alphabétique | tous | — |
| Distance | Lieux (si géolocalisation autorisée) | — |
| Le plus recommandé (nombre de personnes) | tous | — |

Les favoris restent toujours en tête, quel que soit le tri.

### Filtres et carte

- Les filtres s'appliquent **directement aux épingles** : la carte n'affiche que les lieux qui correspondent.
- Après chaque changement de filtre, la carte se recadre sur les résultats (avec une marge), sauf si l'utilisateur a déplacé la carte manuellement depuis moins de 10 secondes.
- La carte et la liste partagent le même état de filtres : basculer de l'une à l'autre conserve la sélection.

### Persistance

Chaque onglet garde son propre état de filtres, encodé dans l'URL et sauvegardé localement. On retrouve donc ses filtres en rouvrant l'app. Le filtre par personne n'est pas partagé automatiquement entre onglets : la vue transversale « tout ce que Paul m'a conseillé », c'est la fiche personne.

## 5. Ajout, édition et statut

L'ajout d'une recommandation doit tenir en **moins de 10 secondes** en saisie libre, hors ligne compris. L'enrichissement automatique est un plus, jamais un passage obligé.

### Parcours d'ajout rapide

1. **Catégorie** : trois gros boutons (Lieu, Film ou série, Podcast). Si l'ajout est lancé depuis un onglet, sa catégorie est pré-sélectionnée et cette étape est sautée (on peut toujours la changer en haut du formulaire).
2. **Quoi** : un champ unique avec suggestions sous le champ, déclenchées à partir de 3 caractères (délai 350 ms) :
   - Lieu : recherche de lieux autour de ma position ou de la ville saisie (« Bouchon des Filles Lyon »).
   - Film ou série : recherche TMDB, avec affiche miniature, année et type.
   - Podcast : recherche iTunes, avec pochette et auteur.
   - Dernière ligne des suggestions, toujours présente : « Ajouter “\[texte saisi\]” sans recherche ».
3. **Qui** : puces des 6 personnes les plus récentes, puis un champ avec autocomplétion. Taper un prénom inconnu propose « Créer “Léa” ». Sélection multiple possible, et une puce « Moi » pour les découvertes personnelles.
4. **Sous-catégorie** : devinée quand c'est possible (TMDB `movie` → Film, `tv` → Série ; type de lieu renvoyé par la recherche → Restaurant, Bar, Café…), sinon puces à choisir. « Autre » par défaut.
5. **Plus de détails** (section repliée) : ce que la personne en a dit, date de la recommandation (aujourd'hui par défaut), lien, épisode précis (podcasts), adresse manuelle (lieux).
6. **Enregistrer** : retour à l'onglet de la catégorie, notification discrète « Ajouté » avec un lien « Voir ».

Le bouton Enregistrer est actif dès que les trois champs obligatoires sont remplis. Le clavier s'ouvre directement sur le champ « Quoi ».

### Lieux : les cas de localisation

| Cas | Comportement |
| --- | --- |
| Suggestion choisie | Adresse, ville et coordonnées remplies automatiquement |
| Bouton « Je suis devant » | Position GPS actuelle, adresse retrouvée par géocodage inverse |
| Saisie libre sans réseau | Enregistré sans coordonnées, badge « Position à ajouter » |
| Position approximative | En édition, l'épingle se déplace sur une mini-carte par glisser-déposer |

### Détection des doublons

Avant d'enregistrer, l'app cherche une recommandation existante avec le même identifiant externe (tmdbId, itunesId, osmId), ou le même titre normalisé dans la même ville. Si elle en trouve une, elle propose : « Déjà recommandé par Paul — ajouter Marie à cette recommandation ? » (action principale) ou « Créer quand même ». C'est ce qui rend le tri « Le plus recommandé » utile.

### Passage au statut testé

- Depuis la fiche : bouton « Marquer comme testé / vu / écouté ».
- Depuis une liste : balayage vers la gauche sur une carte.
- Dans les deux cas, un petit panneau s'ouvre : note de 1 à 5 étoiles (facultative), « Mon avis » (facultatif), bouton Valider. `doneAt` prend la date du jour.
- « Pas pour moi » est accessible depuis le menu de la fiche, sans note.
- Un statut peut toujours être remis à « À tester ».

### Édition et suppression

- Tous les champs sont modifiables depuis la fiche, y compris la catégorie et les personnes.
- Bouton « Compléter les infos » sur une recommandation saisie librement : relance la recherche externe avec le titre.
- Suppression avec confirmation, puis notification « Supprimé » avec un bouton « Annuler » pendant 5 secondes.
- Une personne qui n'a plus aucune recommandation n'est pas supprimée automatiquement.

## 6. Intégrations externes

Quatre services gratuits, appelés directement depuis le navigateur, sans serveur intermédiaire. Chacun est isolé dans son propre module `services/`, avec un délai maximal de 8 secondes et un repli sur la saisie manuelle en cas d'échec.

| Besoin | Service | Clé | Attribution obligatoire |
| --- | --- | --- | --- |
| Fond de carte | Leaflet + tuiles OpenStreetMap | non | « © OpenStreetMap contributors » sur la carte |
| Recherche de lieux et géocodage inverse | Photon (komoot), basé sur OpenStreetMap | non | via l'attribution OSM |
| Films et séries, plateformes | TMDB API v3 | oui (gratuite, usage non commercial) | logo ou mention TMDB, et « plateformes : JustWatch » |
| Podcasts | iTunes Search API (Apple) | non | aucune |

### Carte (Leaflet + OpenStreetMap)

- Leaflet 1.9 et le plugin Leaflet.markercluster, copiés dans `vendor/` pour fonctionner hors ligne.
- Tuiles `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. En mode sombre, appliquer un filtre CSS sur la couche de tuiles (inversion + rotation de teinte) plutôt que changer de fournisseur.
- Marqueurs en `L.divIcon` : pastille ronde de la couleur de la sous-catégorie avec son icône SVG blanche.
- Respecter la politique d'usage des tuiles OSM : pas de préchargement massif, seulement le cache des tuiles déjà vues.
- **Itinéraire** : ouvrir `https://maps.apple.com/?daddr={lat},{lng}&q={titre}` (Plans sur iPhone).

### Recherche de lieux (Photon)

- Recherche : `https://photon.komoot.io/api/?q={texte}&lat={lat}&lon={lon}&lang=fr&limit=8`. Le biais de position utilise ma position si elle est connue, sinon le centre de la carte.
- Géocodage inverse (bouton « Je suis devant ») : `https://photon.komoot.io/reverse?lat={lat}&lon={lon}&lang=fr`.
- Photon est conçu pour la recherche pendant la frappe. Garder quand même le délai de 350 ms et annuler la requête précédente (`AbortController`).
- Afficher chaque suggestion avec son nom, sa rue et sa ville. Deviner la sous-catégorie depuis `osm_key` / `osm_value` : `amenity=restaurant` → Restaurant, `amenity=bar` ou `pub` → Bar, `amenity=cafe` → Café, `shop=bakery` ou `pastry` → Boulangerie, `tourism=museum` ou `gallery` → Expo & musée, `tourism=hotel` → Hébergement, `shop=*` → Boutique, `leisure=park` ou `natural=*` → Balade & nature.
- Documentation : [Photon sur GitHub](https://github.com/Komoot/photon).

### Films et séries (TMDB)

- La clé est saisie par l'utilisateur dans les réglages et stockée sur l'appareil. **Elle ne doit jamais apparaître dans le dépôt GitHub.** Sans clé, la recherche TMDB est simplement désactivée avec un lien « Ajouter une clé TMDB ».
- Recherche : `GET /3/search/multi?query={texte}&language=fr-FR&include_adult=false`, en ne gardant que `media_type` = `movie` ou `tv`.
- Détails à l'enregistrement : `GET /3/{movie|tv}/{id}?language=fr-FR&append_to_response=watch/providers`. Retenir le titre français, l'année, les genres, le synopsis, le nombre de saisons et, dans `watch/providers.results.FR.flatrate`, les plateformes par abonnement.
- Affiches : `https://image.tmdb.org/t/p/w342{poster_path}` pour la grille, `w500` pour la fiche.
- Bouton « Actualiser les plateformes » sur la fiche, car la disponibilité change dans le temps.
- Documentation : [TMDB — Watch providers](https://developer.themoviedb.org/reference/tv-season-watch-providers).

### Podcasts (iTunes Search API)

- Émissions : `https://itunes.apple.com/search?term={texte}&media=podcast&country=FR&limit=10`. Retenir `collectionId`, `collectionName`, `artistName`, `artworkUrl600`, `collectionViewUrl`, `feedUrl`.
- Épisode précis (facultatif, depuis « Plus de détails ») : même requête avec `entity=podcastEpisode`.
- Bouton « Ouvrir dans Podcasts » : lien vers `collectionViewUrl`.
- Si la requête est bloquée par le navigateur (CORS), utiliser le paramètre `callback` de l'API (JSONP) en repli.

### Gestion hors ligne et erreurs

| Situation | Comportement |
| --- | --- |
| Pas de réseau à l'ajout | Pas de suggestions, seule la ligne « Ajouter sans recherche » s'affiche |
| API lente (> 8 s) ou en erreur | Message discret « Recherche indisponible », saisie libre possible |
| Clé TMDB invalide | Message dans les réglages, recherche TMDB désactivée |
| Image introuvable | Vignette de remplacement colorée avec le titre |
| Retour du réseau | Rien d'automatique : bouton « Compléter les infos » sur chaque recommandation saisie librement |

## 7. Stockage, sauvegarde et PWA

Les données vivent dans **IndexedDB** sur l'iPhone, via la librairie Dexie. L'export JSON est la seule vraie sauvegarde : l'app doit donc le rendre simple et y faire penser.

### Base locale (IndexedDB avec Dexie 4)

| Table | Clé et index |
| --- | --- |
| recommendations | `id`, `category`, `status`, `*personIds` (index multi-valeurs), `recommendedAt`, `[category+status]` |
| persons | `id`, `&name` (unique) |
| meta | `key` : sous-catégories, préférences, filtres sauvegardés, clé TMDB, date de dernière sauvegarde, version du schéma |

- Au premier lancement : créer la personne « Moi » et les sous-catégories par défaut.
- Appeler `navigator.storage.persist()` au premier ajout pour demander un stockage persistant.
- Toutes les écritures passent par une couche `store/` unique, qui met à jour `updatedAt` et notifie les vues (petit système d'abonnement).
- Les filtres de chaque onglet sont aussi gardés dans `localStorage` pour un chargement instantané.

### Export

- Bouton « Exporter » dans les réglages : génère `a-tester-sauvegarde-AAAA-MM-JJ.json` au format décrit en section 2.
- Sur iPhone, utiliser le partage natif avec fichier (`navigator.share({ files: [...] })`) : l'utilisateur choisit « Enregistrer dans Fichiers » ou iCloud Drive. En repli, un lien de téléchargement classique.
- Après un export réussi, enregistrer la date dans `meta`.
- **Rappel** : si la dernière sauvegarde date de plus de 14 jours et qu'il y a eu des ajouts depuis, afficher un bandeau discret dans les réglages et une pastille sur l'engrenage.

### Import

- Sélection d'un fichier `.json`, puis vérification (`app`, `schemaVersion`, structure). En cas d'erreur, message clair et aucune modification.
- Choix entre **Fusionner** (ajoute les éléments absents, et pour un même `id` garde le plus récent selon `updatedAt` ; les personnes de même nom sont rapprochées) et **Remplacer tout** (double confirmation).
- Résumé après import : « 42 recommandations et 9 personnes importées ».

### Manifest

- `name` : « À tester », `short_name` : « À tester », `lang` : `fr`.
- `display` : `standalone`, `orientation` : `portrait`.
- `start_url` et `scope` : `./` (**chemins relatifs obligatoires**, l'app est servie depuis un sous-dossier GitHub Pages du type `/a-tester/`).
- `theme_color` et `background_color` alignés sur les couleurs de l'app.
- Icônes 192 et 512 px (dont une version `maskable`), plus `apple-touch-icon` de 180 px.

### Service worker

| Ressource | Stratégie |
| --- | --- |
| Coquille de l'app (HTML, CSS, JS, `vendor/`, icônes) | Pré-cache à l'installation, versionné |
| Tuiles de carte | Cache d'abord, limité à environ 500 tuiles (les plus anciennes supprimées) |
| Affiches et pochettes | Cache d'abord, limité à environ 300 images |
| Appels API (Photon, TMDB, iTunes) | Réseau uniquement, jamais en cache |

- Le nom du cache contient la version (`a-tester-v1.0.0`). Changer de version purge les anciens caches.
- Quand une nouvelle version est disponible, afficher « Nouvelle version disponible — Recharger » plutôt que de forcer le rechargement.

### Spécificités iPhone

- Balises `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` (`black-translucent`) et `viewport-fit=cover`.
- La géolocalisation est demandée seulement au premier tap sur « Me localiser » ou « Je suis devant », jamais au lancement.
- Page « Installer l'app » affichée une seule fois dans Safari (hors mode installé) : Partager → Sur l'écran d'accueil.
- Rappeler dans l'écran À propos qu'iOS peut, dans certains cas, effacer les données d'un site web, et que l'export est la vraie sauvegarde.

## 8. Design et UX

Une interface sobre, proche des apps natives iOS, où la couleur sert à reconnaître les sous-catégories d'un coup d'œil. Base de conception : **390 × 844 px**, mise en page fluide.

### Règles de base

- **Zones sûres iOS** : `env(safe-area-inset-top)` sur l'en-tête, `env(safe-area-inset-bottom)` sous la barre d'onglets, qui ne doit jamais coller au bord.
- **Cibles tactiles** d'au moins 44 × 44 px, navigation au pouce : actions principales en bas de l'écran.
- **Typographie** : police système (`-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`). Titre d'onglet 28 px gras, texte courant 16 px minimum (évite le zoom automatique de Safari sur les champs).
- **Thème clair et sombre** automatique (`prefers-color-scheme`), forçable dans les réglages. Toutes les couleurs passent par des variables CSS définies dans `tokens.css`.
- **Icônes** : Lucide en SVG inline, trait 2 px, aucun emoji dans l'interface.
- **Langue** : tout en français, dates relatives (« aujourd'hui », « il y a 3 jours », puis « 12 sept. » au-delà d'un mois).

### Couleurs

Une couleur d'accent unique pour l'interface (boutons, onglet actif, bouton +), par exemple un orange terracotta `#E07A5F`. Les sous-catégories ont leur propre couleur, modifiable dans les réglages.

| Sous-catégorie | Couleur | Icône Lucide |
| --- | --- | --- |
| Restaurant | `#E4572E` (rouge orangé) | utensils |
| Bar | `#8E5CC4` (violet) | wine |
| Café | `#9C6644` (brun) | coffee |
| Boulangerie & pâtisserie | `#E9A23B` (miel) | croissant |
| Expo & musée | `#3A7BD5` (bleu) | landmark |
| Balade & nature | `#3E9B5F` (vert) | trees |
| Boutique | `#D6518C` (rose) | shopping-bag |
| Hébergement | `#4F6D7A` (bleu-gris) | bed |
| Autre | `#8A8F98` (gris) | map-pin |

Icônes des catégories dans la barre d'onglets : `map-pin` (Lieux), `clapperboard` (Films & séries), `headphones` (Podcasts), `users` (Personnes), `plus` (ajout).

### Composants récurrents

- **Carte de recommandation** : visuel ou pastille de couleur à gauche, titre, ligne secondaire (ville, année ou émission), avatars des personnes, badge de statut à droite.
- **Avatar de personne** : cercle avec les initiales sur sa couleur. Couleur par défaut dérivée d'un hash du prénom, dans une palette de 10 teintes lisibles en clair comme en sombre.
- **Panneaux glissants depuis le bas** (filtres, aperçu d'épingle, marquer comme testé) : poignée visible, fermeture par glissement vers le bas ou tap sur le fond.
- **Notifications** (« Ajouté », « Supprimé — Annuler ») : bandeau au-dessus de la barre d'onglets, 3 à 5 secondes.
- **Balayage sur les cartes** : vers la gauche pour marquer comme testé, avec retour visuel de la couleur du statut.

### États vides

| Écran | Texte |
| --- | --- |
| Lieux | « Aucun lieu pour l'instant. La prochaine fois qu'on te conseille une adresse, ajoute-la avec + » |
| Films & séries | « Rien à voir pour l'instant. Ajoute la prochaine série qu'on te conseille » |
| Podcasts | « Personne ne t'a encore conseillé de podcast » |
| Personnes | « Les personnes apparaissent ici dès ta première recommandation » |
| Filtres sans résultat | « Aucun résultat avec ces filtres » + bouton « Effacer les filtres » |

### Accessibilité et confort

- Contraste suffisant du texte sur toutes les couleurs de sous-catégorie (texte blanc uniquement sur les teintes foncées).
- Libellés `aria-label` sur tous les boutons icônes.
- Respect de `prefers-reduced-motion` : pas d'animation de panneau ni de zoom de carte animé si activé.
- Aucun rechargement de page visible : navigation instantanée entre onglets, position de défilement conservée.

## 9. Architecture technique

JavaScript vanilla en modules ES, sans étape de build ni framework, dans la lignée des PWA existantes : on déploie par un simple push. Les vues ne parlent jamais directement à la base ni aux API, tout passe par `store/` et `services/`.

&#91;embedded content: architecture · 3 couches, 7 blocs\]

Les vues lisent et écrivent uniquement via `store/`, et demandent les informations externes via `services/`. Le service worker sert l'app hors ligne et laisse passer les appels API.

### Stack

| Élément | Choix | Version |
| --- | --- | --- |
| Langage | JavaScript (modules ES), HTML, CSS | — |
| Base locale | Dexie (sur IndexedDB) | 4.x |
| Carte | Leaflet + Leaflet.markercluster | 1.9.x / 1.5.x |
| Icônes | Lucide, SVG copiés dans `components/icons.js` | — |
| Hébergement | GitHub Pages | — |
| Tests | Navigateur de bureau en vue mobile, puis iPhone réel | — |

Toutes les librairies sont copiées dans `vendor/`, sans CDN, pour que l'app fonctionne hors ligne dès l'installation.

### Structure du dépôt

```
a-tester/
├── index.html                 point d'entrée unique
├── manifest.webmanifest
├── sw.js                      service worker (version du cache en tête)
├── SPEC.md                    ce descriptif
├── CLAUDE.md                  consignes pour Claude Code
├── icons/                     192, 512, maskable 512, apple-touch-icon 180
├── css/
│   ├── tokens.css             couleurs, espacements, thèmes clair et sombre
│   └── app.css
├── js/
│   ├── app.js                 démarrage, enregistrement du service worker
│   ├── router.js              routes par hash, paramètres de filtres
│   ├── config.js              sous-catégories par défaut, couleurs, icônes
│   ├── store/
│   │   ├── db.js              schéma Dexie et migrations
│   │   ├── recommendations.js
│   │   ├── persons.js
│   │   ├── filters.js         état des filtres, filtrage et tri
│   │   └── events.js          abonnements des vues
│   ├── services/
│   │   ├── photon.js
│   │   ├── tmdb.js
│   │   ├── itunes.js
│   │   └── backup.js          export et import JSON
│   ├── views/
│   │   ├── places.js          carte + liste
│   │   ├── screens.js         films et séries
│   │   ├── podcasts.js
│   │   ├── persons.js
│   │   ├── person-detail.js
│   │   ├── reco-detail.js
│   │   ├── add.js
│   │   └── settings.js
│   └── components/
│       ├── tabbar.js
│       ├── filter-sheet.js
│       ├── bottom-sheet.js
│       ├── reco-card.js
│       ├── person-avatar.js
│       ├── rating.js
│       ├── toast.js
│       └── icons.js           SVG Lucide utilisés
└── vendor/
    ├── leaflet/
    ├── leaflet.markercluster/
    └── dexie/
```

### Déploiement

- GitHub Pages sur la branche `main`, dossier racine. URL du type `https://<pseudo>.github.io/a-tester/`.
- Chemins relatifs partout (`./js/app.js`, jamais `/js/app.js`), sinon l'app casse dans le sous-dossier.
- À chaque livraison : incrémenter `CACHE_VERSION` dans `sw.js`, commit, push. GitHub Pages redéploie en une minute environ.
- Le dépôt peut rester public : il ne contient ni données personnelles ni clé API.

## 10. Plan de développement avec Claude Code

Huit étapes, chacune testable sur l'iPhone avant de passer à la suivante. Une étape = une session Claude Code = un ou plusieurs commits, puis un test réel sur le téléphone.

### Mise en place (une fois)

1. Créer le dépôt GitHub `a-tester` et activer GitHub Pages sur la branche `main` (dossier racine).
2. Exporter ce descriptif en Markdown et le placer à la racine sous le nom `SPEC.md`.
3. Ajouter un fichier `CLAUDE.md` à la racine, lu automatiquement par Claude Code à chaque session :

```markdown
# À tester — consignes pour Claude Code

- Le cahier des charges complet est dans SPEC.md : le relire avant chaque étape.
- JavaScript vanilla en modules ES, sans étape de build ni framework.
- Librairies externes copiées dans vendor/, jamais chargées depuis un CDN.
- Chemins toujours relatifs (l'app est servie depuis /a-tester/ sur GitHub Pages).
- Aucune clé API dans le code ou le dépôt.
- Interface et textes en français.
- À chaque modification de fichier servi, incrémenter la version du cache dans sw.js.
- Ne réaliser que l'étape demandée ; signaler les écarts avec SPEC.md au lieu de les décider seul.
- Terminer chaque étape par : liste des fichiers modifiés, points à tester sur iPhone, commit et push.
```

### Modèle de prompt pour chaque étape

> Lis SPEC.md et CLAUDE.md. Réalise uniquement l'étape N : \[intitulé\]. Commence par me proposer ton plan (fichiers créés ou modifiés), attends ma validation, puis code, vérifie, commit et push.

### Les huit étapes

1. **Squelette PWA** : structure du dépôt, `index.html`, `tokens.css`, barre d'onglets, routeur par hash, écrans vides avec leurs états vides, manifest, icônes provisoires, service worker minimal. *Test : l'app s'installe sur l'écran d'accueil, s'ouvre en plein écran, les zones sûres sont respectées, les onglets naviguent.*
2. **Données** : schéma Dexie, couche `store/` (lecture, création, modification, suppression, abonnements), personne « Moi » et sous-catégories par défaut, export et import JSON, jeu de démonstration activable depuis les réglages (4 personnes, 15 recommandations réparties). *Test : export, suppression des données, import, tout revient.*
3. **Ajout et fiche détail en saisie libre** : parcours d'ajout rapide sans API, création de personnes, fiche détail, édition, suppression avec annulation, passage au statut testé avec note, détection des doublons par titre. *Test : ajouter une recommandation en moins de 10 secondes, en mode avion.*
4. **Listes des trois onglets** : liste des lieux, grille des films et séries, liste des podcasts, contrôles segmentés de statut, balayage pour marquer comme testé, favoris.
5. **Filtres, recherche et tri** : composant de filtres commun, panneau glissant, puces actives, compteur en direct, recherche sans accents, tri, filtres dans l'URL et sauvegardés. *Test : filtrer « Paul + Restaurant + À tester », fermer l'app, la rouvrir, les filtres sont toujours là.*
6. **Onglet Personnes** : liste avec compteurs et note moyenne, fiche personne, lien « Voir ses lieux sur la carte », renommage, fusion, suppression.
7. **Carte** : Leaflet et clusters dans `vendor/`, épingles colorées, filtres appliqués aux épingles, recadrage automatique, aperçu au tap, géolocalisation, tri par distance, itinéraire Plans, déplacement d'épingle en édition. *Test : la carte n'affiche que les lieux filtrés et l'itinéraire s'ouvre dans Plans.*
8. **Enrichissement et finitions** : Photon (recherche et « Je suis devant »), TMDB (clé dans les réglages, affiches, plateformes), iTunes, doublons par identifiant externe, cache des images et des tuiles, mode sombre, rappel de sauvegarde, attributions, écran À propos.

### Conseils de travail

- Tester sur l'iPhone après chaque étape : l'affichage et la saisie diffèrent souvent du simulateur de bureau.
- Après une mise à jour, fermer complètement l'app puis la rouvrir pour que le service worker prenne la nouvelle version.
- Garder le jeu de démonstration activé pendant le développement, puis le vider avant l'usage réel (export d'abord).

## 11. Critères d'acceptation

La V1 est terminée quand tous ces points sont vérifiés sur l'iPhone, en app installée.

### Installation et fonctionnement

- [ ] L'app s'installe sur l'écran d'accueil et s'ouvre en plein écran, sans barre Safari.
- [ ] L'en-tête et la barre d'onglets respectent l'encoche et la barre d'accueil.
- [ ] En mode avion, l'app s'ouvre, les listes et les fiches s'affichent, la carte montre les zones déjà consultées.
- [ ] Une nouvelle version déployée est proposée via le bandeau « Recharger ».

### Ajout et édition

- [ ] Une recommandation en saisie libre s'ajoute en moins de 10 secondes, hors ligne compris.
- [ ] Une recommandation peut avoir plusieurs personnes.
- [ ] Ajouter un film déjà présent propose d'ajouter la nouvelle personne à la recommandation existante.
- [ ] Marquer comme testé fonctionne depuis la fiche et par balayage, avec note facultative.
- [ ] Une suppression peut être annulée pendant 5 secondes.

### Filtres et carte

- [ ] Sur chaque onglet, les filtres personne, sous-catégorie et statut se combinent correctement et le compteur de résultats est juste.
- [ ] La recherche « cafe » trouve « Café ».
- [ ] Les filtres sont conservés après fermeture et réouverture de l'app.
- [ ] La carte n'affiche que les lieux filtrés et se recadre sur eux.
- [ ] Le tap sur une épingle ouvre l'aperçu, et « Itinéraire » ouvre Plans.
- [ ] La fiche d'une personne liste toutes ses recommandations, et « Voir ses lieux sur la carte » applique le filtre.

### Enrichissement

- [ ] La recherche d'un restaurant par son nom et sa ville place l'épingle au bon endroit et devine la sous-catégorie.
- [ ] « Je suis devant » remplit l'adresse à partir de la position GPS.
- [ ] Un film trouvé via TMDB affiche son affiche, son année et ses plateformes en France.
- [ ] Un podcast trouvé via iTunes affiche sa pochette et s'ouvre dans l'app Podcasts.
- [ ] Sans clé TMDB ou sans réseau, l'ajout reste possible en saisie libre.

### Données

- [ ] Un export puis un import dans un navigateur vierge restituent 100 % des recommandations et des personnes.
- [ ] L'import en mode Fusionner ne crée aucun doublon.
- [ ] Le rappel de sauvegarde apparaît après 14 jours sans export.
- [ ] Aucune clé API n'apparaît dans le dépôt GitHub.
- [ ] Les mentions OpenStreetMap, TMDB et JustWatch sont visibles.
