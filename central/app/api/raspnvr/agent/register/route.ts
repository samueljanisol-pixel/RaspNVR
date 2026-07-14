import { NextRequest } from 'next/server';
import { getDeviceByApiKey, getStoreByCode, consumeRegistrationToken, registerDevice, newApiKey } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/http';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const storeCode = String(body.store_code || body.magasin_code || '').trim();
    const token = String(body.registration_token || '').trim();
    const hostname = String(body.hostname || '').trim();
    const agentVersion = String(body.agent_version || '1.0.0').trim();

    if (!storeCode || !token) {
      return jsonError('store_code et registration_token requis', 400);
    }

    const store = await getStoreByCode(storeCode);
    if (!store) return jsonError('Magasin introuvable', 404);

    const valid = await consumeRegistrationToken(store.id, token);
    if (!valid) return jsonError('Token invalide ou expiré', 403);

    const apiKey = newApiKey();
    const device = await registerDevice(
      store.id,
      apiKey,
      hostname || `raspnvr-${storeCode}`,
      agentVersion,
    );

    return jsonOk({ device_id: device.id, api_key: apiKey });
  } catch (err) {
    console.error(err);
    return jsonError(err instanceof Error ? err.message : 'Erreur serveur', 500);
  }
}
