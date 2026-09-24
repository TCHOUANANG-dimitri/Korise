'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Ban, CheckCircle2, LifeBuoy, Phone, Play, StickyNote } from 'lucide-react';

import {
  addNote,
  changeSubscription,
  createTicket,
  deactivateBusinessUser,
  fetchBilling,
  fetchBusinessDetail,
  reactivateBusiness,
  suspendBusiness,
  updateTicket,
  BusinessDetail,
  Plan,
  ApiError,
} from '../../../lib/api';
import { getAdminSession } from '../../../lib/session';
import { ago, EVENT_LABEL, fcfa, fdate, fdatetime, HEALTH_LABEL, STATUS_LABEL } from '../../../lib/format';
import { Badge, ConfirmDialog, ErrorNote, Kpi, Loading, Section } from '../../../components/ui';

type Pending =
  | { kind: 'suspend' }
  | { kind: 'reactivate' }
  | { kind: 'deactivate-user'; userId: string; name: string }
  | { kind: 'subscription'; body: { plan_id?: string; status?: string; extend_trial_days?: number }; label: string };

export default function BusinessDetailPage() {
  const params = useParams<{ id: string }>();
  const role = getAdminSession()?.role;
  const canSupport = role === 'owner' || role === 'support';
  const isOwner = role === 'owner';

  const [detail, setDetail] = useState<BusinessDetail | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [note, setNote] = useState('');
  const [ticketSubject, setTicketSubject] = useState('');
  const [planId, setPlanId] = useState('');

  const load = useCallback(() => {
    fetchBusinessDetail(params.id)
      .then((d) => {
        setDetail(d);
        setPlanId(d.plan_id ?? '');
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Erreur de chargement'));
  }, [params.id]);

  useEffect(load, [load]);
  useEffect(() => {
    if (isOwner) {
      fetchBilling()
        .then((b) => setPlans(b.plans))
        .catch(() => undefined);
    }
  }, [isOwner]);

  const confirmAction = async (reason: string | null) => {
    if (!detail || !pending) return;
    try {
      if (pending.kind === 'suspend') setDetail(await suspendBusiness(detail.id, reason));
      else if (pending.kind === 'reactivate') setDetail(await reactivateBusiness(detail.id, reason));
      else if (pending.kind === 'deactivate-user') setDetail(await deactivateBusinessUser(detail.id, pending.userId, reason));
      else setDetail(await changeSubscription(detail.id, pending.body));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Action refusée');
    }
  };

  if (error && !detail) return <ErrorNote error={error} />;
  if (!detail) return <Loading />;

  const health = detail.health;
  const tone = health.value === 'healthy' ? 'good' : health.value === 'a_surveiller' ? 'warn' : 'bad';

  return (
    <>
      <Link href="/entreprises" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
        <ArrowLeft size={16} /> Retour aux entreprises
      </Link>
      <ErrorNote error={error} />

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-background">{detail.name}</h1>
          <p className="text-sm text-text-muted">
            Code {detail.business_code} · {detail.sector ?? 'secteur non renseigné'} · inscrite le {fdate(detail.created_at)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={tone}>{HEALTH_LABEL[health.value]}</Badge>
            {detail.is_suspended && <Badge tone="bad">Suspendue</Badge>}
            {health.reasons.map((r) => (
              <span key={r} className="text-xs text-text-muted">
                {r}
              </span>
            ))}
          </div>
        </div>
        {canSupport && (
          <div className="flex gap-2">
            {detail.is_suspended ? (
              <button type="button" className="btn-secondary" onClick={() => setPending({ kind: 'reactivate' })}>
                <Play size={16} /> Réactiver
              </button>
            ) : (
              <button type="button" className="btn-secondary text-danger" onClick={() => setPending({ kind: 'suspend' })}>
                <Ban size={16} /> Suspendre
              </button>
            )}
          </div>
        )}
      </div>

      <Section title="Usage" sub="Mesuré à partir des ventes et connexions réelles.">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Kpi label="Ventes aujourd’hui" value={detail.sales_count_today} />
          <Kpi label="Ventes 7 j" value={detail.sales_count_7d} />
          <Kpi label="Ventes 30 j" value={detail.sales_count_30d} />
          <Kpi label="Volume 30 j" value={fcfa(detail.sales_total_30d)} />
          <Kpi label="Utilisateurs actifs (7 j)" value={detail.active_users_7d} />
          <Kpi label="Jours d’activité (30 j)" value={detail.active_days_30d} />
        </div>
      </Section>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="kpi-card">
          <h2 className="mb-2 font-heading text-sm font-bold">Compte</h2>
          <p className="text-sm">
            Propriétaire : <strong>{detail.owner_full_name ?? '—'}</strong>
          </p>
          {(detail.owner_phone || detail.phone) && (
            <p className="mt-1 flex items-center gap-1 text-sm text-text-muted">
              <Phone size={14} /> {detail.owner_phone ?? detail.phone}
            </p>
          )}
          {detail.email && <p className="text-sm text-text-muted">{detail.email}</p>}
          {detail.address && <p className="text-sm text-text-muted">{detail.address}</p>}
        </div>
        <div className="kpi-card">
          <h2 className="mb-2 font-heading text-sm font-bold">Structure</h2>
          <p className="text-sm">
            1 boutique · {detail.employee_count} employé(s)
          </p>
          <p className="text-sm text-text-muted">
            {detail.product_count} produits · {detail.customer_count} clients · {detail.device_count} appareil(s)
          </p>
        </div>
        <div className="kpi-card">
          <h2 className="mb-2 font-heading text-sm font-bold">Abonnement</h2>
          <p className="text-sm">
            Plan : <strong>{detail.plan_name ?? '—'}</strong>
          </p>
          <p className="text-sm text-text-muted">
            Statut : {detail.subscription_status ? STATUS_LABEL[detail.subscription_status] ?? detail.subscription_status : '—'}
            {detail.subscription_ends_at ? ` · jusqu’au ${fdate(detail.subscription_ends_at)}` : ''}
          </p>
          {isOwner && (
            <div className="mt-3 space-y-2">
              <div className="flex gap-2">
                <select className="field-input !py-1.5 text-sm" value={planId} onChange={(e) => setPlanId(e.target.value)}>
                  <option value="">Plan…</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {fcfa(p.price)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-secondary !px-3 !py-1.5 text-sm"
                  disabled={!planId || planId === detail.plan_id}
                  onClick={() => setPending({ kind: 'subscription', body: { plan_id: planId, status: 'active' }, label: 'Changer de plan' })}
                >
                  Appliquer
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => setPending({ kind: 'subscription', body: { extend_trial_days: 14 }, label: 'Prolonger l’essai de 14 jours' })}>
                  Prolonger l’essai (14 j)
                </button>
                {detail.subscription_status !== 'cancelled' ? (
                  <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => setPending({ kind: 'subscription', body: { status: 'cancelled' }, label: 'Suspendre l’abonnement' })}>
                    Suspendre l’abonnement
                  </button>
                ) : (
                  <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => setPending({ kind: 'subscription', body: { status: 'active' }, label: 'Réactiver l’abonnement' })}>
                    Réactiver l’abonnement
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <Section title="Fonctionnalités utilisées (30 j)" sub="Un point = au moins une utilisation réelle sur la période.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {detail.features.map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-2 rounded-field border border-border bg-surface px-3 py-2 text-sm">
              <span className={f.available ? '' : 'text-text-muted'}>{f.label}</span>
              {!f.available ? (
                <Badge>Bientôt</Badge>
              ) : f.businesses > 0 ? (
                <span className="flex items-center gap-1 text-xs text-success">
                  <CheckCircle2 size={14} /> {ago(f.last_used_at)}
                </span>
              ) : (
                <span className="text-xs text-text-muted">jamais</span>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Technique" sub={`Dernière synchronisation : ${detail.last_sync_at ? ago(detail.last_sync_at) : 'jamais'} · ${detail.pending_ops} opération(s) en attente · ${detail.errors_7d} erreur(s) sur 7 j`}>
        {detail.devices.length === 0 ? (
          <p className="kpi-card text-sm text-text-muted">Aucun appareil connu — l’entreprise n’a pas encore ouvert l’app avec la télémétrie active.</p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-border bg-surface">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Appareil</th>
                  <th>Plateforme</th>
                  <th>Version</th>
                  <th>Utilisateur</th>
                  <th>Dernière activité</th>
                  <th>Dernière synchro</th>
                  <th>En attente</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {detail.devices.map((d) => (
                  <tr key={d.id}>
                    <td className="font-mono text-xs">…{d.device_ref}</td>
                    <td>{d.platform}</td>
                    <td>
                      {d.app_version ?? '—'} {d.obsolete && <Badge tone="warn">obsolète</Badge>}
                    </td>
                    <td>{d.user_name ?? '—'}</td>
                    <td className="text-text-muted">{ago(d.last_seen_at)}</td>
                    <td className="text-text-muted">
                      {d.last_sync_at ? ago(d.last_sync_at) : 'jamais'}
                      {d.last_sync_ok === false && <span className="block text-xs text-danger">{d.last_sync_error}</span>}
                    </td>
                    <td>{d.pending_ops}</td>
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
        )}
      </Section>

      <Section title="Utilisateurs">
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Rôle</th>
                <th>Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {detail.users.map((u, i) => (
                <tr key={i}>
                  <td>{u.full_name}</td>
                  <td>{u.role === 'owner' ? 'Propriétaire' : 'Employé'}</td>
                  <td>{u.is_active ? <Badge tone="good">Actif</Badge> : <Badge>Désactivé</Badge>}</td>
                  <td className="text-right">
                    {canSupport && u.role !== 'owner' && u.is_active && (
                      <button
                        type="button"
                        className="text-xs font-semibold text-danger"
                        onClick={() => setPending({ kind: 'deactivate-user', userId: u.id, name: u.full_name })}
                      >
                        Désactiver
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {role !== 'developer' && (
        <Section title="Support" sub="Notes internes et tickets — jamais visibles par le client.">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="kpi-card">
              <h3 className="mb-2 flex items-center gap-1.5 font-heading text-sm font-bold">
                <StickyNote size={15} /> Notes internes
              </h3>
              {canSupport && (
                <div className="mb-3 flex gap-2">
                  <input className="field-input !py-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ajouter une note…" />
                  <button
                    type="button"
                    className="btn-accent !px-3 !py-2 text-sm"
                    disabled={!note.trim()}
                    onClick={async () => {
                      await addNote(detail.id, note);
                      setNote('');
                      load();
                    }}
                  >
                    Ajouter
                  </button>
                </div>
              )}
              {detail.notes.length === 0 ? (
                <p className="text-sm text-text-muted">Aucune note.</p>
              ) : (
                <ul className="space-y-2">
                  {detail.notes.map((n) => (
                    <li key={n.id} className="rounded-field bg-[#FAFAFA] px-3 py-2 text-sm">
                      {n.text}
                      <span className="block text-xs text-text-muted">
                        {n.admin_name} · {fdatetime(n.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="kpi-card">
              <h3 className="mb-2 flex items-center gap-1.5 font-heading text-sm font-bold">
                <LifeBuoy size={15} /> Tickets
              </h3>
              {canSupport && (
                <div className="mb-3 flex gap-2">
                  <input className="field-input !py-2" value={ticketSubject} onChange={(e) => setTicketSubject(e.target.value)} placeholder="Nouveau ticket : sujet…" />
                  <button
                    type="button"
                    className="btn-accent !px-3 !py-2 text-sm"
                    disabled={!ticketSubject.trim()}
                    onClick={async () => {
                      await createTicket({ business_id: detail.id, subject: ticketSubject });
                      setTicketSubject('');
                      load();
                    }}
                  >
                    Créer
                  </button>
                </div>
              )}
              {detail.tickets.length === 0 ? (
                <p className="text-sm text-text-muted">Aucun ticket.</p>
              ) : (
                <ul className="space-y-2">
                  {detail.tickets.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 rounded-field bg-[#FAFAFA] px-3 py-2 text-sm">
                      <span>
                        {t.subject}
                        <span className="block text-xs text-text-muted">{fdatetime(t.created_at)}</span>
                      </span>
                      {canSupport ? (
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
                      ) : (
                        <Badge>{STATUS_LABEL[t.status]}</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Section>
      )}

      <Section title="Historique" sub="Événements de la plateforme et actions Super Admin sur cette entreprise.">
        {detail.history.length === 0 ? (
          <p className="kpi-card text-sm text-text-muted">Aucun événement.</p>
        ) : (
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            {detail.history.map((e, i) => (
              <div key={i} className="flex items-start justify-between gap-3 border-t border-border px-3 py-2 text-sm first:border-t-0">
                <div className="min-w-0">
                  <span className="font-medium">{EVENT_LABEL[e.type] ?? e.type}</span>
                  {e.source === 'admin' && <Badge tone="info">{e.actor ?? 'Super Admin'}</Badge>}
                  {e.detail && <span className="block truncate text-xs text-text-muted">{e.detail}</span>}
                </div>
                <span className="shrink-0 text-xs text-text-muted">{fdatetime(e.at)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {pending && (
        <ConfirmDialog
          title={
            pending.kind === 'suspend'
              ? `Suspendre ${detail.name} ?`
              : pending.kind === 'reactivate'
                ? `Réactiver ${detail.name} ?`
                : pending.kind === 'deactivate-user'
                  ? `Désactiver ${pending.name} ?`
                  : pending.label
          }
          message={
            pending.kind === 'suspend'
              ? 'Plus personne de cette entreprise ne pourra se connecter ni synchroniser tant qu’elle n’est pas réactivée. Action tracée dans l’audit.'
              : 'Cette action est tracée dans le journal d’audit Super Admin.'
          }
          confirmLabel="Confirmer"
          danger={pending.kind === 'suspend' || pending.kind === 'deactivate-user'}
          askReason
          onConfirm={confirmAction}
          onClose={() => setPending(null)}
        />
      )}
    </>
  );
}
