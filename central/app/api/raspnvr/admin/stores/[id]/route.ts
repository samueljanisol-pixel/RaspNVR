import { NextRequest } from 'next/server';
import { deleteStore, getStoreDetail, updateStore } from '@/lib/db';
import { jsonError, jsonOk, requireAdmin } from '@/lib/http';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  if (!requireAdmin(request)) return jsonError('Non autorisé', 401);
  try {
    const { id } = await params;
    const detail = await getStoreDetail(id);
    if (!detail) return jsonError('Magasin introuvable', 404);
    return jsonOk(detail);
  } catch (err) {
    console.error(err);
    return jsonError(err instanceof Error ? err.message : 'Erreur serveur', 500);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  if (!requireAdmin(request)) return jsonError('Non autorisé', 401);
  try {
    const { id } = await params;
    const body = await request.json();
    const store = await updateStore(id, {
      name: body.name,
      code: body.code,
      sort_order: body.sort_order,
    });
    if (!store) return jsonError('Magasin introuvable', 404);
    return jsonOk({ store });
  } catch (err) {
    console.error(err);
    return jsonError(err instanceof Error ? err.message : 'Erreur serveur', 500);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  if (!requireAdmin(request)) return jsonError('Non autorisé', 401);
  try {
    const { id } = await params;
    const ok = await deleteStore(id);
    if (!ok) return jsonError('Magasin introuvable', 404);
    return jsonOk({ status: 'ok' });
  } catch (err) {
    console.error(err);
    return jsonError(err instanceof Error ? err.message : 'Erreur serveur', 500);
  }
}
