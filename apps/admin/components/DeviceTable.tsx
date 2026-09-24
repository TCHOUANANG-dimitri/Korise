'use client';

import Link from 'next/link';

import type { Device } from '../lib/api';
import { ago } from '../lib/format';
import { Badge } from './ui';

export function DeviceTable({ devices, empty = 'Aucun appareil.' }: { devices: Device[]; empty?: string }) {
  if (devices.length === 0) return <p className="kpi-card text-sm text-text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="data-table">
        <thead>
          <tr>
            <th>Entreprise</th>
            <th>Appareil</th>
            <th>Plateforme</th>
            <th>Version</th>
            <th>Dernière activité</th>
            <th>Dernière synchro</th>
            <th>En attente</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((d) => (
            <tr key={d.id}>
              <td className="font-medium">
                <Link href={`/entreprises/${d.business_id}`} className="text-primary hover:underline">
                  {d.business_name}
                </Link>
                {d.user_name && <span className="block text-xs text-text-muted">{d.user_name}</span>}
              </td>
              <td className="font-mono text-xs">…{d.device_ref}</td>
              <td className="capitalize">{d.platform}</td>
              <td>
                {d.app_version ?? '—'} {d.obsolete && <Badge tone="warn">obsolète</Badge>}
              </td>
              <td className="text-text-muted">{ago(d.last_seen_at)}</td>
              <td className="text-text-muted">
                {d.last_sync_at ? ago(d.last_sync_at) : 'jamais'}
                {d.last_sync_ok === false && <span className="block text-xs text-danger">{d.last_sync_error}</span>}
              </td>
              <td className={d.pending_ops > 0 ? 'font-semibold' : ''}>
                {d.pending_ops}
                {d.rejected_ops > 0 && <span className="block text-xs text-danger">{d.rejected_ops} refusée(s)</span>}
              </td>
              <td>
                <Badge tone={d.status === 'online' ? 'good' : d.status === 'offline' ? 'neutral' : 'warn'}>
                  {d.status === 'online' ? 'En ligne' : d.status === 'offline' ? 'Hors ligne' : 'Jamais sync'}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
