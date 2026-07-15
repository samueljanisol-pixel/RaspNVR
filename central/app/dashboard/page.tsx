'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/DashboardShell';
import { LivePlayer, LivePlayerHandle } from '@/components/LivePlayer';
import { adminHeaders, getAdminKey } from '@/lib/auth-client';
import { useRequireAuth } from '@/lib/useRequireAuth';
import { useLiveFullscreen } from '@/lib/useLiveFullscreen';
import { useSwipePages } from '@/lib/useSwipePages';
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
  const authed = useRequireAuth();
  const playerRefs = useRef<Map<string, LivePlayerHandle>>(new Map());
  const stageRef = useRef<HTMLDivElement>(null);
  const [views, setViews] = useState<LiveView[]>([]);
  const [feeds, setFeeds] = useState<CameraFeed[]>([]);
  const [activeViewId, setActiveViewId] = useState<string>('');
  const [layout, setLayout] = useState<LayoutMode>(4);
  const [focusedKey, setFocusedKey] = useState('');
  const [previousLayout, setPreviousLayout] = useState<LayoutMode | null>(null);
  const [soloFromDblClick, setSoloFromDblClick] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [error, setError] = useState('');

  function resetAllZooms() {
    playerRefs.current.forEach((handle) => handle.resetZoom());
  }

  const { isFullscreen, enterFullscreen, exitFullscreen } = useLiveFullscreen(stageRef, {
    onEnter: () => resetAllZooms(),
    onExit: () => resetAllZooms(),
  });

  useEffect(() => {
    setLayout(readLayout());
    setFocusedKey(localStorage.getItem(FOCUS_KEY) || '');
  }, []);

  const loadData = useCallback(async () => {
    if (!getAdminKey()) return;
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
    if (!authed) return;
    loadData().catch((err) => setError(String(err)));
    const timer = setInterval(() => {
      loadData().catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [authed, loadData]);

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

  const pageCount = useMemo(() => {
    if (layout === 1 && soloFromDblClick) return 1;
    return Math.max(1, Math.ceil(displayCameras.length / slots));
  }, [layout, soloFromDblClick, displayCameras.length, slots]);

  const safePageIndex = Math.min(pageIndex, pageCount - 1);

  const pageCameras = useMemo(() => {
    if (layout === 1 && soloFromDblClick) {
      const cam = displayCameras.find((c) => c.key === effectiveFocusKey);
      return cam ? [cam] : [];
    }
    const start = safePageIndex * slots;
    return displayCameras.slice(start, start + slots);
  }, [layout, soloFromDblClick, displayCameras, effectiveFocusKey, safePageIndex, slots]);

  const visibleKeys = useMemo(() => pageCameras.map((c) => c.key), [pageCameras]);
  const emptySlots = layout === 1 ? 0 : Math.max(0, slots - pageCameras.length);
  const showPagination = pageCount > 1;

  const pageCountRef = useRef(pageCount);
  pageCountRef.current = pageCount;

  useEffect(() => {
    setPageIndex((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  const goToPage = useCallback((index: number) => {
    setPageIndex(Math.max(0, Math.min(index, pageCountRef.current - 1)));
    resetAllZooms();
  }, []);

  const goPrevPage = useCallback(() => {
    setPageIndex((current) => Math.max(0, current - 1));
    resetAllZooms();
  }, []);

  const goNextPage = useCallback(() => {
    setPageIndex((current) => Math.min(pageCountRef.current - 1, current + 1));
    resetAllZooms();
  }, []);

  useSwipePages(stageRef, {
    enabled: showPagination,
    onPrev: goPrevPage,
    onNext: goNextPage,
  });

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
    setPageIndex(0);
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
    setPageIndex(0);
    resetAllZooms();
  }

  if (!authed) return null;

  return (
    <DashboardShell mainClassName="container-live">
      {!isFullscreen && error && <p className="error">{error}</p>}

      {!isFullscreen && (
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
      )}

      {!isFullscreen && (
        <div className="live-toolbar">
          <p className="meta view-meta">
            {displayCameras.length} caméra(s)
            {displayCameras.filter((c) => c.online).length < displayCameras.length &&
              ` · ${displayCameras.filter((c) => c.online).length} en ligne`}
          </p>
          <div className="live-toolbar-actions">
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
            {displayCameras.length > 0 && (
              <button
                type="button"
                className="btn secondary fullscreen-btn"
                title="Plein écran (Retour pour quitter)"
                onClick={() => enterFullscreen().catch(() => {})}
              >
                Plein écran
              </button>
            )}
          </div>
        </div>
      )}

      {!isFullscreen && displayCameras.length > 0 && (
        <p className="view-hint">
          Ctrl + molette ou pincement pour zoomer · glisser si zoomé · double-clic = focus caméra
          {layout === 1 ? ' · son activé' : ''}
          {showPagination ? ' · swipe gauche/droite = changer de page' : ''}
        </p>
      )}

      <div ref={stageRef} className={`live-stage${isFullscreen ? ' is-fullscreen' : ''}`}>
        {isFullscreen && (
          <button type="button" className="fullscreen-back-btn" onClick={() => exitFullscreen().catch(() => {})}>
            ← Retour
          </button>
        )}
        <section className={`live-grid layout-${layout}`}>
        {displayCameras.map((cam) => {
          const src = cam.tunnel_url
            ? `${cam.tunnel_url.replace(/\/$/, '')}/api/hls/cam${cam.camera_id}/index.m3u8`
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
              withAudio={layout === 1 && visible}
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

        {showPagination && (
          <nav
            className={`page-tabs${isFullscreen ? ' page-tabs-overlay' : ''}`}
            aria-label="Pages caméras"
          >
            {Array.from({ length: pageCount }, (_, index) => (
              <button
                key={index}
                type="button"
                className={`page-tab ${safePageIndex === index ? 'active' : ''}`}
                onClick={() => goToPage(index)}
              >
                Page {index + 1}
              </button>
            ))}
          </nav>
        )}
      </div>

      {!isFullscreen && !displayCameras.length && !error && (
        <p className="meta empty-hint">
          Aucune caméra dans cette vue. Ajoutez-en dans{' '}
          <Link href="/dashboard/settings">Paramètres → Vues</Link>.
        </p>
      )}
    </DashboardShell>
  );
}
