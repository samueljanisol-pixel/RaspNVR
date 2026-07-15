'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAdminKey } from '@/lib/auth-client';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    if (getAdminKey()) router.replace('/dashboard');
    else router.replace('/login');
  }, [router]);

  return null;
}
