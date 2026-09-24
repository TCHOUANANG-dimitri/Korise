'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';

import { fetchOverview, Overview, ApiError } from '../lib/api';
import { fcfa, fdatetime, ago, HEALTH_LABEL } from '../lib/format';
import { AlertList, Badge, ErrorNote, Kpi, Loading, PageHeader, Section } from '../components/ui';
import { BarRows, ChartCard, LineChart } from '../components/charts';

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    fetchOverview()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Erreur de chargement'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <>
      <PageHeader
        title="Overview"
        sub={data ? `Santé de KORISE — mis à jour ${fdatetime(data.generated_at)}` : 'Santé de KORISE'}
        action={
          <button type="button" className="btn-secondary !px-3 !py-2 text-sm" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualiser
          </button>
        }
      />
      <ErrorNote error={error} />
      {!data && !error && <Loading />}

      {data && (
        <>
          <Section title="À traiter en priorité" sub="Synchronisations bloquées, versions obsolètes, erreurs, paiements, comptes inactifs.">
            <AlertList alerts={data.alerts} />
          </Section>

          <Section title="Entreprises">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              <Kpi label="Inscrites" value={data.businesses_total} />
              <Kpi label="Actives (7 j)" value={data.businesses_active_7d} tone="good" />
              <Kpi label="Nouvelles 7 j" value={data.businesses_new_7d} sub={`${data.businesses_new_30d} sur 30 j`} />
              <Kpi label="Premières ventes (30 j)" value={data.businesses_first_sale_30d} />
              <Kpi label="Sans activité" value={data.businesses_without_activity} tone={data.businesses_without_activity > 0 ? 'warn' : undefined} />
              <Kpi
                label="Santé"
                value={`${data.businesses_healthy} / ${data.businesses_to_watch} / ${data.businesses_at_risk}`}
                sub="healthy / à surveiller / à risque"
              />
            </div>
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Usage">
              <div className="grid grid-cols-2 gap-3">
                <Kpi label="Utilisateurs actifs aujourd’hui" value={data.users_active_today} />
                <Kpi label="Utilisateurs actifs 7 j" value={data.users_active_7d} sub={`${data.users_active_30d} sur 30 j`} />
                <Kpi label="Ventes aujourd’hui" value={data.sales_count_today} />
                <Kpi label="Volume 30 j" value={fcfa(data.sales_total_30d)} sub={`${data.sales_count_30d} ventes`} />
              </div>
            </Section>
            <Section title="Structure">
              <div className="grid grid-cols-3 gap-3">
                <Kpi label="Boutiques" value={data.shops_total} />
                <Kpi label="Employés" value={data.employees_total} />
                <Kpi label="Appareils" value={data.devices_total} />
              </div>
            </Section>
            <Section title="Business SaaS" sub={data.mrr === null ? 'Accès financier limité pour ton rôle.' : undefined}>
              {data.mrr === null ? (
                <p className="kpi-card text-sm text-text-muted">Section réservée aux rôles Owner et Product Manager.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Kpi label="Abonnements actifs" value={data.subscriptions_active ?? 0} />
                  <Kpi label="Essais" value={data.subscriptions_trial ?? 0} />
                  <Kpi label="Expirés" value={data.subscriptions_expired ?? 0} />
                  <Kpi label="Paiements échoués" value={data.payments_failed ?? 0} tone={(data.payments_failed ?? 0) > 0 ? 'bad' : undefined} />
                  <Kpi label="MRR" value={fcfa(data.mrr)} sub="plans actifs" />
                </div>
              )}
            </Section>
            <Section title="Technique">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Kpi label="Appareils offline" value={data.devices_offline} />
                <Kpi label="Opérations en attente" value={data.pending_ops_total} tone={data.pending_ops_total > 0 ? 'warn' : undefined} />
                <Kpi label="Erreurs de synchro (24 h)" value={data.sync_errors_24h} tone={data.sync_errors_24h > 0 ? 'warn' : undefined} />
                <Kpi label="Erreurs serveur (24 h)" value={data.server_errors_24h} tone={data.server_errors_24h > 0 ? 'bad' : undefined} />
                <Kpi label="Incidents en cours" value={data.open_incidents} tone={data.open_incidents > 0 ? 'bad' : 'good'} />
              </div>
            </Section>
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Entreprises actives"
              sub="par jour — 30 derniers jours"
              table={{ head: ['Jour', 'Entreprises actives'], rows: data.active_businesses_series.map((p) => [p.date, p.value]) }}
            >
              <LineChart data={data.active_businesses_series} />
            </ChartCard>
            <ChartCard
              title="Utilisateurs actifs"
              sub="par jour — 30 derniers jours"
              table={{ head: ['Jour', 'Utilisateurs actifs'], rows: data.active_users_series.map((p) => [p.date, p.value]) }}
            >
              <LineChart data={data.active_users_series} />
            </ChartCard>
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <ChartCard title="Funnel d’activation" sub="entreprises inscrites sur 30 jours">
              <BarRows
                rows={data.funnel.map((f) => ({ label: f.label, value: f.count, display: String(f.count), sub: `${f.percent} %` }))}
                max={Math.max(1, data.funnel[0]?.count ?? 1)}
              />
            </ChartCard>
            <ChartCard title="Top fonctionnalités" sub="part des entreprises actives (30 j) qui les utilisent">
              <BarRows rows={data.top_features.map((f) => ({ label: f.label, value: f.percent, display: `${f.percent} %`, sub: `${f.businesses}` }))} max={100} />
            </ChartCard>
          </div>

          <Section title="Comptes récemment inactifs ou à surveiller" action={<Link href="/entreprises" className="text-sm font-semibold text-primary">Toutes les entreprises</Link>}>
            {data.inactive_recently.length === 0 ? (
              <p className="kpi-card text-sm text-text-muted">Aucun compte à surveiller.</p>
            ) : (
              <div className="overflow-x-auto rounded-card border border-border bg-surface">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Entreprise</th>
                      <th>Santé</th>
                      <th>Dernière activité</th>
                      <th>Raison</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.inactive_recently.map((b) => (
                      <tr key={b.id}>
                        <td className="font-medium">
                          <Link href={`/entreprises/${b.id}`} className="text-primary hover:underline">
                            {b.name}
                          </Link>
                        </td>
                        <td>
                          <Badge tone={b.health.value === 'a_risque' ? 'bad' : 'warn'}>{HEALTH_LABEL[b.health.value]}</Badge>
                        </td>
                        <td className="text-text-muted">{ago(b.last_activity_at)}</td>
                        <td className="text-text-muted">{b.health.reasons.join(' · ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </>
  );
}
