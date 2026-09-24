'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  CreditCard,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  Smartphone,
  X,
  type LucideIcon,
} from 'lucide-react';

import { clearAdminSession, getAdminSession, AdminSession } from '../../lib/session';
import { fetchAlerts, searchBusinesses, Alert, SearchHit } from '../../lib/api';
import { ROLE_LABEL } from '../../lib/format';
import { AlertRow } from '../../components/ui';

type Role = AdminSession['role'];

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
}

const ALL: Role[] = ['owner', 'product_manager', 'support', 'developer'];

// Principe du moindre privilège (cahier Super Admin §16) : chaque rôle ne voit que ses sections.
const NAV: NavItem[] = [
  { href: '/', label: 'Overview', icon: LayoutDashboard, roles: ALL },
  { href: '/entreprises', label: 'Entreprises', icon: Building2, roles: ALL },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, roles: ['owner', 'product_manager'] },
  { href: '/monitoring', label: 'Monitoring', icon: Activity, roles: ['owner', 'developer', 'support'] },
  { href: '/devices', label: 'Devices & Versions', icon: Smartphone, roles: ['owner', 'developer', 'support'] },
  { href: '/support', label: 'Support', icon: LifeBuoy, roles: ['owner', 'support'] },
  { href: '/billing', label: 'Billing', icon: CreditCard, roles: ['owner', 'product_manager'] },
  { href: '/administration', label: 'Administration', icon: ShieldCheck, roles: ['owner'] },
];

function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      searchBusinesses(q.trim())
        .then(setHits)
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div ref={box} className="relative w-full max-w-sm">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
      <input
        className="field-input !py-2 pl-9"
        placeholder="Rechercher une entreprise (nom, code)…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-card border border-border bg-surface shadow-lg">
          {hits.length === 0 ? (
            <p className="px-3 py-2 text-sm text-text-muted">Aucun résultat.</p>
          ) : (
            hits.map((h) => (
              <button
                key={h.business_id}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-[#F3F4F6]"
                onClick={() => {
                  setOpen(false);
                  setQ('');
                  router.push(`/entreprises/${h.business_id}`);
                }}
              >
                <strong>{h.name}</strong>
                <span className="ml-2 font-mono text-xs text-text-muted">{h.business_code}</span>
                {h.owner_full_name && <span className="block text-xs text-text-muted">{h.owner_full_name}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function AlertsBell() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = () =>
      fetchAlerts()
        .then(setAlerts)
        .catch(() => undefined);
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const urgent = alerts.filter((a) => a.severity !== 'info').length;
  return (
    <div ref={box} className="relative">
      <button type="button" className="relative flex h-9 w-9 items-center justify-center rounded-field hover:bg-[#F3F4F6]" onClick={() => setOpen((v) => !v)} title="Alertes">
        <Bell size={18} />
        {urgent > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {urgent}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 max-h-96 w-80 overflow-y-auto rounded-card border border-border bg-surface shadow-lg">
          {alerts.length === 0 ? <p className="px-3 py-3 text-sm text-text-muted">Aucune alerte.</p> : alerts.map((a, i) => <AlertRow key={i} alert={a} />)}
        </div>
      )}
    </div>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const sync = () => setSession(getAdminSession());
    sync();
    window.addEventListener('korise-admin-session-changed', sync);
    return () => window.removeEventListener('korise-admin-session-changed', sync);
  }, []);

  useEffect(() => setMenu(false), [pathname]);

  if (pathname === '/login' || !session) return <>{children}</>;

  const nav = NAV.filter((n) => n.roles.includes(session.role));
  const env = session.environment ?? 'development';

  const logout = () => {
    clearAdminSession();
    router.replace('/login');
  };

  const sidebar = (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="border-b border-border px-5 py-5">
        <p className="font-heading text-lg font-extrabold text-background">Korise</p>
        <p className="text-xs text-text-muted">Super Admin</p>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {nav.map((l) => {
          const Icon = l.icon;
          const active = pathname === l.href || (l.href !== '/' && pathname.startsWith(l.href));
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-2 rounded-field px-3 py-2 text-sm font-medium ${active ? 'bg-background text-white' : 'text-text hover:bg-[#F3F4F6]'}`}
            >
              <Icon size={18} /> {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
        <p className="truncate px-1 text-xs font-semibold text-text">{session.full_name}</p>
        <p className="truncate px-1 text-xs text-text-muted">
          {ROLE_LABEL[session.role]} · {session.email}
        </p>
        <button type="button" onClick={logout} className="btn-secondary mt-2 w-full !py-2 text-sm">
          <LogOut size={16} /> Déconnexion
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen">
      <div className="hidden lg:block">{sidebar}</div>
      {menu && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="h-full">{sidebar}</div>
          <button type="button" className="flex-1 bg-black/40" onClick={() => setMenu(false)} aria-label="Fermer le menu" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-[#F7F7F8]/95 px-4 py-2.5 backdrop-blur">
          <button type="button" className="lg:hidden" onClick={() => setMenu(true)} aria-label="Menu">
            {menu ? <X size={20} /> : <Menu size={20} />}
          </button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-3">
            <span
              className={`badge ${env === 'production' ? 'badge-risk' : 'badge-info'}`}
              title="Environnement connecté"
            >
              {env === 'production' ? 'PRODUCTION' : env.toUpperCase()}
            </span>
            <AlertsBell />
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
