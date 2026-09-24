'use client';

import { useEffect, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Banknote, CheckCircle2, Wallet } from 'lucide-react';

import { useData } from '../../lib/useData';
import { addMoneyMovement, getMoneyMovementsToday, MoneyKind, MoneyMovementRow } from '../../lib/repo';
import { formatFcfa, formatTime } from '../../lib/format';
import { MONEY_CHANNEL_LABELS, MONEY_CHANNELS, MoneyChannel } from '../../lib/config';

const KINDS: { key: MoneyKind; label: string; icon: React.ReactNode; hint: string }[] = [
  { key: 'income', label: 'Entrée', icon: <ArrowUpCircle size={18} />, hint: 'ex. apport personnel, remboursement' },
  { key: 'expense', label: 'Dépense', icon: <ArrowDownCircle size={18} />, hint: 'ex. achat de sachets, transport' },
  { key: 'withdrawal', label: 'Retrait', icon: <Wallet size={18} />, hint: 'ex. retrait du patron pour lui-même' },
];

const EXPENSE_CATEGORIES = ['Fournisseur', 'Transport', 'Loyer', 'Salaire', 'Électricité / eau', 'Autre'];

export default function ArgentPage() {
  const version = useData();
  const [kind, setKind] = useState<MoneyKind>('expense');
  const [channel, setChannel] = useState<MoneyChannel>('cash');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [today, setToday] = useState<MoneyMovementRow[]>([]);

  const reload = () =>
    void getMoneyMovementsToday().then((rows) => setToday(rows.filter((r) => r.type !== 'sale')));

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const n = Math.round(Number(amount));
  const valid = Number.isFinite(n) && n > 0;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    const row = await addMoneyMovement(kind, n, reason.trim() || null, channel, null, kind === 'expense' ? category : null);
    setBusy(false);
    if (row) {
      setAmount('');
      setReason('');
      setCategory(null);
      reload();
      const label = KINDS.find((k) => k.key === kind)!.label;
      setFlash(`${label} enregistrée : ${formatFcfa(n)}`);
      window.setTimeout(() => setFlash(null), 4000);
    }
  };

  const totals = KINDS.reduce<Record<MoneyKind, number>>(
    (acc, k) => {
      acc[k.key] = today.filter((r) => r.type === k.key).reduce((a, r) => a + Math.abs(r.amount), 0);
      return acc;
    },
    { income: 0, expense: 0, withdrawal: 0 },
  );
  const netByChannel = {
    cash: today.filter((r) => r.channel !== 'mobile_money' && r.channel !== 'orange_money').reduce((a, r) => a + r.amount, 0),
    momo: today.filter((r) => r.channel === 'mobile_money').reduce((a, r) => a + r.amount, 0),
    orange: today.filter((r) => r.channel === 'orange_money').reduce((a, r) => a + r.amount, 0),
  };

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-background">Argent</h1>
        <p className="text-sm text-text-muted">
          Entrée, dépense ou retrait — hors ventes, qui alimentent la caisse automatiquement.
        </p>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <div className="kpi-card">
          <span className="kpi-label">Entrées</span>
          <div className="kpi-value text-success">{formatFcfa(totals.income)}</div>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Dépenses</span>
          <div className="kpi-value text-danger">{formatFcfa(totals.expense)}</div>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Retraits</span>
          <div className="kpi-value text-danger">{formatFcfa(totals.withdrawal)}</div>
        </div>
      </div>

      <p className="mb-5 text-sm text-text-muted">
        Net du jour — cash {formatFcfa(netByChannel.cash)} · Mobile Money {formatFcfa(netByChannel.momo)} · Orange
        Money {formatFcfa(netByChannel.orange)}
      </p>

      {flash && (
        <div className="mb-5 flex items-center gap-2 rounded-field bg-success px-3 py-3 text-sm font-medium text-white">
          <CheckCircle2 size={18} /> {flash}
        </div>
      )}

      <div className="kpi-card">
        <div className="mb-4 inline-flex overflow-hidden rounded-field border border-border">
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold ${
                kind === k.key ? 'bg-background text-white' : 'text-text-muted'
              }`}
              onClick={() => setKind(k.key)}
            >
              {k.icon} {k.label}
            </button>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-4">
          <div>
            <p className="field-label">Canal</p>
            <div className="inline-flex overflow-hidden rounded-field border border-border">
              {MONEY_CHANNELS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  className={`px-3 py-2 text-sm font-semibold ${channel === ch ? 'bg-background text-white' : 'text-text-muted'}`}
                  onClick={() => setChannel(ch)}
                >
                  {MONEY_CHANNEL_LABELS[ch]}
                </button>
              ))}
            </div>
          </div>
          <div className="text-sm text-text-muted">
            {channel === 'cash'
              ? 'Espèces physiques : entrent dans la caisse.'
              : `L’argent ne touche pas la caisse physique — il rejoint le compte ${MONEY_CHANNEL_LABELS[channel]}.`}
          </div>
        </div>

        {kind === 'expense' && (
          <div className="mb-4">
            <p className="field-label">Catégorie</p>
            <div className="flex flex-wrap gap-2">
              {EXPENSE_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    category === c ? 'border-background bg-background text-white' : 'border-border text-text-muted'
                  }`}
                  onClick={() => setCategory(category === c ? null : c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="field-label" htmlFor="amount">Montant (FCFA)</label>
        <input
          id="amount"
          className="field-input"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="ex. 2000"
        />

        <label className="mt-3 field-label" htmlFor="reason">Motif</label>
        <input
          id="reason"
          className="field-input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={KINDS.find((k) => k.key === kind)?.hint}
        />

        <button type="button" className="btn-accent mt-4 w-full" disabled={busy || !valid} onClick={() => void submit()}>
          <Banknote size={18} /> Enregistrer (hors-ligne)
        </button>
      </div>

      <h2 className="mb-2 mt-6 font-heading text-base font-bold text-background">Mouvements du jour</h2>
      {today.length === 0 ? (
        <p className="text-sm text-text-muted">Aucun mouvement manuel aujourd&rsquo;hui.</p>
      ) : (
        <div className="space-y-2">
          {today
            .slice()
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map((m) => (
              <div key={m.id} className="kpi-card flex items-center justify-between gap-3">
                <div>
                  <strong className="text-sm">{KINDS.find((k) => k.key === m.type)?.label ?? m.type}</strong>
                  {(m.category || m.reason) && (
                    <p className="text-xs text-text-muted">
                      {m.category ? `${m.category}${m.reason ? ' — ' : ''}` : ''}
                      {m.reason}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <div className={`font-heading text-base font-bold ${m.amount >= 0 ? 'text-success' : 'text-danger'}`}>
                    {m.amount >= 0 ? '+' : ''}
                    {formatFcfa(m.amount)}
                  </div>
                  <div className="text-xs text-text-muted">{formatTime(m.created_at)}</div>
                </div>
              </div>
            ))}
        </div>
      )}
    </>
  );
}
