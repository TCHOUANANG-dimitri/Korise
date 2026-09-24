// Client REST des routes /admin/* du contrat publié dans packages/shared/openapi.json.

import { API_BASE_URL } from './config';
import { getAdminSession, AdminSession } from './session';

const TIMEOUT_MS = 20_000;

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
  if (init.body) headers.set('Content-Type', 'application/json');
  if (auth) {
    const session = getAdminSession();
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
      if (body && typeof body.detail === 'string') detail = body.detail;
      else if (body && body.detail) detail = JSON.stringify(body.detail);
    } catch {
      /* ignore */
    }
    throw new ApiError(detail, res.status);
  }
  return (await res.json()) as T;
}

const get = <T,>(path: string) => request<T>(path, { method: 'GET' });
const post = <T,>(path: string, body: unknown = {}) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });
const patch = <T,>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });

export type Role = 'owner' | 'product_manager' | 'support' | 'developer';

export async function adminLogin(input: { email: string; password: string }): Promise<AdminSession> {
  return request<AdminSession>('/admin/auth/login', { method: 'POST', body: JSON.stringify(input) }, false);
}

// ---------------------------------------------------------------- shared shapes

export interface BusinessHealth {
  value: 'healthy' | 'a_surveiller' | 'a_risque';
  last_activity_at: string | null;
  reasons: string[];
}

export interface BusinessListItem {
  id: string;
  name: string;
  business_code: string;
  sector: string | null;
  created_at: string;
  owner_full_name: string | null;
  owner_phone: string | null;
  employee_count: number;
  product_count: number;
  device_count: number;
  plan_name: string | null;
  subscription_status: string | null;
  subscription_ends_at: string | null;
  is_suspended: boolean;
  last_activity_at: string | null;
  sales_7d: number;
  last_sync_at: string | null;
  pending_ops: number;
  errors_7d: number;
  app_versions: string[];
  platforms: string[];
  health: BusinessHealth;
}

export interface Device {
  id: string;
  business_id: string;
  business_name: string;
  device_ref: string;
  platform: string;
  app_version: string | null;
  user_name: string | null;
  first_seen_at: string;
  last_seen_at: string;
  last_sync_at: string | null;
  last_sync_ok: boolean | null;
  last_sync_error: string | null;
  pending_ops: number;
  rejected_ops: number;
  status: 'online' | 'offline' | 'never_synced';
  obsolete: boolean;
}

export interface AdminEvent {
  at: string;
  type: string;
  source: 'platform' | 'admin';
  actor: string | null;
  detail: string | null;
  platform: string | null;
  app_version: string | null;
}

export interface Note {
  id: string;
  admin_name: string | null;
  text: string;
  created_at: string;
}

export interface Ticket {
  id: string;
  business_id: string;
  business_name: string | null;
  subject: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'resolved';
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeatureUsage {
  key: string;
  label: string;
  businesses: number;
  percent: number;
  available: boolean;
  last_used_at: string | null;
}

export interface BusinessDetail {
  id: string;
  name: string;
  business_code: string;
  sector: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  is_suspended: boolean;
  owner_full_name: string | null;
  owner_phone: string | null;
  plan_id: string | null;
  plan_name: string | null;
  subscription_status: string | null;
  subscription_started_at: string | null;
  subscription_ends_at: string | null;
  health: BusinessHealth;
  employee_count: number;
  product_count: number;
  customer_count: number;
  device_count: number;
  sales_count_today: number;
  sales_count_7d: number;
  sales_count_30d: number;
  sales_total_30d: number;
  active_users_7d: number;
  active_days_30d: number;
  features: FeatureUsage[];
  devices: Device[];
  pending_ops: number;
  last_sync_at: string | null;
  errors_7d: number;
  history: AdminEvent[];
  notes: Note[];
  tickets: Ticket[];
  users: { id: string; full_name: string; role: string; is_active: boolean; phone: string | null }[];
}

export interface Alert {
  severity: 'critical' | 'warning' | 'info';
  kind: string;
  title: string;
  detail: string | null;
  business_id: string | null;
  business_name: string | null;
  at: string | null;
}

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  percent: number;
}

export interface Overview {
  environment: string;
  generated_at: string;
  businesses_total: number;
  businesses_active_7d: number;
  businesses_new_7d: number;
  businesses_new_30d: number;
  businesses_first_sale_30d: number;
  businesses_without_activity: number;
  users_active_today: number;
  users_active_7d: number;
  users_active_30d: number;
  sales_count_30d: number;
  sales_total_30d: number;
  sales_count_today: number;
  employees_total: number;
  devices_total: number;
  shops_total: number;
  subscriptions_active: number | null;
  subscriptions_trial: number | null;
  subscriptions_expired: number | null;
  payments_failed: number | null;
  mrr: number | null;
  devices_offline: number;
  pending_ops_total: number;
  sync_errors_24h: number;
  server_errors_24h: number;
  open_incidents: number;
  businesses_healthy: number;
  businesses_to_watch: number;
  businesses_at_risk: number;
  alerts: Alert[];
  funnel: FunnelStep[];
  active_businesses_series: SeriesPoint[];
  active_users_series: SeriesPoint[];
  top_features: FeatureUsage[];
  inactive_recently: BusinessListItem[];
}

export interface Retention {
  eligible: number;
  retained: number;
  percent: number;
}

export interface Analytics {
  period_days: number;
  generated_at: string;
  active_businesses: number;
  feature_usage: FeatureUsage[];
  funnel: FunnelStep[];
  retention_d7: Retention;
  retention_d30: Retention;
  dau: number;
  wau: number;
  mau: number;
  activation_rate: number;
  series_active_businesses: SeriesPoint[];
  series_new_businesses: SeriesPoint[];
  series_active_users: SeriesPoint[];
  versions: { label: string; count: number }[];
  platforms: { label: string; count: number }[];
}

export interface Monitoring {
  generated_at: string;
  devices_total: number;
  devices_online: number;
  devices_offline: number;
  pending_ops_total: number;
  rejected_ops_total: number;
  sync_errors_24h: number;
  server_errors_24h: number;
  outdated_devices: number;
  alerts: Alert[];
  stale_devices: Device[];
  recent_errors: AdminEvent[];
  error_series: SeriesPoint[];
  latest_versions: Record<string, string>;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  period: 'monthly' | 'annual';
  is_active: boolean;
  subscribers: number;
}

export interface Billing {
  generated_at: string;
  plans: Plan[];
  by_status: Record<string, number>;
  mrr: number;
  arr: number;
  trials_started_30d: number;
  trials_converted_30d: number;
  failed_or_unpaid: number;
  expired: number;
  subscriptions: {
    business_id: string;
    business_name: string;
    plan_name: string | null;
    status: string;
    started_at: string;
    trial_ends_at: string | null;
    current_period_ends_at: string | null;
    price: number;
  }[];
  revenue_note: string;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface AdminAudit {
  id: string;
  at: string;
  admin_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: string | null;
}

export interface SearchHit {
  business_id: string;
  name: string;
  business_code: string;
  owner_full_name: string | null;
}

// ---------------------------------------------------------------- calls

export const fetchOverview = () => get<Overview>('/admin/overview');
export const fetchAlerts = () => get<Alert[]>('/admin/alerts');
export const searchBusinesses = (q: string) => get<SearchHit[]>(`/admin/search?q=${encodeURIComponent(q)}`);
export const fetchBusinesses = () => get<BusinessListItem[]>('/admin/businesses');
export const fetchBusinessDetail = (id: string) => get<BusinessDetail>(`/admin/businesses/${id}`);
export const fetchAnalytics = (p: { days?: number; plan_id?: string; platform?: string; app_version?: string; activity?: string }) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '') qs.set(k, String(v));
  return get<Analytics>(`/admin/analytics?${qs.toString()}`);
};
export const fetchMonitoring = () => get<Monitoring>('/admin/monitoring');
export const fetchDevices = (businessId?: string) => get<Device[]>(`/admin/devices${businessId ? `?business_id=${businessId}` : ''}`);
export const fetchBilling = () => get<Billing>('/admin/billing');
export const fetchTickets = (status?: string) => get<Ticket[]>(`/admin/tickets${status ? `?status_filter=${status}` : ''}`);
export const fetchAdmins = () => get<AdminUser[]>('/admin/admins');
export const fetchAudit = () => get<AdminAudit[]>('/admin/audit?limit=150');

export const suspendBusiness = (id: string, reason: string | null) => post<BusinessDetail>(`/admin/businesses/${id}/suspend`, { reason });
export const reactivateBusiness = (id: string, reason: string | null) => post<BusinessDetail>(`/admin/businesses/${id}/reactivate`, { reason });
export const changeSubscription = (id: string, body: { plan_id?: string; status?: string; extend_trial_days?: number }) =>
  post<BusinessDetail>(`/admin/businesses/${id}/subscription`, body);
export const deactivateBusinessUser = (businessId: string, userId: string, reason: string | null) =>
  post<BusinessDetail>(`/admin/businesses/${businessId}/users/${userId}/deactivate`, { reason });
export const addNote = (businessId: string, text: string) => post<Note>(`/admin/businesses/${businessId}/notes`, { text });
export const createTicket = (body: { business_id: string; subject: string; description?: string }) => post<Ticket>('/admin/tickets', body);
export const updateTicket = (id: string, body: { status?: string }) => patch<Ticket>(`/admin/tickets/${id}`, body);
export const createPlan = (body: { name: string; price: number; period: string }) => post<Plan>('/admin/plans', body);
export const updatePlan = (id: string, body: Partial<Pick<Plan, 'name' | 'price' | 'is_active' | 'period'>>) => patch<Plan>(`/admin/plans/${id}`, body);
export const createAdmin = (body: { email: string; full_name: string; password: string; role: Role }) => post<AdminUser>('/admin/admins', body);
export const updateAdmin = (id: string, body: { full_name?: string; role?: Role; is_active?: boolean; password?: string }) =>
  patch<AdminUser>(`/admin/admins/${id}`, body);
