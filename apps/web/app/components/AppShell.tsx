'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { getSession, Session } from '../../lib/session';
import { normalizePathname } from '../../lib/pathname';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import IdleLock from './IdleLock';

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

  if (pathname === '/login') return <>{children}</>;

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
