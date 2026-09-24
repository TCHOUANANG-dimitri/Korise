'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { fetchTickets, updateTicket, Ticket, ApiError } from '../../lib/api';
import { fdatetime, STATUS_LABEL } from '../../lib/format';
import { Badge, ErrorNote, Loading, PageHeader } from '../../components/ui';

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const load = useCallback(() => {
    fetchTickets(status || undefined)
      .then(setTickets)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Erreur de chargement'));
  }, [status]);
  useEffect(load, [load]);

  return (
    <>
      <PageHeader
        title="Support & diagnostic"
        sub="Tickets et notes internes. Pour diagnostiquer un compte, ouvre sa fiche : dernière synchronisation, appareils, erreurs, historique."
      />
      <ErrorNote error={error} />
      <div className="mb-4 inline-flex overflow-hidden rounded-field border border-border bg-surface">
        {[
          ['', 'Tous'],
          ['open', 'Ouverts'],
          ['in_progress', 'En cours'],
          ['resolved', 'Résolus'],
        ].map(([v, l]) => (
          <button key={v} type="button" className={`px-3 py-2 text-sm font-semibold ${status === v ? 'bg-background text-white' : 'text-text-muted'}`} onClick={() => setStatus(v)}>
            {l}
          </button>
        ))}
      </div>

      {!tickets ? (
        <Loading />
      ) : tickets.length === 0 ? (
        <p className="kpi-card text-sm text-text-muted">Aucun ticket. Crée-en depuis la fiche d’une entreprise.</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Entreprise</th>
                <th>Créé par</th>
                <th>Mis à jour</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td className="font-medium">{t.subject}</td>
                  <td>
                    <Link href={`/entreprises/${t.business_id}`} className="text-primary hover:underline">
                      {t.business_name}
                    </Link>
                  </td>
                  <td className="text-text-muted">{t.created_by_name ?? '—'}</td>
                  <td className="text-text-muted">{fdatetime(t.updated_at)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Badge tone={t.status === 'resolved' ? 'good' : t.status === 'in_progress' ? 'info' : 'warn'}>{STATUS_LABEL[t.status]}</Badge>
                      <select
                        className="field-input !w-auto !py-1 text-xs"
                        value={t.status}
                        onChange={async (e) => {
                          await updateTicket(t.id, { status: e.target.value });
                          load();
                        }}
                      >
                        <option value="open">Ouvert</option>
                        <option value="in_progress">En cours</option>
                        <option value="resolved">Résolu</option>
                      </select>
                    </div>
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
