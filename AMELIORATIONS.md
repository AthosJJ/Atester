# À tester — améliorations ergonomiques intégrées à la V1

Le descriptif (`SPEC.md`) est suivi dans son intégralité. En l'analysant, plusieurs points pouvaient ralentir l'usage au quotidien ou rester ambigus. Voici ce qui a été ajusté, et pourquoi.

## 1. Ajout rapide : viser 5 secondes plutôt que 10

| Dans le descriptif | Dans l'app | Pourquoi |
| --- | --- | --- |
| Étape 1 « Catégorie » sur un écran à part quand l'ajout ne part pas d'un onglet | Un seul écran : trois boutons ronds en haut de la feuille, catégorie pré-sélectionnée (onglet courant, sinon la dernière utilisée) | Aucun écran intermédiaire, le clavier s'ouvre toujours directement sur « Quoi » |
| Bouton Enregistrer désactivé tant qu'il manque un champ | Bouton estompé mais touchable : un tap le fait vibrer et indique ce qui manque (« Qu'est-ce qu'on t'a conseillé ? », « Indique qui te l'a conseillé ») | Un bouton grisé sans explication est la première source de blocage dans un formulaire |
| Position du bouton non précisée | « Ajouter » en pied de feuille, dans la zone du pouce, et collé au-dessus du clavier quand il est ouvert | Enregistrer d'une main |
| Taper un prénom inconnu propose « Créer » | La personne n'est créée qu'à l'enregistrement ; les suggestions tolèrent accents et fautes légères (« Paulo » propose « Paul ») | Pas de personne orpheline si l'on annule, et moins de fusions à faire ensuite |
| — | Brouillon conservé 30 min si la feuille se ferme par erreur (glissement, tap sur le fond) ; la croix annule vraiment | Même logique que l'app Lecture |
| Date « aujourd'hui par défaut » | Raccourcis « Aujourd'hui » et « Hier » au-dessus du sélecteur de date | Le cas le plus fréquent après « aujourd'hui » |
| Sous-catégorie devinée pour les lieux et les films | Aussi pour les podcasts (genres Apple Podcasts) et les documentaires (genre TMDB) | Un tap de moins |
| Sans réseau ou sans clé : pas de suggestions | La raison s'affiche discrètement (« hors ligne : saisie libre », « sans clé TMDB : saisie libre ») | On sait que ce n'est pas un bug |
| Clé TMDB | Clé v3 ou jeton de lecture v4 acceptés, lien direct vers la page TMDB où la créer, bouton « Tester la clé » | Les deux formats sont proposés par TMDB |
| Après l'ajout : retour à l'onglet + « Ajouté · Voir » | La nouvelle carte pulse ; un lieu est centré sur la carte avec son aperçu ouvert ; si les filtres le masquent : « Ajouté (masqué par tes filtres) » ; depuis la fiche d'une personne, on y reste | On voit tout de suite où l'élément a atterri |
| Doublon : « Ajouter Marie à cette recommandation » | Idem, et « ce qu'on m'en a dit » est ajouté avec le prénom ; si la personne y est déjà : « Déjà dans ta liste » + « Voir la fiche » | Évite une proposition absurde (s'ajouter soi-même) |

## 2. Listes, filtres et navigation

- **Recherche repliée dans un bouton rond** : le champ s'ouvre d'un tap (clavier ouvert) et libère environ 50 px pour la carte et les listes.
- **Barre compacte au défilement** (titre et bouton Filtres) : les filtres restent à portée sans remonter.
- **Ligne « 12 lieux · Plus récent ⌄ »** au-dessus des listes : le nombre de résultats et le tri sont visibles et à un tap (le descriptif ne situait pas le tri).
- **Un seul état de statut** : le contrôle « À voir / Vu / Tout » et la section Statut du panneau pilotent le même filtre ; le statut par défaut ne gonfle pas le badge du bouton Filtres ; chaque segment affiche son compteur.
- **Rangée de puces utile** : seules les sous-catégories qui contiennent au moins un élément y figurent.
- **Panneau de filtres en direct** : la liste bouge derrière pendant qu'on coche ; le fermer en glissant garde la sélection.
- **Balayage dans les deux sens** : à gauche « testé » (ou « remettre à tester » si c'est déjà fait), à droite « favori », avec couleur et icône ; une astuce l'explique une fois.
- **Appui long** sur une carte ou une affiche : menu d'actions rapides (le balayage est peu pratique dans une grille d'affiches).
- **Annulation partout** : statut, « Pas pour moi », suppression d'une recommandation ou d'une personne.
- Toucher l'onglet actif remonte en haut ; l'app se rouvre sur le dernier onglet utilisé, avec ses filtres.

## 3. Carte

- **Aperçu flottant non bloquant** : on peut toucher une autre épingle ou déplacer la carte sans le fermer. En plus d'« Itinéraire » et « Voir la fiche », un bouton rond « Testé » (pratique quand on est sur place).
- **Compteur « 5 lieux · 1 sans position »** posé sur la carte : les lieux à localiser ne sont pas oubliés ; un tap ouvre la liste.
- **Groupes colorés** : l'anneau d'un groupe reprend les couleurs des sous-catégories qu'il contient.
- **Bouton « Recadrer »** en plus de « Me localiser » ; revenir sur l'onglet conserve le cadrage choisi.
- **Distances** affichées dès que la localisation est déjà autorisée, sans jamais la demander au lancement.
- En édition, on peut aussi **toucher la mini-carte** pour placer un lieu qui n'a pas encore de position.

## 4. Fiches

- **Action principale dans la zone du pouce** (« Marquer comme testé ») et favori en bouton rond ; modifier et le menu « … » en haut.
- **Fiche personne façon fiche contact iOS** : boutons ronds « Ses lieux », « Ajouter », « Photo », « Plus ». La fusion propose d'abord les prénoms proches ; une suppression impossible propose directement la fusion.
- **Partager** une recommandation (feuille de partage iOS) depuis le menu « … ».

## 5. Données

- **Exemples proposés dès le premier lancement** (état vide), et retirables en un geste sans toucher aux vraies données.
- **Import « Fusionner » sans aucun doublon**, y compris quand le même film ou le même lieu a été saisi séparément sur deux appareils (identifiants différents) : les personnes sont réunies.
- **Rappel de sauvegarde actionnable** : le bandeau contient directement le bouton « Exporter ».
- La clé TMDB n'est jamais exportée.

## 6. Design et confort

- **Boutons ronds et animations** : boutons à ressort, bulle qui suit l'onglet actif, bouton + en relief, épingles qui tombent sur la carte, cartes qui apparaissent en cascade, coche animée et confettis quand on marque comme testé, retour haptique sur iOS 18+. Tout est coupé si « Réduire les animations » est activé.
- **Contraste automatique** : icône blanche ou sombre selon la couleur de la sous-catégorie (le miel de « Boulangerie » ne permet pas le blanc).
- **Barre d'état sans bande** : le fond de l'app monte jusqu'en haut de l'écran ; iOS écrit l'heure en noir en thème clair et en blanc en thème sombre (voir la version 1.1 ci-dessous).
- **Cibles d'au moins 44 × 44 px** partout (zones de toucher étendues autour des petits boutons), textes de saisie à 16 px.
- **Écrans de lancement iOS** et icône dédiée (bulle « on m'a conseillé » + coche « testé »).

## 7. Écarts techniques assumés

- Modules ajoutés à la structure prévue : `js/utils.js`, `js/store/settings.js` (table `meta`), `js/services/{http,geo,map,demo}.js`, `js/views/{content-tab,empty,hints}.js`, `js/components/{reco-actions,swipe,celebrate}.js`, et `tools/` (icônes, contrôle du service worker).
- Seul le cache de la coquille est purgé à chaque version : les tuiles et les affiches déjà vues restent disponibles hors ligne après une mise à jour.
- `#/ajout` ouvre la feuille d'ajout par-dessus l'onglet de la catégorie (c'est un panneau, pas une page).
- Grand titre à 30 px en police arrondie (SF Pro Rounded sur iPhone) au lieu de 28 px.

## 8. Version 1.1 : ajustements demandés après essai

| Dans le descriptif | Dans l'app | Pourquoi |
| --- | --- | --- |
| Accent unique terracotta `#E07A5F` | Palette « Encre » : boutons pleins encre (texte crème), touches de corail `#E8846A` (onglet actif, icônes, liens) ; en sombre, boutons crème. Icône et écrans de lancement recolorés | Le terracotta en aplat paraissait lourd ; l'encre garde le caractère chaleureux avec plus de légèreté |
| `apple-mobile-web-app-status-bar-style` : `black-translucent` | `default`, avec `theme-color` crème en clair et brun nuit en sombre : plus de bande colorée, la couleur du fond continue jusqu'en haut | Demande explicite : pas de bande en haut. Sur un iPhone où l'app est déjà installée, la retirer puis la réinstaller peut être nécessaire pour qu'iOS prenne le nouveau réglage |
| Tuiles `tile.openstreetmap.org`, filtre CSS en mode sombre | Fonds CARTO (données OpenStreetMap), nets sur écran Retina : « Couleurs douces » (Voyager, par défaut) ou « Épuré » (Positron) au choix dans Réglages › Carte et itinéraire ; « Dark Matter » en thème sombre, sans filtre | Carte plus épurée et plus lisible sous les épingles. Attribution « © OpenStreetMap © CARTO » sur la carte et dans À propos ; service gratuit pour un usage personnel non commercial |
| « Itinéraire » ouvre Plans | Feuille « Itinéraire avec… » : Plans, Google Maps ou Waze ; Réglages › Carte et itinéraire permet de choisir une app par défaut (le bouton ouvre alors directement cette app) | On ne peut pas savoir quelles apps sont installées ; chaque choix est un lien universel (l'app s'ouvre si elle est là, son site sinon) |
| Avatar : initiales sur la couleur de la personne | Photo facultative : touche l'avatar (pastille appareil photo) ou le bouton rond « Photo » de sa fiche, choisis dans la photothèque ou prends une photo, puis recadre (glisser, pincer ou curseur de zoom) dans un cercle. La photo apparaît partout où la personne apparaît ; « Retirer » s'annule. La couleur reste utilisée pour ses étiquettes | Reconnaître les gens d'un coup d'œil |
| Format d'export : `id`, `name`, `color`, `isMe`, `createdAt` | Champ facultatif `photo` (JPEG carré de 320 px en data URL, environ 30 Ko) ; `schemaVersion` reste à 1. À l'import, une photo invalide est ignorée ; en fusion, une personne sans photo reprend celle de la sauvegarde | La sauvegarde reste complète ; une ancienne version de l'app ignore simplement ce champ |

Autres points de cette version :

- Le cache des tuiles change de nom (`a-tester-tiles-carto`) : les anciennes tuiles OpenStreetMap sont purgées à la mise à jour, les tuiles CARTO déjà vues restent disponibles hors ligne.
- L'aperçu de la carte, une fois fermé, ne dépasse plus derrière la barre d'onglets.
- Nouveaux modules : `js/services/photo.js` (préparation, contrôle et affichage des photos), `js/components/photo-crop.js` (recadrage), `js/components/directions.js` (choix de l'app d'itinéraire).
