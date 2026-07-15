'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/DashboardShell';
import { LivePlayer } from '@/components/LivePlayer';
import { adminHeaders, getAdminKey } from '@/lib/auth-client';
import type { CameraFeed, LiveView } from '@/lib/types';

function resolveViewCameras(view: LiveView, allFeeds: CameraFeed[]): CameraFeed[] {
  if (view.is_all) {
    return allFeeds;
  }
  const byKey = new Map(allFeeds.map((f) => [f.key, f]));
  return [...view.items]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => byKey.get(`${item.store_id}:${item.camera_id}`))
    .filter((f): f is CameraFeed => Boolean(f));
}

export default function DashboardPage() {
  const router = useRouter();
  const [views, setViews] = useState<LiveView[]>([]);
  const [feeds, setFeeds] = useState<CameraFeed[]>([]);
  const [activeViewId, setActiveViewId] = useState<string>('');
  const [error, setError] = useState('');

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

  return (
    <DashboardShell>
      {error && <p className="error">{error}</p>}

      <nav className="view-tabs" aria-label="Vues live">
        {views.map((view) => (
          <button
            key={view.id}
            type="button"
            className={`view-tab ${activeView?.id === view.id ? 'active' : ''}`}
            onClick={() => setActiveViewId(view.id)}
          >
            {view.name}
          </button>
        ))}
      </nav>

      {activeView && (
        <p className="meta view-meta">
          {displayCameras.length} caméra(s)
          {displayCameras.filter((c) => c.online).length < displayCameras.length &&
            ` · ${displayCameras.filter((c) => c.online).length} en ligne`}
        </p>
      )}

      <section className="video-grid">
        {displayCameras.map((cam) => {
          const src = cam.online
            ? `${cam.tunnel_url}/api/hls/cam${cam.camera_id}/index.m3u8`
            : '';
          return (
            <LivePlayer
              key={cam.key}
              src={src}
              label={cam.camera_name}
              sublabel={`${cam.store_name} (${cam.store_code})`}
            />
          );
        })}
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
