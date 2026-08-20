const express = require('express');
const { client } = require('../db');
const { haversineDistance, nearestNeighborOrder } = require('../geo');

const router = express.Router();

async function getTourneeWithStops(id) {
  const tourneeRs = await client.execute({ sql: 'SELECT * FROM tournees WHERE id = ?', args: [id] });
  const tournee = tourneeRs.rows[0];
  if (!tournee) return null;
  const stopsRs = await client.execute({
    sql: `SELECT c.*, ts.position
          FROM tournee_stops ts
          JOIN clients c ON c.id = ts.client_id
          WHERE ts.tournee_id = ?
          ORDER BY ts.position ASC`,
    args: [id],
  });
  return { ...tournee, stops: stopsRs.rows };
}

router.get('/', async (req, res) => {
  const tourneesRs = await client.execute('SELECT * FROM tournees ORDER BY date DESC, created_at DESC');
  const withCounts = await Promise.all(
    tourneesRs.rows.map(async (t) => {
      const countRs = await client.execute({
        sql: 'SELECT COUNT(*) as c FROM tournee_stops WHERE tournee_id = ?',
        args: [t.id],
      });
      return { ...t, stopCount: countRs.rows[0].c };
    })
  );
  res.json(withCounts);
});

router.post('/', async (req, res) => {
  const { name, date, clientIds } = req.body;
  if (!name) return res.status(400).json({ error: 'Le nom de la tournée est requis' });

  const info = await client.execute({
    sql: 'INSERT INTO tournees (name, date) VALUES (?, ?)',
    args: [name, date || null],
  });
  const tId = Number(info.lastInsertRowid);

  if (clientIds && clientIds.length) {
    await client.batch(
      clientIds.map((clientId, idx) => ({
        sql: 'INSERT INTO tournee_stops (tournee_id, client_id, position) VALUES (?, ?, ?)',
        args: [tId, clientId, idx],
      })),
      'write'
    );
  }

  res.status(201).json(await getTourneeWithStops(tId));
});

router.get('/:id', async (req, res) => {
  const tournee = await getTourneeWithStops(req.params.id);
  if (!tournee) return res.status(404).json({ error: 'Tournée introuvable' });
  res.json(tournee);
});

router.put('/:id', async (req, res) => {
  const existingRs = await client.execute({ sql: 'SELECT * FROM tournees WHERE id = ?', args: [req.params.id] });
  const existing = existingRs.rows[0];
  if (!existing) return res.status(404).json({ error: 'Tournée introuvable' });

  const { name, date } = req.body;
  await client.execute({
    sql: 'UPDATE tournees SET name = ?, date = ? WHERE id = ?',
    args: [name ?? existing.name, date ?? existing.date, req.params.id],
  });
  res.json(await getTourneeWithStops(req.params.id));
});

router.delete('/:id', async (req, res) => {
  const info = await client.execute({ sql: 'DELETE FROM tournees WHERE id = ?', args: [req.params.id] });
  if (info.rowsAffected === 0) return res.status(404).json({ error: 'Tournée introuvable' });
  res.status(204).end();
});

router.post('/:id/stops', async (req, res) => {
  const { clientId } = req.body;
  const tourneeRs = await client.execute({ sql: 'SELECT * FROM tournees WHERE id = ?', args: [req.params.id] });
  if (!tourneeRs.rows[0]) return res.status(404).json({ error: 'Tournée introuvable' });
  const clientRs = await client.execute({ sql: 'SELECT * FROM clients WHERE id = ?', args: [clientId] });
  if (!clientRs.rows[0]) return res.status(404).json({ error: 'Client introuvable' });

  const maxPosRs = await client.execute({
    sql: 'SELECT MAX(position) as m FROM tournee_stops WHERE tournee_id = ?',
    args: [req.params.id],
  });
  const maxPos = maxPosRs.rows[0].m;
  const nextPos = (maxPos === null ? -1 : maxPos) + 1;

  try {
    await client.execute({
      sql: 'INSERT INTO tournee_stops (tournee_id, client_id, position) VALUES (?, ?, ?)',
      args: [req.params.id, clientId, nextPos],
    });
  } catch (err) {
    return res.status(409).json({ error: 'Ce client est déjà dans la tournée' });
  }
  res.status(201).json(await getTourneeWithStops(req.params.id));
});

router.delete('/:id/stops/:clientId', async (req, res) => {
  await client.execute({
    sql: 'DELETE FROM tournee_stops WHERE tournee_id = ? AND client_id = ?',
    args: [req.params.id, req.params.clientId],
  });
  res.json(await getTourneeWithStops(req.params.id));
});

router.put('/:id/order', async (req, res) => {
  const { clientIds } = req.body;
  if (clientIds && clientIds.length) {
    await client.batch(
      clientIds.map((clientId, idx) => ({
        sql: 'UPDATE tournee_stops SET position = ? WHERE tournee_id = ? AND client_id = ?',
        args: [idx, req.params.id, clientId],
      })),
      'write'
    );
  }
  res.json(await getTourneeWithStops(req.params.id));
});

router.post('/:id/optimize', async (req, res) => {
  const tournee = await getTourneeWithStops(req.params.id);
  if (!tournee) return res.status(404).json({ error: 'Tournée introuvable' });
  const stopsWithCoords = tournee.stops.filter((s) => s.lat != null && s.lng != null);
  if (!stopsWithCoords.length) return res.json(tournee);

  const ordered = nearestNeighborOrder(stopsWithCoords, stopsWithCoords[0].lat, stopsWithCoords[0].lng);
  await client.batch(
    ordered.map((c, idx) => ({
      sql: 'UPDATE tournee_stops SET position = ? WHERE tournee_id = ? AND client_id = ?',
      args: [idx, req.params.id, c.id],
    })),
    'write'
  );
  res.json(await getTourneeWithStops(req.params.id));
});

// Clients proches d'au moins une étape de la tournée, pas encore ajoutés
router.get('/:id/suggestions', async (req, res) => {
  const radius = parseFloat(req.query.radius) || 1000;
  const tournee = await getTourneeWithStops(req.params.id);
  if (!tournee) return res.status(404).json({ error: 'Tournée introuvable' });

  const stopIds = new Set(tournee.stops.map((s) => s.id));
  const stopsWithCoords = tournee.stops.filter((s) => s.lat != null && s.lng != null);
  if (!stopsWithCoords.length) return res.json([]);

  const allClientsRs = await client.execute('SELECT * FROM clients WHERE lat IS NOT NULL AND lng IS NOT NULL');
  const suggestions = [];

  for (const c of allClientsRs.rows) {
    if (stopIds.has(c.id)) continue;
    let minDist = Infinity;
    let nearestStop = null;
    for (const stop of stopsWithCoords) {
      const d = haversineDistance(c.lat, c.lng, stop.lat, stop.lng);
      if (d < minDist) {
        minDist = d;
        nearestStop = stop;
      }
    }
    if (minDist <= radius) {
      suggestions.push({ ...c, distance: Math.round(minDist), nearestStopName: nearestStop.name });
    }
  }

  suggestions.sort((a, b) => a.distance - b.distance);
  res.json(suggestions);
});

module.exports = router;
