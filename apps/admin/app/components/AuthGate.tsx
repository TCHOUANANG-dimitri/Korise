'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { getAdminSession } from '../../lib/session';

// Garde d'authentification côté client, séparée de celle de apps/web (session/clé
// différentes — voir lib/session.ts).
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const check = () => {
      const session = getAdminSession();
      if (!session && pathname !== '/login') {
        router.replace('/login');
      } else {
        setReady(true);
      }
    };
    check();
    window.addEventListener('korise-admin-session-changed', check);
    return () => window.removeEventListener('korise-admin-session-changed', check);
  }, [pathname, router]);

  if (!ready && pathname !== '/login') return null;
  return <>{children}</>;
}
