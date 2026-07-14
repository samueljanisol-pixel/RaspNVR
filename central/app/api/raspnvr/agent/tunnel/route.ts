import { NextRequest } from 'next/server';
import { getDeviceByApiKey, updateDeviceTunnel } from '@/lib/db';
import { getBearerToken, jsonError, jsonOk } from '@/lib/http';

export async function POST(request: NextRequest) {
  try {
    const apiKey = getBearerToken(request);
    if (!apiKey) return jsonError('Token Bearer requis', 401);

    const device = await getDeviceByApiKey(apiKey);
    if (!device) return jsonError('Device inconnu', 401);

    const body = await request.json();
    const tunnelUrl = String(body.tunnel_url || '').trim().replace(/\/$/, '');
    if (!tunnelUrl) return jsonError('tunnel_url requis', 400);

    await updateDeviceTunnel(device.id, tunnelUrl);
    return jsonOk({ status: 'ok', tunnel_url: tunnelUrl });
  } catch (err) {
    console.error(err);
    return jsonError(err instanceof Error ? err.message : 'Erreur serveur', 500);
  }
}
