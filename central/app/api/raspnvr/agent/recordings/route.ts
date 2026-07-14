import { NextRequest } from 'next/server';
import {
  createUploadUrl,
  getDeviceByApiKey,
  registerRecording,
} from '@/lib/db';
import { getBearerToken, jsonError, jsonOk } from '@/lib/http';

export async function POST(request: NextRequest) {
  try {
    const apiKey = getBearerToken(request);
    if (!apiKey) return jsonError('Token Bearer requis', 401);

    const device = await getDeviceByApiKey(apiKey);
    if (!device || !device.store) return jsonError('Device inconnu', 401);

    const body = await request.json();
    const cameraId = Number(body.camera_id);
    const sizeBytes = Number(body.size_bytes || 0);
    const startedAt = String(body.started_at || '');
    const localPath = String(body.local_path || '');
    const cameraName = String(body.camera_name || '');

    if (!cameraId || !startedAt || !localPath) {
      return jsonError('camera_id, started_at et local_path requis', 400);
    }

    const filename = localPath.split('/').pop() || `seg_${Date.now()}.mkv`;
    const storagePath = `${device.store.code}/cam_${cameraId}/${filename}`;

    const upload = await createUploadUrl(storagePath);
    const recording = await registerRecording(device.id, device.store_id, {
      camera_id: cameraId,
      camera_name: cameraName,
      storage_path: storagePath,
      local_path: localPath,
      size_bytes: sizeBytes,
      started_at: startedAt,
    });

    return jsonOk({
      recording_id: recording.id,
      storage_path: storagePath,
      upload_url: upload.signedUrl,
      token: upload.token,
    });
  } catch (err) {
    console.error(err);
    return jsonError(err instanceof Error ? err.message : 'Erreur serveur', 500);
  }
}
