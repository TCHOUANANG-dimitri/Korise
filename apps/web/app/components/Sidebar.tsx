'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  BarChart3,
  Check,
  ClipboardCheck,
  Copy,
  HandCoins,
  Home,
  Package,
  ScrollText,
  Settings,
  ShieldAlert,
  ShoppingCart,
  Timer,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { normalizePathname } from '../../lib/pathname';
import { Session } from '../../lib/session';
import Logo from './Logo';

interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

const LINKS: NavLink[] = [
  { href: '/', label: 'Aujourd’hui', icon: Home },
  { href: '/sale', label: 'Vente', icon: ShoppingCart },
  { href: '/credits', label: 'Clients & crédits', icon: HandCoins },
  { href: '/argent', label: 'Argent', icon: Wallet },
  { href: '/stock', label: 'Stock', icon: Package },
  { href: '/shift', label: 'Mon shift', icon: Timer },
  { href: '/closing', label: 'Clôture', icon: ClipboardCheck },
];

const REPORT_LINK: NavLink = { href: '/rapports', label: 'Rapports', icon: BarChart3 };

const OWNER_LINKS: NavLink[] = [
  { href: '/anomalies', label: 'Anomalies', icon: ShieldAlert },
  { href: '/equipe', label: 'Équipe', icon: Users },
  { href: '/journal', label: 'Journal', icon: ScrollText },
];

const SETTINGS_LINK: NavLink = { href: '/parametres', label: 'Paramètres', icon: Settings };

export default function Sidebar({
  open,
  onClose,
  session,
}: {
  open: boolean;
  onClose: () => void;
  session: Session | null;
}) {
  const pathname = normalizePathname(usePathname());
  const isOwner = session?.role === 'owner';
  const canReports = isOwner || !!session?.can_view_owner_dashboard;
  const links = [
    ...LINKS,
    ...(canReports ? [REPORT_LINK] : []),
    ...(isOwner ? OWNER_LINKS : []),
    SETTINGS_LINK,
  ];

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[82vw] flex-col bg-background text-white shadow-2xl transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-hidden={!open}
      >
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-2.5 border-b border-white/10 px-5 py-5 text-left transition hover:bg-white/5"
          title="Réduire le menu"
        >
          <Logo variant="icon" className="h-9 w-9 shrink-0 rounded-lg" />
          <span className="font-heading text-lg font-extrabold text-white">Korise</span>
        </button>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {links.map((l) => {
            const active = pathname === l.href;
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-field px-3 py-2.5 text-sm font-semibold transition ${
                  active ? 'bg-accent text-background' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={20} strokeWidth={2} />
                {l.label}
              </Link>
            );
          })}
        </nav>

        {session && (
          <div className="border-t border-white/10 px-5 py-4">
            <p className="truncate text-sm font-semibold text-white">{session.full_name}</p>
            <p className="text-xs text-white/50">{session.role === 'owner' ? 'Propriétaire' : 'Employé'}</p>
            <BusinessCodeTag code={session.business_code} />
          </div>
        )}
      </aside>
    </>
  );
}

// Seul endroit permanent où retrouver le code entreprise après l'inscription
// (il n'est sinon jamais réaffiché ailleurs) — nécessaire pour connecter un
// employé ou se reconnecter sur un autre appareil.
function BusinessCodeTag({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponible — pas bloquant */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="mt-2 flex w-full items-center justify-between gap-2 rounded-field border border-white/10 bg-white/5 px-2.5 py-1.5 text-left transition hover:bg-white/10"
      title="Copier le code entreprise"
    >
      <span>
        <span className="block text-[10px] font-medium uppercase tracking-wide text-white/40">Code entreprise</span>
        <span className="font-heading text-sm font-bold tracking-wide text-accent">{code}</span>
      </span>
      {copied ? <Check size={15} className="shrink-0 text-success" /> : <Copy size={15} className="shrink-0 text-white/50" />}
    </button>
  );
}
