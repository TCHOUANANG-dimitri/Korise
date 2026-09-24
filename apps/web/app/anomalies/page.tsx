'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, FileText, ShieldAlert } from 'lucide-react';

import { useData } from '../../lib/useData';
import {
  fetchAnomalies,
  fetchAnomalyOperations,
  openPdf,
  resolveAnomaly,
  AnomalyApi,
  RelatedOperationApi,
} from '../../lib/api';
import { channelLabel, formatDate, formatDateTime, formatFcfa } from '../../lib/format';
import { getSession } from '../../lib/session';

const KIND_LABEL: Record<AnomalyApi['kind'], string> = {
  closing_gap: 'Clôture',
  shift_gap: 'Shift',
  stock_adjustment: 'Stock',
  price_deviation: 'Prix',
};

function amountText(a: AnomalyApi): string {
  if (a.amount == null) return '';
  if (a.kind === 'stock_adjustment') return `${a.amount} unité(s)`;
  return `${a.amount > 0 ? '+' : ''}${formatFcfa(a.amount)}`;
}

export default function AnomaliesPage() {
  const version = useData();
  const isOwner = getSession()?.role === 'owner';
  const [items, setItems] = useState<AnomalyApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [ops, setOps] = useState<RelatedOperationApi[] | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAnomalies({ days, only_open: onlyOpen })
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Chargement impossible (connexion requise)'))
      .finally(() => setLoading(false));
  }, [days, onlyOpen]);

  useEffect(() => {
    if (isOwner) load();
  }, [load, version, isOwner]);

  if (!isOwner) {
    return (
      <div className="mt-4 flex items-start gap-2 rounded-field border border-border bg-surface px-3 py-3 text-sm text-text-muted">
        <ShieldAlert size={18} className="mt-0.5 shrink-0" />
        <span>Le centre d’anomalies est réservé au propriétaire.</span>
      </div>
    );
  }

  const keyOf = (a: AnomalyApi) => `${a.kind}:${a.source_id}`;

  const toggleOps = async (a: AnomalyApi) => {
    const k = keyOf(a);
    if (openKey === k) {
      setOpenKey(null);
      return;
    }
    setOpenKey(k);
    setOps(null);
    try {
      setOps(await fetchAnomalyOperations(a.kind, a.source_id));
    } catch {
      setOps([]);
    }
  };

  const resolve = async (a: AnomalyApi) => {
    await resolveAnomaly(a.kind, a.source_id, note.trim() || null);
    setNoteFor(null);
    setNote('');
    load();
  };

  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      await openPdf(`/reports/anomalies.pdf?days=${days}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF indisponible');
    } finally {
      setPdfBusy(false);
    }
  };

  const openCount = items.filter((i) => i.status === 'open').length;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-background">Centre d’anomalies</h1>
          <p className="text-sm text-text-muted">
            Qu’est-ce qui nécessite ton attention ? Écarts de caisse, ajustements sans motif, prix inhabituels.
          </p>
        </div>
        <button type="button" className="btn-secondary !px-3 !py-2" onClick={() => void downloadPdf()} disabled={pdfBusy}>
          <FileText size={16} /> {pdfBusy ? 'Génération…' : 'Rapport PDF'}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex overflow-hidden rounded-field border border-border">
          {[7, 14, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              className={`px-3 py-2 text-sm font-semibold ${days === d ? 'bg-background text-white' : 'text-text-muted'}`}
              onClick={() => setDays(d)}
            >
              {d} j
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-text-muted">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />À traiter seulement
        </label>
        <span className="text-sm text-text-muted">{openCount} à traiter</span>
      </div>

      {error && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}

      {loading ? (
        <p className="text-sm text-text-muted">Chargement…</p>
      ) : items.length === 0 ? (
        <div className="kpi-card flex items-center gap-2 text-sm text-success">
          <CheckCircle2 size={18} /> Aucune anomalie sur la période. Les chiffres et le réel correspondent.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((a) => {
            const k = keyOf(a);
            const expanded = openKey === k;
            return (
              <div key={k} className="kpi-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className={`badge ${a.status === 'open' ? 'badge-danger' : 'badge-success'}`}>
                        {a.status === 'open' ? 'À traiter' : 'Résolue'}
                      </span>
                      <span className="badge badge-primary">{KIND_LABEL[a.kind]}</span>
                      <span className="text-xs text-text-muted">{formatDate(a.date)}</span>
                    </div>
                    <strong className="block text-base">{a.label}</strong>
                    {a.detail && <p className="mt-1 text-sm text-text-muted">{a.detail}</p>}
                    {a.probable_cause && (
                      <p className="mt-1 flex items-start gap-1.5 text-sm">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
                        <span>
                          <span className="font-semibold">Cause probable :</span> {a.probable_cause}
                        </span>
                      </p>
                    )}
                    {a.user_name && <p className="mt-1 text-xs text-text-muted">Utilisateur : {a.user_name}</p>}
                    {a.resolution_note && <p className="mt-1 text-xs text-text-muted">Note : {a.resolution_note}</p>}
                  </div>
                  <div className="text-right">
                    <div className={`font-heading text-xl font-extrabold ${(a.amount ?? 0) < 0 ? 'text-danger' : 'text-primary'}`}>
                      {amountText(a)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary !px-3 !py-1.5 text-sm" onClick={() => void toggleOps(a)}>
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />} Opérations liées
                  </button>
                  {a.status === 'open' && noteFor !== k && (
                    <button type="button" className="btn-accent !px-3 !py-1.5 text-sm" onClick={() => setNoteFor(k)}>
                      Marquer comme résolue
                    </button>
                  )}
                </div>

                {noteFor === k && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      className="field-input flex-1"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Explication (optionnel) : ex. dépense fournisseur non saisie"
                      autoFocus
                    />
                    <button type="button" className="btn-accent !px-3 !py-2" onClick={() => void resolve(a)}>
                      Valider
                    </button>
                    <button type="button" className="btn-secondary !px-3 !py-2" onClick={() => setNoteFor(null)}>
                      Annuler
                    </button>
                  </div>
                )}

                {expanded && (
                  <div className="mt-3 overflow-hidden rounded-field border border-border">
                    {ops === null ? (
                      <p className="p-3 text-sm text-text-muted">Chargement…</p>
                    ) : ops.length === 0 ? (
                      <p className="p-3 text-sm text-text-muted">Aucune opération trouvée.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-[#FAFAFA] text-text-muted">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold">Quand</th>
                            <th className="px-3 py-2 text-left font-semibold">Opération</th>
                            <th className="px-3 py-2 text-left font-semibold">Par</th>
                            <th className="px-3 py-2 text-right font-semibold">Montant</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ops.map((o, i) => (
                            <tr key={i} className="border-t border-border">
                              <td className="whitespace-nowrap px-3 py-2 text-text-muted">{formatDateTime(o.at)}</td>
                              <td className="px-3 py-2">
                                {o.label}
                                {o.channel && <span className="ml-1 text-xs text-text-muted">({channelLabel(o.channel)})</span>}
                              </td>
                              <td className="px-3 py-2 text-text-muted">{o.user_name ?? '—'}</td>
                              <td className={`px-3 py-2 text-right font-semibold ${(o.amount ?? 0) < 0 ? 'text-danger' : ''}`}>
                                {o.amount == null ? '' : a.kind === 'stock_adjustment' ? o.amount : formatFcfa(o.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
