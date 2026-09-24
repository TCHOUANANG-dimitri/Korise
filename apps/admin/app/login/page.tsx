'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn } from 'lucide-react';

import { adminLogin, ApiError } from '../../lib/api';
import { setAdminSession } from '../../lib/session';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const session = await adminLogin({ email: email.trim(), password });
      setAdminSession(session);
      router.replace('/');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Connexion impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-card bg-surface p-6">
        <p className="mb-1 font-heading text-2xl font-extrabold text-background">Korise</p>
        <p className="mb-6 text-sm text-text-muted">Super Admin — accès réservé à l’équipe interne.</p>

        <label className="field-label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          className="field-input mb-3"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="prenom@korise.app"
          autoFocus
        />
        <label className="field-label" htmlFor="password">
          Mot de passe
        </label>
        <input
          id="password"
          type="password"
          className="field-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
        />

        {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}

        <button
          type="button"
          className="btn-accent mt-5 w-full"
          disabled={busy || !email.trim() || !password}
          onClick={() => void submit()}
        >
          <LogIn size={18} /> Se connecter
        </button>
      </div>
    </div>
  );
}
