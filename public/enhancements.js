(() => {
  const isAdmin = location.pathname.endsWith('/admin.html');
  let audioContext = null;
  let audioArmed = false;
  let chatPrimed = false;
  let highestIncomingId = Number(sessionStorage.getItem(isAdmin ? 'hunt_admin_incoming_id' : 'hunt_player_incoming_id') || 0);
  let capturedMap = null;
  let realRouteLayer = null;
  let routeWatchId = null;
  let routeTarget = null;
  let lastRouteFrom = null;
  let lastRouteAt = 0;
  let routeRequestInFlight = false;
  let routeHasFitted = false;

  function armAudio() {
    if (audioArmed) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioContext = audioContext || new Ctx();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      audioArmed = true;
    } catch {}
  }

  window.addEventListener('pointerdown', armAudio, { once: true, passive: true });
  window.addEventListener('keydown', armAudio, { once: true });

  function playMessageSound() {
    if (!audioArmed || !audioContext) return;
    try {
      const now = audioContext.currentTime;
      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.055, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
      gain.connect(audioContext.destination);

      const one = audioContext.createOscillator();
      const two = audioContext.createOscillator();
      one.type = 'sine';
      two.type = 'sine';
      one.frequency.setValueAtTime(660, now);
      two.frequency.setValueAtTime(880, now + 0.11);
      one.connect(gain);
      two.connect(gain);
      one.start(now);
      one.stop(now + 0.16);
      two.start(now + 0.11);
      two.stop(now + 0.32);
    } catch {}
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    try {
      const input = args[0];
      const url = typeof input === 'string' ? input : input?.url || '';
      const chatPath = isAdmin ? '/api/admin/chat' : '/api/chat';
      if (url.includes(chatPath) && (!args[1]?.method || String(args[1].method).toUpperCase() === 'GET')) {
        const clone = response.clone();
        clone.json().then((data) => inspectChat(data?.messages || [])).catch(() => {});
      }
    } catch {}
    return response;
  };

  function inspectChat(messages) {
    if (!Array.isArray(messages)) return;
    const incomingSender = isAdmin ? 'player' : 'admin';
    const incoming = messages.filter((m) => m.sender === incomingSender);
    const newestIncoming = incoming.reduce((max, m) => Math.max(max, Number(m.id) || 0), 0);

    if (!chatPrimed) {
      highestIncomingId = Math.max(highestIncomingId, newestIncoming);
      sessionStorage.setItem(isAdmin ? 'hunt_admin_incoming_id' : 'hunt_player_incoming_id', String(highestIncomingId));
      chatPrimed = true;
      return;
    }

    if (newestIncoming > highestIncomingId) {
      highestIncomingId = newestIncoming;
      sessionStorage.setItem(isAdmin ? 'hunt_admin_incoming_id' : 'hunt_player_incoming_id', String(highestIncomingId));
      playMessageSound();
    }
  }

  if (isAdmin) return;

  const routeStyle = document.createElement('style');
  routeStyle.textContent = '.route-line{opacity:0!important}.route-line-real{stroke:#595aa3;stroke-opacity:.82;stroke-linecap:round;stroke-linejoin:round}';
  document.head.appendChild(routeStyle);

  function patchLeaflet() {
    if (!window.L?.map || window.L.map.__huntPatched) return;
    const original = window.L.map;
    const patched = function (...args) {
      const instance = original.apply(this, args);
      const container = typeof args[0] === 'string' ? document.getElementById(args[0]) : args[0];
      if (container?.id === 'map') {
        capturedMap = instance;
        routeHasFitted = false;
        setTimeout(prepareRouteUi, 0);
      }
      return instance;
    };
    Object.assign(patched, original);
    patched.__huntPatched = true;
    window.L.map = patched;
  }

  patchLeaflet();
  const leafletTimer = setInterval(() => {
    patchLeaflet();
    if (window.L?.map?.__huntPatched) clearInterval(leafletTimer);
  }, 50);
  setTimeout(() => clearInterval(leafletTimer), 5000);

  function parseTarget() {
    const coordinate = document.querySelector('.coordinate-copy strong')?.textContent?.trim();
    if (!coordinate) return null;
    const [latRaw, lonRaw] = coordinate.split(',').map((part) => Number(part.trim()));
    if (!Number.isFinite(latRaw) || !Number.isFinite(lonRaw)) return null;
    return { latitude: latRaw, longitude: lonRaw };
  }

  function prepareRouteUi() {
    const card = document.querySelector('.map-card');
    if (!card) return;
    const external = card.querySelector('.external-map');
    if (external) external.remove();

    const copy = card.querySelector('.coordinate-copy');
    if (copy && !copy.querySelector('.route-summary')) {
      copy.innerHTML = `
        <div class="route-summary">
          <small>percorso a piedi</small>
          <strong id="routeSummary">attiva la posizione</strong>
          <span id="routeHint">ti mostro la strada qui, senza aprire altre app</span>
        </div>`;
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('#locateButton');
    if (!button) return;
    armAudio();
    routeTarget = parseTarget();
    prepareRouteUi();
    startRouteTracking();
  }, true);

  function startRouteTracking() {
    if (!routeTarget || !navigator.geolocation || routeWatchId != null) return;
    routeWatchId = navigator.geolocation.watchPosition(
      (position) => maybeUpdateRoute(position.coords),
      () => updateRouteUi('percorso non disponibile', 'puoi comunque vedere posizione e destinazione'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 7000 },
    );
  }

  async function maybeUpdateRoute(coords) {
    if (!capturedMap || !routeTarget || routeRequestInFlight) return;
    const here = { latitude: coords.latitude, longitude: coords.longitude };
    const moved = lastRouteFrom ? distanceMeters(lastRouteFrom, here) : Infinity;
    const age = Date.now() - lastRouteAt;
    if (moved < 65 && age < 45000) return;

    lastRouteFrom = here;
    lastRouteAt = Date.now();
    routeRequestInFlight = true;
    updateRouteUi('calcolo il percorso…', 'uso strade e passaggi pedonali reali');

    try {
      const url = `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${here.longitude},${here.latitude};${routeTarget.longitude},${routeTarget.latitude}?overview=full&geometries=geojson&steps=true`;
      const res = await nativeFetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`routing ${res.status}`);
      const data = await res.json();
      const route = data?.routes?.[0];
      if (!route?.geometry?.coordinates?.length) throw new Error('no route');
      drawRoute(route);
    } catch {
      drawFallbackRoute(here);
      updateRouteUi('percorso temporaneamente non disponibile', 'mostro la direzione diretta come fallback');
    } finally {
      routeRequestInFlight = false;
    }
  }

  function drawRoute(route) {
    if (!capturedMap || !window.L) return;
    if (realRouteLayer) capturedMap.removeLayer(realRouteLayer);
    const latlngs = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
    realRouteLayer = window.L.polyline(latlngs, {
      className: 'route-line-real',
      weight: 5,
      opacity: 0.82,
      interactive: false,
    }).addTo(capturedMap);

    const durationMin = Math.max(1, Math.round((route.duration || 0) / 60));
    const distance = formatDistance(route.distance || 0);
    const hint = routeInstruction(route.legs?.[0]?.steps || []);
    updateRouteUi(`${durationMin} min · ${distance}`, hint);

    if (!routeHasFitted) {
      capturedMap.fitBounds(realRouteLayer.getBounds().pad(0.14), { maxZoom: 17, animate: true });
      routeHasFitted = true;
    }
  }

  function drawFallbackRoute(here) {
    if (!capturedMap || !window.L || !routeTarget) return;
    if (realRouteLayer) capturedMap.removeLayer(realRouteLayer);
    realRouteLayer = window.L.polyline(
      [[here.latitude, here.longitude], [routeTarget.latitude, routeTarget.longitude]],
      { className: 'route-line-real', weight: 3, opacity: 0.4, dashArray: '5 9', interactive: false },
    ).addTo(capturedMap);
  }

  function routeInstruction(steps) {
    const useful = steps.find((step) => step?.name && step.name.trim()) || steps[0];
    if (!useful) return 'segui il percorso evidenziato sulla mappa';
    const type = useful.maneuver?.type;
    const modifier = useful.maneuver?.modifier;
    const street = useful.name?.trim();
    if (type === 'depart' && street) return `parti verso ${street}`;
    if (modifier && street) return `${turnLabel(modifier)} su ${street}`;
    if (street) return `continua su ${street}`;
    return 'segui il percorso evidenziato sulla mappa';
  }

  function turnLabel(modifier) {
    const labels = {
      left: 'svolta a sinistra',
      right: 'svolta a destra',
      'slight left': 'tieni leggermente la sinistra',
      'slight right': 'tieni leggermente la destra',
      straight: 'prosegui dritto',
      uturn: 'fai inversione',
    };
    return labels[modifier] || 'prosegui';
  }

  function updateRouteUi(summary, hint) {
    const summaryNode = document.querySelector('#routeSummary');
    const hintNode = document.querySelector('#routeHint');
    if (summaryNode) summaryNode.textContent = summary;
    if (hintNode) hintNode.textContent = hint;
  }

  function distanceMeters(a, b) {
    const R = 6371000;
    const p1 = a.latitude * Math.PI / 180;
    const p2 = b.latitude * Math.PI / 180;
    const dp = (b.latitude - a.latitude) * Math.PI / 180;
    const dl = (b.longitude - a.longitude) * Math.PI / 180;
    const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function formatDistance(meters) {
    if (!Number.isFinite(meters)) return '';
    if (meters < 1000) return `${Math.max(1, Math.round(meters))} m`;
    return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
  }

  const observer = new MutationObserver(() => {
    if (document.querySelector('.map-card')) prepareRouteUi();
    if (!document.querySelector('#map') && routeWatchId != null) {
      navigator.geolocation.clearWatch(routeWatchId);
      routeWatchId = null;
      routeTarget = null;
      realRouteLayer = null;
      capturedMap = null;
      lastRouteFrom = null;
      routeHasFitted = false;
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
