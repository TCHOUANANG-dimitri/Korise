// Contrats des endpoints d'auth (packages/shared/openapi.json).

import { apiFetch } from './client';
import { Role } from '../auth/session';

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  business_id: string;
  business_code: string;
  business_name: string;
  role: Role;
  full_name: string;
  can_view_purchase_prices: boolean;
  can_view_owner_dashboard: boolean;
}

export interface UserOut {
  id: string;
  business_id: string;
  full_name: string;
  phone: string | null;
  role: Role;
  can_view_purchase_prices: boolean;
  can_view_owner_dashboard: boolean;
  is_active: boolean;
}

export function login(business_code: string, pin: string): Promise<TokenResponse> {
  return apiFetch<TokenResponse>('/auth/login', { method: 'POST', body: { business_code, pin }, auth: false });
}

export function registerBusiness(request: {
  business_name: string;
  sector?: string | null;
  owner_full_name: string;
  owner_phone?: string | null;
  pin: string;
}): Promise<TokenResponse> {
  return apiFetch<TokenResponse>('/auth/register-business', { method: 'POST', body: request, auth: false });
}

export function createEmployee(request: {
  full_name: string;
  phone?: string | null;
  pin: string;
  can_view_purchase_prices?: boolean;
  can_view_owner_dashboard?: boolean;
}): Promise<UserOut> {
  return apiFetch<UserOut>('/auth/employees', { method: 'POST', body: request });
}

export function listEmployees(): Promise<UserOut[]> {
  return apiFetch<UserOut[]>('/auth/employees');
}
