'use client';

import { useCallback, useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';

import { createAdmin, fetchAdmins, fetchAudit, updateAdmin, AdminAudit, AdminUser, Role, ApiError } from '../../lib/api';
import { getAdminSession } from '../../lib/session';
import { EVENT_LABEL, fdatetime, ROLE_LABEL } from '../../lib/format';
import { Badge, ConfirmDialog, ErrorNote, Loading, PageHeader, Section } from '../../components/ui';

const ROLES: Role[] = ['owner', 'product_manager', 'support', 'developer'];

const ROLE_HELP: Record<Role, string> = {
  owner: 'Accès complet, configuration et données sensibles.',
  product_manager: 'Analytics, entreprises et usage ; accès financier limité.',
  support: 'Comptes, tickets et diagnostic ; pas d’accès financier global.',
  developer: 'Monitoring, logs, versions et synchronisation ; accès commercial limité.',
};

export default function AdministrationPage() {
  const me = getAdminSession();
  const [admins, setAdmins] = useState<AdminUser[] | null>(null);
  const [audit, setAudit] = useState<AdminAudit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('support');
  const [toggle, setToggle] = useState<AdminUser | null>(null);

  const load = useCallback(() => {
    fetchAdmins()
      .then(setAdmins)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Erreur de chargement'));
    fetchAudit()
      .then(setAudit)
      .catch(() => undefined);
  }, []);
  useEffect(load, [load]);

  const add = async () => {
    setError(null);
    try {
      await createAdmin({ email, full_name: fullName, password, role });
      setEmail('');
      setFullName('');
      setPassword('');
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Création impossible');
    }
  };

  return (
    <>
      <PageHeader title="Administration" sub="Comptes Super Admin, rôles et journal d’audit. Un compte individuel par personne, principe du moindre privilège." />
      <ErrorNote error={error} />

      <Section title="Comptes Super Admin">
        {!admins ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto rounded-card border border-border bg-surface">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Email</th>
                  <th>Rôle</th>
                  <th>Statut</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.id}>
                    <td className="font-medium">{a.full_name}</td>
                    <td className="text-text-muted">{a.email}</td>
                    <td>
                      <select
                        className="field-input !w-auto !py-1 text-sm"
                        value={a.role}
                        disabled={a.id === me?.super_admin_id}
                        onChange={async (e) => {
                          try {
                            await updateAdmin(a.id, { role: e.target.value as Role });
                            load();
                          } catch (err) {
                            setError(err instanceof ApiError ? err.message : 'Action refusée');
                          }
                        }}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                        ))}
                      </select>
                    </td>
                    <td>{a.is_active ? <Badge tone="good">Actif</Badge> : <Badge>Désactivé</Badge>}</td>
                    <td className="text-right">
                      {a.id !== me?.super_admin_id && (
                        <button type="button" className="text-xs font-semibold text-primary" onClick={() => setToggle(a)}>
                          {a.is_active ? 'Désactiver' : 'Réactiver'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="kpi-card mt-3">
          <h3 className="mb-2 font-heading text-sm font-bold">Ajouter un compte</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
            <input className="field-input !py-2" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nom complet" />
            <input className="field-input !py-2" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" />
            <input className="field-input !py-2" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe (8+)" type="password" />
            <select className="field-input !py-2" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
            <button type="button" className="btn-accent !py-2 text-sm" disabled={!email || !fullName || password.length < 8} onClick={() => void add()}>
              <UserPlus size={16} /> Créer
            </button>
          </div>
          <p className="mt-2 text-xs text-text-muted">{ROLE_HELP[role]}</p>
        </div>
      </Section>

      <Section title="Journal d’audit" sub="Connexions, suspensions, changements d’abonnement, modifications de comptes — jamais effaçable.">
        {audit.length === 0 ? (
          <p className="kpi-card text-sm text-text-muted">Aucune action enregistrée.</p>
        ) : (
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            {audit.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-3 border-t border-border px-3 py-2 text-sm first:border-t-0">
                <div className="min-w-0">
                  <span className="font-medium">{EVENT_LABEL[a.action] ?? a.action}</span>
                  <span className="ml-2 text-text-muted">— {a.admin_name}</span>
                  {a.details && <span className="block truncate text-xs text-text-muted">{a.details}</span>}
                </div>
                <span className="shrink-0 text-xs text-text-muted">{fdatetime(a.at)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {toggle && (
        <ConfirmDialog
          title={`${toggle.is_active ? 'Désactiver' : 'Réactiver'} ${toggle.full_name} ?`}
          message="Action sensible : elle est tracée dans le journal d’audit."
          confirmLabel="Confirmer"
          danger={toggle.is_active}
          onConfirm={async () => {
            try {
              await updateAdmin(toggle.id, { is_active: !toggle.is_active });
              load();
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Action refusée');
            }
          }}
          onClose={() => setToggle(null)}
        />
      )}
    </>
  );
}
