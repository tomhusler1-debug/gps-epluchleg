const redis = require('./redisClient');

const CLIENTS_KEY = 'gps:clients';
const TOURNEES_KEY = 'gps:tournees';
const CLIENT_SEQ_KEY = 'gps:clients:seq';
const TOURNEE_SEQ_KEY = 'gps:tournees:seq';
const geocodeCacheKey = (query) => `gps:geocode:${query}`;

async function getClients() {
  return (await redis.get(CLIENTS_KEY)) || [];
}

async function saveClients(clients) {
  await redis.set(CLIENTS_KEY, clients);
}

async function nextClientId() {
  return redis.incr(CLIENT_SEQ_KEY);
}

async function getTournees() {
  return (await redis.get(TOURNEES_KEY)) || [];
}

async function saveTournees(tournees) {
  await redis.set(TOURNEES_KEY, tournees);
}

async function nextTourneeId() {
  return redis.incr(TOURNEE_SEQ_KEY);
}

async function getGeocodeCache(query) {
  return redis.get(geocodeCacheKey(query));
}

async function setGeocodeCache(query, value) {
  await redis.set(geocodeCacheKey(query), value);
}

module.exports = {
  getClients,
  saveClients,
  nextClientId,
  getTournees,
  saveTournees,
  nextTourneeId,
  getGeocodeCache,
  setGeocodeCache,
};
