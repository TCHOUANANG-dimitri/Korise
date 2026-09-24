'use client';

import { useEffect, useState } from 'react';
import { Check, CheckCircle2, Copy, Crown, FileText, RefreshCw, Settings2, UserPlus, UserX, Users } from 'lucide-react';

import { useData } from '../../lib/useData';
import { createEmployee, listEmployees, openPdf, updateEmployee, EmployeeApi } from '../../lib/api';
import { getSession } from '../../lib/session';

const PIN_MIN = 4;
const PIN_MAX = 8;

export default function TeamPage() {
  const version = useData();
  const session = getSession();
  const isOwner = session?.role === 'owner';
  const [employees, setEmployees] = useState<EmployeeApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionFlash, setActionFlash] = useState<string | null>(null);

  const savePerm = async (e: EmployeeApi, next: { can_view_purchase_prices: boolean; can_view_owner_dashboard: boolean }) => {
    setSavingId(e.id);
    try {
      await updateEmployee(e.id, next);
      setActionFlash(`Permissions de ${e.full_name} à jour.`);
      window.setTimeout(() => setActionFlash(null), 4000);
    } finally {
      setSavingId(null);
      setEditingId(null);
      load();
    }
  };

  const deactivate = async (e: EmployeeApi) => {
    if (!window.confirm(`Désactiver le compte de ${e.full_name} ? Il ne pourra plus se connecter.`)) return;
    setSavingId(e.id);
    try {
      await updateEmployee(e.id, { is_active: false });
      setActionFlash(`${e.full_name} désactivé(e).`);
      window.setTimeout(() => setActionFlash(null), 4000);
    } finally {
      setSavingId(null);
      setEditingId(null);
      load();
    }
  };

  const load = () => {
    setLoading(true);
    void listEmployees()
      .then((list) => setEmployees(list))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  if (!isOwner) {
    return (
      <div className="mt-4 flex items-start gap-2 rounded-field border border-border bg-surface px-3 py-3 text-sm text-text-muted">
        <Users size={18} className="mt-0.5 shrink-0" />
        <span>L&rsquo;équipe est gérée par le propriétaire. Connecte-toi avec le compte patron pour voir et créer des employés.</span>
      </div>
    );
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-background">Équipe</h1>
          <p className="text-sm text-text-muted">Employés, rôles et permissions — chaque action sensible est tracée (Journal).</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary !px-3 !py-2" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualiser
          </button>
          <button type="button" className="btn-accent !px-3 !py-2" onClick={() => setOpen((v) => !v)}>
            <UserPlus size={16} /> {open ? 'Fermer' : 'Ajouter'}
          </button>
        </div>
      </div>

      {session && <BusinessCodeCard code={session.business_code} />}

      {actionFlash && (
        <div className="mb-4 flex items-center gap-2 rounded-field bg-success px-3 py-3 text-sm font-medium text-white">
          <CheckCircle2 size={18} /> {actionFlash}
        </div>
      )}

      {open && <CreateEmployeeForm onCreated={() => { setOpen(false); load(); }} />}

      {employees.length === 0 && !loading && (
        <p className="text-sm text-text-muted">Aucun employé — ajoute ton premier collaborateur.</p>
      )}

      <div className="space-y-3">
        {employees.map((e) => {
          const isOwnerUser = e.role === 'owner';
          const editing = editingId === e.id;
          const saving = savingId === e.id;
          return (
            <div key={e.id} className="kpi-card">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {isOwnerUser ? <Crown size={16} className="text-warning" /> : <Users size={16} className="text-text-muted" />}
                    <strong className="truncate">{e.full_name}</strong>
                    <span className={`badge ${isOwnerUser ? 'badge-primary' : 'badge'}`}>
                      {isOwnerUser ? 'propriétaire' : 'employé'}
                    </span>
                    {!e.is_active && <span className="badge badge-danger">désactivé</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-sm text-text-muted">
                    {e.phone && <span>{e.phone}</span>}
                    {e.can_view_purchase_prices && <span className="badge badge-warning">prix d&rsquo;achat</span>}
                    {e.can_view_owner_dashboard && <span className="badge badge-primary">dashboard patron</span>}
                    {!isOwnerUser && !e.can_view_purchase_prices && !e.can_view_owner_dashboard && (
                      <span>permissions restreintes</span>
                    )}
                  </div>
                </div>
                {!isOwnerUser && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-secondary !px-3 !py-1.5 text-sm"
                      title="Ventes, shifts et écarts des 30 derniers jours"
                      onClick={() => void openPdf(`/reports/employee.pdf?user_id=${e.id}`).catch(() => setActionFlash('PDF indisponible (connexion requise).'))}
                    >
                      <FileText size={15} /> Rapport
                    </button>
                    <button
                      type="button"
                      className="btn-secondary !px-3 !py-1.5 text-sm"
                      onClick={() => setEditingId(editing ? null : e.id)}
                      disabled={saving}
                    >
                      <Settings2 size={15} /> {editing ? 'Fermer' : 'Modifier'}
                    </button>
                  </div>
                )}
              </div>

              {editing && (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="field-label mb-2">Permissions</p>
                  <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={e.can_view_purchase_prices}
                      onChange={(ev) => {
                        const next = { ...e, can_view_purchase_prices: ev.target.checked } as EmployeeApi;
                        setEmployees((prev) => prev.map((x) => (x.id === e.id ? next : x)));
                      }}
                    />
                    Voir les prix d&rsquo;achat
                  </label>
                  <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={e.can_view_owner_dashboard}
                      onChange={(ev) => {
                        const next = { ...e, can_view_owner_dashboard: ev.target.checked } as EmployeeApi;
                        setEmployees((prev) => prev.map((x) => (x.id === e.id ? next : x)));
                      }}
                    />
                    Voir le dashboard patron
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-accent !px-3 !py-1.5 text-sm"
                      disabled={saving}
                      onClick={() =>
                        void savePerm(e, {
                          can_view_purchase_prices: e.can_view_purchase_prices,
                          can_view_owner_dashboard: e.can_view_owner_dashboard,
                        })
                      }
                    >
                      {saving ? 'Enregistrement…' : 'Enregistrer les permissions'}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary !px-3 !py-1.5 text-sm text-danger"
                      disabled={saving || !e.is_active}
                      onClick={() => void deactivate(e)}
                    >
                      <UserX size={15} /> Désactiver le compte
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// C'est le code que chaque employé doit saisir (avec son propre PIN) pour se
// connecter — voir ce même composant dans Sidebar.tsx et l'écran d'inscription.
function BusinessCodeCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponible — pas bloquant */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="mb-5 flex w-full items-center justify-between gap-3 rounded-field border border-border bg-background px-4 py-3 text-left transition hover:opacity-90"
      title="Copier le code entreprise"
    >
      <span>
        <span className="block text-[10px] font-medium uppercase tracking-wide text-white/50">
          Code entreprise — à donner à chaque employé pour se connecter
        </span>
        <span className="font-heading text-xl font-extrabold tracking-widest text-accent">{code}</span>
      </span>
      {copied ? <Check size={20} className="shrink-0 text-success" /> : <Copy size={20} className="shrink-0 text-white/60" />}
    </button>
  );
}

function CreateEmployeeForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [viewPrices, setViewPrices] = useState(false);
  const [viewDashboard, setViewDashboard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdPin, setCreatedPin] = useState<string | null>(null);

  const valid = name.trim() !== '' && pin.length >= PIN_MIN && pin.length <= PIN_MAX;

  const submit = () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    void createEmployee({
      full_name: name.trim(),
      phone: phone.trim() || null,
      pin,
      can_view_purchase_prices: viewPrices,
      can_view_owner_dashboard: viewDashboard,
    })
      .then(() => {
        setCreatedPin(pin);
        setName('');
        setPhone('');
        setPin('');
        setViewPrices(false);
        setViewDashboard(false);
        onCreated();
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Création impossible.'))
      .finally(() => setBusy(false));
  };

  return (
    <div className="mb-5 rounded-field border border-border bg-surface p-4">
      <h2 className="mb-4 font-heading text-lg font-bold">Créer un employé</h2>

      <label className="field-label" htmlFor="ename">Nom complet</label>
      <input id="ename" className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Marc Eyenga" />

      <label className="mt-3 field-label" htmlFor="ephone">Téléphone (optionnel)</label>
      <input id="ephone" className="field-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="ex. 6 90 00 00 00" />

      <label className="mt-3 field-label" htmlFor="epin">PIN (4 à 8 chiffres, à remettre à l&rsquo;employé)</label>
      <input id="epin" className="field-input" inputMode="numeric" maxLength={PIN_MAX} value={pin} onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))} placeholder="ex. 1234" />

      <div className="mt-4 space-y-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={viewPrices} onChange={(e) => setViewPrices(e.target.checked)} />
          Voir les prix d&rsquo;achat
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={viewDashboard} onChange={(e) => setViewDashboard(e.target.checked)} />
          Voir le dashboard patron
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {createdPin && (
        <p className="mt-3 flex items-center gap-2 rounded-field border border-success/30 bg-success/10 px-3 py-2 text-sm font-medium text-success">
          <CheckCircle2 size={16} /> Employé créé — PIN à transmettre : {createdPin}
        </p>
      )}

      <div className="mt-4">
        <button type="button" className="btn-accent w-full" disabled={busy || !valid} onClick={submit}>
          {busy ? 'Création…' : 'Créer l’employé'}
        </button>
      </div>
    </div>
  );
}