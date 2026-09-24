'use client';

import { useEffect, useState } from 'react';

import { fetchAnalytics, fetchBilling, Analytics, Plan, ApiError } from '../../lib/api';
import { fdatetime } from '../../lib/format';
import { ErrorNote, Kpi, Loading, PageHeader, Section } from '../../components/ui';
import { BarRows, ChartCard, LineChart } from '../../components/charts';

const PERIODS = [7, 30, 90];

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [plan, setPlan] = useState('');
  const [platform, setPlatform] = useState('');
  const [version, setVersion] = useState('');
  const [activity, setActivity] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBilling()
      .then((b) => setPlans(b.plans))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setError(null);
    fetchAnalytics({ days, plan_id: plan, platform, app_version: version, activity })
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Erreur de chargement'));
  }, [days, plan, platform, version, activity]);

  const versions = Array.from(new Set((data?.versions ?? []).map((v) => v.label.split(' ')[1]).filter((v) => v && v !== '?')));

  return (
    <>
      <PageHeader
        title="Analytics produit"
        sub={data ? `Feedback d’usage réel — période ${data.period_days} j · calculé le ${fdatetime(data.generated_at)}` : 'Feedback d’usage réel'}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-field border border-border bg-surface">
          {PERIODS.map((d) => (
            <button key={d} type="button" className={`px-3 py-2 text-sm font-semibold ${days === d ? 'bg-background text-white' : 'text-text-muted'}`} onClick={() => setDays(d)}>
              {d} j
            </button>
          ))}
        </div>
        <select className="field-input !w-auto !py-2" value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="">Tous les plans</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select className="field-input !w-auto !py-2" value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="">Toute plateforme</option>
          <option value="web">Web</option>
          <option value="android">Android</option>
          <option value="windows">Windows</option>
        </select>
        <select className="field-input !w-auto !py-2" value={version} onChange={(e) => setVersion(e.target.value)}>
          <option value="">Toute version</option>
          {versions.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <select className="field-input !w-auto !py-2" value={activity} onChange={(e) => setActivity(e.target.value)}>
          <option value="">Actives et inactives</option>
          <option value="active">Actives</option>
          <option value="inactive">Inactives</option>
        </select>
      </div>

      <ErrorNote error={error} />
      {!data && !error && <Loading />}

      {data && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Kpi label="Entreprises actives" value={data.active_businesses} sub={`sur ${data.period_days} j`} />
            <Kpi label="Taux d’activation" value={`${data.activation_rate} %`} sub="inscrites → 1re vente" />
            <Kpi label="DAU utilisateurs" value={data.dau} />
            <Kpi label="WAU utilisateurs" value={data.wau} />
            <Kpi label="MAU utilisateurs" value={data.mau} />
            <Kpi
              label="Rétention 7 / 30 j"
              value={`${data.retention_d7.percent} % / ${data.retention_d30.percent} %`}
              sub={`${data.retention_d7.retained}/${data.retention_d7.eligible} · ${data.retention_d30.retained}/${data.retention_d30.eligible}`}
              hint="Part des entreprises inscrites depuis au moins 7 (resp. 30) jours encore actives après ce délai."
            />
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Usage des fonctionnalités"
              sub="proportion des entreprises actives qui l’ont utilisée sur la période"
              table={{ head: ['Fonctionnalité', 'Entreprises', '%'], rows: data.feature_usage.map((f) => [f.label, f.businesses, f.available ? `${f.percent} %` : 'non disponible']) }}
            >
              <BarRows
                rows={data.feature_usage.map((f) => ({
                  label: f.label,
                  value: f.available ? f.percent : 0,
                  display: f.available ? `${f.percent} %` : 'bientôt',
                  sub: f.available ? `${f.businesses}` : undefined,
                  muted: !f.available,
                }))}
                max={100}
              />
            </ChartCard>
            <ChartCard
              title="Funnel d’activation"
              sub="entreprises inscrites sur la période"
              table={{ head: ['Étape', 'Entreprises', '%'], rows: data.funnel.map((f) => [f.label, f.count, `${f.percent} %`]) }}
            >
              <BarRows rows={data.funnel.map((f) => ({ label: f.label, value: f.count, display: String(f.count), sub: `${f.percent} %` }))} max={Math.max(1, data.funnel[0]?.count ?? 1)} />
              <p className="mt-3 text-xs text-text-muted">
                « Activité 7 jours » = ventes sur au moins 2 jours dans la première semaine ; « récurrente » = ventes sur au moins 5 jours dans le premier mois.
              </p>
            </ChartCard>
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <ChartCard title="Entreprises actives" sub="par jour" table={{ head: ['Jour', 'Actives'], rows: data.series_active_businesses.map((p) => [p.date, p.value]) }}>
              <LineChart data={data.series_active_businesses} />
            </ChartCard>
            <ChartCard title="Utilisateurs actifs" sub="par jour" table={{ head: ['Jour', 'Utilisateurs'], rows: data.series_active_users.map((p) => [p.date, p.value]) }}>
              <LineChart data={data.series_active_users} />
            </ChartCard>
            <ChartCard title="Nouvelles entreprises" sub="par jour" table={{ head: ['Jour', 'Nouvelles'], rows: data.series_new_businesses.map((p) => [p.date, p.value]) }}>
              <LineChart data={data.series_new_businesses} />
            </ChartCard>
          </div>

          <Section title="Segmentation appareils" sub="Répartition des appareils connus (mêmes filtres que ci-dessus).">
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Plateformes">
                {data.platforms.length === 0 ? (
                  <p className="text-sm text-text-muted">Aucun appareil connu.</p>
                ) : (
                  <BarRows rows={data.platforms.map((p) => ({ label: p.label, value: p.count, display: String(p.count) }))} />
                )}
              </ChartCard>
              <ChartCard title="Versions de l’application">
                {data.versions.length === 0 ? (
                  <p className="text-sm text-text-muted">Aucune version connue.</p>
                ) : (
                  <BarRows rows={data.versions.map((p) => ({ label: p.label, value: p.count, display: String(p.count) }))} />
                )}
              </ChartCard>
            </div>
          </Section>
        </>
      )}
    </>
  );
}
