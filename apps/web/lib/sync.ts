// Ordonnanceur de synchronisation web — mêmes règles que le mobile
// (SYNC_DESIGN §8) : push d'abord (vider l'outbox), pull ensuite, backoff
// exponentiel, déclenché à l'ouverture/retour réseau/périodiquement/manuel.

import { MAX_BACKOFF_MS, SYNC_INTERVAL_MS } from './config';
import {
  applyPullEvents,
  getCursor,
  getPendingOutbox,
  getRejectedOutbox,
  markOutboxRejected,
  markOutboxSynced,
  setCursor,
} from './repo';
import { pull as apiPull, push as apiPush, sendHeartbeat, PushBody } from './api';
import { getSession } from './session';

export type SyncState =
  | { phase: 'idle' }
  | { phase: 'syncing' }
  | { phase: 'ok'; lastSyncAt: string; pushed: number; pulled: number }
  | { phase: 'error'; message: string };

const CURSOR_KEYS: Record<string, string> = {
  sales: 'sync_cursor_sales',
  money_movements: 'sync_cursor_money_movements',
  stock_movements: 'sync_cursor_stock_movements',
  daily_closings: 'sync_cursor_daily_closings',
  customers: 'sync_cursor_customers',
};

type Listener = () => void;

class SyncEngine {
  private syncing = false;
  private backoffMs = 2_000;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private syncListeners = new Set<(s: SyncState) => void>();
  private dataListeners = new Set<Listener>();
  state: SyncState = { phase: 'idle' };
  started = false;

  onSync(listener: (s: SyncState) => void): () => void {
    this.syncListeners.add(listener);
    return () => this.syncListeners.delete(listener);
  }

  // Les pages écoutent ce signal pour recharger leurs données après un sync.
  onDataChanged(listener: Listener): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  private emitSync() {
    this.syncListeners.forEach((l) => l(this.state));
  }
  private emitDataChanged() {
    this.dataListeners.forEach((l) => l());
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    void (async () => {
      await this.syncNow();
    })();

    const onReconnect = () => {
      if (navigator.onLine) void this.syncNow();
    };
    window.addEventListener('online', onReconnect);
    const onVisible = () => {
      if (!document.hidden) void this.syncNow();
    };
    document.addEventListener('visibilitychange', onVisible);
    this.timer = setInterval(() => {
      if (navigator.onLine) void this.syncNow();
    }, SYNC_INTERVAL_MS);

    this.cleanup = () => {
      window.removeEventListener('online', onReconnect);
      document.removeEventListener('visibilitychange', onVisible);
      if (this.timer) clearInterval(this.timer);
    };
  }

  private timer: ReturnType<typeof setInterval> | null = null;
  private cleanup: (() => void) | null = null;

  async syncNow(): Promise<void> {
    if (this.syncing || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    if (!getSession()) return;
    this.syncing = true;
    this.state = { phase: 'syncing' };
    this.emitSync();

    try {
      const pushed = await this.pushOutbox();
      const pulled = await this.doPull();
      this.backoffMs = 2_000;
      this.state = { phase: 'ok', lastSyncAt: new Date().toISOString(), pushed, pulled };
      this.emitSync();
      this.emitDataChanged();
      void this.reportHealth(true, null, pushed);
    } catch (err) {
      this.state = { phase: 'error', message: err instanceof Error ? err.message : 'Échec de synchro' };
      this.emitSync();
      this.scheduleRetry();
      void this.reportHealth(false, this.state.message, 0);
    } finally {
      this.syncing = false;
    }
  }

  // Heartbeat vers le Super Admin : opérations en attente / refusées, dernier résultat de synchro.
  // Best-effort (jamais bloquant, silencieux si le réseau est coupé).
  private async reportHealth(ok: boolean, error: string | null, pushed: number): Promise<void> {
    const [pending, rejected] = await Promise.all([getPendingOutbox(), getRejectedOutbox()]);
    await sendHeartbeat({ pending_ops: pending.length, rejected_ops: rejected.length, sync_ok: ok, sync_error: error, pushed });
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

  private async pushOutbox(): Promise<number> {
    const pending = await getPendingOutbox();
    if (pending.length === 0) return 0;

    const body: PushBody = {
    sales: [],
    money_movements: [],
    stock_movements: [],
    daily_closings: [],
    customers: [],
    credit_repayments: [],
    shifts: [],
  };
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

    // Les réponses du serveur gardent l'ordre d'envoi de chaque liste : on associe donc le
    // résultat i de chaque liste à l'entrée d'outbox i (indispensable pour les shifts, dont
    // l'ouverture et la fermeture partagent le même client_uuid).
    const sentIds: Record<keyof PushBody, string[]> = {
      sales: [],
      money_movements: [],
      stock_movements: [],
      daily_closings: [],
      customers: [],
      credit_repayments: [],
      shifts: [],
    };
    for (const item of pending) {
      try {
        const payload = JSON.parse(item.payload) as Record<string, unknown>;
        const key = byKind(item.kind);
        body[key].push(payload);
        sentIds[key].push(item.id);
      } catch {
        await markOutboxRejected(item.id, 'Payload local illisible');
      }
    }

    const res = await apiPush(body);
    let pushed = 0;
    for (const key of Object.keys(sentIds) as (keyof PushBody)[]) {
      const results = (res[key] ?? []) as { status: string; detail?: string | null }[];
      for (let i = 0; i < results.length; i += 1) {
        const outboxId = sentIds[key][i];
        if (!outboxId) continue;
        const r = results[i];
        if (r.status === 'accepted' || r.status === 'duplicate') {
          await markOutboxSynced(outboxId);
          pushed += 1;
        } else if (r.status === 'rejected') {
          await markOutboxRejected(outboxId, r.detail ?? 'Rejeté par le serveur');
        }
      }
    }
    return pushed;
  }

  private async doPull(): Promise<number> {
    const res = await apiPull({
      since_sales: await getCursor(CURSOR_KEYS.sales),
      since_money_movements: await getCursor(CURSOR_KEYS.money_movements),
      since_stock_movements: await getCursor(CURSOR_KEYS.stock_movements),
      since_daily_closings: await getCursor(CURSOR_KEYS.daily_closings),
      since_customers: await getCursor(CURSOR_KEYS.customers),
    });

    await applyPullEvents({
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
        await setCursor(key, value);
        if (value) pulled += 1;
      }
    }
    return pulled;
  }
}

export const syncEngine = new SyncEngine();