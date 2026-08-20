# gps-epluchleg

Application de gestion de tournées : enregistrez vos clients et leurs adresses dans une base de données, visualisez-les sur une carte, créez des tournées, et découvrez les clients à proximité d'une tournée pour les y ajouter facilement.

## Fonctionnalités

- **Clients** : ajout, modification, suppression. Chaque adresse est automatiquement géolocalisée (latitude/longitude) et stockée en base de données (SQLite, fichier local).
- **Carte** : tous les clients sont affichés sur une carte OpenStreetMap.
- **Tournées** : créez une tournée (nom + date), ajoutez-y des clients, réordonnez les étapes manuellement ou automatiquement (bouton "Optimiser l'ordre", qui calcule le trajet le plus court de proche en proche).
- **Clients à proximité** : pour une tournée ouverte, l'application liste les clients qui ne sont pas encore dans la tournée mais se trouvent à proximité (rayon réglable : 300 m à 5 km) d'une des étapes, avec la distance exacte et un bouton pour les ajouter en un clic.

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

- **Backend** : Node.js + Express, base de données SQLite (`better-sqlite3`).
- **Géocodage** : les adresses sont converties en coordonnées via l'API publique [Nominatim (OpenStreetMap)](https://nominatim.org/), avec mise en cache des résultats pour éviter les appels répétés. Une connexion internet est donc nécessaire pour ajouter un nouveau client et pour charger les fonds de carte.
- **Frontend** : HTML/CSS/JavaScript, sans étape de build, avec [Leaflet](https://leafletjs.com/) pour la carte (fournie localement dans `server/public/vendor/leaflet`).

## Développement

```bash
cd server
npm run dev
```

Redémarre automatiquement le serveur à chaque modification des fichiers dans `server/src`.
