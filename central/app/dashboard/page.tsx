'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/DashboardShell';
import { LivePlayer, LivePlayerHandle } from '@/components/LivePlayer';
import { adminHeaders, getAdminKey } from '@/lib/auth-client';
import type { CameraFeed, LiveView } from '@/lib/types';

type LayoutMode = 1 | 4 | 9;

const LAYOUT_KEY = 'raspnvr_central_layout';
const FOCUS_KEY = 'raspnvr_central_focus';

function readLayout(): LayoutMode {
  const n = Number(typeof window !== 'undefined' ? localStorage.getItem(LAYOUT_KEY) : 4);
  return n === 1 || n === 9 ? n : 4;
}

function resolveViewCameras(view: LiveView, allFeeds: CameraFeed[]): CameraFeed[] {
  if (view.is_all) return allFeeds;
  const byKey = new Map(allFeeds.map((f) => [f.key, f]));
  return [...view.items]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => byKey.get(`${item.store_id}:${item.camera_id}`))
    .filter((f): f is CameraFeed => Boolean(f));
}

export default function DashboardPage() {
  const router = useRouter();
  const playerRefs = useRef<Map<string, LivePlayerHandle>>(new Map());
  const [views, setViews] = useState<LiveView[]>([]);
  const [feeds, setFeeds] = useState<CameraFeed[]>([]);
  const [activeViewId, setActiveViewId] = useState<string>('');
  const [layout, setLayout] = useState<LayoutMode>(4);
  const [focusedKey, setFocusedKey] = useState('');
  const [previousLayout, setPreviousLayout] = useState<LayoutMode | null>(null);
  const [soloFromDblClick, setSoloFromDblClick] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLayout(readLayout());
    setFocusedKey(localStorage.getItem(FOCUS_KEY) || '');
  }, []);

  const loadData = useCallback(async () => {
    if (!getAdminKey()) {
      router.replace('/login');
      return;
    }
    const [viewsRes, camsRes] = await Promise.all([
      fetch('/api/raspnvr/admin/views', { headers: adminHeaders() }),
      fetch('/api/raspnvr/admin/cameras', { headers: adminHeaders() }),
    ]);
    if (viewsRes.status === 401 || camsRes.status === 401) {
      router.replace('/login');
      return;
    }
    if (!viewsRes.ok || !camsRes.ok) throw new Error('Chargement impossible');
    const viewsData = await viewsRes.json();
    const camsData = await camsRes.json();
    const nextViews = viewsData.views || [];
    setViews(nextViews);
    setFeeds(camsData.cameras || []);
    setActiveViewId((current) => current || nextViews[0]?.id || '');
  }, [router]);

  useEffect(() => {
    loadData().catch((err) => setError(String(err)));
    const timer = setInterval(() => {
      loadData().catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [loadData]);

  const activeView = views.find((v) => v.id === activeViewId) || views[0];
  const displayCameras = useMemo(
    () => (activeView ? resolveViewCameras(activeView, feeds) : []),
    [activeView, feeds],
  );

  const effectiveFocusKey = useMemo(() => {
    if (!displayCameras.length) return '';
    if (displayCameras.some((c) => c.key === focusedKey)) return focusedKey;
    return displayCameras[0].key;
  }, [displayCameras, focusedKey]);

  const slots = layout === 1 ? 1 : layout === 4 ? 4 : 9;

  const visibleKeys = useMemo(() => {
    if (layout === 1) return effectiveFocusKey ? [effectiveFocusKey] : [];
    return displayCameras.slice(0, slots).map((c) => c.key);
  }, [layout, displayCameras, effectiveFocusKey, slots]);

  const emptySlots = layout === 1 ? 0 : Math.max(0, slots - visibleKeys.length);

  function resetAllZooms() {
    playerRefs.current.forEach((handle) => handle.resetZoom());
  }

  function persistLayout(next: LayoutMode) {
    localStorage.setItem(LAYOUT_KEY, String(next));
    setLayout(next);
  }

  function persistFocus(key: string) {
    localStorage.setItem(FOCUS_KEY, key);
    setFocusedKey(key);
  }

  function setLayoutMode(next: LayoutMode) {
    persistLayout(next);
    setSoloFromDblClick(false);
    setPreviousLayout(null);
    resetAllZooms();
  }

  function handleCameraDoubleClick(cameraKey: string) {
    if (soloFromDblClick && layout === 1 && effectiveFocusKey === cameraKey) {
      persistLayout(previousLayout || 4);
      setPreviousLayout(null);
      setSoloFromDblClick(false);
      resetAllZooms();
      return;
    }

    if (layout === 4 || layout === 9) {
      setPreviousLayout(layout);
      setSoloFromDblClick(true);
      persistFocus(cameraKey);
      persistLayout(1);
      resetAllZooms();
    }
  }

  function handleViewChange(viewId: string) {
    setActiveViewId(viewId);
    setSoloFromDblClick(false);
    setPreviousLayout(null);
    resetAllZooms();
  }

  const showCameraTabs =
    layout === 1 && displayCameras.length > 1 && !soloFromDblClick;

  return (
    <DashboardShell mainClassName="container-live">
      {error && <p className="error">{error}</p>}

      <nav className="view-tabs" aria-label="Vues live">
        {views.map((view) => (
          <button
            key={view.id}
            type="button"
            className={`view-tab ${activeView?.id === view.id ? 'active' : ''}`}
            onClick={() => handleViewChange(view.id)}
          >
            {view.name}
          </button>
        ))}
      </nav>

      <div className="live-toolbar">
        <p className="meta view-meta">
          {displayCameras.length} caméra(s)
          {displayCameras.filter((c) => c.online).length < displayCameras.length &&
            ` · ${displayCameras.filter((c) => c.online).length} en ligne`}
        </p>
        <div className="layout-picker" role="group" aria-label="Disposition des caméras">
          {([1, 4, 9] as const).map((n) => (
            <button
              key={n}
              type="button"
              className={`layout-btn ${layout === n ? 'active' : ''}`}
              title={`${n} caméra${n > 1 ? 's' : ''}`}
              onClick={() => setLayoutMode(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {showCameraTabs && (
        <nav className="camera-tabs" aria-label="Caméras">
          {displayCameras.map((cam) => (
            <button
              key={cam.key}
              type="button"
              className={`tab-btn ${cam.key === effectiveFocusKey ? 'active' : ''}`}
              onClick={() => persistFocus(cam.key)}
            >
              {cam.camera_name}
            </button>
          ))}
        </nav>
      )}

      {displayCameras.length > 0 && (
        <p className="view-hint">
          Ctrl + molette ou pincement pour zoomer · glisser si zoomé · double-clic = plein écran
        </p>
      )}

      <section className={`live-grid layout-${layout}`}>
        {displayCameras.map((cam) => {
          const src = cam.online
            ? `${cam.tunnel_url}/api/hls/cam${cam.camera_id}/index.m3u8`
            : '';
          const visible = visibleKeys.includes(cam.key);
          return (
            <LivePlayer
              key={cam.key}
              ref={(handle) => {
                if (handle) playerRefs.current.set(cam.key, handle);
                else playerRefs.current.delete(cam.key);
              }}
              src={src}
              label={cam.camera_name}
              sublabel={`${cam.store_name} (${cam.store_code})`}
              hidden={!visible}
              soloHighlight={soloFromDblClick && visible}
              onDoubleClick={() => handleCameraDoubleClick(cam.key)}
            />
          );
        })}
        {Array.from({ length: emptySlots }, (_, i) => (
          <div key={`empty-${i}`} className="slot-empty">
            Aucune caméra
          </div>
        ))}
      </section>

      {!displayCameras.length && !error && (
        <p className="meta empty-hint">
          Aucune caméra dans cette vue. Ajoutez-en dans{' '}
          <Link href="/dashboard/settings">Paramètres → Vues</Link>.
        </p>
      )}
    </DashboardShell>
  );
}
