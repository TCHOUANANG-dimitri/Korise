'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Banknote, HandCoins, PackageSearch, PiggyBank, ReceiptText, ShieldAlert, TrendingUp, Users } from 'lucide-react';

import { useData } from '../lib/useData';
import {
  getCashTotal,
  getExpectedCashForDateLocal,
  getLastClosings,
  getMoneyMovementsToday,
  getPendingOutbox,
  getRejectedOutbox,
  getSalesToday,
  listProducts,
  DailyClosingRow,
  MoneyMovementRow,
  OutboxRow,
  ProductRow,
  SaleRow,
} from '../lib/repo';
import { fetchAnomalies, fetchDashboard, fetchReportSummary, DashboardApi, ReportSummaryApi } from '../lib/api';
import { getSession } from '../lib/session';
import { formatDate, formatFcfa, todayKey } from '../lib/format';
import { isTauri } from '../lib/platform';

interface LocalFallback {
  products: ProductRow[];
  sales: SaleRow[];
  movements: MoneyMovementRow[];
  cash: number;
  expectedCash: number;
  closings: DailyClosingRow[];
}

async function loadLocalFallback(): Promise<LocalFallback> {
  const [products, sales, movements, cash, expectedCash, closings] = await Promise.all([
    listProducts(),
    getSalesToday(),
    getMoneyMovementsToday(),
    getCashTotal(),
    getExpectedCashForDateLocal(todayKey()),
    getLastClosings(5),
  ]);
  return { products, sales, movements, cash, expectedCash, closings };
}

export default function HomePage() {
  const version = useData();
  const [remote, setRemote] = useState<DashboardApi | null>(null);
  const [local, setLocal] = useState<LocalFallback | null>(null);
  const [pending, setPending] = useState<OutboxRow[]>([]);
  const [rejected, setRejected] = useState<OutboxRow[]>([]);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [pendingRows, rejectedRows] = await Promise.all([getPendingOutbox(), getRejectedOutbox()]);
      if (!alive) return;
      setPending(pendingRows);
      setRejected(rejectedRows);

      try {
        const dashboard = await fetchDashboard(todayKey());
        if (!alive) return;
        setRemote(dashboard);
        setOffline(false);
      } catch {
        if (!alive) return;
        setOffline(true);
        setLocal(await loadLocalFallback());
      }
    })();
    return () => {
      alive = false;
    };
  }, [version]);

  if (!remote && !local) {
    return <p className="text-sm text-text-muted">Chargement…</p>;
  }

  const salesToday = remote ? remote.sales_total : local!.sales.reduce((a, s) => a + s.total_amount, 0);
  const expectedCash = remote ? remote.expected_cash : local!.expectedCash;
  const stockAlertCount = remote
    ? remote.stock_alerts.length
    : local!.products.filter((p) => p.quantity <= p.minimum_stock).length;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-background">Aujourd&rsquo;hui — {formatDate(new Date().toISOString())}</h1>
        <p className="text-sm text-text-muted">
          Est-ce que l&rsquo;argent et le stock correspondent à ce qu&rsquo;il devrait y avoir ?
        </p>
        {offline && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-warning">
            <AlertTriangle size={14} /> Hors-ligne — vue calculée localement, en attente de synchronisation.
          </p>
        )}
      </div>

      {isTauri() && (
        // Bandeau "aperçu rapide" desktop uniquement (poste toujours allumé en
        // arrière-boutique, voir opencode.md §4.2). Ne remplace rien : le
        // dashboard complet reste en dessous, identique au web classique.
        <div className="mb-5 kpi-card">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-text-muted">Aperçu rapide</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <span className="kpi-label">Ventes du jour</span>
              <div className="kpi-value">{formatFcfa(salesToday)}</div>
            </div>
            <div>
              <span className="kpi-label">Caisse attendue</span>
              <div className="kpi-value">{formatFcfa(expectedCash)}</div>
            </div>
            <div>
              <span className="kpi-label">Alertes stock</span>
              <div className={`kpi-value ${stockAlertCount > 0 ? 'text-danger' : 'text-success'}`}>{stockAlertCount}</div>
            </div>
          </div>
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          icon={<TrendingUp size={18} />}
          label="Ventes du jour"
          value={formatFcfa(remote ? remote.sales_total : local!.sales.reduce((a, s) => a + s.total_amount, 0))}
        />
        <KpiCard
          icon={<ReceiptText size={18} />}
          label="Dépenses du jour"
          value={formatFcfa(
            remote ? remote.expense_total + remote.withdrawal_total : local!.movements.filter((m) => m.amount < 0).reduce((a, m) => a + m.amount, 0),
          )}
          tone="danger"
        />
        <KpiCard
          icon={<Banknote size={18} />}
          label="Caisse attendue"
          value={formatFcfa(remote ? remote.expected_cash : local!.expectedCash)}
        />
        <KpiCard
          icon={<PackageSearch size={18} />}
          label="En attente de sync"
          value={String(pending.length)}
          tone={rejected.length > 0 ? 'danger' : undefined}
          sub={rejected.length > 0 ? `${rejected.length} refusé(s)` : undefined}
        />
      </div>

      {remote && <ControlCards />}

      <ClosingCard remote={remote} local={local} />

      <Section title="Alertes stock" icon={<AlertTriangle size={16} />}>
        {(remote ? remote.stock_alerts : local!.products.filter((p) => p.quantity <= p.minimum_stock)).length === 0 ? (
          <EmptyState label="Aucune alerte. Tout le stock est au-dessus des seuils." />
        ) : (
          <div className="space-y-2">
            {(remote
              ? remote.stock_alerts.map((a) => ({ id: a.product_id, name: a.name, quantity: a.quantity, minimum_stock: a.minimum_stock }))
              : local!.products.filter((p) => p.quantity <= p.minimum_stock)
            ).map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-field border border-warning/30 bg-warning/5 px-3 py-2 text-sm">
                <AlertTriangle size={16} className="shrink-0 text-warning" />
                <span>
                  <strong>{p.name}</strong> — plus que {p.quantity} en stock (seuil : {p.minimum_stock})
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {remote && (
        <Section title="Top produits du jour" icon={<TrendingUp size={16} />}>
          {remote.top_products.length === 0 ? (
            <EmptyState label="Aucune vente enregistrée aujourd'hui." />
          ) : (
            <DataTable
              head={['Produit', 'Unités', 'Chiffre']}
              rows={remote.top_products.map((p) => [p.name, String(p.quantity_sold), formatFcfa(p.revenue)])}
            />
          )}
        </Section>
      )}

      {remote && (
        <Section title="Activité par employé" icon={<Users size={16} />}>
          {remote.employee_activity.length === 0 ? (
            <EmptyState label="Aucune activité aujourd'hui." />
          ) : (
            <DataTable
              head={['Employé', 'Ventes', 'Montant']}
              rows={remote.employee_activity.map((a) => [a.full_name, String(a.sales_count), formatFcfa(a.sales_total)])}
            />
          )}
        </Section>
      )}
    </>
  );
}

// Couche « Contrôle » du dashboard propriétaire : dettes clients, bénéfice estimé, anomalies à traiter.
function ControlCards() {
  const isOwner = getSession()?.role === 'owner';
  const [summary, setSummary] = useState<ReportSummaryApi | null>(null);
  const [anomalies, setAnomalies] = useState<number | null>(null);

  useEffect(() => {
    const day = todayKey();
    fetchReportSummary({ date_from: day, date_to: day })
      .then(setSummary)
      .catch(() => undefined);
    if (isOwner) {
      fetchAnomalies({ days: 14, only_open: true })
        .then((a) => setAnomalies(a.length))
        .catch(() => undefined);
    }
  }, [isOwner]);

  if (!summary && anomalies === null) return null;
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {summary && (
        <KpiCard
          icon={<HandCoins size={18} />}
          label="Dettes clients"
          value={formatFcfa(summary.credit_outstanding)}
          tone={summary.credit_outstanding > 0 ? 'danger' : undefined}
        />
      )}
      {summary && summary.estimated_profit !== null && (
        <KpiCard icon={<PiggyBank size={18} />} label="Bénéfice estimé du jour" value={formatFcfa(summary.estimated_profit)} />
      )}
      {anomalies !== null && (
        <Link href="/anomalies" className="block">
          <KpiCard
            icon={<ShieldAlert size={18} />}
            label="Anomalies à traiter"
            value={String(anomalies)}
            tone={anomalies > 0 ? 'danger' : undefined}
            sub={anomalies > 0 ? 'Voir le centre d’anomalies' : undefined}
          />
        </Link>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  tone,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'danger';
  sub?: string;
}) {
  return (
    <div className="kpi-card">
      <div className="flex items-center gap-1.5 text-text-muted">
        {icon}
        <p className="kpi-label !mb-0">{label}</p>
      </div>
      <p className={`kpi-value ${tone === 'danger' ? 'text-danger' : ''}`}>{value}</p>
      {sub && <p className="badge badge-danger mt-1">{sub}</p>}
    </div>
  );
}

function ClosingCard({ remote, local }: { remote: DashboardApi | null; local: LocalFallback | null }) {
  const closing = remote?.latest_closing;
  const localClosing = local?.closings.find((c) => c.closing_date === todayKey());

  if (!closing && !localClosing) {
    return (
      <div className="kpi-card mb-5">
        <p className="kpi-label">Clôture du jour</p>
        <p className="mt-1 text-sm text-text-muted">Pas encore clôturé. Va dans l&rsquo;onglet Clôture.</p>
      </div>
    );
  }

  const actual = closing?.actual_cash ?? localClosing!.actual_cash;
  const expected = closing?.expected_cash ?? localClosing!.expected_cash;
  const difference = closing?.difference ?? localClosing!.difference;
  const note = closing?.note ?? localClosing?.note;

  return (
    <div className="kpi-card mb-5">
      <p className="kpi-label">Clôture du jour — attendue vs comptée</p>
      <p className="kpi-value">
        {formatFcfa(actual)} <span className="text-text-muted">vs</span> {formatFcfa(expected)}
      </p>
      <span className={`badge mt-2 ${difference === 0 ? 'badge-success' : difference > 0 ? 'badge-primary' : 'badge-danger'}`}>
        Écart {difference >= 0 ? '+' : ''}
        {formatFcfa(difference)}
      </span>
      {note && <p className="mt-2 text-sm text-text-muted">Note : {note}</p>}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="mb-2 flex items-center gap-1.5 font-heading text-base font-bold text-background">
        {icon}
        {title}
      </h2>
      {children}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="text-sm text-text-muted">{label}</p>;
}

function DataTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-card border border-border">
      <table className="w-full text-sm">
        <thead className="bg-[#FAFAFA] text-text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 text-left font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
