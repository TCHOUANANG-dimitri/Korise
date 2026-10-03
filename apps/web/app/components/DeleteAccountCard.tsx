'use client';

import { useState } from 'react';
import { FileDown, FileSpreadsheet, FileText, Trash2 } from 'lucide-react';

import { ApiError, downloadFile, scheduleBusinessDeletion, verifyPin } from '../../lib/api';
import { getSession, setSession } from '../../lib/session';

export const DELETION_GRACE_DAYS = 7;

type Step = 'idle' | 'pin' | 'choice';
type Choice = 'export' | 'everything' | null;

// Suppression du compte propriétaire = suppression de l'entreprise entière (décision du fondateur,
// 2026-09-30) : PIN d'abord, puis « télécharger l'historique puis supprimer » ou « tout supprimer ».
// Dans les deux cas l'effacement a lieu 7 jours plus tard, annulable jusque-là.
export default function DeleteAccountCard() {
  const [step, setStep] = useState<Step>('idle');
  const [pin, setPin] = useState('');
  const [choice, setChoice] = useState<Choice>(null);
  const [downloaded, setDownloaded] = useState({ pdf: false, xlsx: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep('idle');
    setPin('');
    setChoice(null);
    setDownloaded({ pdf: false, xlsx: false });
    setError(null);
  };

  const checkPin = async () => {
    setBusy(true);
    setError(null);
    try {
      await verifyPin(pin);
      setStep('choice');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? 'PIN incorrect.' : 'Vérification impossible (connexion requise).');
    } finally {
      setBusy(false);
    }
  };

  const download = async (kind: 'pdf' | 'xlsx') => {
    setError(null);
    try {
      await downloadFile(`/business/export.${kind}`, `historique-korise.${kind}`);
      setDownloaded((d) => ({ ...d, [kind]: true }));
    } catch {
      setError('Téléchargement impossible (connexion requise).');
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const business = await scheduleBusinessDeletion(pin, choice === 'export');
      const session = getSession();
      if (session) setSession({ ...session, deletion_scheduled_for: business.deletion_scheduled_for ?? null });
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? 'PIN incorrect.' : 'Suppression impossible (connexion requise).');
      setBusy(false);
    }
  };

  return (
    <div className="kpi-card mt-5 border-danger/40">
      <h2 className="mb-2 flex items-center gap-2 font-heading text-base font-bold text-danger">
        <Trash2 size={16} /> Supprimer mon compte
      </h2>
      <p className="mb-3 text-sm text-text-muted">
        Supprime l’entreprise entière : ton compte, tous les employés, les produits et tout l’historique. L’effacement a lieu{' '}
        {DELETION_GRACE_DAYS} jours après ta demande ; d’ici là tu peux annuler, et tes employés ne peuvent plus se connecter.
      </p>

      {step === 'idle' && (
        <button type="button" className="btn-secondary !px-3 !py-2 text-sm text-danger" onClick={() => setStep('pin')}>
          <Trash2 size={16} /> Supprimer mon compte
        </button>
      )}

      {step === 'pin' && (
        <div className="max-w-xs">
          <label className="field-label" htmlFor="delete-pin">Confirme avec ton PIN</label>
          <input
            id="delete-pin"
            className="field-input"
            type="password"
            inputMode="numeric"
            maxLength={8}
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && pin.length >= 4 && void checkPin()}
          />
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn-secondary !px-3 !py-2 text-sm" onClick={reset}>
              Annuler
            </button>
            <button type="button" className="btn-primary !px-3 !py-2 text-sm" disabled={busy || pin.length < 4} onClick={() => void checkPin()}>
              Continuer
            </button>
          </div>
        </div>
      )}

      {step === 'choice' && (
        <div className="space-y-3">
          <p className="field-label">Que veux-tu faire de ton historique ?</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <OptionCard
              selected={choice === 'export'}
              onSelect={() => setChoice('export')}
              icon={<FileDown size={18} />}
              title="Télécharger l’historique puis supprimer"
              text="Ventes, argent, stock, clôtures, shifts, clients et équipe — en PDF (résumé) et Excel (détail)."
            />
            <OptionCard
              selected={choice === 'everything'}
              onSelect={() => setChoice('everything')}
              icon={<Trash2 size={18} />}
              title="Tout supprimer"
              text="Aucun fichier conservé. Tout est effacé définitivement au bout de 7 jours."
            />
          </div>

          {choice === 'export' && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary !px-3 !py-2 text-sm" onClick={() => void download('pdf')}>
                <FileText size={16} /> {downloaded.pdf ? 'PDF téléchargé' : 'Télécharger le PDF'}
              </button>
              <button type="button" className="btn-secondary !px-3 !py-2 text-sm" onClick={() => void download('xlsx')}>
                <FileSpreadsheet size={16} /> {downloaded.xlsx ? 'Excel téléchargé' : 'Télécharger l’Excel'}
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary !px-3 !py-2 text-sm" onClick={reset}>
              Garder mon compte
            </button>
            <button
              type="button"
              className="btn-primary !bg-danger !px-3 !py-2 text-sm"
              disabled={busy || choice === null || (choice === 'export' && !downloaded.pdf && !downloaded.xlsx)}
              onClick={() => void confirm()}
            >
              <Trash2 size={16} /> Supprimer dans {DELETION_GRACE_DAYS} jours
            </button>
          </div>
          {choice === 'export' && !downloaded.pdf && !downloaded.xlsx && (
            <p className="text-xs text-text-muted">Télécharge au moins un fichier pour continuer.</p>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}

function OptionCard(props: { selected: boolean; onSelect: () => void; icon: React.ReactNode; title: string; text: string }) {
  return (
    <button
      type="button"
      onClick={props.onSelect}
      className={`rounded-field border p-3 text-left transition ${props.selected ? 'border-background ring-1 ring-background' : 'border-border hover:bg-[#F9FAFB]'}`}
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        {props.icon} {props.title}
      </span>
      <span className="mt-1 block text-xs text-text-muted">{props.text}</span>
    </button>
  );
}
