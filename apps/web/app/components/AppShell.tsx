'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { fetchBusinessSettings } from '../../lib/api';
import { getSession, setSession as saveSession, Session } from '../../lib/session';
import { normalizePathname } from '../../lib/pathname';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import IdleLock from './IdleLock';
import DeletionPending from './DeletionPending';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = normalizePathname(usePathname());
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const sync = () => setSession(getSession());
    sync();
    window.addEventListener('korise-session-changed', sync);
    return () => window.removeEventListener('korise-session-changed', sync);
  }, []);

  // La suppression a pu être demandée depuis un autre appareil : le propriétaire relit l'état
  // de l'entreprise au démarrage (best-effort, sans effet hors-ligne).
  useEffect(() => {
    const current = getSession();
    if (current?.role !== 'owner') return;
    fetchBusinessSettings()
      .then((b) => {
        const scheduled = b.deletion_scheduled_for ?? null;
        const latest = getSession();
        if (latest && (latest.deletion_scheduled_for ?? null) !== scheduled) saveSession({ ...latest, deletion_scheduled_for: scheduled });
      })
      .catch(() => undefined);
  }, [session?.user_id]);

  // Routes publiques (hors shell) : connexion et récupération du code entreprise.
  if (pathname === '/login' || pathname === '/code-oublie') return <>{children}</>;
  if (session?.deletion_scheduled_for) return <DeletionPending session={session} />;

  return (
    <>
      <IdleLock />
      <Sidebar open={open} onClose={() => setOpen(false)} session={session} />
      <div className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <TopBar onOpenMenu={() => setOpen(true)} session={session} />
        {children}
      </div>
    </>
  );
}
