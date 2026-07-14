function showMsg(el, text) {
  el.textContent = text;
  el.hidden = !text;
}

async function loadSettings() {
  const res = await fetch('/api/system/settings');
  const data = await res.json();
  document.querySelector('#app-name-form [name=app_name]').value = data.app_name;
  document.querySelector('#hostname-form [name=hostname]').value = data.hostname;
  document.getElementById('hostname-preview').textContent = data.hostname;
  document.getElementById('info-store').textContent = data.store_code;
  document.getElementById('info-hostname').textContent = data.hostname;
}

document.getElementById('app-name-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const errEl = document.getElementById('app-name-error');
  const msgEl = document.getElementById('app-name-msg');
  showMsg(errEl, '');
  showMsg(msgEl, '');

  const form = new FormData(event.target);
  const res = await fetch('/api/system/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_name: form.get('app_name') }),
  });

  if (!res.ok) {
    showMsg(errEl, 'Erreur lors de la sauvegarde');
    return;
  }

  const data = await res.json();
  document.querySelectorAll('[data-app-name]').forEach((el) => {
    el.textContent = data.app_name;
  });
  if (document.title.includes('RaspNVR') || document.title.includes('—')) {
    const part = document.title.split('—').pop()?.trim() || 'Paramètres';
    document.title = `${data.app_name} — ${part}`;
  }
  showMsg(msgEl, 'Nom enregistré.');
});

document.getElementById('hostname-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const errEl = document.getElementById('hostname-error');
  const msgEl = document.getElementById('hostname-msg');
  showMsg(errEl, '');
  showMsg(msgEl, '');

  const form = new FormData(event.target);
  const hostname = String(form.get('hostname') || '').trim().toLowerCase();
  const res = await fetch('/api/system/hostname', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostname }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    showMsg(errEl, data.detail || 'Erreur lors du changement de hostname');
    return;
  }

  document.getElementById('hostname-preview').textContent = data.hostname;
  document.getElementById('info-hostname').textContent = data.hostname;
  showMsg(msgEl, `Hostname appliqué : ${data.hostname}.local`);
});

async function loadAgentStatus() {
  const res = await fetch('/api/agent/status');
  if (!res.ok) return;
  const data = await res.json();
  const cfg = data.config || {};
  document.querySelector('#central-form [name=central_url]').value = cfg.central_url || '';
  document.querySelector('#central-form [name=store_code]').value = cfg.store_code || '';
  document.querySelector('#central-form [name=tunnel_url]').value = cfg.tunnel_url || '';
  document.getElementById('info-agent').textContent = cfg.registered ? `Enregistré (${cfg.device_id})` : 'Non enregistré';
  document.getElementById('info-heartbeat').textContent = data.state?.last_heartbeat_at || '—';
}

document.getElementById('central-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const errEl = document.getElementById('central-error');
  const msgEl = document.getElementById('central-msg');
  showMsg(errEl, '');
  showMsg(msgEl, '');

  const form = new FormData(event.target);
  const centralUrl = String(form.get('central_url') || '').trim();
  const tunnelUrl = String(form.get('tunnel_url') || '').trim();
  const storeCode = String(form.get('store_code') || '').trim();
  const token = String(form.get('registration_token') || '').trim();

  if (centralUrl || tunnelUrl) {
    await fetch('/api/agent/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ central_url: centralUrl || null, tunnel_url: tunnelUrl || null }),
    });
  }

  if (storeCode && token) {
    const res = await fetch('/api/agent/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_code: storeCode,
        registration_token: token,
        central_url: centralUrl || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showMsg(errEl, data.detail || 'Enregistrement échoué');
      return;
    }
    showMsg(msgEl, data.message || 'Enregistrement réussi.');
  } else {
    showMsg(msgEl, 'Configuration enregistrée.');
  }
  loadAgentStatus();
});

loadSettings();
loadAgentStatus();
setInterval(loadAgentStatus, 15000);
