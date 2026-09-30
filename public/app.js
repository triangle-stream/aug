const app = document.querySelector('#app');
const timer = document.querySelector('#timer');
const chatButton = document.querySelector('#chatButton');
const chatPanel = document.querySelector('#chatPanel');
const chatBackdrop = document.querySelector('#chatBackdrop');
const chatClose = document.querySelector('#chatClose');
const chatMessages = document.querySelector('#chatMessages');
const chatForm = document.querySelector('#chatForm');
const chatInput = document.querySelector('#chatInput');
const chatUnread = document.querySelector('#chatUnread');
const toast = document.querySelector('#toast');

let state = null;
let timerHandle = null;
let pollHandle = null;
let chatPollHandle = null;
let map = null;
let userMarker = null;
let targetMarker = null;
let routeLine = null;
let accuracyCircle = null;
let watchId = null;
let lastPosition = null;
let currentTarget = null;
let hasFittedMap = false;
let chatOpen = false;
let lastChatId = Number(localStorage.getItem('hunt_last_chat_id') || 0);
let toastHandle = null;

async function api(path, options = {}) {
  const headers = { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) };
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function showToast(message) {
  clearTimeout(toastHandle);
  toast.textContent = message;
  toast.classList.remove('hidden');
  requestAnimationFrame(() => toast.classList.add('visible'));
  toastHandle = setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.classList.add('hidden'), 250);
  }, 2600);
}

function renderTimer() {
  clearInterval(timerHandle);
  if (!state?.authorized || !state?.expiresAt || state?.completedAt) {
    timer.textContent = state?.completedAt ? 'completata ✦' : '';
    timer.classList.toggle('hidden', !timer.textContent);
    return;
  }

  timer.classList.remove('hidden');
  const tick = () => {
    const ms = new Date(state.expiresAt).getTime() - Date.now();
    if (ms <= 0) {
      timer.textContent = 'tempo scaduto';
      clearInterval(timerHandle);
      return;
    }
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    timer.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  tick();
  timerHandle = setInterval(tick, 1000);
}

function progressDots(progress) {
  if (!progress?.total) return '';
  return Array.from({ length: progress.total }, (_, i) => {
    const n = i + 1;
    const cls = n < progress.current ? 'done' : n === progress.current ? 'active' : '';
    return `<span class="progress-dot ${cls}"></span>`;
  }).join('');
}

function entryView() {
  return `
    <article class="story-card entrance-card">
      <div class="card-orbit">✦</div>
      <p class="eyebrow">una cosa per te</p>
      <h1>${esc(state.title)}</h1>
      <p class="lead">Prima di iniziare c'è una piccola porta da aprire.</p>
      <div class="question-box">
        <span class="question-label">La prima domanda</span>
        <p>${esc(state.entryQuestion || '')}</p>
      </div>
      <form id="activate" class="answer-form">
        <label class="field-label" for="entryAnswer">La tua risposta</label>
        <div class="field-row">
          <input id="entryAnswer" name="answer" autocomplete="off" autocapitalize="sentences" placeholder="Scrivila qui…" required />
          <button class="round-submit" aria-label="Apri">→</button>
        </div>
        <p class="form-error" id="entryError"></p>
      </form>
    </article>`;
}

function waitingView() {
  const when = new Date(state.birthdayAt).toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' });
  return `
    <article class="story-card centered-card">
      <div class="moon-mark">✦</div>
      <p class="eyebrow">non ancora</p>
      <h1>C'è un momento giusto.</h1>
      <p class="lead">Questa porta si apre il <strong>${esc(when)}</strong>.</p>
    </article>`;
}

function expiredView() {
  return `
    <article class="story-card centered-card">
      <div class="moon-mark">⌛</div>
      <p class="eyebrow">48 ore</p>
      <h1>Il tempo è finito.</h1>
      <p class="lead">La caccia si è fermata qui.</p>
    </article>`;
}

function completedView() {
  return `
    <article class="story-card centered-card finish-card">
      <div class="final-star">✦</div>
      <p class="eyebrow">fine della caccia</p>
      <h1>Ce l'hai fatta.</h1>
      <p class="lead">Tutti i posti, tutte le risposte, tutti i piccoli pezzi. Questo era l'ultimo.</p>
      <div class="finish-sign">♡</div>
    </article>`;
}

function questionView(step) {
  return `
    <article class="story-card step-card">
      <div class="step-meta">
        <span>step ${step.position} di ${state.progress.total}</span>
        <div class="progress-dots">${progressDots(state.progress)}</div>
      </div>
      <div class="step-number">${String(step.position).padStart(2, '0')}</div>
      <p class="eyebrow">trova la risposta</p>
      <h1 class="question-title">${esc(step.question)}</h1>
      <p class="soft-copy">Non serve avere fretta. La risposta giusta apre il prossimo posto.</p>
      <form id="stepForm" data-step="${step.id}" class="answer-form bottom-form">
        <label class="field-label" for="stepAnswer">Risposta</label>
        <div class="field-row">
          <input id="stepAnswer" name="answer" autocomplete="off" placeholder="Prova…" required />
          <button class="round-submit" aria-label="Sblocca">→</button>
        </div>
        <p class="form-error" id="stepError"></p>
      </form>
    </article>`;
}

function rewardView(step) {
  const reward = step.reward;
  const hasCoords = reward?.latitude != null && reward?.longitude != null;
  const locker = reward?.hasLockerCode
    ? reward.lockerCodeRevealed
      ? `<div class="locker-state"><span>✓</span><p>Il codice del locker è già stato mostrato.</p></div>`
      : `<button id="lockerButton" class="locker-button"><span class="locker-icon">⌗</span><span><strong>Sono davanti al locker</strong><small>Mostrami il codice una sola volta</small></span></button><div id="lockerSecret"></div>`
    : '';

  return `
    <article class="reward-screen">
      <div class="reward-copy">
        <div class="step-meta light-meta">
          <span>step ${step.position} · sbloccato</span>
          <div class="progress-dots">${progressDots(state.progress)}</div>
        </div>
        <p class="eyebrow">hai trovato il posto</p>
        <h1>${esc(reward?.title || 'Il prossimo regalo')}</h1>
        <p class="lead">${esc(reward?.text || '')}</p>
      </div>

      ${hasCoords ? `
        <div class="map-card">
          <div id="map" class="map"></div>
          <div class="map-overlay-top">
            <button id="locateButton" class="map-pill"><span class="pulse-dot"></span><span id="locationLabel">Usa la mia posizione</span></button>
            <div id="distancePill" class="map-pill distance-pill hidden"></div>
          </div>
          <div class="map-overlay-bottom">
            <div class="coordinate-copy">
              <small>destinazione</small>
              <strong>${Number(reward.latitude).toFixed(5)}, ${Number(reward.longitude).toFixed(5)}</strong>
            </div>
            <a class="external-map" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${reward.latitude},${reward.longitude}`)}" target="_blank" rel="noopener" aria-label="Apri indicazioni">↗</a>
          </div>
        </div>` : ''}

      <div class="reward-actions">
        ${locker}
        <button id="continueButton" class="primary-wide">${step.position === state.progress.total ? 'Ho trovato anche questo' : 'Ho trovato il regalo · continua'}</button>
      </div>
    </article>`;
}

function render() {
  destroyMap();

  if (!state.available) {
    app.innerHTML = waitingView();
    return;
  }
  if (!state.authorized) {
    chatButton.classList.add('hidden');
    app.innerHTML = entryView();
    bindEntry();
    return;
  }

  chatButton.classList.remove('hidden');
  if (state.expired) {
    app.innerHTML = expiredView();
    return;
  }
  if (state.completedAt || !state.currentStep) {
    app.innerHTML = completedView();
    return;
  }

  const step = state.currentStep;
  if (step.phase === 'question') {
    app.innerHTML = questionView(step);
    bindQuestion(step);
  } else {
    app.innerHTML = rewardView(step);
    bindReward(step);
  }
}

function bindEntry() {
  const form = document.querySelector('#activate');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = document.querySelector('#entryError');
    const button = form.querySelector('button');
    button.disabled = true;
    error.textContent = '';
    try {
      await api('/api/activate', { method: 'POST', body: JSON.stringify({ answer: new FormData(form).get('answer') }) });
      showToast('La caccia è iniziata ✦');
      await load();
    } catch (err) {
      error.textContent = err.message;
      button.disabled = false;
    }
  });
}

function bindQuestion(step) {
  const form = document.querySelector('#stepForm');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = document.querySelector('#stepError');
    const button = form.querySelector('button');
    button.disabled = true;
    error.textContent = '';
    try {
      await api(`/api/steps/${step.id}/answer`, { method: 'POST', body: JSON.stringify({ answer: new FormData(form).get('answer') }) });
      showToast('Giusta. Hai sbloccato un posto ✦');
      await load();
    } catch (err) {
      error.textContent = err.message;
      button.disabled = false;
    }
  });
}

function bindReward(step) {
  const reward = step.reward;
  if (reward?.latitude != null && reward?.longitude != null) {
    currentTarget = { latitude: Number(reward.latitude), longitude: Number(reward.longitude) };
    initMap(currentTarget);
    document.querySelector('#locateButton')?.addEventListener('click', startLocationTracking);
  }

  document.querySelector('#lockerButton')?.addEventListener('click', async () => {
    if (!confirm('Il codice verrà mostrato una sola volta. Confermi di essere davanti al locker?')) return;
    const button = document.querySelector('#lockerButton');
    button.disabled = true;
    try {
      const data = await api(`/api/steps/${step.id}/locker`, { method: 'POST' });
      const box = document.querySelector('#lockerSecret');
      box.innerHTML = `<div class="secret-card"><small>codice locker</small><code>${esc(data.code)}</code><p>Usalo adesso: dopo un refresh non comparirà di nuovo.</p></div>`;
      button.remove();
    } catch (err) {
      showToast(err.message);
      button.disabled = false;
    }
  });

  document.querySelector('#continueButton')?.addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    try {
      await api(`/api/steps/${step.id}/continue`, { method: 'POST' });
      await load();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      showToast(err.message);
      event.currentTarget.disabled = false;
    }
  });
}

function markerIcon(kind) {
  return L.divIcon({
    className: '',
    html: kind === 'user'
      ? '<div class="user-marker"><span></span></div>'
      : '<div class="target-marker"><span>✦</span></div>',
    iconSize: kind === 'user' ? [26, 26] : [44, 44],
    iconAnchor: kind === 'user' ? [13, 13] : [22, 38],
  });
}

function initMap(target) {
  if (!window.L) {
    document.querySelector('.map-card')?.classList.add('map-failed');
    return;
  }
  const mapNode = document.querySelector('#map');
  if (!mapNode) return;

  map = L.map(mapNode, { zoomControl: false, attributionControl: false, preferCanvas: true }).setView([target.latitude, target.longitude], 15);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  L.control.attribution({ position: 'bottomleft', prefix: false }).addAttribution('© OpenStreetMap').addTo(map);
  targetMarker = L.marker([target.latitude, target.longitude], { icon: markerIcon('target'), zIndexOffset: 1000 }).addTo(map);

  setTimeout(() => map?.invalidateSize(), 100);
}

function destroyMap() {
  if (watchId != null && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (map) {
    map.remove();
    map = null;
  }
  userMarker = null;
  targetMarker = null;
  routeLine = null;
  accuracyCircle = null;
  currentTarget = null;
  lastPosition = null;
  hasFittedMap = false;
}

function startLocationTracking() {
  const label = document.querySelector('#locationLabel');
  if (!navigator.geolocation) {
    showToast('Questo browser non supporta la posizione.');
    return;
  }
  if (watchId != null) {
    if (lastPosition && map) map.panTo([lastPosition.latitude, lastPosition.longitude]);
    return;
  }
  if (label) label.textContent = 'Cerco la tua posizione…';

  watchId = navigator.geolocation.watchPosition(
    (position) => updateLocation(position.coords),
    (error) => {
      if (label) label.textContent = 'Posizione non disponibile';
      showToast(error.code === 1 ? 'Permesso posizione non concesso.' : 'Non riesco a trovare la posizione.');
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
  );
}

function updateLocation(coords) {
  if (!map || !currentTarget) return;
  const here = { latitude: coords.latitude, longitude: coords.longitude };
  lastPosition = here;
  const latlng = [here.latitude, here.longitude];
  const targetLatLng = [currentTarget.latitude, currentTarget.longitude];

  if (!userMarker) userMarker = L.marker(latlng, { icon: markerIcon('user'), zIndexOffset: 1200 }).addTo(map);
  else userMarker.setLatLng(latlng);

  if (!accuracyCircle) accuracyCircle = L.circle(latlng, { radius: coords.accuracy || 20, className: 'accuracy-circle', interactive: false }).addTo(map);
  else accuracyCircle.setLatLng(latlng).setRadius(coords.accuracy || 20);

  if (!routeLine) routeLine = L.polyline([latlng, targetLatLng], { className: 'route-line', weight: 3, dashArray: '4 9', interactive: false }).addTo(map);
  else routeLine.setLatLngs([latlng, targetLatLng]);

  const distance = haversineMeters(here.latitude, here.longitude, currentTarget.latitude, currentTarget.longitude);
  const distancePill = document.querySelector('#distancePill');
  if (distancePill) {
    distancePill.textContent = formatDistance(distance);
    distancePill.classList.remove('hidden');
  }
  const label = document.querySelector('#locationLabel');
  if (label) label.textContent = 'Tu sei qui';

  if (!hasFittedMap) {
    map.fitBounds(L.latLngBounds([latlng, targetLatLng]).pad(0.24), { maxZoom: 16, animate: true });
    hasFittedMap = true;
  }
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.max(1, Math.round(meters))} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}

async function load() {
  state = await api('/api/status');
  renderTimer();
  render();
  if (state.authorized) {
    startPolling();
    loadChat().catch(() => {});
  }
}

function startPolling() {
  if (!pollHandle) {
    pollHandle = setInterval(async () => {
      try {
        const fresh = await api('/api/status');
        const changed = JSON.stringify({ step: fresh.currentStep, completedAt: fresh.completedAt, expired: fresh.expired }) !==
          JSON.stringify({ step: state.currentStep, completedAt: state.completedAt, expired: state.expired });
        state = fresh;
        renderTimer();
        if (changed) render();
      } catch {}
    }, 15000);
  }
  if (!chatPollHandle) chatPollHandle = setInterval(() => loadChat().catch(() => {}), 5000);
}

function openChat() {
  chatOpen = true;
  chatPanel.classList.add('open');
  chatBackdrop.classList.remove('hidden');
  requestAnimationFrame(() => chatBackdrop.classList.add('visible'));
  chatPanel.setAttribute('aria-hidden', 'false');
  chatButton.setAttribute('aria-expanded', 'true');
  loadChat(true).catch(() => {});
  setTimeout(() => chatInput.focus({ preventScroll: true }), 300);
}

function closeChat() {
  chatOpen = false;
  chatPanel.classList.remove('open');
  chatBackdrop.classList.remove('visible');
  setTimeout(() => chatBackdrop.classList.add('hidden'), 220);
  chatPanel.setAttribute('aria-hidden', 'true');
  chatButton.setAttribute('aria-expanded', 'false');
}

async function loadChat(markRead = false) {
  if (!state?.authorized) return;
  const data = await api('/api/chat');
  const messages = data.messages || [];
  const previousLast = lastChatId;
  const newest = messages.at(-1)?.id || 0;

  chatMessages.innerHTML = messages.length
    ? messages.map((m) => `
      <div class="bubble-row ${m.sender === 'player' ? 'mine' : 'theirs'}">
        <div class="bubble">
          <p>${esc(m.body)}</p>
          <time>${new Date(m.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</time>
        </div>
      </div>`).join('')
    : `<div class="chat-empty"><span>✦</span><p>Qui potete scrivervi durante la caccia.</p></div>`;

  const unreadAdmin = messages.filter((m) => m.sender === 'admin' && m.id > previousLast).length;
  if (chatOpen || markRead) {
    lastChatId = newest;
    localStorage.setItem('hunt_last_chat_id', String(lastChatId));
    chatUnread.classList.add('hidden');
    requestAnimationFrame(() => { chatMessages.scrollTop = chatMessages.scrollHeight; });
  } else if (unreadAdmin > 0) {
    chatUnread.textContent = unreadAdmin > 9 ? '9+' : String(unreadAdmin);
    chatUnread.classList.remove('hidden');
  }
}

chatButton.addEventListener('click', openChat);
chatClose.addEventListener('click', closeChat);
chatBackdrop.addEventListener('click', closeChat);

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  const send = chatForm.querySelector('button');
  send.disabled = true;
  try {
    await api('/api/chat', { method: 'POST', body: JSON.stringify({ message }) });
    chatInput.value = '';
    chatInput.style.height = '';
    await loadChat(true);
  } catch (err) {
    showToast(err.message);
  } finally {
    send.disabled = false;
  }
});

chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = `${Math.min(chatInput.scrollHeight, 110)}px`;
});

load().catch((err) => {
  app.innerHTML = `<article class="story-card centered-card"><p class="eyebrow">ops</p><h1>Qualcosa non va.</h1><p class="lead">${esc(err.message)}</p></article>`;
});
