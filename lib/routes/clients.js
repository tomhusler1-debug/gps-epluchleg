const express = require('express');
const { getClients, saveClients, nextClientId, getTournees, saveTournees } = require('../store');
const { geocodeAddress } = require('../geocode');

const router = express.Router();

router.get('/', async (req, res) => {
  const clients = await getClients();
  const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
  res.json(sorted);
});

router.post('/', async (req, res) => {
  const { name, address, phone, notes } = req.body;
  if (!name || !address) {
    return res.status(400).json({ error: "Le nom et l'adresse sont requis" });
  }

  try {
    const geo = await geocodeAddress(address);
    const clients = await getClients();
    const client = {
      id: await nextClientId(),
      name,
      address,
      phone: phone || null,
      notes: notes || null,
      lat: geo.lat,
      lng: geo.lng,
      createdAt: new Date().toISOString(),
    };
    clients.push(client);
    await saveClients(clients);
    res.status(201).json(client);
  } catch (err) {
    res.status(err.notFound ? 422 : 500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const clients = await getClients();
  const idx = clients.findIndex((c) => c.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Client introuvable' });

  const existing = clients[idx];
  const { name, address, phone, notes } = req.body;
  let lat = existing.lat;
  let lng = existing.lng;

  try {
    if (address && address !== existing.address) {
      const geo = await geocodeAddress(address);
      lat = geo.lat;
      lng = geo.lng;
    }
    const updated = {
      ...existing,
      name: name ?? existing.name,
      address: address ?? existing.address,
      phone: phone ?? existing.phone,
      notes: notes ?? existing.notes,
      lat,
      lng,
    };
    clients[idx] = updated;
    await saveClients(clients);
    res.json(updated);
  } catch (err) {
    res.status(err.notFound ? 422 : 500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const clients = await getClients();
  const idx = clients.findIndex((c) => c.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Client introuvable' });

  clients.splice(idx, 1);
  await saveClients(clients);

  // Retire aussi ce client de toutes les tournées qui le contenaient
  const tournees = await getTournees();
  let changed = false;
  for (const t of tournees) {
    const before = t.stopIds.length;
    t.stopIds = t.stopIds.filter((cid) => cid !== id);
    if (t.stopIds.length !== before) changed = true;
  }
  if (changed) await saveTournees(tournees);

  res.status(204).end();
});

module.exports = router;
