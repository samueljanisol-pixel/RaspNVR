import { NextRequest } from 'next/server';
import { listAllCameraFeeds } from '@/lib/db';
import { jsonError, jsonOk, requireAdmin } from '@/lib/http';

export async function GET(request: NextRequest) {
  if (!requireAdmin(request)) return jsonError('Non autorisé', 401);
  try {
    const cameras = await listAllCameraFeeds();
    return jsonOk({ cameras });
  } catch (err) {
    console.error(err);
    return jsonError(err instanceof Error ? err.message : 'Erreur serveur', 500);
  }
}
