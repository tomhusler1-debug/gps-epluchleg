const state = {
  clients: [],
  tournees: [],
  currentTournee: null,
  editingClientId: null,
  selectedClientIds: new Set(),
};

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || `Erreur ${res.status}`);
  return data;
}

// --- Map setup ---
const map = L.map('map').setView([46.6, 2.3], 6); // centre France par défaut
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map);

const clientMarkersLayer = L.layerGroup().addTo(map);
const tourneeLayer = L.layerGroup().addTo(map);
const selectionRouteLayer = L.layerGroup().addTo(map);
let hasFitBounds = false;
let selectionRouteRequestId = 0;
let tourneeRouteRequestId = 0;

function numberedIcon(n, color) {
  return L.divIcon({
    className: 'numbered-marker',
    html: `<div style="background:${color};color:#fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

// --- Tabs ---
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'clients') {
      tourneeLayer.clearLayers();
      renderClientMarkers();
    } else {
      selectionRouteLayer.clearLayers();
      renderTourneeMap();
    }
  });
});

// --- Clients ---
async function loadClients() {
  state.clients = await api('GET', '/api/clients');
  const validIds = new Set(state.clients.map((c) => c.id));
  for (const id of state.selectedClientIds) {
    if (!validIds.has(id)) state.selectedClientIds.delete(id);
  }
  renderClientList();
  renderClientMarkers();
  renderSelectionBar();
}

function renderClientList() {
  const search = document.getElementById('client-search').value.trim().toLowerCase();
  const list = document.getElementById('client-list');
  const filtered = state.clients.filter(
    (c) => !search || c.name.toLowerCase().includes(search) || c.address.toLowerCase().includes(search)
  );

  if (!filtered.length) {
    list.innerHTML = `<p class="empty-msg">${state.clients.length ? 'Aucun résultat.' : 'Aucun client pour le moment.'}</p>`;
    return;
  }

  list.innerHTML = filtered
    .map(
      (c) => `
    <div class="card" data-client-id="${c.id}">
      <div class="card-title">
        <label class="card-select">
          <input type="checkbox" class="client-checkbox" ${state.selectedClientIds.has(c.id) ? 'checked' : ''} ${c.lat == null ? 'disabled title="Adresse non localisée"' : ''} />
          <span>${escapeHtml(c.name)}</span>
        </label>
        ${c.lat == null ? '<span class="pill" style="background:#fee2e2;color:#b91c1c">non localisé</span>' : ''}
      </div>
      <div class="card-sub">${escapeHtml(c.address)}</div>
      ${c.phone ? `<div class="card-sub">📞 ${escapeHtml(c.phone)}</div>` : ''}
      <div class="card-actions">
        <button class="secondary" data-action="locate">Centrer</button>
        <button class="secondary" data-action="edit">Modifier</button>
        <button class="danger" data-action="delete">Supprimer</button>
      </div>
    </div>`
    )
    .join('');

  list.querySelectorAll('.card').forEach((card) => {
    const id = Number(card.dataset.clientId);
    card.querySelector('[data-action="locate"]').addEventListener('click', () => locateClient(id));
    card.querySelector('[data-action="edit"]').addEventListener('click', () => editClient(id));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteClient(id));
    const checkbox = card.querySelector('.client-checkbox');
    if (checkbox) checkbox.addEventListener('change', () => toggleClientSelection(id, checkbox.checked));
  });
}

function toggleClientSelection(id, checked) {
  if (checked) state.selectedClientIds.add(id);
  else state.selectedClientIds.delete(id);
  renderSelectionBar();
}

function renderSelectionBar() {
  const bar = document.getElementById('selection-bar');
  const count = state.selectedClientIds.size;

  if (count === 0) {
    bar.style.display = 'none';
    document.getElementById('route-info').textContent = '';
    document.getElementById('route-error').textContent = '';
    selectionRouteLayer.clearLayers();
    return;
  }

  bar.style.display = 'block';
  document.getElementById('selection-count').textContent = `${count} client${count > 1 ? 's' : ''} sélectionné${count > 1 ? 's' : ''}`;
  document.getElementById('show-route-btn').disabled = count < 2;
  document.getElementById('open-gmaps-btn').disabled = count < 2;
}

document.getElementById('clear-selection-btn').addEventListener('click', () => {
  selectionRouteRequestId++;
  state.selectedClientIds.clear();
  renderClientList();
  renderSelectionBar();
});

document.getElementById('show-route-btn').addEventListener('click', async () => {
  const errorEl = document.getElementById('route-error');
  const infoEl = document.getElementById('route-info');
  const btn = document.getElementById('show-route-btn');
  errorEl.textContent = '';
  infoEl.textContent = '';

  const selected = state.clients.filter((c) => state.selectedClientIds.has(c.id));
  const withCoords = selected.filter((c) => c.lat != null && c.lng != null);
  if (withCoords.length < 2) {
    errorEl.textContent = 'Il faut au moins deux clients localisés dans la sélection.';
    return;
  }

  const requestId = ++selectionRouteRequestId;
  btn.disabled = true;
  btn.textContent = 'Calcul en cours...';

  try {
    const points = withCoords.map((c) => ({ lat: c.lat, lng: c.lng }));
    const result = await api('POST', '/api/route/trip', { points });
    if (requestId !== selectionRouteRequestId) return;

    selectionRouteLayer.clearLayers();
    result.order.forEach((clientIdx, i) => {
      const c = withCoords[clientIdx];
      const marker = L.marker([c.lat, c.lng], { icon: numberedIcon(i + 1, '#7c3aed') });
      marker.bindPopup(popupHtml(c));
      marker.addTo(selectionRouteLayer);
    });
    L.polyline(result.geometry, { color: '#7c3aed', weight: 4 }).addTo(selectionRouteLayer);
    map.fitBounds(L.latLngBounds(result.geometry), { padding: [50, 50], maxZoom: 15 });
    infoEl.textContent = `🚗 ${formatDistance(result.distance)} · environ ${formatDuration(result.duration)}`;
  } catch (err) {
    if (requestId !== selectionRouteRequestId) return;
    errorEl.textContent = err.message;
  } finally {
    if (requestId === selectionRouteRequestId) {
      btn.disabled = false;
      btn.textContent = "🧭 Voir l'itinéraire";
    }
  }
});

document.getElementById('open-gmaps-btn').addEventListener('click', () => {
  const errorEl = document.getElementById('route-error');
  errorEl.textContent = '';
  const selected = state.clients.filter((c) => state.selectedClientIds.has(c.id));
  const withCoords = selected.filter((c) => c.lat != null && c.lng != null);
  if (withCoords.length < 2) {
    errorEl.textContent = 'Il faut au moins deux clients localisés dans la sélection.';
    return;
  }
  window.open(buildGoogleMapsUrl(withCoords, { optimize: true }), '_blank', 'noopener');
});

document.getElementById('client-search').addEventListener('input', renderClientList);

function renderClientMarkers() {
  clientMarkersLayer.clearLayers();
  const inTournee = new Set((state.currentTournee?.stops || []).map((s) => s.id));

  state.clients.forEach((c) => {
    if (c.lat == null || c.lng == null) return;
    if (document.getElementById('tab-tournees').classList.contains('active') && inTournee.has(c.id)) return;

    const marker = L.circleMarker([c.lat, c.lng], {
      radius: 7,
      color: '#1d4ed8',
      fillColor: '#3b82f6',
      fillOpacity: 0.9,
      weight: 2,
    });
    marker.bindPopup(popupHtml(c));
    marker.addTo(clientMarkersLayer);
  });

  fitToAllIfNeeded();
}

function popupHtml(c) {
  return `<b>${escapeHtml(c.name)}</b><br>${escapeHtml(c.address)}${c.phone ? `<br>📞 ${escapeHtml(c.phone)}` : ''}`;
}

function fitToAllIfNeeded() {
  if (hasFitBounds) return;
  const withCoords = state.clients.filter((c) => c.lat != null);
  if (!withCoords.length) return;
  const bounds = L.latLngBounds(withCoords.map((c) => [c.lat, c.lng]));
  map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  hasFitBounds = true;
}

function locateClient(id) {
  const c = state.clients.find((x) => x.id === id);
  if (!c || c.lat == null) return;
  map.setView([c.lat, c.lng], 15);
  clientMarkersLayer.eachLayer((m) => {
    const ll = m.getLatLng();
    if (Math.abs(ll.lat - c.lat) < 1e-9 && Math.abs(ll.lng - c.lng) < 1e-9) m.openPopup();
  });
}

function editClient(id) {
  const c = state.clients.find((x) => x.id === id);
  if (!c) return;
  state.editingClientId = id;
  document.getElementById('client-form-title').textContent = `Modifier ${c.name}`;
  document.getElementById('client-id').value = c.id;
  document.getElementById('client-name').value = c.name;
  document.getElementById('client-address').value = c.address;
  document.getElementById('client-phone').value = c.phone || '';
  document.getElementById('client-notes').value = c.notes || '';
  document.getElementById('client-submit-btn').textContent = 'Enregistrer';
  document.getElementById('client-cancel-btn').style.display = 'inline-block';
  document.getElementById('client-form').scrollIntoView({ behavior: 'smooth' });
}

function resetClientForm() {
  state.editingClientId = null;
  document.getElementById('client-form').reset();
  document.getElementById('client-id').value = '';
  document.getElementById('client-form-title').textContent = 'Ajouter un client';
  document.getElementById('client-submit-btn').textContent = 'Ajouter';
  document.getElementById('client-cancel-btn').style.display = 'none';
  document.getElementById('client-form-error').textContent = '';
}

document.getElementById('client-cancel-btn').addEventListener('click', resetClientForm);

document.getElementById('client-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('client-form-error');
  errorEl.textContent = '';
  const submitBtn = document.getElementById('client-submit-btn');

  const payload = {
    name: document.getElementById('client-name').value.trim(),
    address: document.getElementById('client-address').value.trim(),
    phone: document.getElementById('client-phone').value.trim(),
    notes: document.getElementById('client-notes').value.trim(),
  };

  submitBtn.disabled = true;
  submitBtn.textContent = 'Localisation de l\'adresse...';

  try {
    if (state.editingClientId) {
      await api('PUT', `/api/clients/${state.editingClientId}`, payload);
    } else {
      await api('POST', '/api/clients', payload);
    }
    resetClientForm();
    hasFitBounds = false;
    await loadClients();
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = state.editingClientId ? 'Enregistrer' : 'Ajouter';
  }
});

async function deleteClient(id) {
  const c = state.clients.find((x) => x.id === id);
  if (!c) return;
  if (!confirm(`Supprimer le client "${c.name}" ?`)) return;
  await api('DELETE', `/api/clients/${id}`);
  if (state.editingClientId === id) resetClientForm();
  await loadClients();
}

// --- Tournées ---
async function loadTournees() {
  state.tournees = await api('GET', '/api/tournees');
  renderTourneeList();
}

function renderTourneeList() {
  const list = document.getElementById('tournee-list');
  if (!state.tournees.length) {
    list.innerHTML = '<p class="empty-msg">Aucune tournée pour le moment.</p>';
    return;
  }
  list.innerHTML = state.tournees
    .map(
      (t) => `
    <div class="card" data-tournee-id="${t.id}" style="cursor:pointer">
      <div class="card-title">
        <span>${escapeHtml(t.name)}</span>
        <span class="pill">${t.stopCount} étape${t.stopCount > 1 ? 's' : ''}</span>
      </div>
      ${t.date ? `<div class="card-sub">📅 ${t.date}</div>` : ''}
    </div>`
    )
    .join('');

  list.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', () => openTourneeDetail(Number(card.dataset.tourneeId)));
  });
}

document.getElementById('tournee-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('tournee-name').value.trim();
  const date = document.getElementById('tournee-date').value;
  if (!name) return;
  const t = await api('POST', '/api/tournees', { name, date, clientIds: [] });
  document.getElementById('tournee-form').reset();
  await loadTournees();
  openTourneeDetail(t.id);
});

document.getElementById('back-to-tournees').addEventListener('click', () => {
  tourneeRouteRequestId++;
  state.currentTournee = null;
  document.getElementById('tournee-detail-view').style.display = 'none';
  document.getElementById('tournee-list-view').style.display = 'block';
  renderClientMarkers();
  tourneeLayer.clearLayers();
});

document.getElementById('delete-tournee-btn').addEventListener('click', async () => {
  if (!state.currentTournee) return;
  if (!confirm(`Supprimer la tournée "${state.currentTournee.name}" ?`)) return;
  await api('DELETE', `/api/tournees/${state.currentTournee.id}`);
  tourneeRouteRequestId++;
  state.currentTournee = null;
  document.getElementById('tournee-detail-view').style.display = 'none';
  document.getElementById('tournee-list-view').style.display = 'block';
  tourneeLayer.clearLayers();
  await loadTournees();
});

async function openTourneeDetail(id) {
  state.currentTournee = await api('GET', `/api/tournees/${id}`);
  document.getElementById('tournee-list-view').style.display = 'none';
  document.getElementById('tournee-detail-view').style.display = 'block';
  await refreshTourneeDetail();
}

async function refreshTourneeDetail() {
  const t = state.currentTournee;
  document.getElementById('tournee-detail-name').textContent = t.name;
  document.getElementById('tournee-detail-meta').textContent = t.date ? `📅 ${t.date}` : '';
  document.getElementById('stop-count').textContent = t.stops.length;
  renderStopList();
  renderAddExistingSelect();
  renderClientMarkers();
  renderTourneeMap();
  await loadSuggestions();
}

function renderStopList() {
  const list = document.getElementById('stop-list');
  const t = state.currentTournee;
  if (!t.stops.length) {
    list.innerHTML = '<p class="empty-msg">Aucune étape. Ajoutez des clients ci-dessous.</p>';
    return;
  }
  list.innerHTML = t.stops
    .map(
      (s, i) => `
    <li data-client-id="${s.id}">
      <span class="stop-num">${i + 1}</span>
      <div class="stop-info">
        <div class="name">${escapeHtml(s.name)}${s.lat == null ? ' ⚠️' : ''}</div>
        <div class="addr">${escapeHtml(s.address)}</div>
      </div>
      <div class="stop-btns">
        <button data-action="up" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button data-action="down" ${i === t.stops.length - 1 ? 'disabled' : ''}>▼</button>
        <button class="danger" data-action="remove">✕</button>
      </div>
    </li>`
    )
    .join('');

  list.querySelectorAll('li').forEach((li) => {
    const id = Number(li.dataset.clientId);
    li.querySelector('[data-action="remove"]').addEventListener('click', () => removeStop(id));
    const upBtn = li.querySelector('[data-action="up"]');
    const downBtn = li.querySelector('[data-action="down"]');
    if (upBtn) upBtn.addEventListener('click', () => moveStop(id, -1));
    if (downBtn) downBtn.addEventListener('click', () => moveStop(id, 1));
  });
}

function renderAddExistingSelect() {
  const select = document.getElementById('add-existing-client');
  const inTournee = new Set(state.currentTournee.stops.map((s) => s.id));
  const available = state.clients.filter((c) => !inTournee.has(c.id));

  if (!available.length) {
    select.innerHTML = '<option value="">Tous les clients sont déjà dans cette tournée</option>';
    return;
  }
  select.innerHTML = available.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
}

document.getElementById('add-existing-btn').addEventListener('click', async () => {
  const select = document.getElementById('add-existing-client');
  const clientId = Number(select.value);
  if (!clientId) return;
  await addStopToTournee(clientId);
});

async function addStopToTournee(clientId) {
  state.currentTournee = await api('POST', `/api/tournees/${state.currentTournee.id}/stops`, { clientId });
  await refreshTourneeDetail();
}

async function removeStop(clientId) {
  state.currentTournee = await api('DELETE', `/api/tournees/${state.currentTournee.id}/stops/${clientId}`);
  await refreshTourneeDetail();
}

async function moveStop(clientId, direction) {
  const stops = state.currentTournee.stops.slice();
  const idx = stops.findIndex((s) => s.id === clientId);
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= stops.length) return;
  [stops[idx], stops[newIdx]] = [stops[newIdx], stops[idx]];
  const clientIds = stops.map((s) => s.id);
  state.currentTournee = await api('PUT', `/api/tournees/${state.currentTournee.id}/order`, { clientIds });
  await refreshTourneeDetail();
}

document.getElementById('optimize-btn').addEventListener('click', async () => {
  state.currentTournee = await api('POST', `/api/tournees/${state.currentTournee.id}/optimize`, {});
  await refreshTourneeDetail();
});

document.getElementById('tournee-gmaps-btn').addEventListener('click', () => {
  const t = state.currentTournee;
  if (!t) return;
  const withCoords = t.stops.filter((s) => s.lat != null);
  if (withCoords.length < 2) {
    alert('Il faut au moins deux étapes localisées pour ouvrir Google Maps.');
    return;
  }
  window.open(buildGoogleMapsUrl(withCoords, { optimize: false }), '_blank', 'noopener');
});

document.getElementById('suggestion-radius').addEventListener('change', loadSuggestions);

async function loadSuggestions() {
  if (!state.currentTournee) return;
  const radius = document.getElementById('suggestion-radius').value;
  const list = document.getElementById('suggestion-list');

  if (!state.currentTournee.stops.some((s) => s.lat != null)) {
    list.innerHTML = '<p class="empty-msg">Ajoutez au moins une étape localisée pour voir des suggestions.</p>';
    return;
  }

  const suggestions = await api(
    'GET',
    `/api/tournees/${state.currentTournee.id}/suggestions?radius=${radius}`
  );

  if (!suggestions.length) {
    list.innerHTML = '<p class="empty-msg">Aucun client à proximité dans ce rayon.</p>';
    return;
  }

  list.innerHTML = suggestions
    .map(
      (s) => `
    <div class="card suggestion-card" data-client-id="${s.id}">
      <div class="card-title"><span>${escapeHtml(s.name)}</span></div>
      <div class="card-sub">${formatDistance(s.distance)} de "${escapeHtml(s.nearestStopName)}"</div>
      <div class="card-actions">
        <button data-action="add">+ Ajouter à la tournée</button>
      </div>
    </div>`
    )
    .join('');

  list.querySelectorAll('.card').forEach((card) => {
    const id = Number(card.dataset.clientId);
    card.querySelector('[data-action="add"]').addEventListener('click', () => addStopToTournee(id));
  });
}

function formatDistance(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

function formatDuration(seconds) {
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h} h ${String(m).padStart(2, '0')}`;
}

function buildGoogleMapsUrl(points, { optimize } = {}) {
  const fmt = (p) => `${p.lat},${p.lng}`;
  const origin = fmt(points[0]);
  const destination = fmt(points[points.length - 1]);
  const middle = points.slice(1, -1);

  const params = new URLSearchParams({ api: '1', origin, destination, travelmode: 'driving' });
  if (middle.length) {
    const waypoints = middle.map(fmt).join('|');
    params.set('waypoints', optimize ? `optimize:true|${waypoints}` : waypoints);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function renderTourneeMap() {
  tourneeLayer.clearLayers();
  const t = state.currentTournee;
  const isTourneeTab = document.getElementById('tab-tournees').classList.contains('active');
  if (!t || !isTourneeTab) return;

  const withCoords = t.stops.filter((s) => s.lat != null);
  withCoords.forEach((s, i) => {
    const marker = L.marker([s.lat, s.lng], { icon: numberedIcon(i + 1, '#16a34a') });
    marker.bindPopup(popupHtml(s));
    marker.addTo(tourneeLayer);
  });

  if (withCoords.length) {
    const bounds = L.latLngBounds(withCoords.map((s) => [s.lat, s.lng]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }

  loadTourneeRoute(withCoords);
}

async function loadTourneeRoute(withCoords) {
  const infoEl = document.getElementById('tournee-route-info');
  infoEl.textContent = '';
  if (withCoords.length < 2) return;

  const requestId = ++tourneeRouteRequestId;
  try {
    const points = withCoords.map((s) => ({ lat: s.lat, lng: s.lng }));
    const result = await api('POST', '/api/route', { points });
    if (requestId !== tourneeRouteRequestId) return;
    L.polyline(result.geometry, { color: '#16a34a', weight: 4 }).addTo(tourneeLayer);
    infoEl.textContent = `🚗 ${formatDistance(result.distance)} · environ ${formatDuration(result.duration)}`;
  } catch (err) {
    if (requestId !== tourneeRouteRequestId) return;
    // Repli : trajet à vol d'oiseau si le service d'itinéraire est indisponible
    L.polyline(
      withCoords.map((s) => [s.lat, s.lng]),
      { color: '#16a34a', weight: 3, dashArray: '6 6' }
    ).addTo(tourneeLayer);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// --- Init ---
(async function init() {
  await loadClients();
  await loadTournees();
})();
