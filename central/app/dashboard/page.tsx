'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type StoreRow = {
  id: string;
  code: string;
  name: string;
  online: boolean;
  device?: {
    hostname?: string;
    tunnel_url?: string;
    last_seen_at?: string;
    last_status?: {
      camera_count?: number;
      disk_used_percent?: number;
    };
  } | null;
};

function adminHeaders(): HeadersInit {
  const key = sessionStorage.getItem('raspnvr_admin_key') || '';
  return { Authorization: `Bearer ${key}` };
}

export default function DashboardPage() {
  const router = useRouter();
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');

  const loadStores = useCallback(async () => {
    const key = sessionStorage.getItem('raspnvr_admin_key');
    if (!key) {
      router.replace('/login');
      return;
    }
    const res = await fetch('/api/raspnvr/admin/stores', { headers: adminHeaders() });
    if (res.status === 401) {
      router.replace('/login');
      return;
    }
    if (!res.ok) throw new Error('Chargement impossible');
    const data = await res.json();
    setStores(data.stores || []);
  }, [router]);

  useEffect(() => {
    loadStores().catch((err) => setError(String(err)));
  }, [loadStores]);

  async function onAddStore(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMsg('');
    const res = await fetch('/api/raspnvr/admin/stores', {
      method: 'POST',
      headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: newCode, name: newName }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.detail || 'Erreur lors de la création');
      return;
    }
    setNewCode('');
    setNewName('');
    setMsg(`Magasin « ${data.store.name} » créé.`);
    await loadStores();
  }

  return (
    <>
      <header className="topbar">
        <h1>RaspNVR Central</h1>
        <button
          className="btn secondary"
          type="button"
          onClick={() => {
            sessionStorage.removeItem('raspnvr_admin_key');
            router.push('/login');
          }}
        >
          Déconnexion
        </button>
      </header>
      <main className="container">
        <section className="panel">
          <h2>Ajouter un magasin</h2>
          <form onSubmit={onAddStore} className="store-form">
            <label>
              Code
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="mag02"
                pattern="[a-z0-9][a-z0-9-]*"
                required
              />
            </label>
            <label>
              Nom
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Magasin Centre"
                required
              />
            </label>
            <button className="btn" type="submit">Ajouter</button>
          </form>
          {msg && <p className="success">{msg}</p>}
        </section>

        <h2>Magasins</h2>
        {error && <p className="error">{error}</p>}
        <div className="grid">
          {stores.map((store) => (
            <article key={store.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{store.name}</strong>
                <span className={`badge ${store.online ? 'ok' : 'off'}`}>
                  {store.online ? 'En ligne' : 'Hors ligne'}
                </span>
              </div>
              <p className="meta">Code : {store.code}</p>
              {store.device?.hostname && <p className="meta">Hostname : {store.device.hostname}</p>}
              {store.device?.last_status && (
                <p className="meta">
                  {store.device.last_status.camera_count ?? 0} caméra(s) · disque{' '}
                  {store.device.last_status.disk_used_percent ?? '—'}%
                </p>
              )}
              <p style={{ marginTop: '0.75rem' }}>
                <Link href={`/dashboard/stores/${store.id}`}>Voir le détail →</Link>
              </p>
            </article>
          ))}
        </div>
        {!stores.length && !error && <p className="meta">Aucun magasin configuré.</p>}
      </main>
    </>
  );
}
