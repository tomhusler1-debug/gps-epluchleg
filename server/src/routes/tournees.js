const express = require('express');
const db = require('../db');
const { haversineDistance, nearestNeighborOrder } = require('../geo');

const router = express.Router();

function getTourneeWithStops(id) {
  const tournee = db.prepare('SELECT * FROM tournees WHERE id = ?').get(id);
  if (!tournee) return null;
  const stops = db
    .prepare(
      `SELECT c.*, ts.position
       FROM tournee_stops ts
       JOIN clients c ON c.id = ts.client_id
       WHERE ts.tournee_id = ?
       ORDER BY ts.position ASC`
    )
    .all(id);
  return { ...tournee, stops };
}

router.get('/', (req, res) => {
  const tournees = db.prepare('SELECT * FROM tournees ORDER BY date DESC, created_at DESC').all();
  const withCounts = tournees.map((t) => {
    const count = db
      .prepare('SELECT COUNT(*) as c FROM tournee_stops WHERE tournee_id = ?')
      .get(t.id).c;
    return { ...t, stopCount: count };
  });
  res.json(withCounts);
});

router.post('/', (req, res) => {
  const { name, date, clientIds } = req.body;
  if (!name) return res.status(400).json({ error: 'Le nom de la tournée est requis' });

  const insertTournee = db.prepare('INSERT INTO tournees (name, date) VALUES (?, ?)');
  const insertStop = db.prepare(
    'INSERT INTO tournee_stops (tournee_id, client_id, position) VALUES (?, ?, ?)'
  );

  const tourneeId = db.transaction(() => {
    const info = insertTournee.run(name, date || null);
    const tId = info.lastInsertRowid;
    (clientIds || []).forEach((clientId, idx) => insertStop.run(tId, clientId, idx));
    return tId;
  })();

  res.status(201).json(getTourneeWithStops(tourneeId));
});

router.get('/:id', (req, res) => {
  const tournee = getTourneeWithStops(req.params.id);
  if (!tournee) return res.status(404).json({ error: 'Tournée introuvable' });
  res.json(tournee);
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM tournees WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Tournée introuvable' });

  const { name, date } = req.body;
  db.prepare('UPDATE tournees SET name = ?, date = ? WHERE id = ?').run(
    name ?? existing.name,
    date ?? existing.date,
    req.params.id
  );
  res.json(getTourneeWithStops(req.params.id));
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM tournees WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Tournée introuvable' });
  res.status(204).end();
});

router.post('/:id/stops', (req, res) => {
  const { clientId } = req.body;
  const tournee = db.prepare('SELECT * FROM tournees WHERE id = ?').get(req.params.id);
  if (!tournee) return res.status(404).json({ error: 'Tournée introuvable' });
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Client introuvable' });

  const maxPos = db
    .prepare('SELECT MAX(position) as m FROM tournee_stops WHERE tournee_id = ?')
    .get(req.params.id).m;
  const nextPos = (maxPos === null ? -1 : maxPos) + 1;

  try {
    db.prepare(
      'INSERT INTO tournee_stops (tournee_id, client_id, position) VALUES (?, ?, ?)'
    ).run(req.params.id, clientId, nextPos);
  } catch (err) {
    return res.status(409).json({ error: 'Ce client est déjà dans la tournée' });
  }
  res.status(201).json(getTourneeWithStops(req.params.id));
});

router.delete('/:id/stops/:clientId', (req, res) => {
  db.prepare('DELETE FROM tournee_stops WHERE tournee_id = ? AND client_id = ?').run(
    req.params.id,
    req.params.clientId
  );
  res.json(getTourneeWithStops(req.params.id));
});

router.put('/:id/order', (req, res) => {
  const { clientIds } = req.body;
  const update = db.prepare(
    'UPDATE tournee_stops SET position = ? WHERE tournee_id = ? AND client_id = ?'
  );
  db.transaction(() => {
    (clientIds || []).forEach((clientId, idx) => update.run(idx, req.params.id, clientId));
  })();
  res.json(getTourneeWithStops(req.params.id));
});

router.post('/:id/optimize', (req, res) => {
  const tournee = getTourneeWithStops(req.params.id);
  if (!tournee) return res.status(404).json({ error: 'Tournée introuvable' });
  const stopsWithCoords = tournee.stops.filter((s) => s.lat != null && s.lng != null);
  if (!stopsWithCoords.length) return res.json(tournee);

  const ordered = nearestNeighborOrder(stopsWithCoords, stopsWithCoords[0].lat, stopsWithCoords[0].lng);
  const update = db.prepare(
    'UPDATE tournee_stops SET position = ? WHERE tournee_id = ? AND client_id = ?'
  );
  db.transaction(() => {
    ordered.forEach((client, idx) => update.run(idx, req.params.id, client.id));
  })();
  res.json(getTourneeWithStops(req.params.id));
});

// Clients proches d'au moins une étape de la tournée, pas encore ajoutés
router.get('/:id/suggestions', (req, res) => {
  const radius = parseFloat(req.query.radius) || 1000;
  const tournee = getTourneeWithStops(req.params.id);
  if (!tournee) return res.status(404).json({ error: 'Tournée introuvable' });

  const stopIds = new Set(tournee.stops.map((s) => s.id));
  const stopsWithCoords = tournee.stops.filter((s) => s.lat != null && s.lng != null);
  if (!stopsWithCoords.length) return res.json([]);

  const allClients = db
    .prepare('SELECT * FROM clients WHERE lat IS NOT NULL AND lng IS NOT NULL')
    .all();
  const suggestions = [];

  for (const client of allClients) {
    if (stopIds.has(client.id)) continue;
    let minDist = Infinity;
    let nearestStop = null;
    for (const stop of stopsWithCoords) {
      const d = haversineDistance(client.lat, client.lng, stop.lat, stop.lng);
      if (d < minDist) {
        minDist = d;
        nearestStop = stop;
      }
    }
    if (minDist <= radius) {
      suggestions.push({ ...client, distance: Math.round(minDist), nearestStopName: nearestStop.name });
    }
  }

  suggestions.sort((a, b) => a.distance - b.distance);
  res.json(suggestions);
});

module.exports = router;
