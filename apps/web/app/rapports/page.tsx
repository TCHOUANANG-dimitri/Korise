'use client';

import { useCallback, useEffect, useState } from 'react';
import { BarChart3, FileText, Lock } from 'lucide-react';

import { useData } from '../../lib/useData';
import {
  fetchReportSummary,
  listEmployees,
  openPdf,
  EmployeeApi,
  ReportBucket,
  ReportSummaryApi,
} from '../../lib/api';
import { listProducts, ProductRow } from '../../lib/repo';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from '../../lib/config';
import { formatFcfa, localDateKey } from '../../lib/format';
import { getSession } from '../../lib/session';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateKey(d);
}

const PRESETS = [
  { label: 'Aujourd’hui', from: () => daysAgo(0) },
  { label: '7 jours', from: () => daysAgo(6) },
  { label: '30 jours', from: () => daysAgo(29) },
];

export default function ReportsPage() {
  const version = useData();
  const session = getSession();
  const canView = !!session && (session.role === 'owner' || session.can_view_owner_dashboard);
  const isOwner = session?.role === 'owner';

  const [dateFrom, setDateFrom] = useState(daysAgo(6));
  const [dateTo, setDateTo] = useState(daysAgo(0));
  const [userId, setUserId] = useState('');
  const [productId, setProductId] = useState('');
  const [payment, setPayment] = useState('');
  const [employees, setEmployees] = useState<EmployeeApi[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [data, setData] = useState<ReportSummaryApi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);

  useEffect(() => {
    void listProducts().then(setProducts);
    if (isOwner) void listEmployees().then(setEmployees).catch(() => undefined);
  }, [version, isOwner]);

  const load = useCallback(() => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    fetchReportSummary({ date_from: dateFrom, date_to: dateTo, user_id: userId, product_id: productId, payment_method: payment })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Rapport indisponible (connexion requise)'))
      .finally(() => setLoading(false));
  }, [canView, dateFrom, dateTo, userId, productId, payment]);

  useEffect(() => {
    load();
  }, [load]);

  const pdf = async (key: string, path: string) => {
    setPdfBusy(key);
    setError(null);
    try {
      await openPdf(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF indisponible');
    } finally {
      setPdfBusy(null);
    }
  };

  if (!canView) {
    return (
      <div className="mt-4 flex items-start gap-2 rounded-field border border-border bg-surface px-3 py-3 text-sm text-text-muted">
        <Lock size={18} className="mt-0.5 shrink-0" />
        <span>Les rapports demandent l’accès au tableau de bord (permission à donner par le propriétaire).</span>
      </div>
    );
  }

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-background">Rapports</h1>
        <p className="text-sm text-text-muted">Ventes, paiements, dépenses, crédits — par période, employé, produit, moyen de paiement.</p>
      </div>

      <div className="kpi-card mb-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="btn-secondary !px-3 !py-1.5 text-sm"
              onClick={() => {
                setDateFrom(p.from());
                setDateTo(daysAgo(0));
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div>
            <label className="field-label" htmlFor="df">Du</label>
            <input id="df" type="date" className="field-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="dt">Au</label>
            <input id="dt" type="date" className="field-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          {isOwner && (
            <div>
              <label className="field-label" htmlFor="emp">Employé</label>
              <select id="emp" className="field-input" value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">Tous</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.full_name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="field-label" htmlFor="prod">Produit</label>
            <select id="prod" className="field-input" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Tous</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="pay">Paiement</label>
            <select id="pay" className="field-input" value={payment} onChange={(e) => setPayment(e.target.value)}>
              <option value="">Tous</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <button type="button" className="btn-secondary !px-3 !py-2" disabled={pdfBusy !== null} onClick={() => void pdf('daily', `/reports/daily.pdf?day=${dateTo}`)}>
          <FileText size={16} /> {pdfBusy === 'daily' ? 'Génération…' : `Rapport journalier (${dateTo})`}
        </button>
        <button type="button" className="btn-secondary !px-3 !py-2" disabled={pdfBusy !== null} onClick={() => void pdf('stock', '/reports/stock.pdf')}>
          <FileText size={16} /> {pdfBusy === 'stock' ? 'Génération…' : 'Rapport de stock'}
        </button>
        {isOwner && (
          <>
            <button
              type="button"
              className="btn-secondary !px-3 !py-2"
              disabled={pdfBusy !== null || !userId}
              title={userId ? '' : 'Choisis un employé'}
              onClick={() => void pdf('emp', `/reports/employee.pdf?user_id=${userId}&date_from=${dateFrom}&date_to=${dateTo}`)}
            >
              <FileText size={16} /> {pdfBusy === 'emp' ? 'Génération…' : 'Rapport employé'}
            </button>
            <button type="button" className="btn-secondary !px-3 !py-2" disabled={pdfBusy !== null} onClick={() => void pdf('anom', '/reports/anomalies.pdf?days=30')}>
              <FileText size={16} /> {pdfBusy === 'anom' ? 'Génération…' : 'Rapport anomalies'}
            </button>
          </>
        )}
      </div>

      {error && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}
      {loading && !data && <p className="text-sm text-text-muted">Chargement…</p>}

      {data && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Chiffre d’affaires" value={formatFcfa(data.sales_total)} sub={`${data.sales_count} vente(s)`} />
            <Kpi label="Dépenses" value={formatFcfa(data.expenses_total)} tone="danger" sub={`Retraits ${formatFcfa(data.withdrawals_total)}`} />
            <Kpi label="Crédits accordés" value={formatFcfa(data.credit_granted)} sub={`Remboursés ${formatFcfa(data.credit_repayments_total)}`} />
            <Kpi label="Dettes clients en cours" value={formatFcfa(data.credit_outstanding)} tone={data.credit_outstanding > 0 ? 'danger' : undefined} />
          </div>
          {data.estimated_profit !== null && (
            <p className="mb-5 flex items-center gap-2 text-sm">
              <BarChart3 size={16} className="text-text-muted" />
              Bénéfice estimé (ventes − coût d’achat − dépenses) :{' '}
              <strong className={data.estimated_profit < 0 ? 'text-danger' : 'text-success'}>{formatFcfa(data.estimated_profit)}</strong>
            </p>
          )}

          <Breakdown title="Par moyen de paiement" rows={data.by_payment} label={(k) => PAYMENT_METHOD_LABELS[k as keyof typeof PAYMENT_METHOD_LABELS] ?? k} />
          <Breakdown title="Par produit" rows={data.by_product} label={(k) => k} showQty />
          {isOwner && <Breakdown title="Par employé" rows={data.by_employee} label={(k) => k} />}
          {data.expenses_by_category.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-2 font-heading text-base font-bold text-background">Dépenses par catégorie</h2>
              <div className="overflow-hidden rounded-card border border-border">
                <table className="w-full text-sm">
                  <tbody>
                    {data.expenses_by_category.map((e) => (
                      <tr key={e.key} className="border-t border-border first:border-t-0">
                        <td className="px-3 py-2">{e.key}</td>
                        <td className="px-3 py-2 text-right font-semibold">{formatFcfa(e.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'danger' }) {
  return (
    <div className="kpi-card">
      <span className="kpi-label">{label}</span>
      <div className={`kpi-value ${tone === 'danger' ? 'text-danger' : ''}`}>{value}</div>
      {sub && <p className="mt-1 text-xs text-text-muted">{sub}</p>}
    </div>
  );
}

function Breakdown({
  title,
  rows,
  label,
  showQty,
}: {
  title: string;
  rows: ReportBucket[];
  label: (key: string) => string;
  showQty?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mb-6">
      <h2 className="mb-2 font-heading text-base font-bold text-background">{title}</h2>
      <div className="overflow-hidden rounded-card border border-border">
        <table className="w-full text-sm">
          <thead className="bg-[#FAFAFA] text-text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">&nbsp;</th>
              <th className="px-3 py-2 text-right font-semibold">Ventes</th>
              {showQty && <th className="px-3 py-2 text-right font-semibold">Unités</th>}
              <th className="px-3 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-border">
                <td className="px-3 py-2">{label(r.key)}</td>
                <td className="px-3 py-2 text-right">{r.count}</td>
                {showQty && <td className="px-3 py-2 text-right">{r.quantity}</td>}
                <td className="px-3 py-2 text-right font-semibold">{formatFcfa(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
