import { NextRequest } from 'next/server';
import { getDeviceByApiKey, listPendingCommands } from '@/lib/db';
import { getBearerToken, jsonError, jsonOk } from '@/lib/http';

export async function GET(request: NextRequest) {
  try {
    const apiKey = getBearerToken(request);
    if (!apiKey) return jsonError('Token Bearer requis', 401);

    const device = await getDeviceByApiKey(apiKey);
    if (!device) return jsonError('Device inconnu', 401);

    const commands = await listPendingCommands(device.id);
    return jsonOk({ commands });
  } catch (err) {
    console.error(err);
    return jsonError(err instanceof Error ? err.message : 'Erreur serveur', 500);
  }
}
