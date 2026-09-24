// Contrats des endpoints produits (packages/shared/openapi.json).
// Le backend renvoie ProductOutRestricted aux employés sans can_view_purchase_prices.

import { apiFetch } from './client';

export interface ProductOut {
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

export function listProducts(): Promise<ProductOut[]> {
  return apiFetch<ProductOut[]>('/products');
}

export function createProduct(request: {
  name: string;
  quantity?: number;
  purchase_price?: number;
  selling_price?: number;
  minimum_stock?: number;
  barcode?: string | null;
  category?: string | null;
  is_stockable?: boolean;
}): Promise<ProductOut> {
  return apiFetch<ProductOut>('/products', { method: 'POST', body: request });
}

export function updateProduct(
  productId: string,
  patch: {
    name?: string;
    purchase_price?: number;
    selling_price?: number;
    minimum_stock?: number;
    is_active?: boolean;
    barcode?: string | null;
    category?: string | null;
    is_stockable?: boolean;
  },
): Promise<ProductOut> {
  return apiFetch<ProductOut>(`/products/${productId}`, { method: 'PATCH', body: patch });
}