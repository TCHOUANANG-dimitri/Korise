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
