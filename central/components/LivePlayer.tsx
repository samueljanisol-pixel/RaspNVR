'use client';

import { useEffect, useRef } from 'react';

type Props = {
  src: string;
  label: string;
  sublabel?: string;
};

export function LivePlayer({ src, label, sublabel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      return;
    }

    const Hls = (window as typeof window & {
      Hls?: {
        isSupported: () => boolean;
        new (cfg: object): { loadSource: (s: string) => void; attachMedia: (v: HTMLVideoElement) => void; destroy: () => void };
      };
    }).Hls;

    if (!Hls?.isSupported()) return;

    const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
    hls.loadSource(src);
    hls.attachMedia(video);
    return () => hls.destroy();
  }, [src]);

  return (
    <article className="live-card">
      <header className="live-card-head">
        <strong>{label}</strong>
        {sublabel && <span className="meta">{sublabel}</span>}
      </header>
      {src ? (
        <video ref={videoRef} muted autoPlay playsInline controls />
      ) : (
        <div className="live-offline">Hors ligne ou tunnel indisponible</div>
      )}
    </article>
  );
}
