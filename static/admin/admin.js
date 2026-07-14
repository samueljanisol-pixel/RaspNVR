const ADMIN_KEY = 'dev-admin-key';

function adminHeaders() {
  return { Authorization: `Bearer ${ADMIN_KEY}` };
}

let selectedStoreId = null;

async function loadStores() {
  const res = await fetch('/api/raspnvr/admin/stores', { headers: adminHeaders() });
  const data = await res.json();
  const container = document.getElementById('stores');
  container.innerHTML = '';
  for (const store of data.stores || []) {
    const el = document.createElement('article');
    el.className = 'manage-item';
    el.innerHTML = `
      <div>
        <strong>${store.name}</strong>
        <span class="badge ${store.online ? '' : 'off'}">${store.online ? 'En ligne' : 'Hors ligne'}</span>
        <p class="hint">Code ${store.code}</p>
      </div>
      <button type="button" class="btn-secondary">Détail</button>
    `;
    el.querySelector('button').addEventListener('click', () => openStore(store.id, store.name));
    container.appendChild(el);
  }
}

async function openStore(id, name) {
  selectedStoreId = id;
  document.getElementById('detail-panel').hidden = false;
  document.getElementById('detail-title').textContent = name;
  const res = await fetch(`/api/raspnvr/admin/stores/${id}`, { headers: adminHeaders() });
  const data = await res.json();
  const device = data.device || {};
  const status = device.last_status || {};
  document.getElementById('detail-meta').innerHTML = `
    <p>Hostname : ${device.hostname || '—'}</p>
    <p>Tunnel : ${device.tunnel_url ? `<a href="${device.tunnel_url}">${device.tunnel_url}</a>` : '—'}</p>
    <p>${status.camera_count ?? 0} caméra(s) · disque ${status.disk_used_percent ?? '—'}%</p>
  `;

  const grid = document.getElementById('live-grid');
  grid.innerHTML = '';
  const tunnel = (device.tunnel_url || '').replace(/\/$/, '');
  for (const cam of status.cameras || []) {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `<header><strong>${cam.name}</strong></header><div class="video-wrap"><video muted autoplay playsinline controls></video></div>`;
    grid.appendChild(card);
    if (tunnel) {
      const video = card.querySelector('video');
      const src = `${tunnel}/api/hls/cam${cam.id}/index.m3u8`;
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
      } else if (window.Hls && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hls.loadSource(src);
        hls.attachMedia(video);
      }
    }
  }

  const recList = document.getElementById('recordings');
  recList.innerHTML = '';
  for (const rec of data.recordings || []) {
    const li = document.createElement('li');
    li.innerHTML = `Cam ${rec.camera_id} · ${new Date(rec.started_at).toLocaleString('fr-FR')} · `;
    const btn = document.createElement('button');
    btn.className = 'btn-secondary';
    btn.textContent = 'Lire';
    btn.addEventListener('click', async () => {
      const r = await fetch(`/api/raspnvr/admin/recordings/${rec.id}/url`, { headers: adminHeaders() });
      const j = await r.json();
      if (j.url) window.open(j.url, '_blank');
    });
    li.appendChild(btn);
    recList.appendChild(li);
  }
}

document.getElementById('btn-token').addEventListener('click', async () => {
  if (!selectedStoreId) return;
  const res = await fetch(`/api/raspnvr/admin/stores/${selectedStoreId}/token`, {
    method: 'POST',
    headers: adminHeaders(),
  });
  const data = await res.json();
  const msg = document.getElementById('token-msg');
  msg.hidden = false;
  msg.textContent = data.token ? `Token : ${data.token}` : (data.detail || 'Erreur');
});

async function sendCommand(type) {
  if (!selectedStoreId) return;
  await fetch(`/api/raspnvr/admin/stores/${selectedStoreId}/commands`, {
    method: 'POST',
    headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, payload: {} }),
  });
}

document.getElementById('btn-restart').addEventListener('click', () => sendCommand('restart_service'));
document.getElementById('btn-upload').addEventListener('click', () => sendCommand('upload_recordings'));

loadStores();
setInterval(loadStores, 30000);
