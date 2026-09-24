'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, LogOut } from 'lucide-react';

import { login } from '../../lib/api';
import { checkPinLocally, getLockMinutes, rememberPin } from '../../lib/lock';
import { clearSession, getSession } from '../../lib/session';

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const;

// Caisse partagée : après N minutes sans activité, un écran demande le PIN de l'utilisateur
// connecté (ou de changer d'utilisateur) — sans déconnecter toute l'entreprise ni perdre la
// file de synchronisation.
export default function IdleLock() {
  const router = useRouter();
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const arm = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const minutes = getLockMinutes();
    if (minutes <= 0 || !getSession()) return;
    timer.current = setTimeout(() => setLocked(true), minutes * 60_000);
  }, []);

  useEffect(() => {
    if (locked) return;
    arm();
    const onActivity = () => arm();
    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, onActivity, { passive: true });
    const onLockNow = () => setLocked(true);
    window.addEventListener('korise-lock-now', onLockNow);
    window.addEventListener('korise-lock-settings-changed', arm);
    return () => {
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, onActivity);
      window.removeEventListener('korise-lock-now', onLockNow);
      window.removeEventListener('korise-lock-settings-changed', arm);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [locked, arm]);

  if (!locked) return null;
  const session = getSession();
  if (!session) return null;

  const unlock = async () => {
    setBusy(true);
    setError(null);
    try {
      const local = await checkPinLocally(session.user_id, pin);
      if (local === true) {
        setLocked(false);
        setPin('');
        return;
      }
      if (local === false) {
        setError('PIN incorrect.');
        return;
      }
      // Pas d'empreinte locale (session ouverte avant cette fonction) : on vérifie en ligne une fois.
      await login({ business_code: session.business_code, pin });
      await rememberPin(session.user_id, pin);
      setLocked(false);
      setPin('');
    } catch {
      setError('PIN incorrect ou connexion indisponible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-xs rounded-card bg-surface p-6 text-center">
        <KeyRound size={28} className="mx-auto mb-3 text-accent" />
        <p className="font-heading text-lg font-extrabold text-background">Caisse verrouillée</p>
        <p className="mb-4 text-sm text-text-muted">{session.full_name} — entre ton PIN pour continuer.</p>
        <input
          className="field-input mb-3 text-center text-lg tracking-widest"
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && pin.length >= 4 && void unlock()}
          autoFocus
          placeholder="PIN"
        />
        {error && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}
        <button type="button" className="btn-accent w-full" disabled={busy || pin.length < 4} onClick={() => void unlock()}>
          Déverrouiller
        </button>
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-danger"
          onClick={() => {
            clearSession();
            setLocked(false);
            router.replace('/login');
          }}
        >
          <LogOut size={14} /> Changer d’utilisateur
        </button>
      </div>
    </div>
  );
}
