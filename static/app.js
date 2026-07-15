const cameraCards = new Map();
let allCameras = [];
let layout = Number(localStorage.getItem('raspnvr_layout') || 4);
let focusedCameraId = Number(localStorage.getItem('raspnvr_focus') || 0);
let previousLayout = null;
let soloFromDblClick = false;

function createCameraCard(cam) {
  const card = document.createElement('article');
  card.className = 'card';
  card.dataset.cameraId = String(cam.id);
  card.innerHTML = `
    <header>
      <strong class="cam-name"></strong>
      <span class="badge"></span>
    </header>
    <div class="video-wrap">
      <div class="video-zoom">
        <video muted autoplay playsinline disablepictureinpicture></video>
      </div>
      <button type="button" class="audio-btn hidden">Activer le son</button>
    </div>
  `;
  card.querySelector('.cam-name').textContent = cam.name;
  updateCameraBadge(card, cam);
  const wrap = card.querySelector('.video-wrap');
  initVideoZoom(wrap);
  card.querySelector('.audio-btn')?.addEventListener('click', (event) => {
    event.stopPropagation();
    enableCardAudio(card);
  });
  if (cam.hls_url) {
    attachHls(card.querySelector('video'), cam.hls_url, { withAudio: layout === 1 });
  }

  card.addEventListener('dblclick', (event) => {
    if (event.target.closest('.video-wrap') && wrap.classList.contains('is-zoomed')) {
      wrap.resetZoom();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    handleCameraDblClick(cam.id);
  });

  return card;
}

function handleCameraDblClick(cameraId) {
  if (soloFromDblClick && layout === 1 && focusedCameraId === cameraId) {
    layout = previousLayout || 4;
    previousLayout = null;
    soloFromDblClick = false;
    resetAllZooms();
    localStorage.setItem('raspnvr_layout', String(layout));
    applyLayoutUI();
    applyLayoutVisibility();
    updateCameraTabs();
    return;
  }

  if (layout === 4 || layout === 9) {
    previousLayout = layout;
    soloFromDblClick = true;
    focusedCameraId = cameraId;
    layout = 1;
    localStorage.setItem('raspnvr_layout', String(layout));
    localStorage.setItem('raspnvr_focus', String(focusedCameraId));
    applyLayoutUI();
    applyLayoutVisibility();
    updateCameraTabs();
  }
}

function updateCameraBadge(card, cam) {
  const badge = card.querySelector('.badge');
  badge.textContent = cam.recording ? '● REC' : '○ OFF';
  badge.classList.toggle('off', !cam.recording);
  card.querySelector('.cam-name').textContent = cam.name;
}

function applyLayoutUI() {
  document.querySelectorAll('.layout-btn').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.layout) === layout);
  });
  const grid = document.getElementById('grid');
  grid.classList.remove('layout-1', 'layout-4', 'layout-9');
  grid.classList.add(`layout-${layout}`);
}

function resetAllZooms() {
  cameraCards.forEach((card) => {
    const wrap = card.querySelector('.video-wrap');
    wrap?.resetZoom?.();
  });
}

function syncAudioMute() {
  const enableAudio = layout === 1;
  cameraCards.forEach((card) => {
    const video = card.querySelector('video');
    if (!video) return;
    const visible = !card.classList.contains('hidden-slot');
    const audioOn = enableAudio && visible;
    const btn = card.querySelector('.audio-btn');
    const cam = allCameras.find((c) => c.id === Number(card.dataset.cameraId));
    if (cam?.hls_url && video.dataset.audio !== (audioOn ? '1' : '0')) {
      attachHls(video, cam.hls_url, { withAudio: audioOn, force: true });
    }
    video.muted = !audioOn;
    if (!audioOn) {
      btn?.classList.add('hidden');
      return;
    }
    video.volume = 1;
    btn?.classList.add('hidden');
    if (cam?.hls_url) {
      attachHls(video, cam.hls_url, { withAudio: true, force: true });
    }
    video
      .play()
      .then(() => {
        if (video.muted) btn?.classList.remove('hidden');
      })
      .catch(() => btn?.classList.remove('hidden'));
  });
}

function enableCardAudio(card) {
  const video = card.querySelector('video');
  if (!video) return;
  video.muted = false;
  video.volume = 1;
  video.play().catch(() => {});
  card.querySelector('.audio-btn')?.classList.add('hidden');
}

function setLayout(newLayout) {
  layout = newLayout;
  soloFromDblClick = false;
  previousLayout = null;
  resetAllZooms();
  localStorage.setItem('raspnvr_layout', String(layout));
  applyLayoutUI();
  applyLayoutVisibility();
  updateCameraTabs();
}

function applyLayoutVisibility() {
  const grid = document.getElementById('grid');
  const slots = layout === 1 ? 1 : layout === 4 ? 4 : 9;
  const tabsNav = document.getElementById('camera-tabs');

  grid.querySelectorAll('.slot-empty').forEach((el) => el.remove());

  if (!allCameras.length) return;

  if (layout === 1) {
    tabsNav.hidden = soloFromDblClick || allCameras.length <= 1;
    if (!allCameras.find((c) => c.id === focusedCameraId)) {
      focusedCameraId = allCameras[0].id;
      localStorage.setItem('raspnvr_focus', String(focusedCameraId));
    }
    cameraCards.forEach((card, id) => {
      const show = id === focusedCameraId;
      card.classList.toggle('hidden-slot', !show);
      card.classList.toggle('solo-highlight', soloFromDblClick && show);
    });
    syncAudioMute();
    return;
  }

  tabsNav.hidden = true;
  cameraCards.forEach((card) => card.classList.remove('solo-highlight'));
  const visible = allCameras.slice(0, slots);
  cameraCards.forEach((card, id) => {
    card.classList.toggle('hidden-slot', !visible.some((c) => c.id === id));
  });

  const missing = slots - visible.length;
  for (let i = 0; i < missing; i += 1) {
    const empty = document.createElement('div');
    empty.className = 'slot-empty';
    empty.textContent = 'Aucune caméra';
    grid.appendChild(empty);
  }
  syncAudioMute();
}

function updateCameraTabs() {
  const tabsNav = document.getElementById('camera-tabs');
  tabsNav.innerHTML = '';
  if (layout !== 1 || allCameras.length <= 1 || soloFromDblClick) {
    tabsNav.hidden = true;
    return;
  }
  tabsNav.hidden = false;
  for (const cam of allCameras) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-btn' + (cam.id === focusedCameraId ? ' active' : '');
    btn.textContent = cam.name;
    btn.addEventListener('click', () => {
      focusedCameraId = cam.id;
      localStorage.setItem('raspnvr_focus', String(focusedCameraId));
      applyLayoutVisibility();
      updateCameraTabs();
    });
    tabsNav.appendChild(btn);
  }
}

async function loadStatus() {
  const res = await fetch('/api/system/status');
  const data = await res.json();
  document.getElementById('status').textContent =
    `${data.hostname} · ${data.camera_count} caméra(s) · disque ${data.disk_used_percent}%`;
}

async function syncCameras() {
  const res = await fetch('/api/cameras');
  allCameras = await res.json();
  const grid = document.getElementById('grid');
  const emptyMsg = document.getElementById('empty-msg');
  const seen = new Set();

  if (!allCameras.length) {
    cameraCards.forEach((card) => {
      const video = card.querySelector('video');
      if (video?._hls) video._hls.destroy();
    });
    cameraCards.clear();
    grid.innerHTML = '';
    emptyMsg.hidden = false;
    document.getElementById('camera-tabs').hidden = true;
    return;
  }

  emptyMsg.hidden = true;
  if (grid.querySelector('p')) grid.innerHTML = '';

  for (const cam of allCameras) {
    seen.add(cam.id);
    let card = cameraCards.get(cam.id);
    if (!card) {
      card = createCameraCard(cam);
      cameraCards.set(cam.id, card);
      grid.appendChild(card);
    } else {
      updateCameraBadge(card, cam);
    }
  }

  for (const [id, card] of cameraCards) {
    if (!seen.has(id)) {
      const video = card.querySelector('video');
      if (video?._hls) video._hls.destroy();
      card.remove();
      cameraCards.delete(id);
    }
  }

  applyLayoutVisibility();
  updateCameraTabs();
}

document.querySelectorAll('.layout-btn').forEach((btn) => {
  btn.addEventListener('click', () => setLayout(Number(btn.dataset.layout)));
});

async function refreshStatus() {
  await loadStatus();
  const res = await fetch('/api/cameras');
  const cameras = await res.json();
  allCameras = cameras;
  for (const cam of cameras) {
    const card = cameraCards.get(cam.id);
    if (card) updateCameraBadge(card, cam);
  }
}

applyLayoutUI();
loadStatus();
syncCameras();
setInterval(refreshStatus, 30000);
