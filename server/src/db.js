const { createClient } = require('@libsql/client');
const path = require('path');
const fs = require('fs');

const remoteUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

let url;
if (remoteUrl) {
  url = remoteUrl;
} else {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  url = `file:${path.join(dataDir, 'gps.db')}`;
}

const client = createClient(remoteUrl ? { url, authToken } : { url });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  lat REAL,
  lng REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tournees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tournee_stops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournee_id INTEGER NOT NULL REFERENCES tournees(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  UNIQUE(tournee_id, client_id)
);

CREATE TABLE IF NOT EXISTS geocode_cache (
  query TEXT PRIMARY KEY,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

async function init() {
  await client.executeMultiple(SCHEMA);
}

module.exports = { client, init };
