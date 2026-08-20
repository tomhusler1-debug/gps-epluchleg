const express = require('express');
const app = require('./api/index');

// En production (Vercel), les fichiers statiques sont servis automatiquement
// par la plateforme. Ce fichier sert uniquement au développement local.
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`GPS Tournées (dev local) démarré sur http://localhost:${PORT}`);
});
