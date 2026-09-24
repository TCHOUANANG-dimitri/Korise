'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Bell, CheckCircle2, CloudOff, LockKeyhole, LogOut, Menu, RefreshCw, TriangleAlert } from 'lucide-react';

import { syncEngine, SyncState } from '../../lib/sync';
import { formatTime } from '../../lib/format';
import { clearSession, Session } from '../../lib/session';
import { fetchAnomalies } from '../../lib/api';
import { getPendingOutbox, getRejectedOutbox, listProducts } from '../../lib/repo';
import { useData } from '../../lib/useData';
import Logo from './Logo';

// Indicateur d'état (cahier fonctionnel §11) : En ligne / Hors ligne / Synchronisation / Erreur,
// avec le nombre d'opérations encore en attente d'envoi.
function SyncStatus() {
  const version = useData();
  const [state, setState] = useState<SyncState>(syncEngine.state);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [rejected, setRejected] = useState(0);

  useEffect(() => {
    const off = syncEngine.onSync(setState);
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      off();
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    void Promise.all([getPendingOutbox(), getRejectedOutbox()]).then(([p, r]) => {
      setPending(p.length);
      setRejected(r.length);
    });
  }, [version, state]);

  const queue =
    pending > 0 || rejected > 0 ? (
      <span className={`badge ${rejected > 0 ? 'badge-danger' : 'badge-primary'}`} title="Opérations en attente / refusées par le serveur">
        {pending} en attente{rejected > 0 ? ` · ${rejected} refusée(s)` : ''}
      </span>
    ) : null;

  if (!online) {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-warning">
        <CloudOff size={16} strokeWidth={2} />
        <span className="hidden sm:inline">Hors ligne</span>
        {queue}
      </span>
    );
  }
  if (state.phase === 'error') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-danger" title={state.message}>
        <TriangleAlert size={16} strokeWidth={2} />
        <span className="hidden sm:inline">Erreur de synchro</span>
        {queue}
      </span>
    );
  }
  if (state.phase === 'syncing') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-text-muted">
        <RefreshCw size={16} strokeWidth={2} className="animate-spin" />
        <span className="hidden sm:inline">Synchronisation…</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-success">
      <CheckCircle2 size={16} strokeWidth={2} />
      <span className="hidden sm:inline">
        En ligne{state.phase === 'ok' ? ` · sync ${formatTime(state.lastSyncAt)}` : ''}
      </span>
      {queue}
    </span>
  );
}

// Notifications : anomalies à traiter (propriétaire) + alertes de stock (tous).
function Notifications({ session }: { session: Session | null }) {
  const version = useData();
  const [anomalies, setAnomalies] = useState(0);
  const [stock, setStock] = useState(0);
  const isOwner = session?.role === 'owner';

  useEffect(() => {
    let alive = true;
    void listProducts().then((p) => alive && setStock(p.filter((x) => x.is_stockable !== false && x.quantity <= x.minimum_stock).length));
    if (isOwner) {
      fetchAnomalies({ days: 14, only_open: true })
        .then((a) => alive && setAnomalies(a.length))
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [version, isOwner]);

  const total = anomalies + stock;
  return (
    <Link
      href={isOwner && anomalies > 0 ? '/anomalies' : '/stock'}
      className="relative flex h-9 w-9 items-center justify-center rounded-field text-text-muted transition hover:bg-[#F3F4F6]"
      title={`${anomalies} anomalie(s) à traiter · ${stock} alerte(s) de stock`}
    >
      <Bell size={18} />
      {total > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
          {total > 99 ? '99+' : total}
        </span>
      )}
    </Link>
  );
}

export default function TopBar({
  onOpenMenu,
  session,
}: {
  onOpenMenu: () => void;
  session: Session | null;
}) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-30 mb-4 -mx-4 flex items-center justify-between gap-2 border-b border-border bg-[#F7F7F8]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <button
        type="button"
        onClick={onOpenMenu}
        className="flex items-center gap-2.5 rounded-field py-1.5 pl-1 pr-3 text-left transition hover:bg-[#F3F4F6]"
        title="Ouvrir le menu"
      >
        <Menu size={22} strokeWidth={2} className="text-background" />
        <Logo variant="icon" className="h-7 w-7 rounded-md" />
        <span className="font-heading text-base font-extrabold text-background">Korise</span>
      </button>

      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <SyncStatus />
        <Notifications session={session} />
        <button
          type="button"
          className="btn-secondary !px-3 !py-2"
          onClick={() => void syncEngine.syncNow()}
          title="Synchroniser maintenant"
        >
          <RefreshCw size={16} />
        </button>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-field text-text-muted transition hover:bg-[#F3F4F6]"
          onClick={() => window.dispatchEvent(new Event('korise-lock-now'))}
          title="Verrouiller la caisse"
        >
          <LockKeyhole size={18} />
        </button>
        {session && (
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-danger"
            onClick={() => {
              clearSession();
              router.replace('/login');
            }}
            title={`Déconnecter ${session.full_name}`}
          >
            <LogOut size={16} />
          </button>
        )}
      </div>
    </header>
  );
}
