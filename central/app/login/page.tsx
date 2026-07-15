'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGuestOnly } from '@/lib/useRequireAuth';

export default function LoginPage() {
  const router = useRouter();
  const ready = useGuestOnly();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const res = await fetch('/api/raspnvr/admin/stores', {
      headers: { Authorization: `Bearer ${password}` },
    });
    if (!res.ok) {
      setError('Mot de passe invalide');
      return;
    }
    sessionStorage.setItem('raspnvr_admin_key', password);
    router.replace('/dashboard');
  }

  if (!ready) return null;

  return (
    <main className="container login-page">
      <div className="panel">
        <h2>Connexion</h2>
        <form onSubmit={onSubmit}>
          <label>
            Mot de passe
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn" type="submit">Se connecter</button>
        </form>
      </div>
    </main>
  );
}
