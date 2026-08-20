const express = require('express');
const db = require('../db');
const { geocodeAddress } = require('../geocode');

const router = express.Router();

router.get('/', (req, res) => {
  const clients = db.prepare('SELECT * FROM clients ORDER BY name COLLATE NOCASE').all();
  res.json(clients);
});

router.post('/', async (req, res) => {
  const { name, address, phone, notes } = req.body;
  if (!name || !address) {
    return res.status(400).json({ error: 'Le nom et l\'adresse sont requis' });
  }

  try {
    const geo = await geocodeAddress(address);
    const info = db
      .prepare(
        'INSERT INTO clients (name, address, phone, notes, lat, lng) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(name, address, phone || null, notes || null, geo.lat, geo.lng);
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(client);
  } catch (err) {
    res.status(err.notFound ? 422 : 500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Client introuvable' });

  const { name, address, phone, notes } = req.body;
  let lat = existing.lat;
  let lng = existing.lng;

  try {
    if (address && address !== existing.address) {
      const geo = await geocodeAddress(address);
      lat = geo.lat;
      lng = geo.lng;
    }
    db.prepare(
      'UPDATE clients SET name = ?, address = ?, phone = ?, notes = ?, lat = ?, lng = ? WHERE id = ?'
    ).run(
      name ?? existing.name,
      address ?? existing.address,
      phone ?? existing.phone,
      notes ?? existing.notes,
      lat,
      lng,
      id
    );
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    res.json(client);
  } catch (err) {
    res.status(err.notFound ? 422 : 500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Client introuvable' });
  res.status(204).end();
});

module.exports = router;
