const express = require('express');
const { getClients, getTournees, saveTournees, nextTourneeId } = require('../store');
const { haversineDistance, nearestNeighborOrder } = require('../geo');

const router = express.Router();

async function resolveTournee(t) {
  if (!t) return null;
  const clients = await getClients();
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const stops = t.stopIds
    .map((cid, i) => {
      const c = clientById.get(cid);
      return c ? { ...c, position: i } : null;
    })
    .filter(Boolean);
  return { id: t.id, name: t.name, date: t.date, createdAt: t.createdAt, stops };
}

router.get('/', async (req, res) => {
  const tournees = await getTournees();
  const sorted = [...tournees].sort(
    (a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt)
  );
  res.json(sorted.map((t) => ({ id: t.id, name: t.name, date: t.date, createdAt: t.createdAt, stopCount: t.stopIds.length })));
});

router.post('/', async (req, res) => {
  const { name, date, clientIds } = req.body;
  if (!name) return res.status(400).json({ error: 'Le nom de la tournée est requis' });

  const tournees = await getTournees();
  const t = {
    id: await nextTourneeId(),
    name,
    date: date || null,
    createdAt: new Date().toISOString(),
    stopIds: Array.isArray(clientIds) ? [...new Set(clientIds)] : [],
  };
  tournees.push(t);
  await saveTournees(tournees);
  res.status(201).json(await resolveTournee(t));
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const tournees = await getTournees();
  const t = tournees.find((x) => x.id === id);
  if (!t) return res.status(404).json({ error: 'Tournée introuvable' });
  res.json(await resolveTournee(t));
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const tournees = await getTournees();
  const idx = tournees.findIndex((x) => x.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Tournée introuvable' });

  const { name, date } = req.body;
  tournees[idx] = { ...tournees[idx], name: name ?? tournees[idx].name, date: date ?? tournees[idx].date };
  await saveTournees(tournees);
  res.json(await resolveTournee(tournees[idx]));
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const tournees = await getTournees();
  const idx = tournees.findIndex((x) => x.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Tournée introuvable' });

  tournees.splice(idx, 1);
  await saveTournees(tournees);
  res.status(204).end();
});

router.post('/:id/stops', async (req, res) => {
  const id = Number(req.params.id);
  const clientId = Number(req.body.clientId);

  const tournees = await getTournees();
  const t = tournees.find((x) => x.id === id);
  if (!t) return res.status(404).json({ error: 'Tournée introuvable' });

  const clients = await getClients();
  if (!clients.some((c) => c.id === clientId)) {
    return res.status(404).json({ error: 'Client introuvable' });
  }
  if (t.stopIds.includes(clientId)) {
    return res.status(409).json({ error: 'Ce client est déjà dans la tournée' });
  }

  t.stopIds.push(clientId);
  await saveTournees(tournees);
  res.status(201).json(await resolveTournee(t));
});

router.delete('/:id/stops/:clientId', async (req, res) => {
  const id = Number(req.params.id);
  const clientId = Number(req.params.clientId);

  const tournees = await getTournees();
  const t = tournees.find((x) => x.id === id);
  if (!t) return res.status(404).json({ error: 'Tournée introuvable' });

  t.stopIds = t.stopIds.filter((cid) => cid !== clientId);
  await saveTournees(tournees);
  res.json(await resolveTournee(t));
});

router.put('/:id/order', async (req, res) => {
  const id = Number(req.params.id);
  const clientIds = (req.body.clientIds || []).map(Number);

  const tournees = await getTournees();
  const t = tournees.find((x) => x.id === id);
  if (!t) return res.status(404).json({ error: 'Tournée introuvable' });

  const current = new Set(t.stopIds);
  if (clientIds.length === current.size && clientIds.every((cid) => current.has(cid))) {
    t.stopIds = clientIds;
    await saveTournees(tournees);
  }
  res.json(await resolveTournee(t));
});

router.post('/:id/optimize', async (req, res) => {
  const id = Number(req.params.id);
  const tournees = await getTournees();
  const t = tournees.find((x) => x.id === id);
  if (!t) return res.status(404).json({ error: 'Tournée introuvable' });

  const resolved = await resolveTournee(t);
  const stopsWithCoords = resolved.stops.filter((s) => s.lat != null && s.lng != null);
  if (stopsWithCoords.length) {
    const ordered = nearestNeighborOrder(stopsWithCoords, stopsWithCoords[0].lat, stopsWithCoords[0].lng);
    const orderedIds = ordered.map((c) => c.id);
    const withoutCoords = t.stopIds.filter((cid) => !orderedIds.includes(cid));
    t.stopIds = [...orderedIds, ...withoutCoords];
    await saveTournees(tournees);
  }
  res.json(await resolveTournee(t));
});

// Clients proches d'au moins une étape de la tournée, pas encore ajoutés
router.get('/:id/suggestions', async (req, res) => {
  const id = Number(req.params.id);
  const radius = parseFloat(req.query.radius) || 1000;

  const tournees = await getTournees();
  const t = tournees.find((x) => x.id === id);
  if (!t) return res.status(404).json({ error: 'Tournée introuvable' });

  const resolved = await resolveTournee(t);
  const stopIds = new Set(resolved.stops.map((s) => s.id));
  const stopsWithCoords = resolved.stops.filter((s) => s.lat != null && s.lng != null);
  if (!stopsWithCoords.length) return res.json([]);

  const allClients = await getClients();
  const suggestions = [];

  for (const c of allClients) {
    if (c.lat == null || c.lng == null || stopIds.has(c.id)) continue;
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
