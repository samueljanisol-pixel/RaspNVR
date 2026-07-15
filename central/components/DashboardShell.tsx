'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ReactNode } from 'react';
import { logout } from '@/lib/auth-client';

type Props = {
  title?: string;
  children: ReactNode;
  showSettings?: boolean;
  mainClassName?: string;
};

export function DashboardShell({
  title = 'RaspNVR Central',
  children,
  showSettings = true,
  mainClassName = '',
}: Props) {
  const router = useRouter();

  return (
    <>
      <header className="topbar">
        <h1>{title}</h1>
        <div className="topbar-actions">
          {showSettings && (
            <Link href="/dashboard/settings" className="btn secondary topbar-link">
              Paramètres
            </Link>
          )}
          <button
            className="btn secondary"
            type="button"
            onClick={() => {
              logout();
              router.replace('/login');
            }}
          >
            Déconnexion
          </button>
        </div>
      </header>
      <main className={`container ${mainClassName}`.trim()}>{children}</main>
    </>
  );
}
