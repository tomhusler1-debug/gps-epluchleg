let redis;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  const { Redis } = require('@upstash/redis');
  redis = Redis.fromEnv();
} else {
  // Pas d'identifiants Upstash : stockage en mémoire pour le développement local
  // (les données sont perdues à chaque redémarrage). En production sur Vercel,
  // UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN doivent être définies
  // pour que les données persistent réellement — voir le README.
  console.warn(
    "[gps-epluchleg] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN absentes : stockage en mémoire (non persistant), pratique pour tester en local."
  );
  const memory = new Map();
  redis = {
    async get(key) {
      return memory.has(key) ? memory.get(key) : null;
    },
    async set(key, value) {
      memory.set(key, value);
      return 'OK';
    },
    async incr(key) {
      const value = (memory.get(key) || 0) + 1;
      memory.set(key, value);
      return value;
    },
  };
}

module.exports = redis;
