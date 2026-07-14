import { NextRequest } from 'next/server';
import { verifyCloudflareAccess } from './cf-access';

export function getBearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function requireAdmin(request: NextRequest): boolean {
  if (!verifyCloudflareAccess(request)) return false;
  const adminKey = process.env.RASPNVR_ADMIN_KEY || '';
  if (!adminKey) return false;
  const token = getBearerToken(request);
  if (!token) return false;
  return token === adminKey;
}

export function jsonError(message: string, status = 400) {
  return Response.json({ detail: message }, { status });
}

export function jsonOk(data: unknown, status = 200) {
  return Response.json(data, { status });
}
