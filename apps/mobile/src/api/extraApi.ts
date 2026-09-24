// Contrats des routes « contrôle » consommées aussi par le mobile (même couverture fonctionnelle
// que le web — voir opencode.md, mise à jour 2026-09-24) : anomalies, rapports, équipe, paramètres.

import { apiFetch } from './client';
import { EmployeeApi } from './employeesTypes';

export type { EmployeeApi } from './employeesTypes';

// ----- Anomalies (propriétaire)

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

export const fetchAnomalies = (days = 30, onlyOpen = true) =>
  apiFetch<AnomalyApi[]>(`/anomalies?days=${days}&only_open=${onlyOpen}`);
export const fetchAnomalyOperations = (kind: string, sourceId: string) =>
  apiFetch<RelatedOperationApi[]>(`/anomalies/${kind}/${sourceId}/operations`);
export const resolveAnomaly = (kind: string, sourceId: string, note: string | null) =>
  apiFetch<AnomalyApi>(`/anomalies/${kind}/${sourceId}/resolve`, { method: 'POST', body: { note } });

// ----- Rapports

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

export const fetchReportSummary = (dateFrom: string, dateTo: string) =>
  apiFetch<ReportSummaryApi>(`/reports/summary?date_from=${dateFrom}&date_to=${dateTo}`);

// ----- Équipe (propriétaire)

export const listEmployees = () => apiFetch<EmployeeApi[]>('/auth/employees');
export const updateEmployee = (
  id: string,
  patch: { can_view_purchase_prices?: boolean; can_view_owner_dashboard?: boolean; is_active?: boolean },
) => apiFetch<EmployeeApi>(`/auth/employees/${id}`, { method: 'PATCH', body: patch });

// ----- Shifts (historique serveur)

export interface ShiftApi {
  id: string;
  user_name: string | null;
  opened_at: string;
  opening_cash: number;
  closed_at: string | null;
  counted_cash: number | null;
  expected_cash: number | null;
  difference: number | null;
  sales_total: number;
}

export const fetchShifts = (limit = 30) => apiFetch<ShiftApi[]>(`/shifts?limit=${limit}`);

// ----- Paramètres entreprise (lecture ; l'édition avec logo reste sur le web)

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

export const fetchBusinessSettings = () => apiFetch<BusinessSettingsApi>('/business/me');
export const updateBusinessSettings = (patch: Partial<Omit<BusinessSettingsApi, 'id' | 'business_code' | 'logo_data'>>) =>
  apiFetch<BusinessSettingsApi>('/business/me', { method: 'PATCH', body: patch });

// ----- Journal d'audit (propriétaire)

export interface AuditEntryApi {
  id: string;
  created_at: string;
  action: string;
  entity_type: string;
  user_full_name: string;
  label: string | null;
}

export const fetchAudit = (limit = 60) => apiFetch<AuditEntryApi[]>(`/audit-log?limit=${limit}`);
