'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { isZoomed, useVideoZoom } from '@/lib/useVideoZoom';
import { hlsLiveConfig } from '@/lib/hlsLiveConfig';

export type LivePlayerHandle = {
  resetZoom: () => void;
  isZoomed: () => boolean;
};

type ConnState = 'connecting' | 'playing' | 'offline';

type Props = {
  src: string;
  label: string;
  sublabel?: string;
  hidden?: boolean;
  soloHighlight?: boolean;
  withAudio?: boolean;
  onDoubleClick?: () => void;
};

const CONNECT_TIMEOUT_MS = 25_000;
const RETRY_INTERVAL_MS = 5_000;
const MAX_RECOVERY_ATTEMPTS = 4;

type HlsInstance = {
  loadSource: (s: string) => void;
  attachMedia: (v: HTMLVideoElement) => void;
  destroy: () => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  startLoad: () => void;
  recoverMediaError: () => void;
};

type HlsCtor = {
  isSupported: () => boolean;
  Events: { MANIFEST_PARSED: string; ERROR: string };
  ErrorTypes: { NETWORK_ERROR: string; MEDIA_ERROR: string };
  new (cfg: object): HlsInstance;
};

function getHlsCtor(): HlsCtor | undefined {
  return (window as typeof window & { Hls?: HlsCtor }).Hls;
}

export const LivePlayer = forwardRef<LivePlayerHandle, Props>(function LivePlayer(
  { src, label, sublabel, hidden, soloHighlight, withAudio = false, onDoubleClick },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const resetRef = useRef<(() => void) | null>(null);
  const [connState, setConnState] = useState<ConnState>(src ? 'connecting' : 'offline');
  const [retryCount, setRetryCount] = useState(0);
  const [audioBlocked, setAudioBlocked] = useState(false);

  useVideoZoom(wrapRef, resetRef);

  useImperativeHandle(ref, () => ({
    resetZoom: () => resetRef.current?.(),
    isZoomed: () => isZoomed(wrapRef.current),
  }));

  useEffect(() => {
    setRetryCount(0);
  }, [src]);

  async function enableAudio() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    video.volume = 1;
    try {
      await video.play();
      setAudioBlocked(false);
    } catch {
      setAudioBlocked(true);
    }
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!withAudio) {
      video.muted = true;
      setAudioBlocked(false);
      return;
    }
    video.volume = 1;
    video.muted = false;
    video.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
  }, [withAudio, connState]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) {
      setConnState('offline');
      return;
    }

    let destroyed = false;
    let hls: HlsInstance | null = null;
    let connectTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let recoveryAttempts = 0;
    let hasPlayed = false;

    const clearConnectTimer = () => {
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
    };

    const scheduleRetry = () => {
      if (destroyed) return;
      retryTimer = setTimeout(() => {
        setRetryCount((count) => count + 1);
      }, RETRY_INTERVAL_MS);
    };

    const markPlaying = () => {
      if (destroyed) return;
      clearConnectTimer();
      hasPlayed = true;
      recoveryAttempts = 0;
      setConnState('playing');
    };

    const markOffline = () => {
      if (destroyed) return;
      clearConnectTimer();
      hls?.destroy();
      hls = null;
      video.removeAttribute('src');
      video.load();
      setConnState('offline');
      scheduleRetry();
    };

    const recoverStream = () => {
      if (destroyed || !hls) return false;
      recoveryAttempts += 1;
      if (recoveryAttempts > MAX_RECOVERY_ATTEMPTS) return false;
      hls.startLoad();
      return true;
    };

    const startConnectTimeout = () => {
      clearConnectTimer();
      connectTimer = setTimeout(markOffline, CONNECT_TIMEOUT_MS);
    };

    const keepPlaying = () => {
      if (!hasPlayed) return;
      if (video.paused && !video.ended) video.play().catch(() => {});
    };

    const onVideoPlaying = () => markPlaying();
    const onVideoCanPlay = () => {
      if (!hasPlayed) markPlaying();
    };

    video.addEventListener('pause', keepPlaying);
    video.addEventListener('playing', onVideoPlaying);
    video.addEventListener('canplay', onVideoCanPlay);

    setConnState('connecting');
    startConnectTimeout();
    recoveryAttempts = 0;
    hasPlayed = false;

    const HlsCtor = getHlsCtor();
    const cacheBustSrc = retryCount > 0 ? `${src}${src.includes('?') ? '&' : '?'}r=${retryCount}` : src;

    if (HlsCtor?.isSupported()) {
      hls = new HlsCtor(hlsLiveConfig(false));
      hls.loadSource(cacheBustSrc);
      hls.attachMedia(video);
      hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
        markPlaying();
        video.play().catch(() => {});
      });
      hls.on(HlsCtor.Events.ERROR, (...args: unknown[]) => {
        const data = args[1] as { fatal?: boolean; type?: string };
        if (!data.fatal || !HlsCtor) return;
        switch (data.type) {
          case HlsCtor.ErrorTypes.NETWORK_ERROR:
            if (!recoverStream()) markOffline();
            break;
          case HlsCtor.ErrorTypes.MEDIA_ERROR:
            hls?.recoverMediaError();
            break;
          default:
            if (!recoverStream()) markOffline();
            break;
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = cacheBustSrc;
      video.play().catch(() => {});
    } else {
      markOffline();
    }

    return () => {
      destroyed = true;
      clearConnectTimer();
      if (retryTimer) clearTimeout(retryTimer);
      video.removeEventListener('pause', keepPlaying);
      video.removeEventListener('playing', onVideoPlaying);
      video.removeEventListener('canplay', onVideoCanPlay);
      hls?.destroy();
    };
  }, [src, retryCount]);

  function handleDoubleClick(event: React.MouseEvent) {
    if (event.target instanceof Element && !event.target.closest('.video-wrap')) return;
    if (isZoomed(wrapRef.current)) {
      resetRef.current?.();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    onDoubleClick?.();
  }

  const statusLabel =
    connState === 'connecting' ? 'Connexion…' : connState === 'offline' ? 'Hors connexion' : '';

  return (
    <article
      className={`live-card${hidden ? ' hidden-slot' : ''}${soloHighlight ? ' solo-highlight' : ''}`}
      onDoubleClick={handleDoubleClick}
    >
      <header className="live-card-head">
        <strong>{label}</strong>
        {sublabel && <span className="meta">{sublabel}</span>}
      </header>
      {src ? (
        <div className="video-wrap" ref={wrapRef}>
          <div className="video-zoom">
            <video
              ref={videoRef}
              muted={!withAudio}
              autoPlay
              playsInline
              disablePictureInPicture
              controls={false}
            />
          </div>
          {statusLabel && (
            <div className={`live-status live-status-${connState}`}>{statusLabel}</div>
          )}
          {withAudio && audioBlocked && connState === 'playing' && (
            <button type="button" className="live-audio-btn" onClick={() => enableAudio()}>
              Activer le son
            </button>
          )}
        </div>
      ) : (
        <div className="live-offline">Hors connexion</div>
      )}
    </article>
  );
});
