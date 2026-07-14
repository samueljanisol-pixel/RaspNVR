import { NextRequest } from 'next/server';
import { getDeviceByApiKey, updateDeviceHeartbeat } from '@/lib/db';
import { getBearerToken, jsonError, jsonOk } from '@/lib/http';

export async function POST(request: NextRequest) {
  try {
    const apiKey = getBearerToken(request);
    if (!apiKey) return jsonError('Token Bearer requis', 401);

    const device = await getDeviceByApiKey(apiKey);
    if (!device) return jsonError('Device inconnu', 401);

    const payload = await request.json();
    await updateDeviceHeartbeat(device.id, payload);
    return jsonOk({ status: 'ok' });
  } catch (err) {
    console.error(err);
    return jsonError(err instanceof Error ? err.message : 'Erreur serveur', 500);
  }
}
