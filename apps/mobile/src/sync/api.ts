// Client REST des endpoints de synchronisation (packages/shared/openapi.json).
// Le serveur dériva business_id/user_id du token — aucune de ces valeurs dans
// le corps du push ni dans la query du pull.

import { apiFetch } from '../api/client';

export interface PushResult {
  client_uuid: string;
  status: 'accepted' | 'duplicate' | 'rejected';
  detail?: string | null;
}

export interface PushResponse {
  sales: PushResult[];
  money_movements: PushResult[];
  stock_movements: PushResult[];
  daily_closings: PushResult[];
  customers: PushResult[];
  credit_repayments: PushResult[];
  shifts: PushResult[];
}

export interface PushBody {
  sales: Record<string, unknown>[];
  money_movements: Record<string, unknown>[];
  stock_movements: Record<string, unknown>[];
  daily_closings: Record<string, unknown>[];
  customers: Record<string, unknown>[];
  credit_repayments: Record<string, unknown>[];
  shifts: Record<string, unknown>[];
}

export interface PullResponse {
  sales: Record<string, unknown>[];
  money_movements: Record<string, unknown>[];
  stock_movements: Record<string, unknown>[];
  daily_closings: Record<string, unknown>[];
  customers: Record<string, unknown>[];
  cursors: Record<string, string | null>;
}

export function push(body: PushBody): Promise<PushResponse> {
  return apiFetch<PushResponse>('/sync/push', { method: 'POST', body });
}

export interface PullParams {
  since_sales?: string | null;
  since_money_movements?: string | null;
  since_stock_movements?: string | null;
  since_daily_closings?: string | null;
  since_customers?: string | null;
}

export function pull(params: PullParams): Promise<PullResponse> {
  const qs = new URLSearchParams();
  if (params.since_sales) qs.set('since_sales', params.since_sales);
  if (params.since_money_movements) qs.set('since_money_movements', params.since_money_movements);
  if (params.since_stock_movements) qs.set('since_stock_movements', params.since_stock_movements);
  if (params.since_daily_closings) qs.set('since_daily_closings', params.since_daily_closings);
  if (params.since_customers) qs.set('since_customers', params.since_customers);
  return apiFetch<PullResponse>(`/sync/pull?${qs.toString()}`);
}