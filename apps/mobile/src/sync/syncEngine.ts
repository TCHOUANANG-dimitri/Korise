// Ordonnanceur de synchro (SYNC_DESIGN section 8) : push outbox -> pull des
// faits -> rafraîchissement du catalogue. Backoff exponentiel, jamais agressif.

import * as Network from 'expo-network';

import { API_BASE_URL, MAX_BACKOFF_MS } from '../config';
import { listProducts } from '../api/productsApi';
import {
  applyPullEvents,
  getCursor,
  getPendingOutbox,
  getRejectedOutbox,
  markOutboxRejected,
  markOutboxSynced,
  setCursor,
  upsertProductsFromServer,
} from '../db/repo';
import { push as apiPush, pull as apiPull, PushBody } from './api';
import { sendHeartbeat } from '../api/telemetryApi';
import { getSessionSync } from '../auth/session';

export type SyncState =
  | { phase: 'idle' }
  | { phase: 'syncing' }
  | { phase: 'ok'; lastSyncAt: string; pushed: number; pulled: number; newProducts: number }
  | { phase: 'error'; message: string; nextRetryAt: Date | null };

export type SyncListener = (state: SyncState) => void;

const CURSOR_KEYS: Record<string, string> = {
  sales: 'sync_cursor_sales',
  money_movements: 'sync_cursor_money_movements',
  stock_movements: 'sync_cursor_stock_movements',
  daily_closings: 'sync_cursor_daily_closings',
  customers: 'sync_cursor_customers',
} as const;

class SyncEngine {
  private syncing = false;
  private listeners = new Set<SyncListener>();
  private backoffMs = 2_000;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(state: SyncState): void {
    this.listeners.forEach((l) => l(state));
  }

  async isNetworkReachable(): Promise<boolean> {
    try {
      const state = await Network.getNetworkStateAsync();
      return state.isConnected !== false && state.isInternetReachable !== false;
    } catch {
      return true;
    }
  }

  async syncNow(): Promise<void> {
    if (this.syncing) return;
    const businessId = getSessionSync()?.business_id;
    if (!businessId) return;
    this.syncing = true;
    this.emit({ phase: 'syncing' });

    try {
      const pushed = await this.pushOutbox(businessId);
      const pulled = await this.doPull(businessId);
      const newProducts = await this.refreshCatalog(businessId);
      this.backoffMs = 2_000;
      this.emit({ phase: 'ok', lastSyncAt: new Date().toISOString(), pushed, pulled, newProducts });
      void this.reportHealth(true, null, pushed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Échec de synchronisation';
      const nextRetryAt = new Date(Date.now() + this.backoffMs);
      this.emit({ phase: 'error', message, nextRetryAt });
      this.scheduleRetry();
      void this.reportHealth(false, message, 0);
    } finally {
      this.syncing = false;
    }
  }

  // Heartbeat vers le Super Admin (appareils, versions, file d'attente) — best-effort, jamais bloquant.
  private async reportHealth(ok: boolean, error: string | null, pushed: number): Promise<void> {
    await sendHeartbeat({
      pending_ops: getPendingOutbox().length,
      rejected_ops: getRejectedOutbox().length,
      sync_ok: ok,
      sync_error: error,
      pushed,
    });
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    const wait = Math.min(this.backoffMs, MAX_BACKOFF_MS);
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.syncNow();
    }, wait);
  }

  // La base SQLite et le jeton suivent la session courante : si le compte change
  // pendant une synchro, on s'arrête avant de mélanger les données de deux entreprises.
  private assertSameBusiness(businessId: string): void {
    if (getSessionSync()?.business_id !== businessId) throw new Error('Compte changé pendant la synchro');
  }

  private async pushOutbox(businessId: string): Promise<number> {
    const pending = getPendingOutbox();
    if (pending.length === 0) return 0;

    const byKind = (kind: string): keyof PushBody =>
      kind === 'money'
        ? 'money_movements'
        : kind === 'stock'
          ? 'stock_movements'
          : kind === 'closing'
            ? 'daily_closings'
            : kind === 'customer'
              ? 'customers'
              : kind === 'credit_repayment'
                ? 'credit_repayments'
                : kind === 'shift'
                  ? 'shifts'
                  : 'sales';

    const body: PushBody = {
      sales: [],
      money_movements: [],
      stock_movements: [],
      daily_closings: [],
      customers: [],
      credit_repayments: [],
      shifts: [],
    };
    // Les reponses gardent l'ordre d'envoi de chaque liste : le resultat i correspond a l'entree
    // d'outbox i (necessaire pour les shifts : ouverture et fermeture partagent le meme client_uuid).
    const sentIds: Record<keyof PushBody, string[]> = {
      sales: [], money_movements: [], stock_movements: [], daily_closings: [], customers: [], credit_repayments: [], shifts: [],
    };
    for (const item of pending) {
      try {
        const key = byKind(item.kind);
        body[key].push(JSON.parse(item.payload) as Record<string, unknown>);
        sentIds[key].push(item.client_uuid);
      } catch {
        markOutboxRejected(item.client_uuid, 'Payload local illisible');
      }
    }

    this.assertSameBusiness(businessId);
    const res = await apiPush(body);
    this.assertSameBusiness(businessId);
    let pushed = 0;
    for (const key of Object.keys(sentIds) as (keyof PushBody)[]) {
      const results = (res[key] ?? []) as { status: string; detail?: string | null }[];
      results.forEach((r, i) => {
        const id = sentIds[key][i];
        if (!id) return;
        if (r.status === 'accepted' || r.status === 'duplicate') {
          markOutboxSynced(id);
          pushed += 1;
        } else if (r.status === 'rejected') {
          markOutboxRejected(id, r.detail ?? 'Rejeté par le serveur');
        }
      });
    }
    return pushed;
  }

  private async doPull(businessId: string): Promise<number> {
    const res = await apiPull({
      since_sales: getCursor(CURSOR_KEYS.sales),
      since_money_movements: getCursor(CURSOR_KEYS.money_movements),
      since_stock_movements: getCursor(CURSOR_KEYS.stock_movements),
      since_daily_closings: getCursor(CURSOR_KEYS.daily_closings),
      since_customers: getCursor(CURSOR_KEYS.customers),
    });

    this.assertSameBusiness(businessId);
    applyPullEvents({
      sales: res.sales,
      money_movements: res.money_movements,
      stock_movements: res.stock_movements,
      daily_closings: res.daily_closings,
      customers: res.customers,
    });

    let pulled = 0;
    for (const [entity, key] of Object.entries(CURSOR_KEYS)) {
      const value = res.cursors?.[entity];
      if (value !== undefined) {
        setCursor(key, value ?? '');
        if (value) pulled += 1;
      }
    }
    return pulled;
  }

  // Catalogue depuis GET /products. Un échec ici n'échoue pas le sync complet.
  private async refreshCatalog(businessId: string): Promise<number> {
    try {
      const products = await listProducts();
      this.assertSameBusiness(businessId);
      upsertProductsFromServer(products.map((p) => ({
        id: p.id,
        name: p.name,
        quantity: p.quantity,
        selling_price: p.selling_price,
        minimum_stock: p.minimum_stock,
        is_active: p.is_active,
        purchase_price: p.purchase_price,
        barcode: p.barcode,
        category: p.category,
        is_stockable: p.is_stockable,
      })));
      return products.length;
    } catch {
      return 0;
    }
  }

  getApiBaseUrl(): string {
    return API_BASE_URL;
  }
}

export const syncEngine = new SyncEngine();