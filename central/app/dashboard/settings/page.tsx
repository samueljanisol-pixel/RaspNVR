'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/DashboardShell';
import { Modal } from '@/components/Modal';
import { adminHeaders, getAdminKey } from '@/lib/auth-client';
import { useRequireAuth } from '@/lib/useRequireAuth';
import type { CameraFeed, LiveView, StoreRow } from '@/lib/types';

type Tab = 'views' | 'stores';
type ModalKind = 'view' | 'store' | null;

function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const next = [...list];
  const target = index + delta;
  if (target < 0 || target >= next.length) return list;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export default function SettingsPage() {
  const router = useRouter();
  const authed = useRequireAuth();
  const [tab, setTab] = useState<Tab>('views');
  const [views, setViews] = useState<LiveView[]>([]);
  const [feeds, setFeeds] = useState<CameraFeed[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [selectedViewId, setSelectedViewId] = useState('');
  const [newViewName, setNewViewName] = useState('');
  const [newStoreCode, setNewStoreCode] = useState('');
  const [newStoreName, setNewStoreName] = useState('');
  const [openModal, setOpenModal] = useState<ModalKind>(null);
  const [storeToDelete, setStoreToDelete] = useState<StoreRow | null>(null);
  const [modalError, setModalError] = useState('');
  const [modalBusy, setModalBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  function openViewModal() {
    setModalError('');
    setNewViewName('');
    setOpenModal('view');
  }

  function openStoreModal() {
    setModalError('');
    setNewStoreCode('');
    setNewStoreName('');
    setOpenModal('store');
  }

  function closeModal() {
    if (modalBusy) return;
    setOpenModal(null);
    setStoreToDelete(null);
    setModalError('');
  }

  function askDeleteStore(store: StoreRow) {
    setModalError('');
    setStoreToDelete(store);
  }

  async function confirmDeleteStore() {
    if (!storeToDelete) return;
    setModalError('');
    setError('');
    setModalBusy(true);
    try {
      const res = await fetch(`/api/raspnvr/admin/stores/${storeToDelete.id}`, {
        method: 'DELETE',
        headers: adminHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        setModalError(data.detail || 'Erreur');
        return;
      }
      setMsg(`Magasin « ${storeToDelete.name} » supprimé.`);
      setStoreToDelete(null);
      await loadAll();
    } finally {
      setModalBusy(false);
    }
  }

  const loadAll = useCallback(async () => {
    if (!getAdminKey()) return;
    const [viewsRes, camsRes, storesRes] = await Promise.all([
      fetch('/api/raspnvr/admin/views', { headers: adminHeaders() }),
      fetch('/api/raspnvr/admin/cameras', { headers: adminHeaders() }),
      fetch('/api/raspnvr/admin/stores', { headers: adminHeaders() }),
    ]);
    if ([viewsRes, camsRes, storesRes].some((r) => r.status === 401)) {
      router.replace('/login');
      return;
    }
    const [viewsData, camsData, storesData] = await Promise.all([
      viewsRes.json(),
      camsRes.json(),
      storesRes.json(),
    ]);
    const nextViews = viewsData.views || [];
    setViews(nextViews);
    setFeeds(camsData.cameras || []);
    setStores(storesData.stores || []);
    setSelectedViewId((cur) => cur || nextViews.find((v: LiveView) => !v.is_all)?.id || '');
  }, [router]);

  useEffect(() => {
    if (!authed) return;
    loadAll().catch((err) => setError(String(err)));
  }, [authed, loadAll]);

  const selectedView = views.find((v) => v.id === selectedViewId);

  function selectedKeys(): Set<string> {
    if (!selectedView) return new Set();
    return new Set(selectedView.items.map((i) => `${i.store_id}:${i.camera_id}`));
  }

  async function saveViewItems(view: LiveView, keys: string[]) {
    const items = keys.map((key) => {
      const [store_id, camera_id] = key.split(':');
      return { store_id, camera_id: Number(camera_id) };
    });
    const res = await fetch(`/api/raspnvr/admin/views/${view.id}`, {
      method: 'PATCH',
      headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.detail || 'Erreur');
    }
    await loadAll();
  }

  async function onAddView(event: FormEvent) {
    event.preventDefault();
    setModalError('');
    setError('');
    setModalBusy(true);
    try {
      const res = await fetch('/api/raspnvr/admin/views', {
        method: 'POST',
        headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newViewName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModalError(data.detail || 'Erreur');
        return;
      }
      setNewViewName('');
      setSelectedViewId(data.view.id);
      setMsg(`Vue « ${data.view.name} » créée.`);
      setOpenModal(null);
      await loadAll();
    } finally {
      setModalBusy(false);
    }
  }

  async function reorderViewsLocal(index: number, delta: number) {
    const next = moveItem(views, index, delta);
    setViews(next);
    await fetch('/api/raspnvr/admin/views', {
      method: 'PATCH',
      headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ view_ids: next.map((v) => v.id) }),
    });
  }

  async function moveCameraInView(index: number, delta: number) {
    if (!selectedView || selectedView.is_all) return;
    const keys = selectedView.items
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => `${i.store_id}:${i.camera_id}`);
    const next = moveItem(keys, index, delta);
    await saveViewItems(selectedView, next);
    setMsg('Ordre des caméras mis à jour.');
  }

  async function toggleCamera(key: string) {
    if (!selectedView || selectedView.is_all) return;
    const keys = selectedView.items
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => `${i.store_id}:${i.camera_id}`);
    const next = keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
    await saveViewItems(selectedView, next);
  }

  async function deleteView(viewId: string) {
    if (!confirm('Supprimer cette vue ?')) return;
    const res = await fetch(`/api/raspnvr/admin/views/${viewId}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.detail || 'Erreur');
      return;
    }
    setSelectedViewId('');
    await loadAll();
  }

  async function onAddStore(event: FormEvent) {
    event.preventDefault();
    setModalError('');
    setError('');
    setModalBusy(true);
    try {
      const res = await fetch('/api/raspnvr/admin/stores', {
        method: 'POST',
        headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: newStoreCode, name: newStoreName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModalError(data.detail || 'Erreur');
        return;
      }
      setNewStoreCode('');
      setNewStoreName('');
      setMsg(`Magasin « ${data.store.name} » créé.`);
      setOpenModal(null);
      await loadAll();
    } finally {
      setModalBusy(false);
    }
  }

  const keysInView = selectedKeys();
  const orderedKeys = selectedView
    ? [...selectedView.items].sort((a, b) => a.sort_order - b.sort_order).map((i) => `${i.store_id}:${i.camera_id}`)
    : [];

  if (!authed) return null;

  return (
    <DashboardShell title="Paramètres">
      <p className="meta">
        <Link href="/dashboard">← Retour au live</Link>
      </p>

      <div className="settings-tabs">
        <button type="button" className={`view-tab ${tab === 'views' ? 'active' : ''}`} onClick={() => setTab('views')}>
          Vues
        </button>
        <button type="button" className={`view-tab ${tab === 'stores' ? 'active' : ''}`} onClick={() => setTab('stores')}>
          Magasins
        </button>
      </div>

      {msg && <p className="success">{msg}</p>}
      {error && <p className="error">{error}</p>}

      {tab === 'views' && (
        <>
          <section className="panel">
            <div className="panel-head">
              <h2>Vues</h2>
              <button type="button" className="btn" onClick={openViewModal}>
                Nouvelle vue
              </button>
            </div>
          </section>

          <section className="panel">
            <h2>Ordre des vues</h2>
            <ul className="sort-list">
              {views.map((view, index) => (
                <li key={view.id} className="sort-item">
                  <span>{view.name}{view.is_all ? ' (automatique)' : ''}</span>
                  <span className="sort-actions">
                    <button type="button" className="btn secondary btn-sm" disabled={index === 0} onClick={() => reorderViewsLocal(index, -1)}>↑</button>
                    <button type="button" className="btn secondary btn-sm" disabled={index === views.length - 1} onClick={() => reorderViewsLocal(index, 1)}>↓</button>
                    {!view.is_all && (
                      <>
                        <button type="button" className="btn secondary btn-sm" onClick={() => setSelectedViewId(view.id)}>Éditer</button>
                        <button type="button" className="btn secondary btn-sm" onClick={() => deleteView(view.id)}>Suppr.</button>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {selectedView && !selectedView.is_all && (
            <section className="panel">
              <h2>Caméras — {selectedView.name}</h2>
              <h3 className="sub-heading">Caméras disponibles</h3>
              <ul className="check-list">
                {feeds.map((cam) => (
                  <li key={cam.key}>
                    <label>
                      <input
                        type="checkbox"
                        checked={keysInView.has(cam.key)}
                        onChange={() => toggleCamera(cam.key)}
                      />
                      {cam.camera_name} — {cam.store_name}
                    </label>
                  </li>
                ))}
              </ul>
              {!feeds.length && <p className="meta">Aucune caméra remontée (magasins hors ligne ?).</p>}

              <h3 className="sub-heading">Ordre dans la vue</h3>
              <ul className="sort-list">
                {orderedKeys.map((key, index) => {
                  const cam = feeds.find((f) => f.key === key);
                  if (!cam) return null;
                  return (
                    <li key={key} className="sort-item">
                      <span>{cam.camera_name} — {cam.store_name}</span>
                      <span className="sort-actions">
                        <button type="button" className="btn secondary btn-sm" disabled={index === 0} onClick={() => moveCameraInView(index, -1)}>↑</button>
                        <button type="button" className="btn secondary btn-sm" disabled={index === orderedKeys.length - 1} onClick={() => moveCameraInView(index, 1)}>↓</button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {selectedView?.is_all && (
            <p className="meta">La vue « Toutes » affiche automatiquement toutes les caméras de tous les magasins.</p>
          )}
        </>
      )}

      {tab === 'stores' && (
        <>
          <section className="panel">
            <div className="panel-head">
              <h2>Magasins</h2>
              <button type="button" className="btn" onClick={openStoreModal}>
                Ajouter un magasin
              </button>
            </div>
            <div className="grid">
              {stores.map((store) => (
                <article key={store.id} className="card">
                  <div className="card-head">
                    <strong>{store.name}</strong>
                    <span className={`badge ${store.online ? 'ok' : 'off'}`}>{store.online ? 'En ligne' : 'Hors ligne'}</span>
                  </div>
                  <p className="meta">Code : {store.code}</p>
                  <div className="card-actions">
                    <Link href={`/dashboard/stores/${store.id}`}>Gérer →</Link>
                    <button type="button" className="btn danger btn-sm" onClick={() => askDeleteStore(store)}>
                      Supprimer
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      <Modal open={openModal === 'view'} title="Nouvelle vue" onClose={closeModal}>
        <form onSubmit={onAddView} className="modal-form">
          <label>
            Nom de la vue
            <input
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              placeholder="Entrée magasin"
              required
              autoFocus
            />
          </label>
          {modalError && openModal === 'view' && <p className="error">{modalError}</p>}
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={closeModal} disabled={modalBusy}>
              Annuler
            </button>
            <button type="submit" className="btn" disabled={modalBusy}>
              {modalBusy ? 'Création…' : 'Créer'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={openModal === 'store'} title="Ajouter un magasin" onClose={closeModal}>
        <form onSubmit={onAddStore} className="modal-form">
          <label>
            Code
            <input
              value={newStoreCode}
              onChange={(e) => setNewStoreCode(e.target.value)}
              pattern="[a-z0-9][a-z0-9-]*"
              placeholder="mag01"
              required
              autoFocus
            />
          </label>
          <label>
            Nom
            <input
              value={newStoreName}
              onChange={(e) => setNewStoreName(e.target.value)}
              placeholder="Magasin centre-ville"
              required
            />
          </label>
          {modalError && openModal === 'store' && <p className="error">{modalError}</p>}
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={closeModal} disabled={modalBusy}>
              Annuler
            </button>
            <button type="submit" className="btn" disabled={modalBusy}>
              {modalBusy ? 'Ajout…' : 'Ajouter'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(storeToDelete)}
        title="Supprimer le magasin"
        onClose={closeModal}
      >
        <div className="modal-form">
          <p>
            Supprimer le magasin <strong>{storeToDelete?.name}</strong> ({storeToDelete?.code}) ?
          </p>
          <p className="meta">
            Cette action est irréversible. L&apos;appareil, les tokens et les enregistrements associés seront supprimés.
          </p>
          {modalError && storeToDelete && <p className="error">{modalError}</p>}
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={closeModal} disabled={modalBusy}>
              Annuler
            </button>
            <button type="button" className="btn danger" onClick={confirmDeleteStore} disabled={modalBusy}>
              {modalBusy ? 'Suppression…' : 'Supprimer'}
            </button>
          </div>
        </div>
      </Modal>
    </DashboardShell>
  );
}
