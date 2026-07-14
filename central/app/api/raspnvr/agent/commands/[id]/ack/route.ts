import { NextRequest } from 'next/server';
import { ackCommand, getDeviceByApiKey } from '@/lib/db';
import { getBearerToken, jsonError, jsonOk } from '@/lib/http';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const apiKey = getBearerToken(request);
    if (!apiKey) return jsonError('Token Bearer requis', 401);

    const device = await getDeviceByApiKey(apiKey);
    if (!device) return jsonError('Device inconnu', 401);

    const body = await request.json();
    const success = body.success !== false;
    const result = body.result || {};

    const ok = await ackCommand(id, device.id, success, result);
    if (!ok) return jsonError('Commande introuvable', 404);
    return jsonOk({ status: 'ok' });
  } catch (err) {
    console.error(err);
    return jsonError(err instanceof Error ? err.message : 'Erreur serveur', 500);
  }
}
