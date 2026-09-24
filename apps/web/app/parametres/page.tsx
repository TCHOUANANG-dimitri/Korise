'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ImagePlus, Lock, Trash2 } from 'lucide-react';

import { fetchBusinessSettings, updateBusinessSettings, BusinessSettingsApi } from '../../lib/api';
import { getSession } from '../../lib/session';
import { APP_VERSION, getDeviceKey, getPlatform } from '../../lib/telemetry';
import { getLockMinutes, setLockMinutes } from '../../lib/lock';

// Réduit le logo côté navigateur (≤ 256 px, PNG) avant envoi : le serveur le range dans la
// fiche entreprise et l'utilise dans les PDF (reçus, factures, rapports).
async function fileToLogo(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

export default function SettingsPage() {
  const session = getSession();
  const isOwner = session?.role === 'owner';
  const [data, setData] = useState<BusinessSettingsApi | null>(null);
  const [form, setForm] = useState({ name: '', sector: '', address: '', phone: '', email: '' });
  const [logo, setLogo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lockMin, setLockMin] = useState(getLockMinutes());

  useEffect(() => {
    fetchBusinessSettings()
      .then((b) => {
        setData(b);
        setForm({ name: b.name, sector: b.sector ?? '', address: b.address ?? '', phone: b.phone ?? '', email: b.email ?? '' });
        setLogo(b.logo_data);
      })
      .catch(() => setError('Paramètres indisponibles (connexion requise).'));
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateBusinessSettings({
        name: form.name.trim(),
        sector: form.sector.trim() || null,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        logo_data: logo ?? '',
      });
      setData(updated);
      setFlash('Paramètres enregistrés — ils apparaissent sur les reçus, factures et rapports PDF.');
      window.setTimeout(() => setFlash(null), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  };

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      setLogo(await fileToLogo(file));
    } catch {
      setError('Image illisible — choisis un PNG ou JPG.');
    }
  };

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-background">Paramètres</h1>
        <p className="text-sm text-text-muted">Identité de l’entreprise (reçus, factures, rapports) et sécurité de la caisse.</p>
      </div>

      {flash && (
        <div className="mb-4 flex items-center gap-2 rounded-field bg-success px-3 py-3 text-sm font-medium text-white">
          <CheckCircle2 size={18} /> {flash}
        </div>
      )}
      {error && <p className="mb-4 text-sm font-medium text-danger">{error}</p>}

      <div className="kpi-card mb-5">
        <h2 className="mb-3 font-heading text-base font-bold text-background">Entreprise</h2>
        {!isOwner && <p className="mb-3 text-sm text-text-muted">Seul le propriétaire peut modifier ces informations.</p>}

        <div className="mb-4 flex items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-card border border-border bg-[#FAFAFA]">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="Logo de l’entreprise" className="max-h-full max-w-full object-contain" />
            ) : (
              <ImagePlus size={24} className="text-text-muted" />
            )}
          </div>
          {isOwner && (
            <div className="flex flex-wrap gap-2">
              <label className="btn-secondary cursor-pointer !px-3 !py-2 text-sm">
                <ImagePlus size={16} /> Choisir un logo
                <input type="file" accept="image/*" className="hidden" onChange={(e) => void pickLogo(e.target.files?.[0])} />
              </label>
              {logo && (
                <button type="button" className="btn-secondary !px-3 !py-2 text-sm" onClick={() => setLogo(null)}>
                  <Trash2 size={16} /> Retirer
                </button>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nom de l’entreprise" value={form.name} disabled={!isOwner} onChange={(v) => setForm({ ...form, name: v })} />
          <Field label="Activité / secteur" value={form.sector} disabled={!isOwner} onChange={(v) => setForm({ ...form, sector: v })} />
          <Field label="Adresse" value={form.address} disabled={!isOwner} onChange={(v) => setForm({ ...form, address: v })} />
          <Field label="Téléphone" value={form.phone} disabled={!isOwner} onChange={(v) => setForm({ ...form, phone: v })} />
          <Field label="Email" value={form.email} disabled={!isOwner} onChange={(v) => setForm({ ...form, email: v })} />
          <div>
            <p className="field-label">Devise</p>
            <p className="py-2.5 text-sm font-semibold">FCFA (XAF)</p>
          </div>
        </div>

        {isOwner && (
          <button type="button" className="btn-accent mt-4" onClick={() => void save()} disabled={busy || !form.name.trim()}>
            Enregistrer
          </button>
        )}
      </div>

      <div className="kpi-card mb-5">
        <h2 className="mb-3 flex items-center gap-2 font-heading text-base font-bold text-background">
          <Lock size={16} /> Verrouillage de la caisse
        </h2>
        <p className="mb-3 text-sm text-text-muted">
          Après une période d’inactivité, la caisse se verrouille : il faut retaper son PIN (ou changer d’utilisateur). Utile sur une caisse
          partagée.
        </p>
        <select
          className="field-input max-w-xs"
          value={lockMin}
          onChange={(e) => {
            const v = Number(e.target.value);
            setLockMin(v);
            setLockMinutes(v);
          }}
        >
          <option value={0}>Jamais</option>
          <option value={1}>1 minute</option>
          <option value={5}>5 minutes</option>
          <option value={10}>10 minutes</option>
          <option value={30}>30 minutes</option>
        </select>
      </div>

      <div className="kpi-card">
        <h2 className="mb-3 font-heading text-base font-bold text-background">Cet appareil</h2>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Info label="Compte" value={`${session?.full_name ?? '—'} (${session?.role === 'owner' ? 'propriétaire' : 'employé'})`} />
          <Info label="Code entreprise" value={data?.business_code ?? session?.business_code ?? '—'} />
          <Info label="Plateforme" value={getPlatform() === 'windows' ? 'Windows' : 'Web'} />
          <Info label="Version" value={APP_VERSION} />
          <Info label="Identifiant appareil" value={getDeviceKey().slice(-8)} />
        </dl>
      </div>
    </>
  );
}

function Field({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <input className="field-input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="field-label !mb-0">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
