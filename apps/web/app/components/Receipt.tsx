'use client';

import { useState } from 'react';
import { Check, Copy, FileText, Receipt as ReceiptIcon, Share2 } from 'lucide-react';

import { getSession } from '../../lib/session';
import { formatDateTime, formatFcfa } from '../../lib/format';
import { openPdf } from '../../lib/api';
import { syncEngine } from '../../lib/sync';

// Reçu post-vente : texte léger partageable/copiable (fonctionne hors-ligne) + PDF brandé
// reçu / facture générés par le serveur (logo et coordonnées de l'entreprise — cahier fonctionnel §13),
// disponibles dès que la vente est synchronisée.
export interface ReceiptLine {
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface ReceiptData {
  lines: ReceiptLine[];
  total: number;
  paymentMethod: string; // 'cash' | 'mobile_money' | 'orange_money' | 'credit'
  customerName?: string | null;
  saleIds?: string[]; // client_uuid des ventes du panier — active les PDF reçu / facture
}

function paymentText(method: string, customerName?: string | null): string {
  if (method === 'cash') return 'Cash';
  if (method === 'mobile_money') return 'Mobile Money';
  if (method === 'orange_money') return 'Orange Money';
  return customerName ? `Crédit — ${customerName}` : 'Crédit';
}

export function buildReceiptText(data: ReceiptData): string {
  const session = getSession();
  return [
    session?.business_name || 'Korise',
    '—',
    ...data.lines.map((l) => `${l.quantity} × ${l.productName} @ ${l.unitPrice} FCFA`),
    `Total : ${data.total} FCFA`,
    `Paiement : ${paymentText(data.paymentMethod, data.customerName)}`,
    `Vendeur : ${session?.full_name ?? ''}`,
    formatDateTime(new Date().toISOString()),
  ].join('\n');
}

export default function Receipt({ data, onDone }: { data: ReceiptData; onDone?: () => void }) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'receipt' | 'invoice' | null>(null);
  const text = buildReceiptText(data);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 3000);
    } catch {
      /* clipboard indisponible */
    }
  };

  const share = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ text });
        setShared(true);
        return;
      } catch {
        /* partage annulé */
      }
    }
    // Repli partout où navigator.share n'existe pas (ex. Safari desktop).
    await copy();
  };

  const pdf = async (kind: 'receipt' | 'invoice') => {
    if (!data.saleIds || data.saleIds.length === 0) return;
    setBusy(kind);
    setPdfError(null);
    try {
      await syncEngine.syncNow(); // la vente doit exister côté serveur pour être imprimée
      await openPdf(`/${kind === 'receipt' ? 'receipts' : 'invoices'}.pdf?refs=${data.saleIds.join(',')}`);
    } catch (e) {
      setPdfError(
        e instanceof Error && /Introuvable|introuvable|injoignable/.test(e.message)
          ? 'PDF disponible dès que la vente est synchronisée (connexion requise).'
          : e instanceof Error
            ? e.message
            : 'PDF indisponible',
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="kpi-card">
      <pre className="mb-3 whitespace-pre-wrap font-body text-sm leading-relaxed">{text}</pre>
      <p className="mb-3 text-xs text-text-muted">Total {formatFcfa(data.total)}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-accent !px-3 !py-2" onClick={() => void share()}>
          <Share2 size={16} /> {shared ? 'Partagé' : 'Partager'}
        </button>
        <button type="button" className="btn-secondary !px-3 !py-2" onClick={() => void copy()}>
          {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copié' : 'Copier'}
        </button>
        {data.saleIds && data.saleIds.length > 0 && (
          <>
            <button type="button" className="btn-secondary !px-3 !py-2" disabled={busy !== null} onClick={() => void pdf('receipt')}>
              <ReceiptIcon size={16} /> {busy === 'receipt' ? 'Génération…' : 'Reçu PDF'}
            </button>
            <button type="button" className="btn-secondary !px-3 !py-2" disabled={busy !== null} onClick={() => void pdf('invoice')}>
              <FileText size={16} /> {busy === 'invoice' ? 'Génération…' : 'Facture PDF'}
            </button>
          </>
        )}
        {onDone && (
          <button type="button" className="btn-secondary !px-3 !py-2" onClick={onDone}>
            Nouvelle vente
          </button>
        )}
      </div>
      {pdfError && <p className="mt-2 text-xs font-medium text-warning">{pdfError}</p>}
    </div>
  );
}
