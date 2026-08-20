const { client } = require('./db');

let lastRequestTime = 0;
const MIN_INTERVAL_MS = 1100; // Nominatim demande max ~1 requête/seconde

async function rateLimit() {
  const wait = lastRequestTime + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestTime = Date.now();
}

async function geocodeAddress(address) {
  const query = address.trim();
  if (!query) throw new Error('Adresse vide');

  const cachedRs = await client.execute({
    sql: 'SELECT lat, lng, display_name FROM geocode_cache WHERE query = ?',
    args: [query],
  });
  if (cachedRs.rows.length) return cachedRs.rows[0];

  await rateLimit();

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'gps-epluchleg/1.0 (application de tournees clients)',
      'Accept-Language': 'fr',
    },
  });
  if (!res.ok) throw new Error(`Erreur de géocodage (${res.status})`);

  const results = await res.json();
  if (!results.length) {
    const err = new Error(`Adresse introuvable : ${address}`);
    err.notFound = true;
    throw err;
  }

  const { lat, lon, display_name } = results[0];
  const result = { lat: parseFloat(lat), lng: parseFloat(lon), display_name };

  await client.execute({
    sql: 'INSERT OR REPLACE INTO geocode_cache (query, lat, lng, display_name) VALUES (?, ?, ?, ?)',
    args: [query, result.lat, result.lng, result.display_name],
  });

  return result;
}

module.exports = { geocodeAddress };
