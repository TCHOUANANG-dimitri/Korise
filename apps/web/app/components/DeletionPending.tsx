'use client';

import { useState } from 'react';
import { FileSpreadsheet, FileText, LogOut, RotateCcw, Trash2 } from 'lucide-react';

import { cancelBusinessDeletion, downloadFile } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { clearSession, setSession, Session } from '../../lib/session';
import Logo from './Logo';

// Les dates du serveur sont en UTC sans suffixe : on l'ajoute avant l'affichage local.
function asUtc(iso: string): string {
  return /[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`;
}

// Écran unique pendant le délai de grâce de suppression : l'app métier est fermée, le propriétaire
// peut seulement récupérer son historique ou annuler (les employés ne peuvent plus se connecter).
export default function DeletionPending({ session }: { session: Session }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const when = formatDate(asUtc(session.deletion_scheduled_for ?? ''));

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      await cancelBusinessDeletion();
      setSession({ ...session, deletion_scheduled_for: null });
    } catch {
      setError('Annulation impossible (connexion requise).');
      setBusy(false);
    }
  };

  const download = (kind: 'pdf' | 'xlsx') =>
    void downloadFile(`/business/export.${kind}`, `historique-korise.${kind}`).catch(() =>
      setError('Téléchargement impossible (connexion requise).'),
    );

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-card bg-surface p-6">
        <Logo variant="icon" />
        <h1 className="mt-4 flex items-center gap-2 font-heading text-xl font-bold text-danger">
          <Trash2 size={20} /> Suppression en cours
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          L’entreprise <strong className="text-text">{session.business_name}</strong> et tout son historique seront effacés
          définitivement le <strong className="text-text">{when}</strong>. Tes employés ne peuvent plus se connecter.
        </p>

        <p className="field-label mt-5">Récupérer l’historique</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary !px-3 !py-2 text-sm" onClick={() => download('pdf')}>
            <FileText size={16} /> PDF
          </button>
          <button type="button" className="btn-secondary !px-3 !py-2 text-sm" onClick={() => download('xlsx')}>
            <FileSpreadsheet size={16} /> Excel
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <button type="button" className="btn-accent" disabled={busy} onClick={() => void cancel()}>
            <RotateCcw size={16} /> Annuler la suppression
          </button>
          <button type="button" className="btn-secondary" onClick={() => clearSession()}>
            <LogOut size={16} /> Se déconnecter
          </button>
        </div>
        {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
      </div>
    </div>
  );
}
