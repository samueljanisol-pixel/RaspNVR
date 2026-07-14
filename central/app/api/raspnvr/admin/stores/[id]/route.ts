import { NextRequest } from 'next/server';
import { getStoreDetail } from '@/lib/db';
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
