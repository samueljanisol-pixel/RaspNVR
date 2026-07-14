import { NextRequest } from 'next/server';

export function verifyCloudflareAccess(request: NextRequest): boolean {
  const aud = process.env.CF_ACCESS_AUD;
  if (!aud) return true;
  const jwt = request.headers.get('cf-access-jwt-assertion');
  return Boolean(jwt);
}
