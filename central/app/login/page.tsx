'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const res = await fetch('/api/raspnvr/admin/stores', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      setError('Clé admin invalide');
      return;
    }
    sessionStorage.setItem('raspnvr_admin_key', key);
    router.push('/dashboard');
  }

  return (
    <main className="container" style={{ maxWidth: 420, marginTop: '4rem' }}>
      <div className="panel">
        <h2>Connexion admin</h2>
        <p className="meta">Clé API admin (RASPNVR_ADMIN_KEY)</p>
        <form onSubmit={onSubmit}>
          <label>
            Clé admin
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
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
