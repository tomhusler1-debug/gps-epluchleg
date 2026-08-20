const express = require('express');
const { client } = require('../db');
const { geocodeAddress } = require('../geocode');

const router = express.Router();

router.get('/', async (req, res) => {
  const rs = await client.execute('SELECT * FROM clients ORDER BY name COLLATE NOCASE');
  res.json(rs.rows);
});

router.post('/', async (req, res) => {
  const { name, address, phone, notes } = req.body;
  if (!name || !address) {
    return res.status(400).json({ error: "Le nom et l'adresse sont requis" });
  }

  try {
    const geo = await geocodeAddress(address);
    const info = await client.execute({
      sql: 'INSERT INTO clients (name, address, phone, notes, lat, lng) VALUES (?, ?, ?, ?, ?, ?)',
      args: [name, address, phone || null, notes || null, geo.lat, geo.lng],
    });
    const rs = await client.execute({
      sql: 'SELECT * FROM clients WHERE id = ?',
      args: [Number(info.lastInsertRowid)],
    });
    res.status(201).json(rs.rows[0]);
  } catch (err) {
    res.status(err.notFound ? 422 : 500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const existingRs = await client.execute({ sql: 'SELECT * FROM clients WHERE id = ?', args: [id] });
  const existing = existingRs.rows[0];
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
    await client.execute({
      sql: 'UPDATE clients SET name = ?, address = ?, phone = ?, notes = ?, lat = ?, lng = ? WHERE id = ?',
      args: [
        name ?? existing.name,
        address ?? existing.address,
        phone ?? existing.phone,
        notes ?? existing.notes,
        lat,
        lng,
        id,
      ],
    });
    const rs = await client.execute({ sql: 'SELECT * FROM clients WHERE id = ?', args: [id] });
    res.json(rs.rows[0]);
  } catch (err) {
    res.status(err.notFound ? 422 : 500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const info = await client.execute({ sql: 'DELETE FROM clients WHERE id = ?', args: [req.params.id] });
  if (info.rowsAffected === 0) return res.status(404).json({ error: 'Client introuvable' });
  res.status(204).end();
});

module.exports = router;
