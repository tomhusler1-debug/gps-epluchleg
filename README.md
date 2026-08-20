# gps-epluchleg

Application de gestion de tournées : enregistrez vos clients et leurs adresses dans une base de données, visualisez-les sur une carte, créez des tournées, et découvrez les clients à proximité d'une tournée pour les y ajouter facilement.

## Fonctionnalités

- **Clients** : ajout, modification, suppression. Chaque adresse est automatiquement géolocalisée (latitude/longitude) et stockée en base de données (SQLite, fichier local).
- **Carte** : tous les clients sont affichés sur une carte OpenStreetMap.
- **Tournées** : créez une tournée (nom + date), ajoutez-y des clients, réordonnez les étapes manuellement ou automatiquement (bouton "Optimiser l'ordre", qui calcule le trajet le plus court de proche en proche). Le trajet routier réel (et non plus une simple ligne droite) est affiché sur la carte avec la distance et la durée estimées.
- **Clients à proximité** : pour une tournée ouverte, l'application liste les clients qui ne sont pas encore dans la tournée mais se trouvent à proximité (rayon réglable : 300 m à 5 km) d'une des étapes, avec la distance exacte et un bouton pour les ajouter en un clic.
- **Itinéraire entre plusieurs clients** : dans l'onglet Clients, cochez plusieurs clients pour faire apparaître une barre d'action permettant de tracer l'itinéraire routier optimisé entre eux sur la carte (distance + durée), ou d'ouvrir directement la navigation GPS turn-by-turn dans Google Maps sur votre téléphone.

## Démarrage

Prérequis : [Node.js](https://nodejs.org/) 18 ou plus récent.

```bash
cd server
npm install
npm start
```

Puis ouvrez [http://localhost:3000](http://localhost:3000) dans votre navigateur.

Les données (clients, tournées) sont stockées dans `server/data/gps.db`, un fichier SQLite créé automatiquement au premier démarrage. Cette base persiste tant que le fichier n'est pas supprimé.

## Fonctionnement technique

- **Backend** : Node.js + Express, base de données SQLite compatible cloud (`@libsql/client`). En local, sans configuration, les données sont stockées dans un fichier (`server/data/gps.db`). En ligne, on pointe vers une base [Turso](https://turso.tech) gratuite pour que les données ne soient jamais perdues (voir ci-dessous).
- **Géocodage** : les adresses sont converties en coordonnées via l'API publique [Nominatim (OpenStreetMap)](https://nominatim.org/), avec mise en cache des résultats pour éviter les appels répétés. Une connexion internet est donc nécessaire pour ajouter un nouveau client et pour charger les fonds de carte.
- **Calcul d'itinéraire** : les trajets routiers réels (distance, durée, tracé) sont calculés via le service public [OSRM](https://project-osrm.org/) (serveur de démonstration, gratuit et sans clé). En cas d'indisponibilité, l'application se replie automatiquement sur une ligne droite entre les points.
- **Frontend** : HTML/CSS/JavaScript, sans étape de build, avec [Leaflet](https://leafletjs.com/) pour la carte (fournie localement dans `server/public/vendor/leaflet`).

## Développement

```bash
cd server
npm run dev
```

Redémarre automatiquement le serveur à chaque modification des fichiers dans `server/src`.

## Déployer en ligne (Render ou Railway)

⚠️ Cette application ne peut **pas** être déployée sur Vercel : c'est un serveur qui tourne en continu (pas une fonction serverless), incompatible avec ce type d'hébergement.

### 1. Créer une base de données gratuite sur Turso

Les hébergeurs comme Render ou Railway ne garantissent pas de disque persistant sur leurs offres gratuites : sans base externe, vos clients seraient effacés à chaque redéploiement. [Turso](https://turso.tech) fournit une base SQLite hébergée gratuitement qui résout ce problème.

1. Créez un compte gratuit sur [turso.tech](https://turso.tech) (connexion possible avec GitHub).
2. Créez une nouvelle base de données (bouton "Create Database").
3. Récupérez son **URL** (commence par `libsql://...`) et générez un **Auth Token** — ces deux informations sont affichées dans le tableau de bord de la base.

### 2. Déployer sur Render (ou Railway)

**Option simple sur Render : utiliser le fichier `render.yaml`** — ce dépôt en contient un à sa racine qui préconfigure tout automatiquement. Sur [render.com](https://render.com) : "New" → "Blueprint" → sélectionnez ce dépôt. Render détecte `render.yaml` et vous demande uniquement de saisir les deux valeurs Turso (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`) avant de déployer.

**Configuration manuelle (Render "Web Service" classique, ou Railway)** :

1. Connectez votre compte GitHub et sélectionnez ce dépôt.
2. Configurez :
   - **Root directory** : `server` ⚠️ étape la plus souvent oubliée — sans elle, l'hébergeur cherche `package.json` à la racine du dépôt (où il n'y en a pas) et l'erreur `Couldn't find a package.json file` apparaît.
   - **Build command** : `npm install`
   - **Start command** : `npm start` (pas `yarn start` — ce dépôt n'utilise pas Yarn)
3. Ajoutez les variables d'environnement :
   - `TURSO_DATABASE_URL` = l'URL récupérée à l'étape précédente
   - `TURSO_AUTH_TOKEN` = le token récupéré à l'étape précédente
4. Déployez. Vos clients et tournées seront désormais conservés durablement, même après un redémarrage ou un nouveau déploiement.

### Dépannage : `Couldn't find a package.json file in "/opt/render/project/src"`

Cette erreur signifie que le **Root directory** n'est pas réglé sur `server`. Dans le tableau de bord Render, ouvrez votre service → **Settings** → **Build & Deploy**, mettez `server` dans le champ "Root Directory", vérifiez aussi que "Start Command" est bien `npm start`, puis relancez un déploiement manuel ("Manual Deploy" → "Deploy latest commit").
