'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';

import { createPlan, fetchBilling, updatePlan, Billing, ApiError } from '../../lib/api';
import { getAdminSession } from '../../lib/session';
import { fcfa, fdate, STATUS_LABEL } from '../../lib/format';
import { Badge, ErrorNote, Kpi, Loading, PageHeader, Section } from '../../components/ui';
import { BarRows, ChartCard } from '../../components/charts';

export default function BillingPage() {
  const isOwner = getAdminSession()?.role === 'owner';
  const [data, setData] = useState<Billing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [period, setPeriod] = useState('monthly');

  const load = useCallback(() => {
    fetchBilling()
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Erreur de chargement'));
  }, []);
  useEffect(load, [load]);

  const add = async () => {
    try {
      await createPlan({ name, price: Number(price) || 0, period });
      setName('');
      setPrice('');
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Création impossible');
    }
  };

  return (
    <>
      <PageHeader title="Billing" sub="Le SaaS KORISE lui-même — pas les finances des commerces clients. Aucun paiement n’est imposé dans les apps : plan gratuit par défaut." />
      <ErrorNote error={error} />
      {!data && !error && <Loading />}
      {data && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Kpi label="MRR" value={fcfa(data.mrr)} sub={`ARR ${fcfa(data.arr)}`} />
            <Kpi label="Abonnements actifs" value={data.by_status.active ?? 0} />
            <Kpi label="Essais" value={data.by_status.trial ?? 0} sub={`${data.trials_started_30d} démarrés (30 j)`} />
            <Kpi label="Essais convertis (30 j)" value={data.trials_converted_30d} />
            <Kpi label="Expirés" value={data.expired} />
            <Kpi label="Paiements échoués" value={data.failed_or_unpaid} tone={data.failed_or_unpaid > 0 ? 'bad' : undefined} />
          </div>
          <p className="mb-6 text-xs text-text-muted">{data.revenue_note}</p>

          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <ChartCard title="Abonnés par plan">
              <BarRows rows={data.plans.map((p) => ({ label: `${p.name} (${fcfa(p.price)} / ${p.period === 'monthly' ? 'mois' : 'an'})`, value: p.subscribers, display: String(p.subscribers), muted: !p.is_active }))} />
            </ChartCard>
            <ChartCard title="Abonnements par statut">
              <BarRows rows={Object.entries(data.by_status).map(([k, v]) => ({ label: STATUS_LABEL[k] ?? k, value: v, display: String(v) }))} />
            </ChartCard>
          </div>

          <Section title="Plans" sub={isOwner ? 'Le plan « Gratuit » est attribué à toute nouvelle entreprise.' : undefined}>
            <div className="overflow-x-auto rounded-card border border-border bg-surface">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Prix</th>
                    <th>Période</th>
                    <th>Abonnés</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {data.plans.map((p) => (
                    <tr key={p.id}>
                      <td className="font-medium">{p.name}</td>
                      <td>{fcfa(p.price)}</td>
                      <td>{p.period === 'monthly' ? 'Mensuel' : 'Annuel'}</td>
                      <td>{p.subscribers}</td>
                      <td>
                        {isOwner ? (
                          <button
                            type="button"
                            className="text-xs font-semibold text-primary"
                            onClick={async () => {
                              await updatePlan(p.id, { is_active: !p.is_active });
                              load();
                            }}
                          >
                            {p.is_active ? 'Actif — désactiver' : 'Inactif — activer'}
                          </button>
                        ) : (
                          <Badge tone={p.is_active ? 'good' : 'neutral'}>{p.is_active ? 'Actif' : 'Inactif'}</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isOwner && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input className="field-input !w-48 !py-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du plan" />
                <input className="field-input !w-32 !py-2" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Prix FCFA" inputMode="numeric" />
                <select className="field-input !w-auto !py-2" value={period} onChange={(e) => setPeriod(e.target.value)}>
                  <option value="monthly">Mensuel</option>
                  <option value="annual">Annuel</option>
                </select>
                <button type="button" className="btn-accent !px-3 !py-2 text-sm" disabled={!name.trim()} onClick={() => void add()}>
                  <Plus size={16} /> Créer un plan
                </button>
              </div>
            )}
          </Section>

          <Section title="Abonnements">
            <div className="overflow-x-auto rounded-card border border-border bg-surface">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Entreprise</th>
                    <th>Plan</th>
                    <th>Statut</th>
                    <th>Depuis</th>
                    <th>Fin d’essai / renouvellement</th>
                  </tr>
                </thead>
                <tbody>
                  {data.subscriptions.map((s) => (
                    <tr key={s.business_id}>
                      <td className="font-medium">
                        <Link href={`/entreprises/${s.business_id}`} className="text-primary hover:underline">
                          {s.business_name}
                        </Link>
                      </td>
                      <td>{s.plan_name ?? '—'}</td>
                      <td>
                        <Badge tone={s.status === 'active' ? 'good' : s.status === 'payment_failed' ? 'bad' : s.status === 'trial' ? 'info' : 'neutral'}>{STATUS_LABEL[s.status] ?? s.status}</Badge>
                      </td>
                      <td className="text-text-muted">{fdate(s.started_at)}</td>
                      <td className="text-text-muted">{fdate(s.current_period_ends_at ?? s.trial_ends_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </>
  );
}
