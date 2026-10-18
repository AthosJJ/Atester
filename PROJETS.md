# À tester — projets en attente

Projets demandés mais pas encore commencés. Ne rien réaliser sans nouvelle demande.

## 1. Envoi de recommandations entre utilisateurs (plan présenté, à valider)

Cahier des charges : demande du 17 octobre 2026 (pseudo public, « Envoyer à… », Reçues et Envoyées, blocage, règles de sécurité). Test d'abord sur la bêta (dépôt `atester-beta`, `https://athosjj.github.io/atester-beta/`), sans toucher à la version publiée.

**Analyse faite**

- La bêta utilise le même projet Firebase (`athos-apps`) et la même appli web que la version publiée : tout doit être additif (nouvelles collections et nouveaux documents seulement).
- Même domaine que la version publiée. Dans un même navigateur (Android, onglets Safari ou Chrome ; pas entre deux apps de l'écran d'accueil sur iPhone), les deux versions partagent la session Firebase, le cache Firestore, le stockage local et les caches des service workers. Chaque activation de service worker efface les caches `a-tester-*` de l'autre. Correctif prévu, actif seulement sous `/atester-beta/` : instance Firebase nommée (session et cache Firestore séparés), préfixe de stockage local et de caches propre à la bêta, nettoyage limité à ses propres caches, import de l'ancien stockage 1.x désactivé. La version publiée garde ses noms actuels.
- La version 2.0.3 réécrit des documents entiers (import, fusion de personnes) : aucun champ nouveau sur les fiches ni les personnes.

**Modèle de données prévu**

- `usernames/{pseudo en minuscules}` → `{ uid }` : verrou d'unicité.
- `profiles/{uid}` → `{ pseudo, pseudoLower }` : rien d'autre, jamais l'e-mail.
- `apps/atester/shares/{id}` → expéditeur et destinataire (uid et pseudo), message (500 caractères au plus), fiche descriptive, état `pending` / `accepted` / `refused`, dates du serveur.
- Privé, sous `users/{uid}/apps/atester` (déjà couvert par la règle actuelle) : `blocks/{uid de l'expéditeur}` et `senderLinks/{uid de l'expéditeur}` → `{ personId }`.
- Fiche envoyée : catégorie, sous-catégorie (clé et nom ; chez le destinataire : même clé, sinon même nom, sinon « Autre »), titre, lien, détails TMDB, lieu ou podcast. Jamais : statut, note, avis, favori, « Ce qu'on m'en a dit », personnes, photos, dates.
- Reco acceptée : fiche ordinaire, expéditeur dans « Recommandé par », message dans « Ce qu'on m'en a dit ». Fiche, personne éventuelle, rattachement et état de l'envoi dans un seul lot atomique.

**Règles** : les règles actuelles de la console recopiées à l'identique, plus trois blocs (`usernames`, `profiles`, `apps/atester/shares`). Pseudos et profils lisibles un par un, jamais en liste ; pseudo et profil écrits ensemble (`getAfter`), ancien pseudo libéré, un seul pseudo par compte. Envois : création en son nom avec son vrai pseudo, vers un profil existant autre que soi qui ne l'a pas bloqué (`exists` sur sa liste privée), champs et tailles contrôlés, date `request.time` ; lecture par l'expéditeur et le destinataire ; modification par le destinataire seulement (`pending` vers `accepted` ou `refused`) ; suppression par l'expéditeur tant que c'est en attente. Aucun index composite (requêtes par égalité, tri dans l'app).

**Interface** : « Envoyer à… » sur la fiche (icône avion en papier et menu « … ») avec raccourcis des pseudos déjà échangés (retrouvés par uid, jamais par un ancien pseudo) ; choix du pseudo à la première utilisation ; icône boîte de réception avec pastille en temps réel en haut des onglets, écran Échanges (Reçues, Envoyées) ; Réglages › Partage (pseudo, déblocage). Actions d'échange seulement en ligne.

**Avant de commencer**

- Demander le fichier de règles actuel de la console (il couvre aussi Lecture).
- Faire trancher : (1) laisser l'expéditeur annuler aussi un envoi refusé, pour que le refus reste invisible dans l'app (variante plus stricte : refus privé chez le destinataire, l'envoi reste « en attente ») ; (2) pseudo sans accents (a à z, chiffres, point, tiret, tiret bas) ; (3) nom « À tester β » pour la bêta, facultatif.
- Branche `envois` depuis `main`, version 2.1.0 publiée seulement sur le `main` d'`atester-beta`.

## 2. Retour à la personne qui a recommandé (idée, plus tard)

Prévenir la personne qui a recommandé une fiche quand on l'a testée, avec la note et le commentaire : « Pierre a vu ton film, il l'a noté 4 étoiles », « Pierre aime ton restaurant ! ».

- S'appuie sur le projet 1 : la personne doit être rattachée à un compte (rattachement mémorisé à la réception d'un envoi, ou à faire depuis sa fiche pour une reco faite de vive voix).
- Prévoir dès le projet 1 de mémoriser, chez le destinataire et en privé, de quel envoi vient chaque fiche acceptée.
- Sans Cloud Functions (forfait Spark), pas de notification système : un message dans Échanges, avec la pastille. Une vraie notification demanderait un petit serveur hors Firebase.
- À décider : envoi proposé à chaque fois (« Dire à Pierre ? ») ou automatique ; ce qui part (note, avis, ou seulement « a aimé »).
