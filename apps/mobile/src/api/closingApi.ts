// Contrats clôture + dashboard (packages/shared/openapi.json).
// Le calcul de la caisse attendue est TOUJOURS côté serveur, jamais fourni par
// le client (CLAUDE.md). Le dashboard exige can_view_owner_dashboard (= owner).

import { apiFetch } from './client';

export interface ExpectedCashOut {
  closing_date: string;
  expected_cash: number;
  expected_momo: number;
  expected_orange: number;
  sales_total: number;
  income_total: number;
  expense_total: number;
  withdrawal_total: number;
}

export interface StockAlertOut {
  product_id: string;
  name: string;
  quantity: number;
  minimum_stock: number;
}

export interface TopProductOut {
  product_id: string;
  name: string;
  quantity_sold: number;
  revenue: number;
}

export interface EmployeeActivityOut {
  user_id: string;
  full_name: string;
  sales_count: number;
  sales_total: number;
}

export interface LatestClosingOut {
  actual_cash: number;
  expected_cash: number;
  difference: number;
  note: string | null;
  created_at: string;
}

export interface DashboardOut {
  day: string;
  sales_total: number;
  expense_total: number;
  income_total: number;
  withdrawal_total: number;
  expected_cash: number;
  latest_closing: LatestClosingOut | null;
  stock_alerts: StockAlertOut[];
  top_products: TopProductOut[];
  employee_activity: EmployeeActivityOut[];
}

export function expectedCash(closingDate: string): Promise<ExpectedCashOut> {
  return apiFetch<ExpectedCashOut>(
    `/closing/expected-cash?closing_date=${encodeURIComponent(closingDate)}`,
  );
}

export function dailyDashboard(day: string): Promise<DashboardOut> {
  return apiFetch<DashboardOut>(`/dashboard/daily?day=${encodeURIComponent(day)}`);
}