const express = require('express');
const { getRoute, getTrip } = require('../osrm');

const router = express.Router();

function parsePoints(body) {
  const { points } = body;
  if (!Array.isArray(points) || points.length < 2) return null;
  if (!points.every((p) => typeof p.lat === 'number' && typeof p.lng === 'number')) return null;
  return points;
}

// Itinéraire dans l'ordre exact fourni (ex : les étapes d'une tournée déjà ordonnée).
router.post('/', async (req, res) => {
  const points = parsePoints(req.body);
  if (!points) return res.status(400).json({ error: 'Il faut au moins deux points valides (lat, lng)' });

  try {
    res.json(await getRoute(points));
  } catch (err) {
    res.status(err.notFound ? 422 : 500).json({ error: err.message });
  }
});

// Itinéraire avec ordre de passage optimisé (ex : sélection libre de clients).
router.post('/trip', async (req, res) => {
  const points = parsePoints(req.body);
  if (!points) return res.status(400).json({ error: 'Il faut au moins deux points valides (lat, lng)' });

  try {
    res.json(await getTrip(points));
  } catch (err) {
    res.status(err.notFound ? 422 : 500).json({ error: err.message });
  }
});

module.exports = router;
