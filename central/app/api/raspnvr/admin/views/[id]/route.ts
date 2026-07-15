import { NextRequest } from 'next/server';
import { deleteView, listViews, setViewItems, updateViewName } from '@/lib/db';
import { jsonError, jsonOk, requireAdmin } from '@/lib/http';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  if (!requireAdmin(request)) return jsonError('Non autorisé', 401);
  try {
    const { id } = await params;
    const body = await request.json();
    if (body.name !== undefined) {
      const view = await updateViewName(id, String(body.name));
      if (!view) return jsonError('Vue introuvable', 404);
      return jsonOk({ view });
    }
    if (body.items !== undefined) {
      const items = (body.items as Array<{ store_id: string; camera_id: number }>) || [];
      await setViewItems(id, items);
      const views = await listViews();
      const view = views.find((v) => v.id === id);
      return jsonOk({ view });
    }
    return jsonError('Aucune modification', 400);
  } catch (err) {
    console.error(err);
    return jsonError(err instanceof Error ? err.message : 'Erreur serveur', 500);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  if (!requireAdmin(request)) return jsonError('Non autorisé', 401);
  try {
    const { id } = await params;
    const ok = await deleteView(id);
    if (!ok) return jsonError('Vue introuvable', 404);
    return jsonOk({ status: 'ok' });
  } catch (err) {
    console.error(err);
    return jsonError(err instanceof Error ? err.message : 'Erreur serveur', 500);
  }
}
