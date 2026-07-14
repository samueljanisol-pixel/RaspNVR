import { NextRequest } from 'next/server';
import { createRegistrationToken } from '@/lib/db';
import { getSupabaseAdmin } from '@/lib/supabase';
import { jsonError, jsonOk, requireAdmin } from '@/lib/http';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  if (!requireAdmin(request)) return jsonError('Non autorisé', 401);
  try {
    const { id } = await params;
    const sb = getSupabaseAdmin();
    const { data: store } = await sb.from('raspnvr_stores').select('id').eq('id', id).maybeSingle();
    if (!store) return jsonError('Magasin introuvable', 404);

    const token = await createRegistrationToken(id);
    return jsonOk({ token, expires_hours: 48 });
  } catch (err) {
    console.error(err);
    return jsonError(err instanceof Error ? err.message : 'Erreur serveur', 500);
  }
}
