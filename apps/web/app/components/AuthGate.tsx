'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { getSession } from '../../lib/session';
import { normalizePathname } from '../../lib/pathname';

// Garde d'authentification côté client — en export statique (Tauri inclus),
// il n'y a pas de middleware serveur possible : la vérification se fait ici.
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = normalizePathname(usePathname());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const check = () => {
      const session = getSession();
      if (!session && pathname !== '/login') {
        router.replace('/login');
      } else {
        setReady(true);
      }
    };
    check();
    window.addEventListener('korise-session-changed', check);
    return () => window.removeEventListener('korise-session-changed', check);
  }, [pathname, router]);

  if (!ready && pathname !== '/login') return null;
  return <>{children}</>;
}
