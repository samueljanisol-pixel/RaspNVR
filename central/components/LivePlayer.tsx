'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { isZoomed, useVideoZoom } from '@/lib/useVideoZoom';

export type LivePlayerHandle = {
  resetZoom: () => void;
  isZoomed: () => boolean;
};

type Props = {
  src: string;
  label: string;
  sublabel?: string;
  hidden?: boolean;
  soloHighlight?: boolean;
  onDoubleClick?: () => void;
};

export const LivePlayer = forwardRef<LivePlayerHandle, Props>(function LivePlayer(
  { src, label, sublabel, hidden, soloHighlight, onDoubleClick },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const resetRef = useRef<(() => void) | null>(null);

  useVideoZoom(wrapRef, resetRef);

  useImperativeHandle(ref, () => ({
    resetZoom: () => resetRef.current?.(),
    isZoomed: () => isZoomed(wrapRef.current),
  }));

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    const keepPlaying = () => {
      if (video.paused && !video.ended) video.play().catch(() => {});
    };
    video.addEventListener('pause', keepPlaying);

    const HlsCtor = (window as typeof window & {
      Hls?: {
        isSupported: () => boolean;
        Events: { MANIFEST_PARSED: string; ERROR: string };
        ErrorTypes: { NETWORK_ERROR: string; MEDIA_ERROR: string };
        new (cfg: object): {
          loadSource: (s: string) => void;
          attachMedia: (v: HTMLVideoElement) => void;
          destroy: () => void;
          on: (event: string, cb: (...args: unknown[]) => void) => void;
          startLoad: () => void;
          recoverMediaError: () => void;
        };
      };
    }).Hls;

    let hls: {
      loadSource: (s: string) => void;
      attachMedia: (v: HTMLVideoElement) => void;
      destroy: () => void;
      on: (event: string, cb: (...args: unknown[]) => void) => void;
      startLoad: () => void;
      recoverMediaError: () => void;
    } | null = null;

    if (HlsCtor?.isSupported()) {
      hls = new HlsCtor({
        lowLatencyMode: false,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 10,
        maxLiveSyncPlaybackRate: 1.2,
        backBufferLength: 30,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      hls.on(HlsCtor.Events.ERROR, (...args: unknown[]) => {
        const data = args[1] as { fatal?: boolean; type?: string };
        if (!data.fatal || !HlsCtor) return;
        switch (data.type) {
          case HlsCtor.ErrorTypes.NETWORK_ERROR:
            hls?.startLoad();
            break;
          case HlsCtor.ErrorTypes.MEDIA_ERROR:
            hls?.recoverMediaError();
            break;
          default:
            break;
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.play().catch(() => {});
    }

    return () => {
      video.removeEventListener('pause', keepPlaying);
      hls?.destroy();
    };
  }, [src]);

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
              muted
              autoPlay
              playsInline
              disablePictureInPicture
              controls={false}
            />
          </div>
        </div>
      ) : (
        <div className="live-offline">Hors ligne ou tunnel indisponible</div>
      )}
    </article>
  );
});
