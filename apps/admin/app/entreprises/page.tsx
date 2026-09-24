'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Columns3, Search } from 'lucide-react';

import { fetchBusinesses, BusinessListItem, ApiError } from '../../lib/api';
import { ago, fdate, HEALTH_LABEL, STATUS_LABEL } from '../../lib/format';
import { Badge, ErrorNote, Loading, PageHeader } from '../../components/ui';

const PAGE_SIZE = 15;

type ColKey = 'identity' | 'activity' | 'structure' | 'subscription' | 'technical' | 'health';
const COLS: { key: ColKey; label: string }[] = [
  { key: 'identity', label: 'Identité' },
  { key: 'activity', label: 'Activité' },
  { key: 'structure', label: 'Structure' },
  { key: 'subscription', label: 'Abonnement' },
  { key: 'technical', label: 'Technique' },
  { key: 'health', label: 'Santé' },
];

export default function EntreprisesPage() {
  const [items, setItems] = useState<BusinessListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [health, setHealth] = useState('');
  const [plan, setPlan] = useState('');
  const [status, setStatus] = useState('');
  const [platform, setPlatform] = useState('');
  const [page, setPage] = useState(0);
  const [cols, setCols] = useState<Record<ColKey, boolean>>({ identity: true, activity: true, structure: true, subscription: true, technical: true, health: true });
  const [showCols, setShowCols] = useState(false);

  useEffect(() => {
    fetchBusinesses()
      .then(setItems)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Erreur de chargement'))
      .finally(() => setLoading(false));
  }, []);

  const plans = useMemo(() => Array.from(new Set(items.map((i) => i.plan_name).filter(Boolean))) as string[], [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (!q || i.name.toLowerCase().includes(q) || i.business_code.toLowerCase().includes(q) || (i.owner_full_name ?? '').toLowerCase().includes(q)) &&
        (!health || i.health.value === health) &&
        (!plan || i.plan_name === plan) &&
        (!status || i.subscription_status === status) &&
        (!platform || i.platforms.includes(platform)),
    );
  }, [items, query, health, plan, status, platform]);

  useEffect(() => setPage(0), [query, health, plan, status, platform]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <>
      <PageHeader title="Entreprises" sub={`${filtered.length} sur ${items.length} entreprise(s) — filtre, recherche et diagnostic.`} />
      <ErrorNote error={error} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input className="field-input !py-2 pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, code, propriétaire…" />
        </div>
        <select className="field-input !w-auto !py-2" value={health} onChange={(e) => setHealth(e.target.value)}>
          <option value="">Toute santé</option>
          <option value="healthy">Healthy</option>
          <option value="a_surveiller">À surveiller</option>
          <option value="a_risque">À risque</option>
        </select>
        <select className="field-input !w-auto !py-2" value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="">Tous les plans</option>
          {plans.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select className="field-input !w-auto !py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tout statut</option>
          {Object.entries(STATUS_LABEL)
            .filter(([k]) => ['trial', 'active', 'expired', 'payment_failed', 'cancelled'].includes(k))
            .map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
        </select>
        <select className="field-input !w-auto !py-2" value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="">Toute plateforme</option>
          <option value="web">Web</option>
          <option value="android">Android</option>
          <option value="windows">Windows</option>
        </select>
        <div className="relative ml-auto">
          <button type="button" className="btn-secondary !px-3 !py-2 text-sm" onClick={() => setShowCols((v) => !v)}>
            <Columns3 size={16} /> Colonnes
          </button>
          {showCols && (
            <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-card border border-border bg-surface p-2 shadow-lg">
              {COLS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 px-2 py-1 text-sm">
                  <input type="checkbox" checked={cols[c.key]} onChange={(e) => setCols({ ...cols, [c.key]: e.target.checked })} />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="data-table">
            <thead>
              <tr>
                <th>Entreprise</th>
                {cols.identity && <th>Propriétaire</th>}
                {cols.activity && <th>Activité</th>}
                {cols.structure && <th>Structure</th>}
                {cols.subscription && <th>Abonnement</th>}
                {cols.technical && <th>Technique</th>}
                {cols.health && <th>Santé</th>}
              </tr>
            </thead>
            <tbody>
              {shown.map((b) => (
                <tr key={b.id} className={b.is_suspended ? 'bg-danger/5' : ''}>
                  <td className="font-medium">
                    <Link href={`/entreprises/${b.id}`} className="text-primary hover:underline">
                      {b.name}
                    </Link>
                    <span className="block font-mono text-xs text-text-muted">
                      {b.business_code} · inscrite le {fdate(b.created_at)}
                    </span>
                    {b.is_suspended && <Badge tone="bad">Suspendue</Badge>}
                  </td>
                  {cols.identity && (
                    <td>
                      {b.owner_full_name ?? '—'}
                      {b.owner_phone && <span className="block text-xs text-text-muted">{b.owner_phone}</span>}
                    </td>
                  )}
                  {cols.activity && (
                    <td>
                      {ago(b.last_activity_at)}
                      <span className="block text-xs text-text-muted">{b.sales_7d} ventes / 7 j</span>
                    </td>
                  )}
                  {cols.structure && (
                    <td>
                      1 boutique · {b.employee_count} emp.
                      <span className="block text-xs text-text-muted">{b.device_count} appareil(s) · {b.product_count} produits</span>
                    </td>
                  )}
                  {cols.subscription && (
                    <td>
                      {b.plan_name ?? '—'}
                      <span className="block text-xs text-text-muted">
                        {b.subscription_status ? STATUS_LABEL[b.subscription_status] ?? b.subscription_status : '—'}
                        {b.subscription_ends_at ? ` · jusqu’au ${fdate(b.subscription_ends_at)}` : ''}
                      </span>
                    </td>
                  )}
                  {cols.technical && (
                    <td>
                      {b.last_sync_at ? `sync ${ago(b.last_sync_at)}` : 'jamais synchronisé'}
                      <span className="block text-xs text-text-muted">
                        {b.pending_ops} en attente · {b.errors_7d} erreur(s) 7 j{b.app_versions.length ? ` · v${b.app_versions.join(', ')}` : ''}
                      </span>
                    </td>
                  )}
                  {cols.health && (
                    <td>
                      <Badge tone={b.health.value === 'healthy' ? 'good' : b.health.value === 'a_surveiller' ? 'warn' : 'bad'}>{HEALTH_LABEL[b.health.value]}</Badge>
                      {b.health.reasons.length > 0 && <span className="mt-1 block text-xs text-text-muted">{b.health.reasons[0]}</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="p-4 text-sm text-text-muted">Aucune entreprise ne correspond.</p>}
        </div>
      )}

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm text-text-muted">
          <span>
            Page {page + 1} / {pages}
          </span>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary !px-3 !py-1.5" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft size={16} />
            </button>
            <button type="button" className="btn-secondary !px-3 !py-1.5" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
