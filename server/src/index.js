const express = require('express');
const path = require('path');

const db = require('./db');
const clientsRouter = require('./routes/clients');
const tourneesRouter = require('./routes/tournees');
const routeRouter = require('./routes/route');

const app = express();
app.use(express.json());

app.use('/api/clients', clientsRouter);
app.use('/api/tournees', tourneesRouter);
app.use('/api/route', routeRouter);

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const PORT = process.env.PORT || 3000;

db.init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`GPS Tournées démarré sur http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Erreur au démarrage de la base de données :', err);
    process.exit(1);
  });
