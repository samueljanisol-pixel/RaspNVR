import { getSupabaseAdmin, storageBucket } from './supabase';
import { generateToken, hashSecret, isOnline, nowIso, verifySecret } from './crypto';

export type StoreRow = {
  id: string;
  code: string;
  name: string;
  sort_order: number;
};

export type DeviceRow = {
  id: string;
  store_id: string;
  api_key_hash: string;
  hostname: string | null;
  tunnel_url: string | null;
  agent_version: string | null;
  last_seen_at: string | null;
  last_status: Record<string, unknown> | null;
  registered_at: string;
};

export async function getStoreByCode(code: string): Promise<StoreRow | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('raspnvr_stores')
    .select('*')
    .ilike('code', code.trim())
    .maybeSingle();
  if (error) throw error;
  return data as StoreRow | null;
}

export async function consumeRegistrationToken(storeId: string, token: string): Promise<boolean> {
  const sb = getSupabaseAdmin();
  const { data: rows, error } = await sb
    .from('raspnvr_registration_tokens')
    .select('*')
    .eq('store_id', storeId)
    .is('used_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  for (const row of rows || []) {
    if (!verifySecret(token, row.token_hash)) continue;
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) continue;
    await sb
      .from('raspnvr_registration_tokens')
      .update({ used_at: nowIso() })
      .eq('id', row.id);
    return true;
  }
  return false;
}

export async function registerDevice(
  storeId: string,
  apiKey: string,
  hostname: string,
  agentVersion: string,
): Promise<DeviceRow> {
  const sb = getSupabaseAdmin();
  const apiKeyHash = hashSecret(apiKey);
  const { data: existing } = await sb
    .from('raspnvr_devices')
    .select('*')
    .eq('store_id', storeId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await sb
      .from('raspnvr_devices')
      .update({
        api_key_hash: apiKeyHash,
        hostname,
        agent_version: agentVersion,
        registered_at: nowIso(),
      })
      .eq('store_id', storeId)
      .select('*')
      .single();
    if (error) throw error;
    return data as DeviceRow;
  }

  const { data, error } = await sb
    .from('raspnvr_devices')
    .insert({
      store_id: storeId,
      api_key_hash: apiKeyHash,
      hostname,
      agent_version: agentVersion,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as DeviceRow;
}

export async function getDeviceByApiKey(apiKey: string): Promise<(DeviceRow & { store?: StoreRow }) | null> {
  const sb = getSupabaseAdmin();
  const apiKeyHash = hashSecret(apiKey);
  const { data, error } = await sb
    .from('raspnvr_devices')
    .select('*, store:raspnvr_stores(*)')
    .eq('api_key_hash', apiKeyHash)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const store = Array.isArray(data.store) ? data.store[0] : data.store;
  return { ...(data as DeviceRow), store: store as StoreRow | undefined };
}

export async function updateDeviceHeartbeat(deviceId: string, payload: Record<string, unknown>) {
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from('raspnvr_devices')
    .update({
      last_seen_at: nowIso(),
      last_status: payload,
      hostname: (payload.hostname as string) || null,
      agent_version: (payload.agent_version as string) || null,
    })
    .eq('id', deviceId);
  if (error) throw error;
}

export async function updateDeviceTunnel(deviceId: string, tunnelUrl: string) {
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from('raspnvr_devices')
    .update({ tunnel_url: tunnelUrl.replace(/\/$/, '') })
    .eq('id', deviceId);
  if (error) throw error;
}

export async function listPendingCommands(deviceId: string) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('raspnvr_commands')
    .select('id, type, payload')
    .eq('device_id', deviceId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function ackCommand(
  commandId: string,
  deviceId: string,
  success: boolean,
  result: Record<string, unknown>,
) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('raspnvr_commands')
    .update({
      status: success ? 'acked' : 'failed',
      result,
      acked_at: nowIso(),
    })
    .eq('id', commandId)
    .eq('device_id', deviceId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function listStoresWithDevices() {
  const sb = getSupabaseAdmin();
  const { data: stores, error: storesErr } = await sb
    .from('raspnvr_stores')
    .select('*')
    .order('sort_order')
    .order('code');
  if (storesErr) throw storesErr;

  const { data: devices, error: devErr } = await sb
    .from('raspnvr_devices')
    .select('*');
  if (devErr) throw devErr;

  const byStore = new Map((devices || []).map((d) => [d.store_id, d]));
  return (stores || []).map((store) => {
    const device = byStore.get(store.id) || null;
    return {
      ...store,
      device,
      online: device ? isOnline(device.last_seen_at) : false,
    };
  });
}

export async function getStoreDetail(storeId: string) {
  const sb = getSupabaseAdmin();
  const { data: store, error } = await sb
    .from('raspnvr_stores')
    .select('*')
    .eq('id', storeId)
    .maybeSingle();
  if (error) throw error;
  if (!store) return null;

  const { data: device } = await sb
    .from('raspnvr_devices')
    .select('*')
    .eq('store_id', storeId)
    .maybeSingle();

  const { data: recordings } = await sb
    .from('raspnvr_recordings')
    .select('*')
    .eq('store_id', storeId)
    .order('started_at', { ascending: false })
    .limit(50);

  return {
    store,
    device: device
      ? { ...device, online: isOnline(device.last_seen_at) }
      : null,
    recordings: recordings || [],
  };
}

export async function createRegistrationToken(storeId: string, expiresHours = 48) {
  const sb = getSupabaseAdmin();
  const token = generateToken(24);
  const tokenHash = hashSecret(token);
  const expiresAt = new Date(Date.now() + expiresHours * 3600 * 1000).toISOString();
  const { error } = await sb.from('raspnvr_registration_tokens').insert({
    store_id: storeId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (error) throw error;
  return token;
}

export async function createCommand(deviceId: string, type: string, payload: Record<string, unknown>) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('raspnvr_commands')
    .insert({ device_id: deviceId, type, payload })
    .select('id, type, payload')
    .single();
  if (error) throw error;
  return data;
}

export async function registerRecording(
  deviceId: string,
  storeId: string,
  body: {
    camera_id: number;
    camera_name?: string;
    storage_path: string;
    local_path?: string;
    size_bytes: number;
    started_at: string;
  },
) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('raspnvr_recordings')
    .insert({
      device_id: deviceId,
      store_id: storeId,
      camera_id: body.camera_id,
      camera_name: body.camera_name || null,
      storage_path: body.storage_path,
      local_path: body.local_path || null,
      size_bytes: body.size_bytes,
      started_at: body.started_at,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function createUploadUrl(storagePath: string) {
  const sb = getSupabaseAdmin();
  const bucket = storageBucket();
  const { data, error } = await sb.storage.from(bucket).createSignedUploadUrl(storagePath);
  if (error) throw error;
  return data;
}

export async function createDownloadUrl(storagePath: string, expiresSec = 3600) {
  const sb = getSupabaseAdmin();
  const bucket = storageBucket();
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(storagePath, expiresSec);
  if (error) throw error;
  return data.signedUrl;
}

export async function listOfflineDevices(thresholdSec = 300) {
  const sb = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - thresholdSec * 1000).toISOString();
  const { data, error } = await sb
    .from('raspnvr_devices')
    .select('*, store:raspnvr_stores(code, name)')
    .or(`last_seen_at.is.null,last_seen_at.lt.${cutoff}`);
  if (error) throw error;
  return data || [];
}

export function newApiKey(): string {
  return generateToken(32);
}

const STORE_CODE_RE = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/;

export function normalizeStoreCode(code: string): string {
  return code.trim().toLowerCase();
}

export function validateStoreCode(code: string): string {
  const normalized = normalizeStoreCode(code);
  if (!STORE_CODE_RE.test(normalized)) {
    throw new Error('Code magasin invalide (lettres minuscules, chiffres, tirets)');
  }
  return normalized;
}

export async function createStore(code: string, name: string, sortOrder = 0) {
  const sb = getSupabaseAdmin();
  const normalizedCode = validateStoreCode(code);
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Nom du magasin requis');

  const { data: maxRow } = await sb
    .from('raspnvr_stores')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const order = sortOrder || ((maxRow?.sort_order as number) || 0) + 1;

  const { data, error } = await sb
    .from('raspnvr_stores')
    .insert({ code: normalizedCode, name: trimmedName, sort_order: order })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('Ce code magasin existe déjà');
    throw error;
  }
  return data as StoreRow;
}

export async function updateStore(
  storeId: string,
  fields: { name?: string; code?: string; sort_order?: number },
) {
  const sb = getSupabaseAdmin();
  const payload: Record<string, string | number> = {};
  if (fields.name !== undefined) {
    const trimmed = fields.name.trim();
    if (!trimmed) throw new Error('Nom du magasin requis');
    payload.name = trimmed;
  }
  if (fields.code !== undefined) {
    payload.code = validateStoreCode(fields.code);
  }
  if (fields.sort_order !== undefined) {
    payload.sort_order = fields.sort_order;
  }
  if (!Object.keys(payload).length) {
    const { data } = await sb.from('raspnvr_stores').select('*').eq('id', storeId).maybeSingle();
    return data as StoreRow | null;
  }

  const { data, error } = await sb
    .from('raspnvr_stores')
    .update(payload)
    .eq('id', storeId)
    .select('*')
    .maybeSingle();
  if (error) {
    if (error.code === '23505') throw new Error('Ce code magasin existe déjà');
    throw error;
  }
  return data as StoreRow | null;
}

export type ViewItemRow = {
  id: string;
  view_id: string;
  store_id: string;
  camera_id: number;
  sort_order: number;
};

export type ViewRow = {
  id: string;
  name: string;
  sort_order: number;
  is_all: boolean;
  items?: ViewItemRow[];
};

export async function ensureDefaultViews() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('raspnvr_views').select('id').eq('is_all', true).limit(1);
  if (error) throw error;
  if (data?.length) return;
  const { error: insErr } = await sb.from('raspnvr_views').insert({ name: 'Toutes', sort_order: 0, is_all: true });
  if (insErr) throw insErr;
}

export async function listViews(): Promise<ViewRow[]> {
  await ensureDefaultViews();
  const sb = getSupabaseAdmin();
  const { data: views, error } = await sb
    .from('raspnvr_views')
    .select('*')
    .order('sort_order')
    .order('name');
  if (error) throw error;

  const { data: items, error: itemsErr } = await sb
    .from('raspnvr_view_items')
    .select('*')
    .order('sort_order');
  if (itemsErr) throw itemsErr;

  const byView = new Map<string, ViewItemRow[]>();
  for (const item of items || []) {
    const list = byView.get(item.view_id) || [];
    list.push(item as ViewItemRow);
    byView.set(item.view_id, list);
  }

  return (views || []).map((v) => ({
    ...(v as ViewRow),
    items: byView.get(v.id) || [],
  }));
}

export async function createView(name: string) {
  const sb = getSupabaseAdmin();
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Nom de vue requis');
  const { data: maxRow } = await sb
    .from('raspnvr_views')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = ((maxRow?.sort_order as number) || 0) + 1;
  const { data, error } = await sb
    .from('raspnvr_views')
    .insert({ name: trimmed, sort_order: sortOrder, is_all: false })
    .select('*')
    .single();
  if (error) throw error;
  return { ...(data as ViewRow), items: [] };
}

export async function updateViewName(viewId: string, name: string) {
  const sb = getSupabaseAdmin();
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Nom de vue requis');
  const { data: view } = await sb.from('raspnvr_views').select('is_all').eq('id', viewId).maybeSingle();
  if (!view) return null;
  const { data, error } = await sb
    .from('raspnvr_views')
    .update({ name: view.is_all ? 'Toutes' : trimmed })
    .eq('id', viewId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data as ViewRow | null;
}

export async function deleteView(viewId: string) {
  const sb = getSupabaseAdmin();
  const { data: view } = await sb.from('raspnvr_views').select('is_all').eq('id', viewId).maybeSingle();
  if (!view) return false;
  if (view.is_all) throw new Error('La vue « Toutes » ne peut pas être supprimée');
  const { error } = await sb.from('raspnvr_views').delete().eq('id', viewId);
  if (error) throw error;
  return true;
}

export async function reorderViews(viewIds: string[]) {
  const sb = getSupabaseAdmin();
  for (let i = 0; i < viewIds.length; i++) {
    const { error } = await sb.from('raspnvr_views').update({ sort_order: i }).eq('id', viewIds[i]);
    if (error) throw error;
  }
}

export async function setViewItems(
  viewId: string,
  items: Array<{ store_id: string; camera_id: number }>,
) {
  const sb = getSupabaseAdmin();
  const { data: view } = await sb.from('raspnvr_views').select('is_all').eq('id', viewId).maybeSingle();
  if (!view) throw new Error('Vue introuvable');
  if (view.is_all) throw new Error('La vue « Toutes » est automatique');

  await sb.from('raspnvr_view_items').delete().eq('view_id', viewId);
  if (items.length) {
    const rows = items.map((item, index) => ({
      view_id: viewId,
      store_id: item.store_id,
      camera_id: item.camera_id,
      sort_order: index,
    }));
    const { error } = await sb.from('raspnvr_view_items').insert(rows);
    if (error) throw error;
  }
}

export async function listAllCameraFeeds() {
  const stores = await listStoresWithDevices();
  const feeds: Array<{
    key: string;
    store_id: string;
    store_code: string;
    store_name: string;
    camera_id: number;
    camera_name: string;
    tunnel_url: string;
    online: boolean;
  }> = [];

  for (const store of stores) {
    const tunnel = (store.device?.tunnel_url || '').replace(/\/$/, '');
    const cameras = store.device?.last_status?.cameras || [];
    if (!Array.isArray(cameras)) continue;
    for (const cam of cameras as Array<{ id: number; name: string }>) {
      feeds.push({
        key: `${store.id}:${cam.id}`,
        store_id: store.id,
        store_code: store.code,
        store_name: store.name,
        camera_id: cam.id,
        camera_name: cam.name,
        tunnel_url: tunnel,
        online: Boolean(store.online && tunnel),
      });
    }
  }
  return feeds;
}

export { generateToken };
