import { NextRequest } from 'next/server';
import { createView, listViews, reorderViews } from '@/lib/db';
import { jsonError, jsonOk, requireAdmin } from '@/lib/http';

export async function GET(request: NextRequest) {
  if (!requireAdmin(request)) return jsonError('Non autorisé', 401);
  try {
    const views = await listViews();
    return jsonOk({ views });
  } catch (err) {
    console.error(err);
    return jsonError(err instanceof Error ? err.message : 'Erreur serveur', 500);
  }
}

export async function POST(request: NextRequest) {
  if (!requireAdmin(request)) return jsonError('Non autorisé', 401);
  try {
    const body = await request.json();
    const name = String(body.name || '').trim();
    if (!name) return jsonError('name requis', 400);
    const view = await createView(name);
    return jsonOk({ view }, 201);
  } catch (err) {
    console.error(err);
    return jsonError(err instanceof Error ? err.message : 'Erreur serveur', 500);
  }
}

export async function PATCH(request: NextRequest) {
  if (!requireAdmin(request)) return jsonError('Non autorisé', 401);
  try {
    const body = await request.json();
    const viewIds = body.view_ids as string[];
    if (!Array.isArray(viewIds) || !viewIds.length) {
      return jsonError('view_ids requis', 400);
    }
    await reorderViews(viewIds);
    const views = await listViews();
    return jsonOk({ views });
  } catch (err) {
    console.error(err);
    return jsonError(err instanceof Error ? err.message : 'Erreur serveur', 500);
  }
}
