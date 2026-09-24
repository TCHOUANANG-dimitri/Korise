'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Copy, LogIn, Store } from 'lucide-react';

import { ApiError, login, registerBusiness } from '../../lib/api';
import { Session, setSession } from '../../lib/session';
import { rememberPin } from '../../lib/lock';
import Logo from '../components/Logo';

type Mode = 'login' | 'register';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Affiché juste après l'inscription, avant de rediriger — c'est le seul
  // moment où le business_code (généré serveur) est montré au propriétaire ;
  // il n'est réaffiché nulle part ailleurs sauf dans le menu latéral.
  const [newBusiness, setNewBusiness] = useState<Session | null>(null);

  // Login
  const [businessCode, setBusinessCode] = useState('');
  const [pin, setPin] = useState('');

  // Register
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [newPin, setNewPin] = useState('');

  const afterSuccess = (session: Parameters<typeof setSession>[0]) => {
    setSession(session);
    router.replace('/');
  };

  const submitLogin = async () => {
    setError(null);
    setBusy(true);
    try {
      const session = await login({ business_code: businessCode.trim().toUpperCase(), pin });
      await rememberPin(session.user_id, pin);
      afterSuccess(session);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  };

  const submitRegister = async () => {
    setError(null);
    setBusy(true);
    try {
      const session = await registerBusiness({
        business_name: businessName.trim(),
        owner_full_name: ownerName.trim(),
        owner_phone: ownerPhone.trim() || undefined,
        pin: newPin,
      });
      await rememberPin(session.user_id, newPin);
      setSession(session);
      setNewBusiness(session);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Création impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo variant="full" className="h-auto w-full max-w-[280px]" />
        </div>

        {newBusiness ? (
          <BusinessCreatedCard session={newBusiness} onContinue={() => afterSuccess(newBusiness)} />
        ) : (
        <div className="rounded-block bg-surface p-6 shadow-sm">
          <div className="mb-5 flex rounded-field border border-border p-1">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 rounded-field py-2 text-sm font-semibold ${mode === 'login' ? 'bg-background text-white' : 'text-text-muted'}`}
            >
              Se connecter
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`flex-1 rounded-field py-2 text-sm font-semibold ${mode === 'register' ? 'bg-background text-white' : 'text-text-muted'}`}
            >
              Créer mon entreprise
            </button>
          </div>

          {error && (
            <div className="badge-danger mb-4 block rounded-field px-3 py-2 text-sm">{error}</div>
          )}

          {mode === 'login' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitLogin();
              }}
            >
              <label className="field-label" htmlFor="business_code">
                Code entreprise
              </label>
              <input
                id="business_code"
                className="field-input mb-4"
                placeholder="ex. KRH4X2"
                value={businessCode}
                onChange={(e) => setBusinessCode(e.target.value)}
                autoCapitalize="characters"
                required
              />
              <label className="field-label" htmlFor="pin">
                Code PIN
              </label>
              <input
                id="pin"
                type="password"
                inputMode="numeric"
                className="field-input mb-5"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required
              />
              <button type="submit" className="btn-accent w-full" disabled={busy}>
                <LogIn size={18} />
                Se connecter
              </button>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitRegister();
              }}
            >
              <label className="field-label" htmlFor="business_name">
                Nom de l&rsquo;entreprise
              </label>
              <input
                id="business_name"
                className="field-input mb-4"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
              />
              <label className="field-label" htmlFor="owner_name">
                Votre nom
              </label>
              <input
                id="owner_name"
                className="field-input mb-4"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                required
              />
              <label className="field-label" htmlFor="owner_phone">
                Téléphone (optionnel)
              </label>
              <input
                id="owner_phone"
                className="field-input mb-4"
                value={ownerPhone}
                onChange={(e) => setOwnerPhone(e.target.value)}
              />
              <label className="field-label" htmlFor="new_pin">
                Choisissez un code PIN
              </label>
              <input
                id="new_pin"
                type="password"
                inputMode="numeric"
                className="field-input mb-5"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                minLength={4}
                maxLength={8}
                required
              />
              <button type="submit" className="btn-accent w-full" disabled={busy}>
                <Store size={18} />
                Créer mon entreprise
              </button>
            </form>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

function BusinessCreatedCard({ session, onContinue }: { session: Session; onContinue: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(session.business_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponible — pas bloquant */
    }
  };

  return (
    <div className="rounded-block bg-surface p-6 text-center shadow-sm">
      <h1 className="font-heading text-lg font-extrabold text-background">Entreprise créée</h1>
      <p className="mt-1 text-sm text-text-muted">
        Note bien ce code : c&rsquo;est lui qui permet à tes employés (et à toi, sur un autre appareil) de se
        connecter à ton entreprise. Il n&rsquo;est réaffiché nulle part ailleurs que dans le menu latéral.
      </p>

      <button
        type="button"
        onClick={copy}
        className="mt-4 flex w-full items-center justify-between gap-3 rounded-field border border-border bg-background px-4 py-3 text-left transition hover:opacity-90"
        title="Copier le code entreprise"
      >
        <span>
          <span className="block text-[10px] font-medium uppercase tracking-wide text-white/50">Code entreprise</span>
          <span className="font-heading text-2xl font-extrabold tracking-widest text-accent">{session.business_code}</span>
        </span>
        {copied ? <Check size={20} className="shrink-0 text-success" /> : <Copy size={20} className="shrink-0 text-white/60" />}
      </button>

      <button type="button" className="btn-accent mt-5 w-full" onClick={onContinue}>
        J&rsquo;ai noté mon code — continuer
        <ArrowRight size={18} />
      </button>
    </div>
  );
}
