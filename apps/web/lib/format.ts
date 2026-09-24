// Formatage monétaire et dates (FCFA entier).

export function formatFcfa(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}${Math.abs(Math.round(amount)).toLocaleString('fr-FR')} FCFA`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatDate(iso)} à ${formatTime(iso)}`;
}

export function paymentLabel(method: string): string {
  if (method === 'credit') return 'Crédit';
  if (method === 'mobile_money') return 'Mobile Money';
  if (method === 'orange_money') return 'Orange Money';
  return 'Cash';
}

export function channelLabel(channel: string | null | undefined): string {
  if (channel === 'mobile_money') return 'Mobile Money';
  if (channel === 'orange_money') return 'Orange Money';
  return 'Cash';
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}