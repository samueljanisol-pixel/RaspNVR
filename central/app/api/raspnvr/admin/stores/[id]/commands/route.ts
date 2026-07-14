import { NextRequest } from 'next/server';
import { createCommand } from '@/lib/db';
import { getSupabaseAdmin } from '@/lib/supabase';
import { jsonError, jsonOk, requireAdmin } from '@/lib/http';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  if (!requireAdmin(request)) return jsonError('Non autorisé', 401);
  try {
    const { id: storeId } = await params;
    const body = await request.json();
    const type = String(body.type || '').trim();
    const payload = body.payload || {};

    if (!type) return jsonError('type requis', 400);

    const sb = getSupabaseAdmin();
    const { data: device } = await sb
      .from('raspnvr_devices')
      .select('id')
      .eq('store_id', storeId)
      .maybeSingle();
    if (!device) return jsonError('Aucun device enregistré pour ce magasin', 404);

    const command = await createCommand(device.id, type, payload);
    return jsonOk({ command });
  } catch (err) {
    console.error(err);
    return jsonError(err instanceof Error ? err.message : 'Erreur serveur', 500);
  }
}
