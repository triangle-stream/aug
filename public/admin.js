const token = document.querySelector('#token');
const out = document.querySelector('#state');
const statusLabel = document.querySelector('#adminStatus');
const messagesNode = document.querySelector('#adminMessages');
const chatForm = document.querySelector('#adminChatForm');
const messageInput = document.querySelector('#adminMessage');
let poll = null;

token.value = sessionStorage.getItem('hunt_admin_token') || '';

const esc = (s = '') => String(s).replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
const headers = (json = false) => ({ authorization: `Bearer ${token.value}`, ...(json ? { 'content-type':'application/json' } : {}) });

async function adminApi(path, options = {}) {
  const res = await fetch(path, { ...options, headers: { ...headers(!!options.body), ...(options.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function refreshState() {
  try {
    const data = await adminApi('/api/admin/state');
    out.textContent = JSON.stringify(data, null, 2);
    statusLabel.textContent = 'connesso';
  } catch (err) {
    out.textContent = err.message;
    statusLabel.textContent = 'errore accesso';
  }
}

async function refreshChat() {
  try {
    const data = await adminApi('/api/admin/chat');
    const wasNearBottom = messagesNode.scrollHeight - messagesNode.scrollTop - messagesNode.clientHeight < 80;
    messagesNode.innerHTML = (data.messages || []).map((m) => `
      <div class="bubble-row ${m.sender === 'admin' ? 'mine' : 'theirs'}">
        <div class="bubble"><p>${esc(m.body)}</p><time>${new Date(m.created_at).toLocaleString('it-IT',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'})}</time></div>
      </div>`).join('') || '<div class="chat-empty"><p>Nessun messaggio ancora.</p></div>';
    if (wasNearBottom) messagesNode.scrollTop = messagesNode.scrollHeight;
    statusLabel.textContent = 'connesso';
  } catch (err) {
    statusLabel.textContent = 'errore accesso';
  }
}

function connect() {
  sessionStorage.setItem('hunt_admin_token', token.value);
  refreshState();
  refreshChat();
  clearInterval(poll);
  poll = setInterval(() => { refreshChat(); refreshState(); }, 5000);
}

document.querySelector('#connect').addEventListener('click', connect);
document.querySelector('#refresh').addEventListener('click', refreshState);
chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();
  if (!message) return;
  const button = chatForm.querySelector('button');
  button.disabled = true;
  try {
    await adminApi('/api/admin/chat', { method:'POST', body: JSON.stringify({ message }) });
    messageInput.value = '';
    await refreshChat();
  } catch (err) {
    statusLabel.textContent = err.message;
  } finally {
    button.disabled = false;
  }
});

if (token.value) connect();
