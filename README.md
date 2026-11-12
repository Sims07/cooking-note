# cooking-note

## PWA et coexistence sur GitHub Pages

Cette application est publiée sous `https://sims07.github.io/cooking-note/`.
Le fichier `manifest.webmanifest` lui donne un identifiant **absolu et propre au
répertoire** (`/cooking-note/`). Ne pas utiliser `id: "./"` : Chrome peut
résoudre cette valeur en `https://sims07.github.io/` et confondre l'installation
avec d'autres PWA du même domaine, comme Companion Correcteur de Devoirs.

Le service worker conserve l'accès hors ligne, mais ne purge que les caches
préfixés `saveurs-shell-` ou `saveurs-runtime-` lors des mises à jour.
Il ne doit pas supprimer les caches des autres applications de l'origine.

### Installation Chrome existante

Après publication, l'ancienne installation Chrome peut toujours être associée
à l'identifiant racine. Si elle propose d'ouvrir d'autres projets, désinstaller
**uniquement l'application installée** « Saveurs & Notes » depuis Chrome,
puis la réinstaller depuis `/cooking-note/`. Éviter de cocher une option
supprimant les données du site tant que les informations locales ne sont pas
sauvegardées. Les installations existantes ne changent pas toutes d'identité
automatiquement lors d'une mise à jour du manifeste.

### Tests

Sans dépendances : `node --test tests/pwa.test.mjs`.
