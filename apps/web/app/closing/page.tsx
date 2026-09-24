'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';

import { useData } from '../../lib/useData';
import {
  addDailyClosing,
  addStockMovement,
  getExpectedForDateLocal,
  getLastClosings,
  listProducts,
  DailyClosingRow,
  ProductRow,
} from '../../lib/repo';
import { syncEngine } from '../../lib/sync';
import { fetchExpectedCash } from '../../lib/api';
import { formatDate, formatFcfa, localDateKey } from '../../lib/format';

const STEPS = ['Jour', 'Caisse', 'MoMo', 'Orange Money', 'Stock', 'Motif', 'Valider'];

export default function ClosingPage() {
  const version = useData();
  const [step, setStep] = useState(0);
  const [dateKey, setDateKey] = useState(localDateKey(new Date()));
  const [expected, setExpected] = useState({ cash: 0, momo: 0, orange: 0 });
  const [expectedSource, setExpectedSource] = useState<'server' | 'local'>('local');
  const [cashCounted, setCashCounted] = useState('');
  const [momoCounted, setMomoCounted] = useState('');
  const [orangeCounted, setOrangeCounted] = useState('');
  const [note, setNote] = useState('');
  const [history, setHistory] = useState<DailyClosingRow[]>([]);
  const [saved, setSaved] = useState<{ cash: number; momo: number; orange: number } | null>(null);
  // Rapprochement stock : uniquement les produits sous leur seuil (jamais tout le catalogue).
  const [lowProducts, setLowProducts] = useState<ProductRow[]>([]);
  const [stockCounts, setStockCounts] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    void (async () => {
      const hist = await getLastClosings(10);
      if (!alive) return;
      setHistory(hist);
      const products = await listProducts();
      if (!alive) return;
      setLowProducts(products.filter((p) => p.is_stockable !== false && p.quantity <= p.minimum_stock));
      const local = await getExpectedForDateLocal(dateKey);
      if (!alive) return;
      try {
        const server = await fetchExpectedCash(dateKey);
        if (!alive) return;
        setExpected({ cash: server.expected_cash, momo: server.expected_momo, orange: server.expected_orange });
        setExpectedSource('server');
      } catch {
        setExpected(local);
        setExpectedSource('local');
      }
    })();
    return () => {
      alive = false;
    };
  }, [dateKey, version]);

  const cashNum = Math.round(Number(cashCounted));
  const momoNum = Math.round(Number(momoCounted));
  const orangeNum = Math.round(Number(orangeCounted));
  const cashValid = cashCounted.trim() !== '' && Number.isFinite(cashNum) && cashNum >= 0;
  const momoValid = momoCounted.trim() !== '' && Number.isFinite(momoNum) && momoNum >= 0;
  const orangeValid = orangeCounted.trim() !== '' && Number.isFinite(orangeNum) && orangeNum >= 0;
  const allValid = cashValid && momoValid && orangeValid;
  const cashDiff = cashValid ? cashNum - expected.cash : 0;
  const momoDiff = momoValid ? momoNum - expected.momo : 0;
  const orangeDiff = orangeValid ? orangeNum - expected.orange : 0;

  const canNext =
    step === 0
      ? true
      : step === 1
        ? cashValid
        : step === 2
          ? momoValid
          : step === 3
            ? orangeValid
            : step === 4 || step === 5
              ? true
              : allValid;

  const submit = async () => {
    if (!allValid) return;
    await addDailyClosing(
      dateKey,
      expected.cash,
      cashNum,
      expected.momo,
      momoNum,
      expected.orange,
      orangeNum,
      note.trim() || null,
    );
    // Écarts de stock constatés : un ajustement AVEC motif par produit, jamais silencieux.
    for (const p of lowProducts) {
      const raw = stockCounts[p.id];
      if (raw === undefined || raw.trim() === '') continue;
      const real = Math.round(Number(raw));
      if (!Number.isFinite(real) || real < 0 || real === p.quantity) continue;
      await addStockMovement(p.id, 'adjustment', real - p.quantity, `Comptage à la clôture du ${formatDate(dateKey)}`);
    }
    setStockCounts({});
    setSaved({ cash: cashNum, momo: momoNum, orange: orangeNum });
    setCashCounted('');
    setMomoCounted('');
    setOrangeCounted('');
    setNote('');
    setStep(0);
    void syncEngine.syncNow();
    const hist = await getLastClosings(10);
    setHistory(hist);
  };

  const diffBadge = (d: number) =>
    d === 0
      ? 'text-success'
      : d > 0
        ? 'text-primary'
        : 'text-danger';

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-background">Clôture de fin de journée</h1>
        <p className="text-sm text-text-muted">
          Cash, Mobile Money et Orange Money sont réconciliés séparément.
        </p>
      </div>

      {/* Stepper */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => i < step && setStep(i)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              i === step
                ? 'bg-background text-white'
                : i < step
                  ? 'bg-accent-light/40 text-background'
                  : 'bg-[#F3F4F6] text-text-muted'
            }`}
          >
            {i < step ? <Check size={12} /> : <span className="font-bold">{i + 1}</span>}
            {label}
          </button>
        ))}
      </div>

      <div className="kpi-card">
        {step === 0 && (
          <div>
            <label className="field-label" htmlFor="closing_date">
              Journée concernée
            </label>
            <input
              id="closing_date"
              type="date"
              className="field-input mb-4 max-w-[200px]"
              value={dateKey}
              onChange={(e) => setDateKey(e.target.value)}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-field border border-border p-3">
                <p className="field-label">Caisse cash attendue</p>
                <p className="font-heading text-2xl font-extrabold">{formatFcfa(expected.cash)}</p>
              </div>
              <div className="rounded-field border border-border p-3">
                <p className="field-label">Mobile Money attendu</p>
                <p className="font-heading text-2xl font-extrabold">{formatFcfa(expected.momo)}</p>
              </div>
              <div className="rounded-field border border-border p-3">
                <p className="field-label">Orange Money attendu</p>
                <p className="font-heading text-2xl font-extrabold">{formatFcfa(expected.orange)}</p>
              </div>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-text-muted">
              {expectedSource === 'server' ? (
                <>
                  <CheckCircle2 size={14} className="text-success" /> Calculés par le serveur à partir des mouvements du jour.
                </>
              ) : (
                <>
                  <AlertTriangle size={14} className="text-warning" /> Hors-ligne : calcul local temporaire, à réconcilier à la sync.
                </>
              )}
            </p>
          </div>
        )}

        {step === 1 && (
          <div>
            <p className="field-label">Caisse physique attendue</p>
            <p className="mb-3 font-heading text-2xl font-extrabold">{formatFcfa(expected.cash)}</p>
            <label className="field-label" htmlFor="actual_cash">
              Argent compté dans la caisse (FCFA)
            </label>
            <input
              id="actual_cash"
              type="number"
              inputMode="numeric"
              min={0}
              className="field-input"
              value={cashCounted}
              onChange={(e) => setCashCounted(e.target.value)}
              placeholder="ex. 45000"
              autoFocus
            />
            {cashValid && (
              <p className={`mt-3 font-heading text-lg font-bold ${diffBadge(cashDiff)}`}>
                Écart cash : {cashDiff > 0 ? '+' : ''}
                {formatFcfa(cashDiff)} ({cashDiff === 0 ? 'caisse exacte' : cashDiff > 0 ? 'excédent' : 'manquant'})
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            <p className="field-label">Mobile Money attendu</p>
            <p className="mb-3 font-heading text-2xl font-extrabold">{formatFcfa(expected.momo)}</p>
            <label className="field-label" htmlFor="actual_momo">
              Solde Mobile Money constaté (FCFA)
            </label>
            <input
              id="actual_momo"
              type="number"
              inputMode="numeric"
              min={0}
              className="field-input"
              value={momoCounted}
              onChange={(e) => setMomoCounted(e.target.value)}
              placeholder="ex. 18500"
              autoFocus
            />
            {momoValid && (
              <p className={`mt-3 font-heading text-lg font-bold ${diffBadge(momoDiff)}`}>
                Écart MoMo : {momoDiff > 0 ? '+' : ''}
                {formatFcfa(momoDiff)} ({momoDiff === 0 ? 'solde exact' : momoDiff > 0 ? 'excédent' : 'manquant'})
              </p>
            )}
          </div>
        )}

        {step === 3 && (
          <div>
            <p className="field-label">Orange Money attendu</p>
            <p className="mb-3 font-heading text-2xl font-extrabold">{formatFcfa(expected.orange)}</p>
            <label className="field-label" htmlFor="actual_orange">
              Solde Orange Money constaté (FCFA)
            </label>
            <input
              id="actual_orange"
              type="number"
              inputMode="numeric"
              min={0}
              className="field-input"
              value={orangeCounted}
              onChange={(e) => setOrangeCounted(e.target.value)}
              placeholder="ex. 9000"
              autoFocus
            />
            {orangeValid && (
              <p className={`mt-3 font-heading text-lg font-bold ${diffBadge(orangeDiff)}`}>
                Écart Orange Money : {orangeDiff > 0 ? '+' : ''}
                {formatFcfa(orangeDiff)} ({orangeDiff === 0 ? 'solde exact' : orangeDiff > 0 ? 'excédent' : 'manquant'})
              </p>
            )}
          </div>
        )}

        {step === 4 && (
          <div>
            <p className="field-label">Comptage du stock sensible</p>
            {lowProducts.length === 0 ? (
              <p className="text-sm text-text-muted">Aucun produit sous son seuil d’alerte : rien à compter aujourd’hui.</p>
            ) : (
              <>
                <p className="mb-3 text-sm text-text-muted">
                  Compte ces produits en rayon. Laisse vide si tu ne veux pas les vérifier : un écart crée un ajustement de stock tracé.
                </p>
                <div className="space-y-2">
                  {lowProducts.map((p) => {
                    const raw = stockCounts[p.id];
                    const real = raw === undefined || raw.trim() === '' ? null : Math.round(Number(raw));
                    const gap = real === null || !Number.isFinite(real) ? null : real - p.quantity;
                    return (
                      <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-field border border-border px-3 py-2">
                        <div>
                          <strong className="text-sm">{p.name}</strong>
                          <p className="text-xs text-text-muted">Attendu : {p.quantity} (seuil {p.minimum_stock})</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            className="field-input !w-24 !py-1.5 text-right"
                            inputMode="numeric"
                            value={raw ?? ''}
                            onChange={(e) => setStockCounts({ ...stockCounts, [p.id]: e.target.value.replace(/[^0-9]/g, '') })}
                            placeholder="Compté"
                          />
                          {gap !== null && (
                            <span className={`text-sm font-semibold ${gap === 0 ? 'text-success' : 'text-danger'}`}>
                              {gap > 0 ? '+' : ''}
                              {gap}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {step === 5 && (
          <div>
            <p className="field-label">Motif de l&rsquo;écart (optionnel)</p>
            <p className="mb-3 text-sm text-text-muted">
              Écart cash : {cashValid ? formatFcfa(cashDiff) : '—'} · Écart MoMo : {momoValid ? formatFcfa(momoDiff) : '—'} · Écart
              Orange Money : {orangeValid ? formatFcfa(orangeDiff) : '—'}
            </p>
            <input
              className="field-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ex. 6000 payés au fournisseur non saisi"
              autoFocus
            />
            <p className="mt-2 text-xs text-text-muted">
              Ne rien saisir si l&rsquo;écart a déjà été expliqué par un mouvement enregistré.
            </p>
          </div>
        )}

        {step === 6 && (
          <div className="overflow-hidden rounded-card border border-border">
            <table className="w-full text-sm">
              <thead className="bg-[#FAFAFA] text-text-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Canal</th>
                  <th className="px-3 py-2 text-right font-semibold">Attendu</th>
                  <th className="px-3 py-2 text-right font-semibold">Compté</th>
                  <th className="px-3 py-2 text-right font-semibold">Écart</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <td className="px-3 py-2 font-medium">Cash</td>
                  <td className="px-3 py-2 text-right">{formatFcfa(expected.cash)}</td>
                  <td className="px-3 py-2 text-right">{cashValid ? formatFcfa(cashNum) : '—'}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${diffBadge(cashDiff)}`}>{formatFcfa(cashDiff)}</td>
                </tr>
                <tr className="border-t border-border">
                  <td className="px-3 py-2 font-medium">Mobile Money</td>
                  <td className="px-3 py-2 text-right">{formatFcfa(expected.momo)}</td>
                  <td className="px-3 py-2 text-right">{momoValid ? formatFcfa(momoNum) : '—'}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${diffBadge(momoDiff)}`}>{formatFcfa(momoDiff)}</td>
                </tr>
                <tr className="border-t border-border">
                  <td className="px-3 py-2 font-medium">Orange Money</td>
                  <td className="px-3 py-2 text-right">{formatFcfa(expected.orange)}</td>
                  <td className="px-3 py-2 text-right">{orangeValid ? formatFcfa(orangeNum) : '—'}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${diffBadge(orangeDiff)}`}>{formatFcfa(orangeDiff)}</td>
                </tr>
              </tbody>
            </table>
            {note.trim() && <p className="border-t border-border px-3 py-2 text-sm text-text-muted">Motif : {note.trim()}</p>}
            <button type="button" className="btn-accent m-3 w-[calc(100%-24px)]" onClick={() => void submit()}>
              <CheckCircle2 size={18} /> Valider la clôture (hors-ligne)
            </button>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between">
          <button type="button" className="btn-secondary" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
            <ChevronLeft size={16} /> Précédent
          </button>
          {step < STEPS.length - 1 && (
            <button type="button" className="btn-accent" disabled={!canNext} onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
              Suivant <ChevronRight size={16} />
            </button>
          )}
        </div>

        {saved && (
          <div className="mt-4 flex items-center gap-2 rounded-field bg-success px-3 py-3 text-sm font-medium text-white">
            <CheckCircle2 size={18} />
            Clôture enregistrée : cash {formatFcfa(saved.cash)} · MoMo {formatFcfa(saved.momo)} · Orange Money{' '}
            {formatFcfa(saved.orange)}.
          </div>
        )}
      </div>

      <h2 className="mb-2 mt-6 font-heading text-base font-bold text-background">Historique des clôtures</h2>
      {history.length === 0 ? (
        <p className="text-sm text-text-muted">Aucune clôture enregistrée.</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border">
          <table className="w-full text-sm">
            <thead className="bg-[#FAFAFA] text-text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Jour</th>
                <th className="px-3 py-2 text-left font-semibold">Écart cash</th>
                <th className="px-3 py-2 text-left font-semibold">Écart MoMo</th>
                <th className="px-3 py-2 text-left font-semibold">Écart Orange</th>
                <th className="px-3 py-2 text-left font-semibold">Motif</th>
              </tr>
            </thead>
            <tbody>
              {history.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-3 py-2">{formatDate(c.closing_date)}</td>
                  <td className={`px-3 py-2 font-semibold ${diffBadge(c.difference)}`}>
                    {c.difference > 0 ? '+' : ''}
                    {formatFcfa(c.difference)} <span className="hidden text-text-muted sm:inline">({formatFcfa(c.expected_cash)} → {formatFcfa(c.actual_cash)})</span>
                  </td>
                  <td className={`px-3 py-2 font-semibold ${c.difference_momo == null ? 'text-text-muted' : diffBadge(c.difference_momo)}`}>
                    {c.difference_momo == null
                      ? '—'
                      : `${c.difference_momo > 0 ? '+' : ''}${formatFcfa(c.difference_momo)}`}
                  </td>
                  <td className={`px-3 py-2 font-semibold ${c.difference_orange == null ? 'text-text-muted' : diffBadge(c.difference_orange)}`}>
                    {c.difference_orange == null
                      ? '—'
                      : `${c.difference_orange > 0 ? '+' : ''}${formatFcfa(c.difference_orange)}`}
                  </td>
                  <td className="px-3 py-2 text-text-muted">{c.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
