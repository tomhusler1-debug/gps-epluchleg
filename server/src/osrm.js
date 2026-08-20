const OSRM_BASE = 'https://router.project-osrm.org';

function toCoordString(points) {
  return points.map((p) => `${p.lng},${p.lat}`).join(';');
}

async function osrmFetch(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'gps-epluchleg/1.0 (application de tournees clients)' } });
  if (!res.ok) throw new Error(`Erreur du service d'itinéraire (${res.status})`);
  return res.json();
}

// Itinéraire routier en suivant l'ordre exact des points fournis.
async function getRoute(points) {
  if (points.length < 2) throw new Error('Il faut au moins deux points pour un itinéraire');

  const url = `${OSRM_BASE}/route/v1/driving/${toCoordString(points)}?overview=full&geometries=geojson`;
  const data = await osrmFetch(url);

  if (data.code !== 'Ok' || !data.routes?.length) {
    const err = new Error('Itinéraire introuvable entre ces points');
    err.notFound = true;
    throw err;
  }

  const route = data.routes[0];
  return {
    distance: route.distance,
    duration: route.duration,
    geometry: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
  };
}

// Itinéraire routier avec ordre de passage optimisé automatiquement (depart = premier point fourni).
async function getTrip(points) {
  if (points.length < 2) throw new Error('Il faut au moins deux points pour un itinéraire');

  const url = `${OSRM_BASE}/trip/v1/driving/${toCoordString(points)}?source=first&roundtrip=false&geometries=geojson&overview=full`;
  const data = await osrmFetch(url);

  if (data.code !== 'Ok' || !data.trips?.length) {
    const err = new Error('Itinéraire introuvable entre ces points');
    err.notFound = true;
    throw err;
  }

  const trip = data.trips[0];
  const order = data.waypoints
    .map((wp, index) => ({ index, visitOrder: wp.waypoint_index }))
    .sort((a, b) => a.visitOrder - b.visitOrder)
    .map((x) => x.index);

  return {
    distance: trip.distance,
    duration: trip.duration,
    geometry: trip.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    order,
  };
}

module.exports = { getRoute, getTrip };
