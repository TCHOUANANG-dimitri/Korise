// Logique métier locale du web (IndexedDB). Miroir de la logique SQLite du
// mobile : même règles d'optimisme, de recalcul et d'outbox (SYNC_DESIGN).

import { MoneyChannel, PaymentMethod } from './config';
import { fetchProducts, ProductApi } from './api';
import { getSession } from './session';
import { deleteItem, getAll, getOne, kvGet, kvSet, put } from './db';

// ===== Types (un PK local normalisé `id` = client_uuid pour les événements) =====

export interface ProductRow {
  id: string;
  name: string;
  quantity: number;
  purchase_price: number | null;
  selling_price: number;
  minimum_stock: number;
  is_active: boolean;
  barcode?: string | null;
  category?: string | null;
  is_stockable?: boolean;
}

export interface SaleRow {
  id: string; // = client_uuid généré sur l'appareil
  server_id: string | null;
  business_id: string;
  user_id: string;
  product_id: string;
  customer_id: string | null;
  quantity: number;
  unit_price: number;
  total_amount: number;
  payment_method: string;
  created_at: string;
}

export interface MoneyMovementRow {
  id: string;
  server_id: string | null;
  business_id: string;
  user_id: string;
  type: 'sale' | 'income' | 'expense' | 'withdrawal' | 'credit_repayment';
  channel: string | null;
  amount: number;
  reason: string | null;
  category?: string | null;
  sale_id: string | null;
  customer_id: string | null;
  created_at: string;
}

export interface StockMovementRow {
  id: string;
  server_id: string | null;
  business_id: string;
  user_id: string;
  product_id: string;
  type: 'sale' | 'restock' | 'adjustment';
  quantity_delta: number;
  reason: string | null;
  sale_id: string | null;
  created_at: string;
}

export interface CustomerRow {
  id: string; // = client_uuid généré sur l'appareil (clé primaire locale)
  server_id: string | null; // id serveur une fois synchronisé
  business_id: string;
  full_name: string;
  phone: string | null;
  created_at: string;
}

export interface DailyClosingRow {
  id: string;
  server_id: string | null;
  business_id: string;
  user_id: string;
  closing_date: string;
  expected_cash: number;
  actual_cash: number;
  difference: number;
  expected_momo: number | null;
  actual_momo: number | null;
  difference_momo: number | null;
  expected_orange: number | null;
  actual_orange: number | null;
  difference_orange: number | null;
  note: string | null;
  created_at: string;
}

export type OutboxKind = 'sale' | 'money' | 'stock' | 'closing' | 'customer' | 'credit_repayment' | 'shift';

export interface OutboxRow {
  id: string; // = client_uuid de l'événement
  kind: OutboxKind;
  payload: string;
  status: 'pending' | 'rejected';
  error: string | null;
  created_at: string;
}

export type MoneyKind = 'income' | 'expense' | 'withdrawal';
export type StockKind = 'restock' | 'adjustment';

// ===== Helpers =====

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const nowIso = (): string => new Date().toISOString();

function requireSession() {
  const session = getSession();
  if (!session) throw new Error('Non connecté');
  return session;
}

// ===== Init + synchronisation catalogue produits =====

export async function initStore(): Promise<void> {
  await recomputeQuantities();
}

// Le catalogue produit vient du backend (`GET /products`), jamais de fixtures.
// Best-effort : si hors-ligne, on garde le cache local existant tel quel.
export async function syncProductsFromServer(): Promise<void> {
  let remote: ProductApi[];
  try {
    remote = await fetchProducts();
  } catch {
    return;
  }
  for (const p of remote) {
    await put<ProductRow>('products', {
      id: p.id,
      name: p.name,
      quantity: p.quantity,
      purchase_price: p.purchase_price ?? null,
      selling_price: p.selling_price,
      minimum_stock: p.minimum_stock,
      is_active: p.is_active,
      barcode: p.barcode ?? null,
      category: p.category ?? null,
      is_stockable: p.is_stockable ?? true,
    });
  }
  await recomputeQuantities();
}

// Stock affiché = dernière valeur connue du serveur − ventes locales encore en
// outbox (optimiste, jamais bloquant même si ça passe sous zéro — SYNC_DESIGN §6).
export async function recomputeQuantities(): Promise<void> {
  // Rien à recalculer depuis des mouvements locaux ici : la quantité de base
  // vient directement du serveur à chaque `syncProductsFromServer`. On ne
  // soustrait que l'optimiste des ventes pas encore synchronisées.
  const [outbox] = await Promise.all([getAll<OutboxRow>('outbox')]);
  const pendingByProduct = new Map<string, number>();
  for (const o of outbox) {
    if (o.kind !== 'sale' || o.status !== 'pending') continue;
    try {
      const payload = JSON.parse(o.payload) as { product_id: string; quantity: number };
      pendingByProduct.set(payload.product_id, (pendingByProduct.get(payload.product_id) ?? 0) + payload.quantity);
    } catch {
      /* ignore */
    }
  }
  if (pendingByProduct.size === 0) return;
  const products = await getAll<ProductRow>('products');
  for (const p of products) {
    const pending = pendingByProduct.get(p.id);
    if (pending && p.is_stockable !== false) await put<ProductRow>('products', { ...p, quantity: p.quantity - pending });
  }
}

// ===== Lecture =====

export async function listProducts(): Promise<ProductRow[]> {
  const rows = await getAll<ProductRow>('products');
  return rows.filter((r) => r.is_active).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export async function getSalesToday(): Promise<SaleRow[]> {
  const rows = await getAll<SaleRow>('sales');
  return rows.filter((r) => r.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10));
}

export async function getMoneyMovementsToday(): Promise<MoneyMovementRow[]> {
  const rows = await getAll<MoneyMovementRow>('money_movements');
  return rows.filter((r) => r.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10));
}

export async function getLastClosings(limit = 10): Promise<DailyClosingRow[]> {
  const rows = await getAll<DailyClosingRow>('daily_closings');
  return rows
    .sort((a, b) => b.closing_date.localeCompare(a.closing_date) || b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

export async function getExpectedCashForDateLocal(dateKey: string): Promise<number> {
  const { cash } = await getExpectedForDateLocal(dateKey);
  return cash;
}

// Caisse attendue locale (hors-ligne uniquement) = flux net d'argent du jour
// civil + ventes locales encore en outbox, scindé par canal. Utilisée en secours
// quand `GET /closing/expected-cash` est injoignable — sinon la valeur serveur prime.
export async function getExpectedForDateLocal(
  dateKey: string,
): Promise<{ cash: number; momo: number; orange: number }> {
  const [movements, sales, outbox] = await Promise.all([
    getAll<MoneyMovementRow>('money_movements'),
    getAll<SaleRow>('sales'),
    getAll<OutboxRow>('outbox'),
  ]);
  let cash = 0;
  let momo = 0;
  let orange = 0;
  for (const m of movements) {
    if (m.created_at.slice(0, 10) !== dateKey) continue;
    if (m.channel === 'mobile_money') momo += m.amount;
    else if (m.channel === 'orange_money') orange += m.amount;
    else cash += m.amount; // channel null (historique) = cash
  }
  const pending = new Set(outbox.filter((o) => o.kind === 'sale' && o.status === 'pending').map((o) => o.id));
  for (const s of sales) {
    if (!pending.has(s.id) || s.created_at.slice(0, 10) !== dateKey) continue;
    if (s.payment_method === 'credit') continue; // pas d'argent rentré tout de suite
    if (s.payment_method === 'mobile_money') momo += s.total_amount;
    else if (s.payment_method === 'orange_money') orange += s.total_amount;
    else cash += s.total_amount;
  }
  return { cash, momo, orange };
}

export async function getCashTotal(): Promise<number> {
  const [movements, sales, outbox] = await Promise.all([
    getAll<MoneyMovementRow>('money_movements'),
    getAll<SaleRow>('sales'),
    getAll<OutboxRow>('outbox'),
  ]);
  const base = movements.reduce((a, m) => a + m.amount, 0);
  const pending = new Set(outbox.filter((o) => o.kind === 'sale' && o.status === 'pending').map((o) => o.id));
  const optimistic = sales.filter((s) => pending.has(s.id)).reduce((a, s) => a + s.total_amount, 0);
  return base + optimistic;
}

// ===== Cursors =====

export async function getCursor(key: string): Promise<string | null> {
  return kvGet(key);
}
export async function setCursor(key: string, value: string | null): Promise<void> {
  await kvSet(key, value ?? '');
}

// ===== Capture (hors-ligne d'abord) =====

export async function addSale(
  productId: string,
  quantity: number,
  unitPrice: number,
  paymentMethod: PaymentMethod,
  customerId: string | null = null,
): Promise<SaleRow | null> {
  if (quantity <= 0 || unitPrice < 0) return null;
  const session = requireSession();
  const id = generateUuid();
  const row: SaleRow = {
    id,
    server_id: null,
    business_id: session.business_id,
    user_id: session.user_id,
    product_id: productId,
    customer_id: customerId,
    quantity,
    unit_price: unitPrice,
    total_amount: quantity * unitPrice,
    payment_method: paymentMethod,
    created_at: nowIso(),
  };
  await put('sales', row);
  await put<OutboxRow>('outbox', {
    id,
    kind: 'sale',
    payload: JSON.stringify({
      client_uuid: id,
      product_id: productId,
      customer_id: customerId,
      quantity,
      unit_price: unitPrice,
      payment_method: paymentMethod,
    }),
    status: 'pending',
    error: null,
    created_at: row.created_at,
  });
  await recomputeQuantities();
  return row;
}

export async function addMoneyMovement(
  type: MoneyKind | 'credit_repayment',
  amount: number,
  reason: string | null,
  channel: MoneyChannel,
  customerId: string | null = null,
  category: string | null = null,
): Promise<MoneyMovementRow | null> {
  if (amount <= 0) return null;
  const session = requireSession();
  const id = generateUuid();
  const signed = type === 'income' || type === 'credit_repayment' ? amount : -amount;
  const row: MoneyMovementRow = {
    id,
    server_id: null,
    business_id: session.business_id,
    user_id: session.user_id,
    type,
    channel,
    amount: signed,
    reason,
    category,
    sale_id: null,
    customer_id: customerId,
    created_at: nowIso(),
  };
  await put('money_movements', row);
  const kind: OutboxKind = type === 'credit_repayment' ? 'credit_repayment' : 'money';
  await put<OutboxRow>('outbox', {
    id,
    kind,
    payload: JSON.stringify({ client_uuid: id, type, amount: signed, reason, channel, customer_id: customerId, category }),
    status: 'pending',
    error: null,
    created_at: row.created_at,
  });
  return row;
}

export async function addStockMovement(productId: string, type: StockKind, quantityDelta: number, reason: string | null): Promise<StockMovementRow | null> {
  if (quantityDelta === 0) return null;
  const session = requireSession();
  const id = generateUuid();
  const row: StockMovementRow = {
    id,
    server_id: null,
    business_id: session.business_id,
    user_id: session.user_id,
    product_id: productId,
    type,
    quantity_delta: quantityDelta,
    reason,
    sale_id: null,
    created_at: nowIso(),
  };
  await put('stock_movements', row);
  await put<OutboxRow>('outbox', {
    id,
    kind: 'stock',
    payload: JSON.stringify({ client_uuid: id, product_id: productId, type, quantity_delta: quantityDelta, reason }),
    status: 'pending',
    error: null,
    created_at: row.created_at,
  });
  return row;
}

export async function addDailyClosing(
  closingDate: string,
  expectedCash: number,
  actualCash: number,
  expectedMomo: number,
  actualMomo: number,
  expectedOrange: number,
  actualOrange: number,
  note: string | null,
): Promise<DailyClosingRow | null> {
  const session = requireSession();
  const id = generateUuid();
  const row: DailyClosingRow = {
    id,
    server_id: null,
    business_id: session.business_id,
    user_id: session.user_id,
    closing_date: closingDate,
    expected_cash: expectedCash,
    actual_cash: actualCash,
    difference: actualCash - expectedCash,
    expected_momo: expectedMomo,
    actual_momo: actualMomo,
    difference_momo: actualMomo - expectedMomo,
    expected_orange: expectedOrange,
    actual_orange: actualOrange,
    difference_orange: actualOrange - expectedOrange,
    note,
    created_at: nowIso(),
  };
  await put('daily_closings', row);
  await put<OutboxRow>('outbox', {
    id,
    kind: 'closing',
    // `expected_*` ne sont jamais envoyés au serveur (calculés côté serveur, voir
    // SYNC_DESIGN.md) — gardés seulement localement pour l'affichage optimiste.
    payload: JSON.stringify({
      client_uuid: id,
      closing_date: closingDate,
      actual_cash: actualCash,
      actual_momo: actualMomo,
      actual_orange: actualOrange,
      note,
    }),
    status: 'pending',
    error: null,
    created_at: row.created_at,
  });
  return row;
}

// ===== Crédit client =====

export async function addCustomer(fullName: string, phone: string | null): Promise<CustomerRow | null> {
  if (!fullName.trim()) return null;
  const session = requireSession();
  const id = generateUuid();
  const row: CustomerRow = {
    id,
    server_id: null,
    business_id: session.business_id,
    full_name: fullName.trim(),
    phone: phone?.trim() || null,
    created_at: nowIso(),
  };
  await put('customers', row);
  await put<OutboxRow>('outbox', {
    id,
    kind: 'customer',
    payload: JSON.stringify({ client_uuid: id, full_name: row.full_name, phone: row.phone }),
    status: 'pending',
    error: null,
    created_at: row.created_at,
  });
  return row;
}

export async function addCreditRepayment(
  customerId: string,
  amount: number,
  channel: MoneyChannel,
  note: string | null,
): Promise<MoneyMovementRow | null> {
  return addMoneyMovement('credit_repayment', amount, note, channel, customerId);
}

export async function listCustomers(): Promise<CustomerRow[]> {
  const rows = await getAll<CustomerRow>('customers');
  return rows.sort((a, b) => a.full_name.localeCompare(b.full_name, 'fr'));
}

export async function getCustomerById(id: string): Promise<CustomerRow | null> {
  return getOne<CustomerRow>('customers', id);
}

// Solde dû local (hors-ligne) : ventes à crédit − remboursements.
export async function getCustomerBalanceLocal(customerId: string): Promise<number> {
  const [sales, movements] = await Promise.all([
    getAll<SaleRow>('sales'),
    getAll<MoneyMovementRow>('money_movements'),
  ]);
  const owed = sales
    .filter((s) => s.customer_id === customerId && s.payment_method === 'credit')
    .reduce((a, s) => a + s.total_amount, 0);
  const repaid = movements
    .filter((m) => m.customer_id === customerId && m.type === 'credit_repayment')
    .reduce((a, m) => a + Math.abs(m.amount), 0);
  return owed - repaid;
}

export interface LocalCustomerTx {
  kind: 'sale' | 'repayment';
  created_at: string;
  amount: number;
  quantity: number | null;
  channel: string | null;
  note: string | null;
}

// Transactions locales d'un client (secours hors-ligne du détail serveur).
export async function getCustomerLocalTransactions(customerId: string): Promise<LocalCustomerTx[]> {
  const [sales, movements] = await Promise.all([
    getAll<SaleRow>('sales'),
    getAll<MoneyMovementRow>('money_movements'),
  ]);
  const items: LocalCustomerTx[] = [];
  for (const s of sales.filter((x) => x.customer_id === customerId && x.payment_method === 'credit')) {
    items.push({ kind: 'sale', created_at: s.created_at, amount: s.total_amount, quantity: s.quantity, channel: null, note: null });
  }
  for (const m of movements.filter((x) => x.customer_id === customerId && x.type === 'credit_repayment')) {
    items.push({ kind: 'repayment', created_at: m.created_at, amount: Math.abs(m.amount), quantity: null, channel: m.channel, note: m.reason });
  }
  return items.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ===== Shift (ouverture / clôture de caisse par employé) =====

export interface ShiftRow {
  id: string; // = client_uuid
  user_id: string;
  opened_at: string;
  opening_cash: number;
  closed_at: string | null;
  counted_cash: number | null;
  note: string | null;
}

export async function getOpenShift(): Promise<ShiftRow | null> {
  const session = getSession();
  if (!session) return null;
  const rows = await getAll<ShiftRow>('shifts');
  return rows.find((s) => s.user_id === session.user_id && s.closed_at === null) ?? null;
}

export async function listLocalShifts(limit = 10): Promise<ShiftRow[]> {
  const session = getSession();
  const rows = await getAll<ShiftRow>('shifts');
  return rows
    .filter((s) => !session || s.user_id === session.user_id)
    .sort((a, b) => b.opened_at.localeCompare(a.opened_at))
    .slice(0, limit);
}

export async function openShift(openingCash: number): Promise<ShiftRow | null> {
  const session = requireSession();
  if (await getOpenShift()) return null; // un seul shift ouvert par employé
  const id = generateUuid();
  const row: ShiftRow = { id, user_id: session.user_id, opened_at: nowIso(), opening_cash: openingCash, closed_at: null, counted_cash: null, note: null };
  await put('shifts', row);
  await put<OutboxRow>('outbox', {
    id,
    kind: 'shift',
    payload: JSON.stringify({ client_uuid: id, opened_at: row.opened_at, opening_cash: openingCash }),
    status: 'pending',
    error: null,
    created_at: row.opened_at,
  });
  return row;
}

export async function closeShift(countedCash: number, note: string | null): Promise<ShiftRow | null> {
  const open = await getOpenShift();
  if (!open) return null;
  const closedAt = nowIso();
  const row: ShiftRow = { ...open, closed_at: closedAt, counted_cash: countedCash, note };
  await put('shifts', row);
  // Nouvel événement d'outbox (id distinct) : le serveur reçoit d'abord l'ouverture puis la
  // fermeture, toutes deux idempotentes sur client_uuid = id du shift.
  await put<OutboxRow>('outbox', {
    id: `${open.id}:close`,
    kind: 'shift',
    payload: JSON.stringify({
      client_uuid: open.id,
      opened_at: open.opened_at,
      opening_cash: open.opening_cash,
      closed_at: closedAt,
      counted_cash: countedCash,
      note,
    }),
    status: 'pending',
    error: null,
    created_at: closedAt,
  });
  return row;
}

// ===== Appliquer un pull (upsert par client_uuid) =====

function toStr(v: unknown): string | null {
  return v == null || v === '' ? null : String(v);
}
function toNum(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export async function applyPullEvents(events: {
  sales?: Record<string, unknown>[];
  money_movements?: Record<string, unknown>[];
  stock_movements?: Record<string, unknown>[];
  daily_closings?: Record<string, unknown>[];
  customers?: Record<string, unknown>[];
}): Promise<void> {
  for (const e of events.sales ?? []) {
    const id = String(e.client_uuid);
    const existing = await getOne('sales', id);
    if (!existing) {
      const created_at = toStr(e.created_at) ?? nowIso();
      await put<SaleRow>('sales', {
        id,
        server_id: toStr(e.id),
        business_id: String(e.business_id),
        user_id: String(e.user_id),
        product_id: String(e.product_id),
        customer_id: toStr(e.customer_id),
        quantity: toNum(e.quantity),
        unit_price: toNum(e.unit_price),
        total_amount: toNum(e.total_amount),
        payment_method: String(e.payment_method),
        created_at,
      });
    }
  }
  for (const e of events.money_movements ?? []) {
    const id = String(e.client_uuid);
    const existing = await getOne('money_movements', id);
    if (!existing) {
      await put<MoneyMovementRow>('money_movements', {
        id,
        server_id: toStr(e.id),
        business_id: String(e.business_id),
        user_id: String(e.user_id),
        type: e.type as MoneyMovementRow['type'],
        channel: toStr(e.channel),
        amount: toNum(e.amount),
        reason: toStr(e.reason),
        sale_id: toStr(e.sale_id),
        customer_id: toStr(e.customer_id),
        created_at: toStr(e.created_at) ?? nowIso(),
      });
    }
  }
  for (const e of events.customers ?? []) {
    const id = String(e.client_uuid);
    const existing = await getOne<CustomerRow>('customers', id);
    if (existing) {
      // Upsert : si le serveur a déjà vu ce client, on mémorise son server_id.
      await put<CustomerRow>('customers', { ...existing, server_id: toStr(e.id) });
      continue;
    }
    await put<CustomerRow>('customers', {
      id,
      server_id: toStr(e.id),
      business_id: String(e.business_id),
      full_name: String(e.full_name),
      phone: toStr(e.phone),
      created_at: toStr(e.created_at) ?? nowIso(),
    });
  }
  for (const e of events.stock_movements ?? []) {
    const id = String(e.client_uuid);
    const existing = await getOne('stock_movements', id);
    if (!existing) {
      await put<StockMovementRow>('stock_movements', {
        id,
        server_id: toStr(e.id),
        business_id: String(e.business_id),
        user_id: String(e.user_id),
        product_id: String(e.product_id),
        type: e.type as StockMovementRow['type'],
        quantity_delta: toNum(e.quantity_delta),
        reason: toStr(e.reason),
        sale_id: toStr(e.sale_id),
        created_at: toStr(e.created_at) ?? nowIso(),
      });
    }
  }
  for (const e of events.daily_closings ?? []) {
    const id = String(e.client_uuid);
    const existing = await getOne('daily_closings', id);
    if (!existing) {
      const expected = toNum(e.expected_cash);
      const actual = toNum(e.actual_cash);
      const expectedMomo = e.expected_momo == null ? null : toNum(e.expected_momo);
      const actualMomo = e.actual_momo == null ? null : toNum(e.actual_momo);
      const expectedOrange = e.expected_orange == null ? null : toNum(e.expected_orange);
      const actualOrange = e.actual_orange == null ? null : toNum(e.actual_orange);
      await put<DailyClosingRow>('daily_closings', {
        id,
        server_id: toStr(e.id),
        business_id: String(e.business_id),
        user_id: String(e.user_id),
        closing_date: String(e.closing_date),
        expected_cash: expected,
        actual_cash: actual,
        difference: toStr(e.difference) == null ? actual - expected : toNum(e.difference),
        expected_momo: expectedMomo,
        actual_momo: actualMomo,
        difference_momo:
          actualMomo == null || expectedMomo == null ? null : toStr(e.difference_momo) == null ? actualMomo - expectedMomo : toNum(e.difference_momo),
        expected_orange: expectedOrange,
        actual_orange: actualOrange,
        difference_orange:
          actualOrange == null || expectedOrange == null
            ? null
            : toStr(e.difference_orange) == null
              ? actualOrange - expectedOrange
              : toNum(e.difference_orange),
        note: toStr(e.note),
        created_at: toStr(e.created_at) ?? nowIso(),
      });
    }
  }

  await syncProductsFromServer();
}

// ===== Outbox =====

export async function getPendingOutbox(): Promise<OutboxRow[]> {
  const rows = await getAll<OutboxRow>('outbox');
  return rows.filter((r) => r.status === 'pending').sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function getRejectedOutbox(): Promise<OutboxRow[]> {
  const rows = await getAll<OutboxRow>('outbox');
  return rows.filter((r) => r.status === 'rejected').sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function markOutboxSynced(id: string): Promise<void> {
  await deleteItem('outbox', id);
}

export async function markOutboxRejected(id: string, detail: string): Promise<void> {
  const row = await getOne<OutboxRow>('outbox', id);
  if (row) await put<OutboxRow>('outbox', { ...row, status: 'rejected', error: detail });
}
