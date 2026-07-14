import { NextRequest } from 'next/server';
import { listOfflineDevices } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/http';

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const expected = process.env.CRON_SECRET || '';
  if (!expected || secret !== expected) {
    return jsonError('Non autorisé', 401);
  }

  try {
    const offline = await listOfflineDevices(300);
    return jsonOk({
      checked_at: new Date().toISOString(),
      offline_count: offline.length,
      offline,
    });
  } catch (err) {
    console.error(err);
    return jsonError(err instanceof Error ? err.message : 'Erreur serveur', 500);
  }
}
