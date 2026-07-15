'use client';

export function getAdminKey(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('raspnvr_admin_key') || '';
}

export function adminHeaders(): HeadersInit {
  return { Authorization: `Bearer ${getAdminKey()}` };
}

export function isLoggedIn(): boolean {
  return Boolean(getAdminKey());
}

export function logout() {
  sessionStorage.removeItem('raspnvr_admin_key');
}
