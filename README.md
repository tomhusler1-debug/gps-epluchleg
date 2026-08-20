# gps-epluchleg

Application de gestion de tournées : enregistrez vos clients et leurs adresses, visualisez-les sur une carte, créez des tournées, et découvrez les clients à proximité d'une tournée pour les y ajouter facilement.

## Fonctionnalités

- **Clients** : ajout, modification, suppression. Chaque adresse est automatiquement géolocalisée (latitude/longitude).
- **Carte** : tous les clients sont affichés sur une carte OpenStreetMap.
- **Tournées** : créez une tournée (nom + date), ajoutez-y des clients, réordonnez les étapes manuellement ou automatiquement (bouton "Optimiser l'ordre", qui calcule le trajet le plus court de proche en proche). Le trajet routier réel (et non une simple ligne droite) est affiché sur la carte avec la distance et la durée estimées.
- **Clients à proximité** : pour une tournée ouverte, l'application liste les clients qui ne sont pas encore dans la tournée mais se trouvent à proximité (rayon réglable : 300 m à 5 km) d'une des étapes, avec la distance exacte et un bouton pour les ajouter en un clic.
- **Itinéraire entre plusieurs clients** : dans l'onglet Clients, cochez plusieurs clients pour faire apparaître une barre d'action permettant de tracer l'itinéraire routier optimisé entre eux sur la carte (distance + durée), ou d'ouvrir directement la navigation GPS turn-by-turn dans Google Maps sur votre téléphone.

## Fonctionnement technique

Application conçue pour être hébergée **gratuitement sur [Vercel](https://vercel.com)**, sans base de données SQL :

- **Backend** : fonctions serverless Node.js/Express (`api/`), compatibles avec l'hébergement de Vercel.
- **Stockage des données** : [Upstash Redis](https://upstash.com) — une base clé/valeur gratuite, sans SQL. En local sans configuration, un stockage en mémoire simule Redis (les données sont perdues au redémarrage, pratique pour tester).
- **Géocodage** : les adresses sont converties en coordonnées via l'API publique [Nominatim (OpenStreetMap)](https://nominatim.org/), avec mise en cache dans Redis.
- **Calcul d'itinéraire** : les trajets routiers réels (distance, durée, tracé) sont calculés via le service public [OSRM](https://project-osrm.org/) (gratuit, sans clé). En cas d'indisponibilité, l'application se replie sur une ligne droite entre les points.
- **Frontend** : HTML/CSS/JavaScript à la racine du dépôt, sans étape de build, avec [Leaflet](https://leafletjs.com/) pour la carte (fournie localement dans `vendor/leaflet`).

## Développement local

Prérequis : [Node.js](https://nodejs.org/) 18 ou plus récent.

```bash
npm install
npm run dev
```

Puis ouvrez [http://localhost:3000](http://localhost:3000). Sans configuration, les données sont stockées en mémoire (perdues à chaque redémarrage) — largement suffisant pour tester. Pour utiliser une vraie base Redis même en local, copiez `.env.example` en `.env` et renseignez les identifiants Upstash (voir ci-dessous).

## Déployer sur Vercel

### 1. Créer une base Redis gratuite (Upstash)

Les fonctions serverless de Vercel n'ont pas de disque persistant : sans base externe, vos clients seraient perdus à chaque redéploiement.

**Option la plus simple** : dans votre projet Vercel → onglet **Storage** → **Create Database** → choisissez une base **Upstash Redis** (ou "Marketplace Database Storage" selon la version du tableau de bord). Vercel connecte automatiquement la base à votre projet et renseigne les variables d'environnement nécessaires — aucune étape manuelle supplémentaire.

**Option manuelle** (si l'intégration n'est pas proposée) :
1. Créez un compte gratuit sur [upstash.com](https://upstash.com).
2. Créez une nouvelle base **Redis**.
3. Dans l'onglet "REST API" de la base, récupérez `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN`.
4. Dans votre projet Vercel → **Settings** → **Environment Variables**, ajoutez ces deux variables avec les valeurs récupérées.

### 2. Déployer

1. Sur [vercel.com](https://vercel.com), cliquez sur "Add New" → "Project" et sélectionnez ce dépôt GitHub.
2. Aucune configuration particulière n'est nécessaire : le dépôt est structuré à la racine (pas de sous-dossier), Vercel détecte automatiquement le dossier `api/` (fonctions serverless) et sert les fichiers statiques (`index.html`, `app.js`, etc.) directement.
3. Déployez. Vos clients et tournées seront conservés durablement grâce à la base Redis connectée à l'étape précédente.

### Dépannage

- **404 NOT_FOUND en visitant le site** : vérifiez qu'aucun "Root Directory" personnalisé n'est configuré dans Settings → General (il doit être vide/racine).
- **Les clients disparaissent après un moment / un redéploiement** : la base Upstash n'est pas connectée, ou les variables `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` sont absentes — vérifiez Settings → Environment Variables, puis redéployez.
