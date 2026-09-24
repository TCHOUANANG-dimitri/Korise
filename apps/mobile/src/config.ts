// Configuration applicative. L'identité (business/user) vient désormais du
// serveur via l'auth (JWT + session locale), plus aucun ID en dur.
// Même backend (FastAPI sur Vercel -> Supabase) que le web. Pour développer contre
// un backend local depuis l'émulateur : EXPO_PUBLIC_API_URL=http://10.0.2.2:8000
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://biz-flow-ge7w.vercel.app';

export const SYNC_INTERVAL_MS = 3 * 60 * 1000;
export const MAX_BACKOFF_MS = 2 * 60 * 1000;
export const PAYMENT_METHODS = ['cash', 'mobile_money', 'orange_money', 'credit'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  mobile_money: 'Mobile Money',
  orange_money: 'Orange Money',
  credit: 'Crédit',
};

export const PIN_MIN = 4;
export const PIN_MAX = 8;