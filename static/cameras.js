const listEl = document.getElementById('camera-list');
const listEmpty = document.getElementById('list-empty');
const editDialog = document.getElementById('edit-dialog');
const editForm = document.getElementById('edit-form');

function showError(el, message) {
  el.textContent = message;
  el.hidden = !message;
}

async function loadCameras() {
  const res = await fetch('/api/cameras');
  const cameras = await res.json();
  listEl.innerHTML = '';
  listEmpty.hidden = cameras.length > 0;

  for (const cam of cameras) {
    const item = document.createElement('article');
    item.className = 'manage-card';
    item.innerHTML = `
      <div class="manage-card-head">
        <div>
          <strong>${escapeHtml(cam.name)}</strong>
          <span class="badge ${cam.recording ? '' : 'off'}">${cam.recording ? '● REC' : '○ OFF'}</span>
          ${cam.enabled ? '' : '<span class="badge off">Désactivée</span>'}
        </div>
        <div class="manage-actions">
          <button type="button" class="btn-secondary btn-sm" data-action="edit" data-id="${cam.id}">Modifier</button>
          <button type="button" class="btn-secondary btn-sm" data-action="restart" data-id="${cam.id}">Redémarrer</button>
          <button type="button" class="btn-danger btn-sm" data-action="delete" data-id="${cam.id}">Supprimer</button>
        </div>
      </div>
      <dl class="manage-meta">
        <dt>Substream</dt><dd>${escapeHtml(cam.rtsp_sub)}</dd>
        <dt>Main stream</dt><dd>${escapeHtml(cam.rtsp_main || '—')}</dd>
      </dl>
    `;
    listEl.appendChild(item);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

listEl.addEventListener('click', async (event) => {
  const btn = event.target.closest('button[data-action]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const action = btn.dataset.action;

  if (action === 'edit') {
    const res = await fetch(`/api/cameras/${id}`);
    const cam = await res.json();
    editForm.elements.id.value = cam.id;
    editForm.elements.name.value = cam.name;
    editForm.elements.rtsp_sub.value = cam.rtsp_sub;
    editForm.elements.rtsp_main.value = cam.rtsp_main || '';
    editForm.elements.enabled.checked = cam.enabled;
    showError(document.getElementById('edit-error'), '');
    editDialog.showModal();
    return;
  }

  if (action === 'restart') {
    await fetch(`/api/cameras/${id}/restart`, { method: 'POST' });
    await loadCameras();
    return;
  }

  if (action === 'delete') {
    if (!confirm('Supprimer cette caméra et ses enregistrements indexés ?')) return;
    await fetch(`/api/cameras/${id}`, { method: 'DELETE' });
    await loadCameras();
  }
});

document.getElementById('edit-cancel').addEventListener('click', () => editDialog.close());

editForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const errEl = document.getElementById('edit-error');
  const id = editForm.elements.id.value;
  const payload = {
    name: editForm.elements.name.value,
    rtsp_sub: normalizeRtspUrl(editForm.elements.rtsp_sub.value.trim()),
    rtsp_main: normalizeRtspUrl(editForm.elements.rtsp_main.value.trim()) || null,
    enabled: editForm.elements.enabled.checked,
  };

  const res = await fetch(`/api/cameras/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    showError(errEl, 'Erreur lors de la modification');
    return;
  }

  editDialog.close();
  await loadCameras();
});

document.getElementById('add-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const errEl = document.getElementById('add-error');
  showError(errEl, '');

  const form = new FormData(event.target);
  const fullUrl = (form.get('rtsp_url') || '').trim();
  let urls;

  try {
    if (fullUrl) {
      urls = urlsFromFullRtsp(fullUrl);
    } else {
      const ip = (form.get('ip') || '').trim();
      const password = form.get('password');
      if (!ip || !password) {
        throw new Error('Renseignez IP + mot de passe, ou une URL RTSP complète.');
      }
      urls = annkeUrls(ip, form.get('user') || 'admin', password);
    }
  } catch (error) {
    showError(errEl, error.message);
    return;
  }

  const res = await fetch('/api/cameras', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: form.get('name') || 'Caméra',
      rtsp_sub: urls.rtsp_sub,
      rtsp_main: urls.rtsp_main,
    }),
  });

  if (!res.ok) {
    showError(errEl, 'Erreur lors de l\'ajout');
    return;
  }

  event.target.reset();
  form.set('user', 'admin');
  await loadCameras();
});

loadCameras();
