'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, Check, Copy, KeyRound, Search } from 'lucide-react';

import { ApiError, recoverBusinessCode, RecoverCodeResult } from '../../lib/api';
import Logo from '../components/Logo';

export default function RecoverCodePage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecoverCodeResult | null>(null);

  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await recoverBusinessCode({
        business_name: businessName.trim(),
        owner_full_name: ownerName.trim(),
        owner_phone: ownerPhone.trim(),
      });
      setResult(res);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Récupération impossible. Vérifie ta connexion et réessaie.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo variant="full" className="h-auto w-full max-w-[280px]" />
        </div>

        {result ? (
          <RecoverResultCard result={result} onContinue={() => router.replace('/login')} />
        ) : (
          <div className="rounded-block bg-surface p-6 shadow-sm">
            <button
              type="button"
              onClick={() => router.back()}
              className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-text-muted transition hover:text-text"
            >
              <ArrowLeft size={16} /> Retour
            </button>

            <div className="mb-5 flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-field bg-background text-white">
                <KeyRound size={20} />
              </span>
              <div>
                <h1 className="font-heading text-lg font-extrabold text-background">Code entreprise oublié ?</h1>
                <p className="text-xs text-text-muted">Retrouve ton code en 30 secondes, sans contact avec le support.</p>
              </div>
            </div>

            {error && <div className="badge-danger mb-4 block rounded-field px-3 py-2 text-sm">{error}</div>}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <label className="field-label" htmlFor="business_name">
                Nom de l&rsquo;entreprise
              </label>
              <input
                id="business_name"
                className="field-input mb-4"
                placeholder="ex. Boutique Awa"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
              />
              <label className="field-label" htmlFor="owner_name">
                Ton nom (propriétaire)
              </label>
              <input
                id="owner_name"
                className="field-input mb-4"
                placeholder="ex. Awa Ngo"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                required
              />
              <label className="field-label" htmlFor="owner_phone">
                Numéro de téléphone du compte
              </label>
              <input
                id="owner_phone"
                className="field-input mb-5"
                placeholder="ex. 6 90 00 00 00"
                inputMode="tel"
                value={ownerPhone}
                onChange={(e) => setOwnerPhone(e.target.value)}
                required
              />
              <p className="mb-4 text-xs leading-relaxed text-text-muted">
                Les trois informations doivent correspondre exactement à celles saisies à la création de l&rsquo;entreprise. Ton code PIN, lui,
                n&rsquo;est jamais demandé ici.
              </p>
              <button type="submit" className="btn-accent w-full" disabled={busy}>
                <Search size={18} />
                Retrouver mon code
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function RecoverResultCard({ result, onContinue }: { result: RecoverCodeResult; onContinue: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.business_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponible — pas bloquant */
    }
  };

  return (
    <div className="rounded-block bg-surface p-6 text-center shadow-sm">
      <div className="mb-3 flex items-center justify-center gap-2 text-success">
        <Check size={22} />
        <h1 className="font-heading text-lg font-extrabold text-background">Code retrouvé</h1>
      </div>
      <p className="text-sm text-text-muted">
        Entreprise <span className="font-semibold text-text">{result.business_name}</span> — note bien ce code : c&rsquo;est celui de ta
        connexion, avec ton PIN.
      </p>

      <button
        type="button"
        onClick={copy}
        className="mt-4 flex w-full items-center justify-between gap-3 rounded-field border border-border bg-background px-4 py-3 text-left transition hover:opacity-90"
        title="Copier le code entreprise"
      >
        <span>
          <span className="block text-[10px] font-medium uppercase tracking-wide text-white/50">Code entreprise</span>
          <span className="font-heading text-2xl font-extrabold tracking-widest text-accent">{result.business_code}</span>
        </span>
        {copied ? <Check size={20} className="shrink-0 text-success" /> : <Copy size={20} className="shrink-0 text-white/60" />}
      </button>

      <button type="button" className="btn-accent mt-5 w-full" onClick={onContinue}>
        <Building2 size={18} />
        Me connecter maintenant
      </button>
    </div>
  );
}
