'use client';

import { useCallback, useEffect, useState } from 'react';
import { Banknote, CheckCircle2, HandCoins, Phone, Plus, RefreshCw, Search, TriangleAlert, UserPlus, Users } from 'lucide-react';

import { useData } from '../../lib/useData';
import {
  addCreditRepayment,
  addCustomer,
  getCustomerBalanceLocal,
  getCustomerById,
  getCustomerLocalTransactions,
  listCustomers,
  CustomerRow,
} from '../../lib/repo';
import { listCustomersOnline as apiListCustomers, getCustomerDetail as apiGetCustomerDetail } from '../../lib/api';
import { formatDateTime, formatFcfa } from '../../lib/format';
import { syncEngine } from '../../lib/sync';
import { MONEY_CHANNEL_LABELS, MONEY_CHANNELS, MoneyChannel } from '../../lib/config';

interface CustomerListItem {
  id: string; // id serveur (en ligne) ou client_uuid local (hors-ligne)
  full_name: string;
  phone: string | null;
  balance: number;
  online: boolean;
}

interface DetailTx {
  kind: 'sale' | 'repayment';
  created_at: string;
  amount: number;
  product_name: string | null;
  quantity: number | null;
  channel: string | null;
  note: string | null;
}

interface DetailView {
  full_name: string;
  phone: string | null;
  balance: number;
  txs: DetailTx[];
}

export default function CreditsPage() {
  const version = useData();

  const [items, setItems] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'online' | 'local'>('online');
  const [customerQuery, setCustomerQuery] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const remote = await apiListCustomers();
      setItems(
        remote.map((c) => ({
          id: c.id,
          full_name: c.full_name,
          phone: c.phone,
          balance: c.balance,
          online: true,
        })),
      );
      setSource('online');
    } catch {
      const local = await listCustomers();
      const rows: CustomerListItem[] = [];
      for (const c of local) {
        const balance = await getCustomerBalanceLocal(c.id);
        rows.push({ id: c.id, full_name: c.full_name, phone: c.phone, balance, online: false });
      }
      setItems(rows);
      setSource('local');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, version]);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [repayAmount, setRepayAmount] = useState('');
  const [repayChannel, setRepayChannel] = useState<MoneyChannel>('cash');
  const [repayNote, setRepayNote] = useState('');
  const [repayBusy, setRepayBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const openDetail = async (item: CustomerListItem) => {
    setDetailId(item.id);
    setDetailLoading(true);
    try {
      const d = await apiGetCustomerDetail(item.id);
      const txs: DetailTx[] = (d.transactions ?? []).map((t) => ({
        kind: t.kind,
        created_at: t.created_at,
        amount: t.amount,
        product_name: t.product_name ?? null,
        quantity: t.quantity ?? null,
        channel: t.channel ?? null,
        note: t.note ?? null,
      }));
      setDetail({ full_name: d.full_name, phone: d.phone, balance: d.balance, txs });
    } catch {
      const local: CustomerRow | null = await getCustomerById(item.id);
      const balance = await getCustomerBalanceLocal(item.id);
      const txs: DetailTx[] = (await getCustomerLocalTransactions(item.id)).map((t) => ({
        kind: t.kind,
        created_at: t.created_at,
        amount: t.amount,
        product_name: null,
        quantity: t.quantity,
        channel: t.channel,
        note: t.note,
      }));
      setDetail({
        full_name: local?.full_name ?? item.full_name,
        phone: local?.phone ?? item.phone,
        balance,
        txs,
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const submitRepay = async () => {
    if (!detailId) return;
    const n = Math.round(Number(repayAmount));
    if (!Number.isFinite(n) || n <= 0) return;
    setRepayBusy(true);
    const row = await addCreditRepayment(detailId, n, repayChannel, repayNote.trim() || null);
    setRepayBusy(false);
    if (row) {
      setFlash(`Remboursement enregistré (hors-ligne) : ${formatFcfa(n)}`);
      setRepayAmount('');
      setRepayNote('');
      window.setTimeout(() => setFlash(null), 5000);
      void syncEngine.syncNow();
      void load();
      const current = items.find((i) => i.id === detailId);
      if (current) void openDetail(current);
    }
  };

  const repayNum = Math.round(Number(repayAmount));
  const repayValid = Number.isFinite(repayNum) && repayNum > 0;
  const createClient = async () => {
    const created = await addCustomer(newName, newPhone.trim() || null);
    if (!created) return;
    setNewName('');
    setNewPhone('');
    setShowNew(false);
    setFlash(`Client « ${created.full_name} » ajouté.`);
    window.setTimeout(() => setFlash(null), 4000);
    void syncEngine.syncNow();
    void load();
  };

  const query = customerQuery.trim().toLowerCase();
  const filtered = query ? items.filter((i) => i.full_name.toLowerCase().includes(query)) : items;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-background">Crédits</h1>
          <p className="text-sm text-text-muted">Ce que les clients doivent, et les remboursements reçus.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-accent !px-3 !py-2" onClick={() => setShowNew((v) => !v)}>
            <UserPlus size={16} /> Nouveau client
          </button>
          <button type="button" className="btn-secondary !px-3 !py-2" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualiser
          </button>
        </div>
      </div>

      {showNew && (
        <div className="kpi-card mb-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input className="field-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nom du client" autoFocus />
            <input
              className="field-input"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value.replace(/[^0-9+]/g, ''))}
              placeholder="Téléphone (optionnel)"
              inputMode="tel"
            />
            <button type="button" className="btn-accent" disabled={!newName.trim()} onClick={() => void createClient()}>
              <Plus size={16} /> Ajouter
            </button>
          </div>
        </div>
      )}

      <div className="mb-4">
        <div className="relative max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            className="field-input pl-9"
            value={customerQuery}
            onChange={(e) => setCustomerQuery(e.target.value)}
            placeholder="Rechercher un client…"
          />
        </div>
      </div>

      {flash && (
        <div className="mb-4 flex items-center gap-2 rounded-field bg-success px-3 py-3 text-sm font-medium text-white">
          <CheckCircle2 size={18} /> {flash}
        </div>
      )}

      {source === 'local' && items.length > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-field border border-warning/30 bg-warning/5 px-3 py-3 text-sm text-text-muted">
          <TriangleAlert size={18} className="text-warning" /> Hors-ligne : soldes recalculés localement, à confirmer à la synchro.
        </div>
      )}

      {detail && detailId && (
        <div className="mb-5 kpi-card">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <HandCoins size={18} className="shrink-0 text-accent" />
              <strong className="truncate text-base">{detail.full_name}</strong>
              {detail.phone && (
                <span className="inline-flex shrink-0 items-center gap-1 text-sm text-text-muted">
                  <Phone size={14} /> {detail.phone}
                </span>
              )}
            </div>
            <button type="button" className="text-sm font-semibold text-primary" onClick={() => setDetailId(null)}>
              Fermer
            </button>
          </div>

          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-field border border-border p-3">
              <p className="field-label">Solde dû</p>
              <p className={`font-heading text-2xl font-extrabold ${detail.balance > 0 ? 'text-danger' : 'text-success'}`}>
                {formatFcfa(Math.max(0, detail.balance))}
              </p>
            </div>
            <div className="rounded-field border border-border p-3">
              <p className="field-label">Rembourser un crédit</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="field-input !py-2"
                  inputMode="numeric"
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Montant"
                />
                <div className="inline-flex overflow-hidden rounded-field border border-border">
                  {MONEY_CHANNELS.map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      className={`px-3 py-2 text-sm font-semibold ${repayChannel === ch ? 'bg-background text-white' : 'text-text-muted'}`}
                      onClick={() => setRepayChannel(ch)}
                    >
                      {MONEY_CHANNEL_LABELS[ch]}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn-accent !px-3 !py-2"
                  disabled={repayBusy || !repayValid}
                  onClick={() => void submitRepay()}
                >
                  <Banknote size={16} /> Enregistrer
                </button>
              </div>
              <input
                className="field-input mt-2 !py-2"
                value={repayNote}
                onChange={(e) => setRepayNote(e.target.value)}
                placeholder="Note (optionnel, ex. avance de lundi)"
              />
            </div>
          </div>

          <h3 className="mb-1 font-heading text-sm font-bold text-background">Historique</h3>
          {detailLoading ? (
            <p className="text-sm text-text-muted">Chargement…</p>
          ) : detail.txs.length === 0 ? (
            <p className="text-sm text-text-muted">Aucune transaction pour ce client.</p>
          ) : (
            <div className="overflow-x-auto rounded-card border border-border">
              <table className="w-full text-sm">
                <thead className="bg-[#FAFAFA] text-text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Date</th>
                    <th className="px-3 py-2 text-left font-semibold">Détail</th>
                    <th className="px-3 py-2 text-left font-semibold">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.txs.map((t, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-2 whitespace-nowrap text-text-muted">{formatDateTime(t.created_at)}</td>
                      <td className="px-3 py-2">
                        {t.kind === 'sale' ? (
                          <span>
                            {t.quantity ? `${t.quantity} × ` : ''}Vente à crédit
                            {t.product_name ? ` — ${t.product_name}` : ''}
                          </span>
                        ) : (
                          <span className="text-success">
                            Remboursement (
                            {t.channel && t.channel in MONEY_CHANNEL_LABELS
                              ? MONEY_CHANNEL_LABELS[t.channel as MoneyChannel]
                              : 'Cash'}
                            )
                          </span>
                        )}
                        {t.note && <span className="block text-xs text-text-muted">{t.note}</span>}
                      </td>
                      <td className={`px-3 py-2 font-semibold ${t.kind === 'repayment' ? 'text-success' : 'text-danger'}`}>
                        {t.kind === 'repayment' ? '-' : ''}
                        {formatFcfa(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <h2 className="mb-2 font-heading text-base font-bold text-background">Clients</h2>
      {loading ? (
        <p className="text-sm text-text-muted">Chargement…</p>
      ) : items.length === 0 ? (
        <div className="mt-4 flex items-start gap-2 rounded-field border border-border bg-surface px-3 py-3 text-sm text-text-muted">
          <Users size={18} className="mt-0.5 shrink-0" />
          <span>
            Aucun client à crédit pour l&rsquo;instant — ils apparaissent ici dès qu&rsquo;une vente est faite « à crédit » depuis
            l&rsquo;écran Vente.
          </span>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((i) => (
            <div key={i.id} className="kpi-card flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <strong className="block truncate">{i.full_name}</strong>
                {i.phone && <span className="text-xs text-text-muted">{i.phone}</span>}
              </div>
              <span className={`font-heading text-lg font-extrabold ${i.balance > 0 ? 'text-danger' : 'text-success'}`}>
                {formatFcfa(i.balance)}
              </span>
              <button
                type="button"
                className="btn-secondary !px-3 !py-1.5 text-sm"
                onClick={() => void (detailId === i.id && detail ? setDetailId(null) : openDetail(i))}
              >
                {detailId === i.id && detail ? 'Fermer' : 'Détail'}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}