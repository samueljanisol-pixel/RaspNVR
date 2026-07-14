'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

type CameraInfo = { id: number; name: string; hls_url?: string };

type Detail = {
  store: { id: string; code: string; name: string };
  device: {
    hostname?: string;
    tunnel_url?: string;
    online?: boolean;
    last_status?: {
      cameras?: CameraInfo[];
      camera_count?: number;
      disk_used_percent?: number;
    };
  } | null;
  recordings: Array<{
    id: string;
    camera_id: number;
    camera_name?: string;
    started_at: string;
    size_bytes: number;
  }>;
};

function adminHeaders(): HeadersInit {
  const key = sessionStorage.getItem('raspnvr_admin_key') || '';
  return { Authorization: `Bearer ${key}` };
}

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function StoreDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());

  const loadDetail = useCallback(async () => {
    const key = sessionStorage.getItem('raspnvr_admin_key');
    if (!key) {
      router.replace('/login');
      return;
    }
    const res = await fetch(`/api/raspnvr/admin/stores/${params.id}`, { headers: adminHeaders() });
    if (res.status === 401) {
      router.replace('/login');
      return;
    }
    if (!res.ok) throw new Error('Magasin introuvable');
    const data = await res.json();
    setDetail(data);
    setEditName(data.store.name);
    setEditCode(data.store.code);
  }, [params.id, router]);

  useEffect(() => {
    loadDetail().catch((err) => setError(String(err)));
  }, [loadDetail]);

  useEffect(() => {
    if (!detail?.device?.tunnel_url) return;
    const tunnel = detail.device.tunnel_url.replace(/\/$/, '');
    const cameras = detail.device.last_status?.cameras || [];
    cameras.forEach((cam) => {
      const video = videoRefs.current.get(cam.id);
      if (!video) return;
      const src = `${tunnel}/api/hls/cam${cam.id}/index.m3u8`;
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
      } else {
        const Hls = (window as typeof window & { Hls?: { isSupported: () => boolean; new (cfg: object): { loadSource: (s: string) => void; attachMedia: (v: HTMLVideoElement) => void } } }).Hls;
        if (Hls?.isSupported()) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
          hls.loadSource(src);
          hls.attachMedia(video);
        }
      }
    });
  }, [detail]);

  async function saveStore(event: React.FormEvent) {
    event.preventDefault();
    setMsg('');
    setError('');
    const res = await fetch(`/api/raspnvr/admin/stores/${params.id}`, {
      method: 'PATCH',
      headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, code: editCode }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.detail || 'Erreur lors de la sauvegarde');
      return;
    }
    setMsg('Magasin mis à jour.');
    await loadDetail();
  }

  async function createToken() {
    setMsg('');
    setError('');
    const res = await fetch(`/api/raspnvr/admin/stores/${params.id}/token`, {
      method: 'POST',
      headers: adminHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.detail || 'Erreur');
      return;
    }
    setToken(data.token);
    setMsg('Token généré (48 h). Copiez-le pour enregistrer le Pi edge.');
  }

  async function sendCommand(type: string) {
    setMsg('');
    setError('');
    const res = await fetch(`/api/raspnvr/admin/stores/${params.id}/commands`, {
      method: 'POST',
      headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, payload: {} }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.detail || 'Erreur');
      return;
    }
    setMsg(`Commande ${type} envoyée.`);
  }

  async function playRecording(id: string) {
    const res = await fetch(`/api/raspnvr/admin/recordings/${id}/url`, { headers: adminHeaders() });
    const data = await res.json();
    if (!res.ok) {
      setError(data.detail || 'Erreur');
      return;
    }
    window.open(data.url, '_blank');
  }

  if (!detail) {
    return <main className="container"><p className="meta">Chargement…</p></main>;
  }

  const cameras = detail.device?.last_status?.cameras || [];
  const tunnel = detail.device?.tunnel_url;

  return (
    <>
      <header className="topbar">
        <h1>{detail.store.name}</h1>
        <Link href="/dashboard">← Magasins</Link>
      </header>
      <main className="container">
        <section className="panel">
          <h3>Informations magasin</h3>
          <form onSubmit={saveStore} className="store-form">
            <label>
              Nom
              <input value={editName} onChange={(e) => setEditName(e.target.value)} required />
            </label>
            <label>
              Code
              <input
                value={editCode}
                onChange={(e) => setEditCode(e.target.value)}
                pattern="[a-z0-9][a-z0-9-]*"
                required
              />
            </label>
            <button className="btn secondary" type="submit">Enregistrer</button>
          </form>
        </section>

        <section className="panel">
          <h3>Statut</h3>
          <p className="meta">
            Code {detail.store.code} ·{' '}
            <span className={`badge ${detail.device?.online ? 'ok' : 'off'}`}>
              {detail.device?.online ? 'En ligne' : 'Hors ligne'}
            </span>
          </p>
          {detail.device?.hostname && <p className="meta">Hostname : {detail.device.hostname}</p>}
          {tunnel && <p className="meta">Tunnel : <a href={tunnel} target="_blank" rel="noreferrer">{tunnel}</a></p>}
          {detail.device?.last_status && (
            <p className="meta">
              {detail.device.last_status.camera_count ?? cameras.length} caméra(s) · disque{' '}
              {detail.device.last_status.disk_used_percent ?? '—'}%
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            <button className="btn secondary" type="button" onClick={createToken}>Token enregistrement</button>
            <button className="btn secondary" type="button" onClick={() => sendCommand('restart_service')}>Redémarrer NVR</button>
            <button className="btn secondary" type="button" onClick={() => sendCommand('upload_recordings')}>Sync enregistrements</button>
          </div>
          {token && (
            <p className="success" style={{ wordBreak: 'break-all' }}>
              Token : <code>{token}</code>
            </p>
          )}
          {msg && <p className="success">{msg}</p>}
          {error && <p className="error">{error}</p>}
        </section>

        {tunnel && cameras.length > 0 && (
          <section className="panel">
            <h3>Live</h3>
            <div className="video-grid">
              {cameras.map((cam) => (
                <div key={cam.id}>
                  <strong>{cam.name}</strong>
                  <video
                    ref={(el) => {
                      if (el) videoRefs.current.set(cam.id, el);
                    }}
                    muted
                    autoPlay
                    playsInline
                    controls
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="panel">
          <h3>Enregistrements distants</h3>
          {!detail.recordings.length && <p className="meta">Aucun segment uploadé.</p>}
          <ul>
            {detail.recordings.map((rec) => (
              <li key={rec.id} style={{ marginBottom: '0.5rem' }}>
                Cam {rec.camera_id} {rec.camera_name ? `(${rec.camera_name})` : ''} ·{' '}
                {new Date(rec.started_at).toLocaleString('fr-FR')} · {formatBytes(rec.size_bytes)}{' '}
                <button className="btn secondary" type="button" onClick={() => playRecording(rec.id)}>
                  Lire
                </button>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
