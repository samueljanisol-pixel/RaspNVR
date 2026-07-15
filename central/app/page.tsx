'use client';

import { useAuthRedirect } from '@/lib/useRequireAuth';

export default function HomePage() {
  useAuthRedirect();
  return null;
}
