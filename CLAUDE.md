# À tester — consignes pour Claude Code

- Le cahier des charges complet est dans SPEC.md : le relire avant chaque étape. Les améliorations et écarts déjà décidés sont dans AMELIORATIONS.md.
- JavaScript vanilla en modules ES, sans étape de build ni framework.
- Librairies externes copiées dans vendor/, jamais chargées depuis un CDN.
- Chemins toujours relatifs (l'app est servie depuis un sous-dossier sur GitHub Pages).
- Aucune clé API dans le code ou le dépôt.
- Interface et textes en français ; icônes Lucide dans js/components/icons.js (régénérées par tools/extract-icons.mjs), aucun emoji.
- Toute couleur passe par les variables de css/tokens.css (thèmes clair et sombre).
- Les vues ne parlent jamais directement à la base ni aux API : tout passe par js/store/ et js/services/.
- À chaque modification de fichier servi : incrémenter CACHE_VERSION dans sw.js et APP_VERSION dans js/config.js (même numéro), puis lancer `node tools/check-sw.mjs` (liste de pré-cache et versions).
- Tester avec Playwright (Chromium préinstallé, PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers) sur un viewport iPhone 390 × 844, en clair et en sombre, avec les API externes simulées (Photon, TMDB, iTunes, tuiles).
- Une seule branche : main, source de GitHub Pages. Committer et pousser directement sur main, sauf demande contraire.
- Ne réaliser que l'étape demandée ; signaler les écarts avec SPEC.md au lieu de les décider seul.
- Terminer chaque étape par : liste des fichiers modifiés, points à tester sur iPhone, commit et push.
