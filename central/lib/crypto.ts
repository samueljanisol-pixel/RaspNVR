import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export function hashSecret(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function verifySecret(value: string, hashed: string): boolean {
  const a = Buffer.from(hashSecret(value), 'utf8');
  const b = Buffer.from(hashed, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function generateToken(length = 32): string {
  return randomBytes(length).toString('base64url').slice(0, length);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export const ONLINE_THRESHOLD_SEC = 120;

export function isOnline(lastSeenAt: string | null | undefined): boolean {
  if (!lastSeenAt) return false;
  const seen = new Date(lastSeenAt).getTime();
  if (Number.isNaN(seen)) return false;
  return (Date.now() - seen) / 1000 < ONLINE_THRESHOLD_SEC;
}
