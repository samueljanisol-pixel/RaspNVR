import { NextRequest } from 'next/server';
import { createStore, listStoresWithDevices } from '@/lib/db';
import { jsonError, jsonOk, requireAdmin } from '@/lib/http';

export async function GET(request: NextRequest) {
  if (!requireAdmin(request)) return jsonError('Non autorisé', 401);
  try {
    const stores = await listStoresWithDevices();
    return jsonOk({ stores });
  } catch (err) {
    console.error(err);
    return jsonError(err instanceof Error ? err.message : 'Erreur serveur', 500);
  }
}

export async function POST(request: NextRequest) {
  if (!requireAdmin(request)) return jsonError('Non autorisé', 401);
  try {
    const body = await request.json();
    const code = String(body.code || '').trim();
    const name = String(body.name || '').trim();
    if (!code || !name) {
      return jsonError('code et name requis', 400);
    }
    const store = await createStore(code, name, body.sort_order);
    return jsonOk({ store }, 201);
  } catch (err) {
    console.error(err);
    return jsonError(err instanceof Error ? err.message : 'Erreur serveur', 500);
  }
}
