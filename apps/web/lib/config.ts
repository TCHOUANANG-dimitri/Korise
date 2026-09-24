// En local (web ou desktop Tauri), le backend tourne sur localhost. Ailleurs
// (déploiement Vercel), on tape le backend FastAPI déployé séparément sur
// Vercel (voir backend/, connecté à Supabase).
export const API_BASE_URL =
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://127.0.0.1:8000'
    : 'https://biz-flow-ge7w.vercel.app';

export const SYNC_INTERVAL_MS = 60_000;
export const MAX_BACKOFF_MS = 2 * 60 * 1000;
export const PAYMENT_METHODS = ['cash', 'mobile_money', 'orange_money', 'credit'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  mobile_money: 'Mobile Money',
  orange_money: 'Orange Money',
  credit: 'Crédit',
};

// Canaux de mouvement d'argent — même liste que PAYMENT_METHODS moins "credit"
// (un mouvement d'argent réel, lui, n'a jamais de canal "crédit" : le crédit ne
// touche la caisse qu'au remboursement, via l'un des trois vrais canaux).
export const MONEY_CHANNELS = ['cash', 'mobile_money', 'orange_money'] as const;
export type MoneyChannel = (typeof MONEY_CHANNELS)[number];
export const MONEY_CHANNEL_LABELS: Record<MoneyChannel, string> = {
  cash: 'Cash',
  mobile_money: 'Mobile Money',
  orange_money: 'Orange Money',
};
