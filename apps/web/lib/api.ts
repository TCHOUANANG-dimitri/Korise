// Client REST du contrat publié dans packages/shared/openapi.json.
// Toutes les routes protégées exigent un Bearer token — business_id/user_id
// sont dérivés du token côté serveur, jamais envoyés par le client.

import { API_BASE_URL, MoneyChannel } from './config';
import { getSession, Session } from './session';
import { clientHeaders, getDeviceKey, getPlatform, APP_VERSION } from './telemetry';

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

export interface PullResponse {
  sales: Record<string, unknown>[];
  money_movements: Record<string, unknown>[];
  stock_movements: Record<string, unknown>[];
  daily_closings: Record<string, unknown>[];
  customers: Record<string, unknown>[];
  cursors: Record<string, string | null>;
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

export interface ProductApi {
  id: string;
  name: string;
  quantity: number;
  purchase_price?: number;
  selling_price: number;
  minimum_stock: number;
  is_active: boolean;
  barcode?: string | null;
  category?: string | null;
  is_stockable?: boolean;
}

export interface ExpectedCashApi {
  closing_date: string;
  expected_cash: number;
  expected_momo: number;
  expected_orange: number;
  sales_total: number;
  income_total: number;
  expense_total: number;
  withdrawal_total: number;
  credit_repayment_total: number;
}

export interface DashboardApi {
  day: string;
  sales_total: number;
  expense_total: number;
  income_total: number;
  withdrawal_total: number;
  expected_cash: number;
  latest_closing: {
    actual_cash: number;
    expected_cash: number;
    difference: number;
    note: string | null;
    created_at: string;
  } | null;
  stock_alerts: { product_id: string; name: string; quantity: number; minimum_stock: number }[];
  top_products: { product_id: string; name: string; quantity_sold: number; revenue: number }[];
  employee_activity: { user_id: string; full_name: string; sales_count: number; sales_total: number }[];
}

const TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(clientHeaders())) headers.set(k, v);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (auth) {
    const session = getSession();
    if (!session) throw new ApiError('Non connecté', 401);
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers, signal: controller.signal });
  } catch {
    throw new ApiError(`Backend injoignable (${API_BASE_URL})`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (body && body.detail) detail = JSON.stringify(body.detail);
    } catch {
      /* ignore */
    }
    throw new ApiError(`Erreur ${res.status}: ${detail}`, res.status);
  }
  return (await res.json()) as T;
}

// ===== Auth =====

export async function registerBusiness(input: {
  business_name: string;
  sector?: string;
  owner_full_name: string;
  owner_phone?: string;
  pin: string;
}): Promise<Session> {
  return request<Session>('/auth/register-business', { method: 'POST', body: JSON.stringify(input) }, false);
}

export async function login(input: { business_code: string; pin: string }): Promise<Session> {
  return request<Session>('/auth/login', { method: 'POST', body: JSON.stringify(input) }, false);
}

// ===== Sync =====

export async function push(body: PushBody): Promise<PushResponse> {
  return request<PushResponse>('/sync/push', { method: 'POST', body: JSON.stringify(body) });
}

export interface PullParams {
  since_sales?: string | null;
  since_money_movements?: string | null;
  since_stock_movements?: string | null;
  since_daily_closings?: string | null;
  since_customers?: string | null;
}

export async function pull(params: PullParams): Promise<PullResponse> {
  const qs = new URLSearchParams();
  if (params.since_sales) qs.set('since_sales', params.since_sales);
  if (params.since_money_movements) qs.set('since_money_movements', params.since_money_movements);
  if (params.since_stock_movements) qs.set('since_stock_movements', params.since_stock_movements);
  if (params.since_daily_closings) qs.set('since_daily_closings', params.since_daily_closings);
  if (params.since_customers) qs.set('since_customers', params.since_customers);
  const query = qs.toString();
  return request<PullResponse>(`/sync/pull${query ? `?${query}` : ''}`, { method: 'GET' });
}

// ===== Produits =====

export async function fetchProducts(): Promise<ProductApi[]> {
  return request<ProductApi[]>('/products', { method: 'GET' });
}

export interface ProductCreateInput {
  name: string;
  quantity?: number;
  purchase_price?: number;
  selling_price?: number;
  minimum_stock?: number;
  barcode?: string | null;
  category?: string | null;
  is_stockable?: boolean;
}

export interface ProductUpdateInput {
  name?: string;
  purchase_price?: number;
  selling_price?: number;
  minimum_stock?: number;
  is_active?: boolean;
  barcode?: string | null;
  category?: string | null;
  is_stockable?: boolean;
}

export async function createProduct(input: ProductCreateInput): Promise<ProductApi> {
  return request<ProductApi>('/products', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateProduct(productId: string, patch: ProductUpdateInput): Promise<ProductApi> {
  return request<ProductApi>(`/products/${productId}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

// ===== Équipe =====

export interface EmployeeApi {
  id: string;
  business_id: string;
  full_name: string;
  phone: string | null;
  role: 'owner' | 'employee';
  can_view_purchase_prices: boolean;
  can_view_owner_dashboard: boolean;
  is_active: boolean;
}

export async function createEmployee(input: {
  full_name: string;
  phone?: string | null;
  pin: string;
  can_view_purchase_prices?: boolean;
  can_view_owner_dashboard?: boolean;
}): Promise<EmployeeApi> {
  return request<EmployeeApi>('/auth/employees', { method: 'POST', body: JSON.stringify(input) });
}

export async function listEmployees(): Promise<EmployeeApi[]> {
  return request<EmployeeApi[]>('/auth/employees', { method: 'GET' });
}

export async function updateEmployee(
  employeeId: string,
  patch: { can_view_purchase_prices?: boolean; can_view_owner_dashboard?: boolean; is_active?: boolean },
): Promise<EmployeeApi> {
  return request<EmployeeApi>(`/auth/employees/${employeeId}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

// ===== Clients crédit =====

export interface CustomerApi {
  id: string;
  client_uuid: string;
  full_name: string;
  phone: string | null;
  balance: number;
}

export interface CustomerTxApi {
  kind: 'sale' | 'repayment';
  created_at: string;
  amount: number;
  product_name?: string | null;
  quantity?: number | null;
  channel?: string | null;
  note?: string | null;
}

export interface CustomerDetailApi extends CustomerApi {
  created_at: string;
  transactions: CustomerTxApi[];
}

export async function createCustomer(input: { client_uuid: string; full_name: string; phone?: string | null }): Promise<CustomerApi> {
  return request<CustomerApi>('/customers', { method: 'POST', body: JSON.stringify(input) });
}

export async function listCustomersOnline(): Promise<CustomerApi[]> {
  return request<CustomerApi[]>('/customers', { method: 'GET' });
}

export async function getCustomerDetail(customerId: string): Promise<CustomerDetailApi> {
  return request<CustomerDetailApi>(`/customers/${customerId}`, { method: 'GET' });
}

export async function recordRepayment(input: {
  client_uuid: string;
  customer_id: string;
  amount: number;
  channel: MoneyChannel;
  note?: string | null;
}): Promise<PushResult> {
  const res = await request<{ credit_repayments: PushResult[] }>('/sync/push', {
    method: 'POST',
    body: JSON.stringify({ credit_repayments: [input] }),
  });
  return res.credit_repayments[0];
}

// ===== Journal d'audit =====

export interface AuditEntry {
  id: string;
  created_at: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string | null;
  user_id: string;
  user_full_name: string;
  label: string | null;
}

export async function fetchAuditLog(params: { limit?: number; action?: string } = {}): Promise<AuditEntry[]> {
  const qs = new URLSearchParams();
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.action) qs.set('action', params.action);
  const query = qs.toString();
  return request<AuditEntry[]>(`/audit-log${query ? `?${query}` : ''}`, { method: 'GET' });
}

// ===== Clôture & dashboard =====

export async function fetchExpectedCash(closingDate: string): Promise<ExpectedCashApi> {
  return request<ExpectedCashApi>(`/closing/expected-cash?closing_date=${closingDate}`, { method: 'GET' });
}

export async function fetchDashboard(day: string): Promise<DashboardApi> {
  return request<DashboardApi>(`/dashboard/daily?day=${day}`, { method: 'GET' });
}


// ===== Télémétrie (Super Admin : appareils, versions, synchro) =====

export async function sendHeartbeat(input: {
  pending_ops: number;
  rejected_ops: number;
  sync_ok: boolean | null;
  sync_error?: string | null;
  pushed?: number;
}): Promise<void> {
  try {
    await request('/telemetry/heartbeat', {
      method: 'POST',
      body: JSON.stringify({
        device_key: getDeviceKey(),
        platform: getPlatform(),
        app_version: APP_VERSION,
        ...input,
      }),
    });
  } catch {
    /* la télémétrie ne doit jamais gêner l'utilisateur */
  }
}

// ===== Centre d'anomalies =====

export interface AnomalyApi {
  kind: 'closing_gap' | 'stock_adjustment' | 'price_deviation' | 'shift_gap';
  label: string;
  detail: string | null;
  probable_cause: string | null;
  amount: number | null;
  date: string;
  product_name: string | null;
  user_name: string | null;
  source_type: string;
  source_id: string;
  status: 'open' | 'resolved';
  resolved_at: string | null;
  resolution_note: string | null;
}

export interface RelatedOperationApi {
  at: string;
  kind: string;
  label: string;
  amount: number | null;
  channel: string | null;
  user_name: string | null;
}

export async function fetchAnomalies(params: { days?: number; only_open?: boolean } = {}): Promise<AnomalyApi[]> {
  const qs = new URLSearchParams();
  if (params.days) qs.set('days', String(params.days));
  if (params.only_open) qs.set('only_open', 'true');
  const q = qs.toString();
  return request<AnomalyApi[]>(`/anomalies${q ? `?${q}` : ''}`, { method: 'GET' });
}

export async function fetchAnomalyOperations(kind: string, sourceId: string): Promise<RelatedOperationApi[]> {
  return request<RelatedOperationApi[]>(`/anomalies/${kind}/${sourceId}/operations`, { method: 'GET' });
}

export async function resolveAnomaly(kind: string, sourceId: string, note: string | null): Promise<AnomalyApi> {
  return request<AnomalyApi>(`/anomalies/${kind}/${sourceId}/resolve`, { method: 'POST', body: JSON.stringify({ note }) });
}

// ===== Rapports =====

export interface ReportBucket {
  key: string;
  count: number;
  quantity: number;
  total: number;
}

export interface ReportSummaryApi {
  date_from: string;
  date_to: string;
  sales_count: number;
  sales_total: number;
  by_payment: ReportBucket[];
  by_product: ReportBucket[];
  by_employee: ReportBucket[];
  expenses_total: number;
  expenses_by_category: { key: string; total: number }[];
  income_total: number;
  withdrawals_total: number;
  credit_repayments_total: number;
  credit_granted: number;
  credit_outstanding: number;
  estimated_profit: number | null;
}

export async function fetchReportSummary(params: {
  date_from?: string;
  date_to?: string;
  user_id?: string;
  product_id?: string;
  payment_method?: string;
}): Promise<ReportSummaryApi> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  return request<ReportSummaryApi>(`/reports/summary?${qs.toString()}`, { method: 'GET' });
}

// Télécharge un PDF protégé (Bearer) et l'ouvre dans un nouvel onglet.
export async function openPdf(path: string): Promise<void> {
  const session = getSession();
  if (!session) throw new ApiError('Non connecté', 401);
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${session.access_token}`, ...clientHeaders() },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = String(((await res.json()) as { detail?: unknown }).detail ?? detail);
    } catch {
      /* ignore */
    }
    throw new ApiError(detail, res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ===== Paramètres entreprise =====

export interface BusinessSettingsApi {
  id: string;
  name: string;
  business_code: string;
  sector: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_data: string | null;
}

export async function fetchBusinessSettings(): Promise<BusinessSettingsApi> {
  return request<BusinessSettingsApi>('/business/me', { method: 'GET' });
}

export async function updateBusinessSettings(patch: Partial<Omit<BusinessSettingsApi, 'id' | 'business_code'>>): Promise<BusinessSettingsApi> {
  return request<BusinessSettingsApi>('/business/me', { method: 'PATCH', body: JSON.stringify(patch) });
}

// ===== Shifts =====

export interface ShiftApi {
  id: string;
  client_uuid: string;
  user_id: string;
  user_name: string | null;
  opened_at: string;
  opening_cash: number;
  closed_at: string | null;
  counted_cash: number | null;
  expected_cash: number | null;
  difference: number | null;
  note: string | null;
  operations_count: number;
  sales_total: number;
}

export async function fetchShifts(limit = 50): Promise<ShiftApi[]> {
  return request<ShiftApi[]>(`/shifts?limit=${limit}`, { method: 'GET' });
}
