'use client';

import { useLayoutEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAdminKey } from './auth-client';

export function useRequireAuth(): boolean {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);

  useLayoutEffect(() => {
    const ok = Boolean(getAdminKey());
    if (!ok) {
      router.replace('/login');
      return;
    }
    setAuthed(true);
  }, [router]);

  return authed;
}

export function useGuestOnly(): boolean {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    if (getAdminKey()) {
      router.replace('/dashboard');
      return;
    }
    setReady(true);
  }, [router]);

  return ready;
}

export function useAuthRedirect(): boolean {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    router.replace(getAdminKey() ? '/dashboard' : '/login');
    setReady(true);
  }, [router]);

  return ready;
}
