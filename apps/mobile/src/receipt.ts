import { Share } from 'react-native';

import { getSessionSync } from './auth/session';
import { formatFcfa } from './format';

// Reçu léger post-vente : un texte structuré à partager (WhatsApp/SMS), utilisable hors-ligne.
// Le reçu / la facture PDF brandés (logo et coordonnées de l'entreprise) viennent du serveur — voir pdf.ts.
export interface ReceiptLine {
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface ReceiptData {
  lines: ReceiptLine[];
  total: number;
  paymentMethod: string;
  customerName?: string | null;
  createdAt: string;
  saleIds?: string[];
}

export function paymentText(method: string, customerName?: string | null): string {
  if (method === 'cash') return 'Cash';
  if (method === 'mobile_money') return 'Mobile Money';
  if (method === 'orange_money') return 'Orange Money';
  return customerName ? `Crédit — ${customerName}` : 'Crédit';
}

function stamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${date} à ${time}`;
}

export function buildReceiptText(data: ReceiptData): string {
  const session = getSessionSync();
  return [
    session?.business_name || 'Korise',
    '—',
    ...data.lines.map((l) => `${l.quantity} × ${l.productName} @ ${formatFcfa(l.unitPrice)}`),
    `Total : ${formatFcfa(data.total)}`,
    `Paiement : ${paymentText(data.paymentMethod, data.customerName)}`,
    `Vendeur : ${session?.full_name ?? ''}`,
    stamp(data.createdAt),
  ].join('\n');
}

export async function shareReceipt(data: ReceiptData): Promise<void> {
  try {
    await Share.share({ message: buildReceiptText(data) });
  } catch {
    /* partage annulé ou indisponible — jamais bloquant pour la vente */
  }
}
