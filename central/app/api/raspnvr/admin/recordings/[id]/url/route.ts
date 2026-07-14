import { NextRequest } from 'next/server';
import { createDownloadUrl } from '@/lib/db';
import { getSupabaseAdmin } from '@/lib/supabase';
import { jsonError, jsonOk, requireAdmin } from '@/lib/http';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  if (!requireAdmin(request)) return jsonError('Non autorisé', 401);
  try {
    const { id } = await params;
    const sb = getSupabaseAdmin();
    const { data: recording } = await sb
      .from('raspnvr_recordings')
      .select('storage_path')
      .eq('id', id)
      .maybeSingle();
    if (!recording) return jsonError('Enregistrement introuvable', 404);

    const url = await createDownloadUrl(recording.storage_path, 3600);
    return jsonOk({ url, expires_in: 3600 });
  } catch (err) {
    console.error(err);
    return jsonError(err instanceof Error ? err.message : 'Erreur serveur', 500);
  }
}
