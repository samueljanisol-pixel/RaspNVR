function normalizeRtspUrl(url) {
  if (!url || !url.trim().toLowerCase().startsWith('rtsp://')) {
    return url;
  }
  try {
    const parsed = new URL(url.trim());
    const user = parsed.username ? decodeURIComponent(parsed.username) : '';
    const password = parsed.password ? decodeURIComponent(parsed.password) : '';
    const auth = user
      ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}@`
      : '';
    return `rtsp://${auth}${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function annkeUrls(ip, user, password) {
  const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;
  const base = `rtsp://${auth}@${ip}:554/Streaming/channels`;
  return {
    rtsp_sub: `${base}/102`,
    rtsp_main: `${base}/101`,
  };
}

function urlsFromFullRtsp(fullUrl) {
  const trimmed = fullUrl.trim();
  if (!trimmed.startsWith('rtsp://')) {
    throw new Error('URL RTSP invalide');
  }
  const main = normalizeRtspUrl(trimmed);
  let sub = main;
  if (/\/101(\?|$)/.test(main)) {
    sub = main.replace(/\/101(\?|$)/, '/102$1');
  } else if (/\/channels\/1(\?|$)/i.test(main)) {
    sub = main.replace(/\/channels\/1(\?|$)/i, '/channels/2$1');
  }
  return { rtsp_main: main, rtsp_sub: sub };
}

function hlsLiveConfig(withAudio = false) {
  return {
    lowLatencyMode: true,
    enableWorker: true,
    // Segments MediaMTX = 5 s (GOP caméra) ; viser ~1 s du live via les parts LL-HLS.
    liveSyncDuration: withAudio ? 1.5 : 1,
    liveMaxLatencyDuration: withAudio ? 5 : 4,
    maxLiveSyncPlaybackRate: 1.5,
    maxBufferLength: 4,
    maxMaxBufferLength: 6,
    backBufferLength: 0,
    liveBackBufferLength: 0,
  };
}

function attachHls(video, url, { withAudio = false, force = false } = {}) {
  const audioKey = withAudio ? '1' : '0';
  if (!force && video.dataset.src === url && video.dataset.audio === audioKey && video._hls) {
    return;
  }
  video.dataset.src = url;
  video.dataset.audio = audioKey;

  if (typeof Hls !== 'undefined' && Hls.isSupported()) {
    if (video._hls) {
      video._hls.destroy();
      video._hls = null;
    }
    const hls = new Hls(hlsLiveConfig(withAudio));
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;
          default:
            console.error('HLS fatal', data);
            break;
        }
      }
    });
    video._hls = hls;
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
    video.play().catch(() => {});
  }
}

function initVideoZoom(wrap) {
  const layer = wrap.querySelector('.video-zoom');
  if (!layer) return;

  let scale = 1;
  let translateX = 0;
  let translateY = 0;
  let pinchStartDistance = 0;
  let pinchStartScale = 1;
  let panStartX = 0;
  let panStartY = 0;
  let panOriginX = 0;
  let panOriginY = 0;
  let isPanning = false;

  function clampPan() {
    if (scale <= 1) {
      translateX = 0;
      translateY = 0;
      return;
    }
    const maxX = ((scale - 1) * wrap.clientWidth) / 2;
    const maxY = ((scale - 1) * wrap.clientHeight) / 2;
    translateX = Math.min(maxX, Math.max(-maxX, translateX));
    translateY = Math.min(maxY, Math.max(-maxY, translateY));
  }

  function applyTransform() {
    clampPan();
    layer.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    wrap.classList.toggle('is-zoomed', scale > 1.01);
  }

  function resetZoom() {
    scale = 1;
    translateX = 0;
    translateY = 0;
    applyTransform();
  }

  function zoomAt(clientX, clientY, factor) {
    const rect = wrap.getBoundingClientRect();
    const x = clientX - rect.left - rect.width / 2;
    const y = clientY - rect.top - rect.height / 2;
    const newScale = Math.min(5, Math.max(1, scale * factor));
    if (newScale === scale) return;
    const ratio = newScale / scale;
    translateX = x - (x - translateX) * ratio;
    translateY = y - (y - translateY) * ratio;
    scale = newScale;
    applyTransform();
  }

  function touchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  wrap.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomAt(event.clientX, event.clientY, factor);
  }, { passive: false });

  wrap.addEventListener('touchstart', (event) => {
    if (event.touches.length === 2) {
      pinchStartDistance = touchDistance(event.touches);
      pinchStartScale = scale;
      isPanning = false;
      event.preventDefault();
    } else if (event.touches.length === 1 && scale > 1) {
      isPanning = true;
      panStartX = event.touches[0].clientX;
      panStartY = event.touches[0].clientY;
      panOriginX = translateX;
      panOriginY = translateY;
    }
  }, { passive: false });

  wrap.addEventListener('touchmove', (event) => {
    if (event.touches.length === 2) {
      event.preventDefault();
      const distance = touchDistance(event.touches);
      scale = Math.min(5, Math.max(1, pinchStartScale * (distance / pinchStartDistance)));
      applyTransform();
    } else if (event.touches.length === 1 && isPanning && scale > 1) {
      event.preventDefault();
      translateX = panOriginX + (event.touches[0].clientX - panStartX);
      translateY = panOriginY + (event.touches[0].clientY - panStartY);
      applyTransform();
    }
  }, { passive: false });

  wrap.addEventListener('touchend', () => {
    if (scale <= 1.01) resetZoom();
    isPanning = false;
  });

  wrap.addEventListener('mousedown', (event) => {
    if (scale <= 1 || event.button !== 0) return;
    isPanning = true;
    panStartX = event.clientX;
    panStartY = event.clientY;
    panOriginX = translateX;
    panOriginY = translateY;
    wrap.classList.add('is-panning');
    event.preventDefault();
  });

  window.addEventListener('mousemove', (event) => {
    if (!isPanning || scale <= 1) return;
    translateX = panOriginX + (event.clientX - panStartX);
    translateY = panOriginY + (event.clientY - panStartY);
    applyTransform();
  });

  window.addEventListener('mouseup', () => {
    isPanning = false;
    wrap.classList.remove('is-panning');
  });

  wrap.resetZoom = resetZoom;
  return wrap;
}
