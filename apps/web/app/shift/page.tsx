'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, PlayCircle, StopCircle } from 'lucide-react';

import { useData } from '../../lib/useData';
import {
  closeShift,
  getOpenShift,
  openShift,
  ShiftRow,
} from '../../lib/repo';
import { getAll } from '../../lib/db';
import { fetchShifts, ShiftApi } from '../../lib/api';
import { syncEngine } from '../../lib/sync';
import { getSession } from '../../lib/session';
import { formatDateTime, formatFcfa } from '../../lib/format';
import type { MoneyMovementRow, SaleRow, OutboxRow } from '../../lib/repo';

// Ce que le shift doit contenir en espèces : fond de caisse + flux espèces de cet employé depuis
// l'ouverture (mouvements déjà connus + ventes encore en outbox). Le serveur recalcule la même
// chose à la clôture ; ici c'est l'aperçu hors-ligne.
async function localExpectedCash(shift: ShiftRow): Promise<{ expected: number; sales: number; salesTotal: number }> {
  const userId = shift.user_id;
  const [movements, sales, outbox] = await Promise.all([
    getAll<MoneyMovementRow>('money_movements'),
    getAll<SaleRow>('sales'),
    getAll<OutboxRow>('outbox'),
  ]);
  let flow = 0;
  for (const m of movements) {
    if (m.user_id !== userId || m.created_at < shift.opened_at) continue;
    if (m.channel === 'mobile_money' || m.channel === 'orange_money') continue;
    flow += m.amount;
  }
  const pending = new Set(outbox.filter((o) => o.kind === 'sale' && o.status === 'pending').map((o) => o.id));
  let count = 0;
  let total = 0;
  for (const s of sales) {
    if (s.user_id !== userId || s.created_at < shift.opened_at) continue;
    count += 1;
    total += s.total_amount;
    if (pending.has(s.id) && s.payment_method === 'cash') flow += s.total_amount;
  }
  return { expected: shift.opening_cash + flow, sales: count, salesTotal: total };
}

export default function ShiftPage() {
  const version = useData();
  const isOwner = getSession()?.role === 'owner';
  const [open, setOpen] = useState<ShiftRow | null>(null);
  const [preview, setPreview] = useState<{ expected: number; sales: number; salesTotal: number } | null>(null);
  const [history, setHistory] = useState<ShiftApi[]>([]);
  const [opening, setOpening] = useState('');
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  const reload = async () => {
    const current = await getOpenShift();
    setOpen(current);
    setPreview(current ? await localExpectedCash(current) : null);
    try {
      setHistory(await fetchShifts(30));
    } catch {
      setHistory([]);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const openNum = Math.round(Number(opening));
  const countedNum = Math.round(Number(counted));
  const countedValid = counted.trim() !== '' && Number.isFinite(countedNum) && countedNum >= 0;

  const doOpen = async () => {
    if (opening.trim() === '' || !Number.isFinite(openNum) || openNum < 0) return;
    await openShift(openNum);
    setOpening('');
    setFlash('Shift ouvert — toutes tes opérations lui sont rattachées.');
    void syncEngine.syncNow();
    await reload();
  };

  const doClose = async () => {
    if (!countedValid) return;
    await closeShift(countedNum, note.trim() || null);
    setCounted('');
    setNote('');
    setFlash('Shift clôturé — l’écart éventuel apparaît dans le centre d’anomalies.');
    void syncEngine.syncNow();
    await reload();
  };

  const diff = preview && countedValid ? countedNum - preview.expected : null;

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-background">Mon shift</h1>
        <p className="text-sm text-text-muted">
          Ouvre ton shift avec le fond de caisse, ferme-le avec le comptage : chaque écart est attribué à la bonne personne.
        </p>
      </div>

      {flash && (
        <div className="mb-4 flex items-center gap-2 rounded-field bg-success px-3 py-3 text-sm font-medium text-white">
          <CheckCircle2 size={18} /> {flash}
        </div>
      )}

      {!open ? (
        <div className="kpi-card mb-6">
          <label className="field-label" htmlFor="opening">Fond de caisse au départ (FCFA)</label>
          <input
            id="opening"
            className="field-input"
            inputMode="numeric"
            value={opening}
            onChange={(e) => setOpening(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="ex. 10000"
          />
          <button type="button" className="btn-accent mt-4 w-full" onClick={() => void doOpen()} disabled={opening.trim() === ''}>
            <PlayCircle size={18} /> Ouvrir mon shift
          </button>
        </div>
      ) : (
        <div className="kpi-card mb-6">
          <p className="kpi-label">Shift ouvert depuis {formatDateTime(open.opened_at)}</p>
          <div className="my-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Fond de caisse" value={formatFcfa(open.opening_cash)} />
            <Stat label="Ventes du shift" value={String(preview?.sales ?? 0)} />
            <Stat label="Chiffre du shift" value={formatFcfa(preview?.salesTotal ?? 0)} />
            <Stat label="Espèces attendues" value={formatFcfa(preview?.expected ?? open.opening_cash)} />
          </div>
          <label className="field-label" htmlFor="counted">Espèces comptées à la fermeture (FCFA)</label>
          <input
            id="counted"
            className="field-input"
            inputMode="numeric"
            value={counted}
            onChange={(e) => setCounted(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="ex. 24500"
          />
          {diff !== null && (
            <p className={`mt-3 font-heading text-lg font-bold ${diff === 0 ? 'text-success' : diff > 0 ? 'text-primary' : 'text-danger'}`}>
              Écart : {diff > 0 ? '+' : ''}
              {formatFcfa(diff)} ({diff === 0 ? 'caisse exacte' : diff > 0 ? 'excédent' : 'manquant'})
            </p>
          )}
          <input className="field-input mt-3" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Commentaire (optionnel)" />
          <button type="button" className="btn-accent mt-4 w-full" onClick={() => void doClose()} disabled={!countedValid}>
            <StopCircle size={18} /> Clôturer mon shift
          </button>
        </div>
      )}

      <h2 className="mb-2 font-heading text-base font-bold text-background">
        {isOwner ? 'Shifts de l’équipe' : 'Mes derniers shifts'}
      </h2>
      {history.length === 0 ? (
        <p className="text-sm text-text-muted">Aucun shift enregistré (connexion requise pour l’historique serveur).</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border">
          <table className="w-full text-sm">
            <thead className="bg-[#FAFAFA] text-text-muted">
              <tr>
                {isOwner && <th className="px-3 py-2 text-left font-semibold">Employé</th>}
                <th className="px-3 py-2 text-left font-semibold">Ouverture</th>
                <th className="px-3 py-2 text-left font-semibold">Fermeture</th>
                <th className="px-3 py-2 text-right font-semibold">Fond</th>
                <th className="px-3 py-2 text-right font-semibold">Ventes</th>
                <th className="px-3 py-2 text-right font-semibold">Écart</th>
              </tr>
            </thead>
            <tbody>
              {history.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  {isOwner && <td className="px-3 py-2">{s.user_name ?? '—'}</td>}
                  <td className="whitespace-nowrap px-3 py-2 text-text-muted">{formatDateTime(s.opened_at)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-text-muted">{s.closed_at ? formatDateTime(s.closed_at) : 'en cours'}</td>
                  <td className="px-3 py-2 text-right">{formatFcfa(s.opening_cash)}</td>
                  <td className="px-3 py-2 text-right">{formatFcfa(s.sales_total)}</td>
                  <td
                    className={`px-3 py-2 text-right font-semibold ${
                      s.difference == null ? 'text-text-muted' : s.difference === 0 ? 'text-success' : s.difference > 0 ? 'text-primary' : 'text-danger'
                    }`}
                  >
                    {s.difference == null ? '—' : `${s.difference > 0 ? '+' : ''}${formatFcfa(s.difference)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-field border border-border p-3">
      <p className="field-label !mb-1">{label}</p>
      <p className="font-heading text-lg font-extrabold">{value}</p>
    </div>
  );
}
