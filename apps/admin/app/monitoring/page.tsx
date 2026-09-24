'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';

import { fetchMonitoring, Monitoring, ApiError } from '../../lib/api';
import { ago, EVENT_LABEL, fdatetime } from '../../lib/format';
import { AlertList, Badge, ErrorNote, Kpi, Loading, PageHeader, Section } from '../../components/ui';
import { ChartCard, ColumnChart } from '../../components/charts';
import { DeviceTable } from '../../components/DeviceTable';

export default function MonitoringPage() {
  const [data, setData] = useState<Monitoring | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    fetchMonitoring()
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
        title="Monitoring technique"
        sub={data ? `Santé opérationnelle — mis à jour ${fdatetime(data.generated_at)}` : 'Santé opérationnelle'}
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
          <Section title="Alertes" sub="Intervenir avant que le problème ne devienne une plainte client.">
            <AlertList alerts={data.alerts} />
          </Section>

          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Kpi label="Appareils en ligne" value={data.devices_online} sub={`sur ${data.devices_total}`} tone="good" />
            <Kpi label="Appareils offline" value={data.devices_offline} />
            <Kpi label="Opérations en attente" value={data.pending_ops_total} tone={data.pending_ops_total > 0 ? 'warn' : undefined} />
            <Kpi label="Conflits (refusées)" value={data.rejected_ops_total} tone={data.rejected_ops_total > 0 ? 'bad' : undefined} />
            <Kpi label="Erreurs synchro 24 h" value={data.sync_errors_24h} tone={data.sync_errors_24h > 0 ? 'warn' : undefined} />
            <Kpi label="Erreurs serveur 24 h" value={data.server_errors_24h} tone={data.server_errors_24h > 0 ? 'bad' : undefined} />
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <ChartCard title="Erreurs par heure" sub="synchronisation + serveur — 24 dernières heures" table={{ head: ['Heure', 'Erreurs'], rows: data.error_series.map((p) => [p.date, p.value]) }}>
              <ColumnChart data={data.error_series} />
            </ChartCard>
            <div className="kpi-card">
              <h3 className="mb-2 font-heading text-sm font-bold">Versions</h3>
              <p className="mb-2 text-xs text-text-muted">
                Dernière version connue par plateforme — {data.outdated_devices} appareil(s) en retard.
              </p>
              {Object.keys(data.latest_versions).length === 0 ? (
                <p className="text-sm text-text-muted">Aucune version connue.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {Object.entries(data.latest_versions).map(([platform, v]) => (
                    <li key={platform} className="flex justify-between">
                      <span className="capitalize">{platform}</span>
                      <strong>{v}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <Section title="Appareils à surveiller" sub="Hors ligne avec des opérations en attente, ou dernière synchronisation en échec.">
            <DeviceTable devices={data.stale_devices} empty="Aucun appareil à surveiller." />
          </Section>

          <Section title="Dernières erreurs" sub="Synchronisations échouées, conflits et erreurs serveur.">
            {data.recent_errors.length === 0 ? (
              <p className="kpi-card text-sm text-text-muted">Aucune erreur récente.</p>
            ) : (
              <div className="overflow-hidden rounded-card border border-border bg-surface">
                {data.recent_errors.map((e, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 border-t border-border px-3 py-2 text-sm first:border-t-0">
                    <div className="min-w-0">
                      <Badge tone={e.type === 'server.error' ? 'bad' : 'warn'}>{EVENT_LABEL[e.type] ?? e.type}</Badge>
                      {e.actor && (
                        <span className="ml-2 font-medium">{e.actor}</span>
                      )}
                      {e.detail && <span className="block truncate text-xs text-text-muted">{e.detail}</span>}
                    </div>
                    <span className="shrink-0 text-xs text-text-muted">{ago(e.at)}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
          <p className="text-xs text-text-muted">
            Détail par entreprise : <Link href="/entreprises" className="font-semibold text-primary">Entreprises</Link>.
          </p>
        </>
      )}
    </>
  );
}
