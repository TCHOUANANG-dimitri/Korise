// Logique métier locale (SQLite) — offline-first comme avant, mais l'identité
// vient de la session (JWT), plus jamais d'ID en dur, et les payloads poussés
// ne contiennent plus business_id/user_id (dérivés du token côté serveur).

import * as Crypto from 'expo-crypto';

import { PaymentMethod } from '../config';
import { getSessionSync } from '../auth/session';
import { getDb, recomputeProductQuantities } from './database';

// ===== Types métier locaux =====

export interface ProductRow {
  id: string;
  business_id: string;
  name: string;
  base_quantity: number;
  quantity: number;
  purchase_price: number;
  selling_price: number;
  minimum_stock: number;
  is_active: number;
  updated_at: string;
  barcode: string | null;
  category: string | null;
  is_stockable: number;
}

export interface SaleRow {
  client_uuid: string;
  server_id: string | null;
  business_id: string;
  user_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  payment_method: string;
  customer_id: string | null;
  created_at: string;
}

export interface MoneyMovementRow {
  client_uuid: string;
  server_id: string | null;
  business_id: string;
  user_id: string;
  type: 'sale' | 'income' | 'expense' | 'withdrawal' | 'credit_repayment';
  amount: number;
  reason: string | null;
  sale_id: string | null;
  channel: MoneyChannel | null;
  customer_id: string | null;
  category?: string | null;
  created_at: string;
}

export interface CustomerRow {
  client_uuid: string;
  server_id: string | null;
  business_id: string;
  full_name: string;
  phone: string | null;
  created_at: string;
}

export interface CustomerWithBalance extends CustomerRow {
  balance: number;
}

export interface StockMovementRow {
  client_uuid: string;
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

export interface DailyClosingRow {
  client_uuid: string;
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

export interface ShiftRow {
  client_uuid: string;
  user_id: string;
  opened_at: string;
  opening_cash: number;
  closed_at: string | null;
  counted_cash: number | null;
  note: string | null;
}

export type OutboxKind = 'sale' | 'money' | 'stock' | 'closing' | 'customer' | 'credit_repayment' | 'shift';
export type OutboxStatus = 'pending' | 'rejected';

export interface OutboxRow {
  client_uuid: string;
  kind: OutboxKind;
  payload: string;
  status: OutboxStatus;
  error: string | null;
  created_at: string;
}

export type MoneyKind = 'income' | 'expense' | 'withdrawal';
export type MoneyChannel = 'cash' | 'mobile_money' | 'orange_money';
export type StockKind = 'restock' | 'adjustment';

// ===== Helpers =====

export function generateUuid(): string {
  return Crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

function currentUser(): { business_id: string; user_id: string } {
  const s = getSessionSync();
  return { business_id: s?.business_id ?? '', user_id: s?.user_id ?? '' };
}

function currentRole(): string {
  return getSessionSync()?.role ?? 'employee';
}

// Isolation employé : un employé ne voit que SES ventes et SES mouvements
// d'argent (le propriétaire voit tout, le stock reste unifié — voir
// getStockMovementFeed). Renvoie l'user_id courant côté employé, null sinon.
function scopedUserId(): string | null {
  return currentRole() === 'employee' ? currentUser().user_id : null;
}

// ===== Utilisateur courant =====

export function saveCurrentUser(u: {
  id: string;
  business_id: string;
  full_name: string;
  role: 'owner' | 'employee';
  can_view_purchase_prices?: boolean;
  can_view_owner_dashboard?: boolean;
}): void {
  getDb().runSync(
    `INSERT OR REPLACE INTO users
      (id, business_id, full_name, role, can_view_purchase_prices, can_view_owner_dashboard, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [u.id, u.business_id, u.full_name, u.role, u.can_view_purchase_prices ? 1 : 0, u.can_view_owner_dashboard ? 1 : 0],
  );
}

// ===== Catalogue (synchronisé depuis GET /products) =====

// Mise à jour depuis la source de vérité serveur : on rétablit base_quantity
// telle que quantité = quantité serveur, sans décompter les mouvements déjà
// dans la table locale (on recale la base, pas la quantité directe).
export function upsertProductsFromServer(products: {
  id: string;
  name: string;
  quantity: number;
  selling_price: number;
  minimum_stock: number;
  is_active: boolean;
  purchase_price?: number;
  barcode?: string | null;
  category?: string | null;
  is_stockable?: boolean;
}[]): void {
  const d = getDb();
  const biz = currentUser().business_id || 'unknown';
  d.withTransactionSync(() => {
    for (const p of products) {
      const delta = d.getFirstSync<{ s: number | null }>(
        'SELECT SUM(quantity_delta) AS s FROM stock_movements WHERE product_id = ?',
        [p.id],
      );
      const deltas = delta?.s ?? 0;
      d.runSync(
        `INSERT OR REPLACE INTO products
          (id, business_id, name, base_quantity, quantity, purchase_price, selling_price, minimum_stock, is_active, updated_at, barcode, category, is_stockable)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.id, biz, p.name, p.quantity - deltas, p.quantity, p.purchase_price ?? 0, p.selling_price, p.minimum_stock, p.is_active ? 1 : 0, nowIso(), p.barcode ?? null, p.category ?? null, p.is_stockable === false ? 0 : 1],
      );
    }
    recomputeProductQuantities(d);
  });
}

// ===== Lecture =====

export function getProducts(): ProductRow[] {
  return getDb().getAllSync<ProductRow>(
    'SELECT * FROM products WHERE is_active = 1 ORDER BY name COLLATE NOCASE',
  );
}

export function getProductByBarcode(code: string): ProductRow | null {
  const c = code.trim();
  if (!c) return null;
  return getDb().getFirstSync<ProductRow>('SELECT * FROM products WHERE is_active = 1 AND barcode = ?', [c]) ?? null;
}

export function getLowStockProducts(): ProductRow[] {
  return getDb().getAllSync<ProductRow>(
    'SELECT * FROM products WHERE is_active = 1 AND is_stockable = 1 AND quantity <= minimum_stock ORDER BY name COLLATE NOCASE',
  );
}

export function getSalesToday(): SaleRow[] {
  return getDb().getAllSync<SaleRow>(
    "SELECT * FROM sales WHERE substr(created_at, 1, 10) = ? ORDER BY created_at DESC",
    [nowIso().slice(0, 10)],
  );
}

export function getRecentSales(limit = 20): SaleRow[] {
  const d = getDb();
  const userId = scopedUserId();
  if (userId) {
    return d.getAllSync<SaleRow>(
      'SELECT * FROM sales WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
      [userId, limit],
    );
  }
  return d.getAllSync<SaleRow>('SELECT * FROM sales ORDER BY created_at DESC LIMIT ?', [limit]);
}

export function getMoneyMovementsToday(): MoneyMovementRow[] {
  const d = getDb();
  const userId = scopedUserId();
  if (userId) {
    return d.getAllSync<MoneyMovementRow>(
      "SELECT * FROM money_movements WHERE substr(created_at, 1, 10) = ? AND user_id = ? ORDER BY created_at DESC",
      [nowIso().slice(0, 10), userId],
    );
  }
  return d.getAllSync<MoneyMovementRow>(
    "SELECT * FROM money_movements WHERE substr(created_at, 1, 10) = ? ORDER BY created_at DESC",
    [nowIso().slice(0, 10)],
  );
}

// Caisse calculée = somme des mouvements reçus + total des ventes en file locale.
// Côté employé : uniquement les mouvements/ventes de l'employé courant.
export function getCashTotal(): number {
  const d = getDb();
  const userId = scopedUserId();
  const row = userId
    ? d.getFirstSync<{ total: number | null }>(
        'SELECT COALESCE(SUM(amount), 0) AS total FROM money_movements WHERE user_id = ?',
        [userId],
      )
    : d.getFirstSync<{ total: number | null }>(
        'SELECT COALESCE(SUM(amount), 0) AS total FROM money_movements',
      );
  const base = row && row.total ? row.total : 0;
  const pending = userId
    ? d.getFirstSync<{ total: number | null }>(
        `SELECT COALESCE(SUM(s.total_amount), 0) AS total
           FROM sales s JOIN outbox o ON o.client_uuid = s.client_uuid
          WHERE o.status = 'pending' AND o.kind = 'sale' AND s.user_id = ?`,
        [userId],
      )
    : d.getFirstSync<{ total: number | null }>(
        `SELECT COALESCE(SUM(s.total_amount), 0) AS total
           FROM sales s JOIN outbox o ON o.client_uuid = s.client_uuid
          WHERE o.status = 'pending' AND o.kind = 'sale'`,
      );
  return base + (pending && pending.total ? pending.total : 0);
}

// Caisse attendue d'une journée civile, calculée localement (repli hors-ligne de la
// clôture, comme le web) : mouvements du jour + ventes du jour encore en file.
export function getExpectedCashForDateLocal(dateKey: string): number {
  const d = getDb();
  const userId = scopedUserId();
  const scope = userId ? ' AND user_id = ?' : '';
  const args = userId ? [dateKey, userId] : [dateKey];
  const moves = d.getFirstSync<{ total: number | null }>(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM money_movements WHERE substr(created_at, 1, 10) = ?${scope}`,
    args,
  );
  const pendingSales = d.getFirstSync<{ total: number | null }>(
    `SELECT COALESCE(SUM(s.total_amount), 0) AS total
       FROM sales s JOIN outbox o ON o.client_uuid = s.client_uuid
      WHERE o.status = 'pending' AND o.kind = 'sale' AND substr(s.created_at, 1, 10) = ?${userId ? ' AND s.user_id = ?' : ''}`,
    args,
  );
  return (moves?.total ?? 0) + (pendingSales?.total ?? 0);
}

export function getPendingOutbox(): OutboxRow[] {
  return getDb().getAllSync<OutboxRow>(
    "SELECT * FROM outbox WHERE status = 'pending' ORDER BY created_at ASC",
  );
}

export function getRejectedOutbox(): OutboxRow[] {
  return getDb().getAllSync<OutboxRow>(
    "SELECT * FROM outbox WHERE status = 'rejected' ORDER BY created_at DESC",
  );
}

export function getLastClosings(limit = 10): DailyClosingRow[] {
  return getDb().getAllSync<DailyClosingRow>(
    'SELECT * FROM daily_closings ORDER BY closing_date DESC, created_at DESC LIMIT ?',
    [limit],
  );
}

// ===== Vue unifiée du stock (tous les employés) =====

export interface StockMovementFeedRow {
  client_uuid: string;
  product_id: string;
  type: string;
  quantity_delta: number;
  reason: string | null;
  created_at: string;
  user_name: string;
  product_name: string;
}

// Le stock est UNIFIÉ : chaque employé voit tous les mouvements de stock du
// business et l'employeur voit bien qui a fait quoi. Jointure users (nom de
// l'auteur) + products (nom du produit).
export function getStockMovementFeed(limit = 20): StockMovementFeedRow[] {
  return getDb().getAllSync<StockMovementFeedRow>(
    `SELECT sm.client_uuid, sm.product_id, sm.type, sm.quantity_delta, sm.reason, sm.created_at,
            COALESCE(u.full_name, sm.user_id) AS user_name,
            COALESCE(p.name, sm.product_id) AS product_name
       FROM stock_movements sm
       LEFT JOIN users u ON u.id = sm.user_id
       LEFT JOIN products p ON p.id = sm.product_id
      ORDER BY sm.created_at DESC
      LIMIT ?`,
    [limit],
  );
}

// ===== Cursors =====

export function getCursor(key: string): string | null {
  const row = getDb().getFirstSync<{ value: string | null }>('SELECT value FROM kv WHERE key = ?', [key]);
  return row ? row.value : null;
}

export function setCursor(key: string, value: string | null): void {
  getDb().runSync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [key, value]);
}

// ===== Capture (hors-ligne d'abord : écriture locale + outbox) =====

export function addSale(
  productId: string,
  quantity: number,
  unitPrice: number,
  paymentMethod: PaymentMethod,
  customerId: string | null = null,
): SaleRow | null {
  if (quantity <= 0 || unitPrice < 0) return null;
  // Une vente a credit sans client serait rejetee par le serveur : on refuse la
  // saisie tout de suite plutot que de la mettre en file pour rien.
  if (paymentMethod === 'credit' && !customerId) return null;
  const { business_id, user_id } = currentUser();
  const client_uuid = generateUuid();
  const total = quantity * unitPrice;
  const created_at = nowIso();
  const row: SaleRow = {
    client_uuid,
    server_id: null,
    business_id,
    user_id,
    product_id: productId,
    quantity,
    unit_price: unitPrice,
    total_amount: total,
    payment_method: paymentMethod,
    customer_id: customerId,
    created_at,
  };

  const d = getDb();
  d.withTransactionSync(() => {
    d.runSync(
      `INSERT INTO sales (client_uuid, server_id, business_id, user_id, product_id, quantity, unit_price, total_amount, payment_method, customer_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.client_uuid, null, row.business_id, row.user_id, row.product_id, row.quantity, row.unit_price, row.total_amount, row.payment_method, row.customer_id, row.created_at],
    );
    d.runSync(
      `INSERT INTO outbox (client_uuid, kind, payload, status, error, created_at) VALUES (?, 'sale', ?, 'pending', NULL, ?)`,
      [client_uuid, JSON.stringify({
        client_uuid,
        product_id: productId,
        quantity,
        unit_price: unitPrice,
        payment_method: paymentMethod,
        ...(customerId ? { customer_id: customerId } : {}),
      }), created_at],
    );
    recomputeProductQuantities(d);
  });
  return row;
}

export function addMoneyMovement(
  type: MoneyKind,
  amount: number,
  reason: string | null,
  channel: MoneyChannel = 'cash',
  category: string | null = null,
): MoneyMovementRow | null {
  if (amount <= 0) return null;
  const { business_id, user_id } = currentUser();
  const signed = type === 'income' ? amount : -amount;
  const client_uuid = generateUuid();
  const created_at = nowIso();
  const row: MoneyMovementRow = {
    client_uuid,
    server_id: null,
    business_id,
    user_id,
    type,
    amount: signed,
    reason,
    sale_id: null,
    channel,
    customer_id: null,
    category,
    created_at,
  };

  const d = getDb();
  d.withTransactionSync(() => {
    d.runSync(
      `INSERT INTO money_movements (client_uuid, server_id, business_id, user_id, type, amount, reason, sale_id, channel, customer_id, category, created_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?)`,
      [row.client_uuid, row.business_id, row.user_id, row.type, row.amount, row.reason, row.channel, category, row.created_at],
    );
    d.runSync(
      `INSERT INTO outbox (client_uuid, kind, payload, status, error, created_at) VALUES (?, 'money', ?, 'pending', NULL, ?)`,
      [client_uuid, JSON.stringify({
        client_uuid,
        type,
        amount: signed,
        reason,
        channel,
        category,
      }), created_at],
    );
  });
  return row;
}

// ===== Clients a credit =====

export function addCustomer(fullName: string, phone: string | null): CustomerRow | null {
  const name = fullName.trim();
  if (name === '') return null;
  const { business_id } = currentUser();
  const client_uuid = generateUuid();
  const created_at = nowIso();
  const row: CustomerRow = { client_uuid, server_id: null, business_id, full_name: name, phone, created_at };

  const d = getDb();
  d.withTransactionSync(() => {
    d.runSync(
      `INSERT INTO customers (client_uuid, server_id, business_id, full_name, phone, created_at)
       VALUES (?, NULL, ?, ?, ?, ?)`,
      [row.client_uuid, row.business_id, row.full_name, row.phone, row.created_at],
    );
    d.runSync(
      `INSERT INTO outbox (client_uuid, kind, payload, status, error, created_at) VALUES (?, 'customer', ?, 'pending', NULL, ?)`,
      [client_uuid, JSON.stringify({ client_uuid, full_name: name, phone }), created_at],
    );
  });
  return row;
}

// Identifiant envoye au serveur pour une vente/un remboursement a credit :
// server_id s il est connu, sinon client_uuid (le backend resout les deux via
// resolve_customer), ce qui permet de creer un client puis de lui vendre a
// credit dans la meme session hors-ligne.
export function customerRef(c: CustomerRow): string {
  return c.server_id ?? c.client_uuid;
}

export function searchCustomers(query: string, limit = 8): CustomerWithBalance[] {
  const like = '%' + query.trim() + '%';
  const rows = getDb().getAllSync<CustomerRow>(
    'SELECT * FROM customers WHERE full_name LIKE ? ORDER BY full_name COLLATE NOCASE LIMIT ?',
    [like, limit],
  );
  return rows.map((c) => ({ ...c, balance: getCustomerBalance(c) }));
}

export function getCustomers(): CustomerWithBalance[] {
  const rows = getDb().getAllSync<CustomerRow>('SELECT * FROM customers ORDER BY full_name COLLATE NOCASE');
  return rows.map((c) => ({ ...c, balance: getCustomerBalance(c) }));
}

// Solde du = ventes a credit - remboursements. Jamais stocke, toujours derive
// des evenements locaux (meme regle que la caisse et le stock).
export function getCustomerBalance(c: CustomerRow): number {
  const d = getDb();
  const ids = [c.client_uuid, c.server_id ?? c.client_uuid];
  const credited = d.getFirstSync<{ total: number | null }>(
    `SELECT COALESCE(SUM(total_amount), 0) AS total FROM sales
      WHERE payment_method = 'credit' AND customer_id IN (?, ?)`,
    ids,
  );
  const repaid = d.getFirstSync<{ total: number | null }>(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM money_movements
      WHERE type = 'credit_repayment' AND customer_id IN (?, ?)`,
    ids,
  );
  return (credited?.total ?? 0) - (repaid?.total ?? 0);
}

export interface CustomerTx {
  kind: 'sale' | 'repayment';
  at: string;
  amount: number;
  label: string;
  channel: string | null;
}

// Historique d'un client (ventes a credit + remboursements), du plus recent au plus ancien.
export function getCustomerTransactions(c: CustomerRow): CustomerTx[] {
  const d = getDb();
  const ids = [c.client_uuid, c.server_id ?? c.client_uuid];
  const out: CustomerTx[] = [];
  for (const s of d.getAllSync<SaleRow & { product_name: string | null }>(
    `SELECT s.*, p.name AS product_name FROM sales s LEFT JOIN products p ON p.id = s.product_id
      WHERE s.payment_method = 'credit' AND s.customer_id IN (?, ?)`,
    ids,
  )) {
    out.push({ kind: 'sale', at: s.created_at, amount: s.total_amount, label: `${s.quantity} x ${s.product_name ?? 'produit'} a credit`, channel: null });
  }
  for (const m of d.getAllSync<MoneyMovementRow>(
    `SELECT * FROM money_movements WHERE type = 'credit_repayment' AND customer_id IN (?, ?)`,
    ids,
  )) {
    out.push({ kind: 'repayment', at: m.created_at, amount: Math.abs(m.amount), label: m.reason ? `Remboursement : ${m.reason}` : 'Remboursement', channel: m.channel });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

export function addCreditRepayment(
  customerRefId: string,
  amount: number,
  channel: MoneyChannel,
  note: string | null,
): MoneyMovementRow | null {
  if (amount <= 0) return null;
  const { business_id, user_id } = currentUser();
  const client_uuid = generateUuid();
  const created_at = nowIso();
  const row: MoneyMovementRow = {
    client_uuid,
    server_id: null,
    business_id,
    user_id,
    type: 'credit_repayment',
    amount,
    reason: note,
    sale_id: null,
    channel,
    customer_id: customerRefId,
    created_at,
  };

  const d = getDb();
  d.withTransactionSync(() => {
    d.runSync(
      `INSERT INTO money_movements (client_uuid, server_id, business_id, user_id, type, amount, reason, sale_id, channel, customer_id, created_at)
       VALUES (?, NULL, ?, ?, 'credit_repayment', ?, ?, NULL, ?, ?, ?)`,
      [row.client_uuid, row.business_id, row.user_id, row.amount, row.reason, row.channel, row.customer_id, row.created_at],
    );
    d.runSync(
      `INSERT INTO outbox (client_uuid, kind, payload, status, error, created_at) VALUES (?, 'credit_repayment', ?, 'pending', NULL, ?)`,
      [client_uuid, JSON.stringify({
        client_uuid,
        customer_id: customerRefId,
        amount,
        channel,
        note,
      }), created_at],
    );
  });
  return row;
}

export function addStockMovement(productId: string, type: StockKind, quantityDelta: number, reason: string | null): StockMovementRow | null {
  if (quantityDelta === 0) return null;
  const { business_id, user_id } = currentUser();
  const client_uuid = generateUuid();
  const created_at = nowIso();
  const row: StockMovementRow = {
    client_uuid,
    server_id: null,
    business_id,
    user_id,
    product_id: productId,
    type,
    quantity_delta: quantityDelta,
    reason,
    sale_id: null,
    created_at,
  };

  const d = getDb();
  d.withTransactionSync(() => {
    d.runSync(
      `INSERT INTO stock_movements (client_uuid, server_id, business_id, user_id, product_id, type, quantity_delta, reason, sale_id, created_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      [row.client_uuid, row.business_id, row.user_id, row.product_id, row.type, row.quantity_delta, row.reason, row.created_at],
    );
    d.runSync(
      `INSERT INTO outbox (client_uuid, kind, payload, status, error, created_at) VALUES (?, 'stock', ?, 'pending', NULL, ?)`,
      [client_uuid, JSON.stringify({
        client_uuid,
        product_id: productId,
        type,
        quantity_delta: quantityDelta,
        reason,
      }), created_at],
    );
    recomputeProductQuantities(d);
  });
  return row;
}

export function addDailyClosing(
  closingDate: string,
  expected: { cash: number; momo: number; orange: number },
  actual: { cash: number; momo: number; orange: number },
  note: string | null,
): DailyClosingRow | null {
  const { business_id, user_id } = currentUser();
  const client_uuid = generateUuid();
  const created_at = nowIso();
  const row: DailyClosingRow = {
    client_uuid,
    server_id: null,
    business_id,
    user_id,
    closing_date: closingDate,
    expected_cash: expected.cash,
    actual_cash: actual.cash,
    difference: actual.cash - expected.cash,
    expected_momo: expected.momo,
    actual_momo: actual.momo,
    difference_momo: actual.momo - expected.momo,
    expected_orange: expected.orange,
    actual_orange: actual.orange,
    difference_orange: actual.orange - expected.orange,
    note,
    created_at,
  };

  const d = getDb();
  d.withTransactionSync(() => {
    d.runSync(
      `INSERT INTO daily_closings (client_uuid, server_id, business_id, user_id, closing_date, expected_cash, actual_cash, difference,
         expected_momo, actual_momo, difference_momo, expected_orange, actual_orange, difference_orange, note, created_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.client_uuid, row.business_id, row.user_id, row.closing_date, row.expected_cash, row.actual_cash, row.difference,
        row.expected_momo, row.actual_momo, row.difference_momo, row.expected_orange, row.actual_orange, row.difference_orange, row.note, row.created_at],
    );
    // expected_* ne partent jamais au serveur (calcules cote serveur, SYNC_DESIGN) : affichage optimiste seulement.
    d.runSync(
      `INSERT INTO outbox (client_uuid, kind, payload, status, error, created_at) VALUES (?, 'closing', ?, 'pending', NULL, ?)`,
      [client_uuid, JSON.stringify({
        client_uuid,
        closing_date: closingDate,
        actual_cash: actual.cash,
        actual_momo: actual.momo,
        actual_orange: actual.orange,
        note,
      }), created_at],
    );
  });
  return row;
}

// Attendu local (repli hors-ligne de la cloture) scinde par canal : mouvements du jour + ventes du jour encore en file.
export function getExpectedByChannelLocal(dateKey: string): { cash: number; momo: number; orange: number } {
  const d = getDb();
  const out = { cash: 0, momo: 0, orange: 0 };
  const moves = d.getAllSync<{ channel: string | null; total: number | null }>(
    `SELECT channel, COALESCE(SUM(amount), 0) AS total FROM money_movements WHERE substr(created_at, 1, 10) = ? GROUP BY channel`,
    [dateKey],
  );
  for (const m of moves) {
    if (m.channel === 'mobile_money') out.momo += m.total ?? 0;
    else if (m.channel === 'orange_money') out.orange += m.total ?? 0;
    else out.cash += m.total ?? 0;
  }
  const pending = d.getAllSync<{ payment_method: string; total: number | null }>(
    `SELECT s.payment_method AS payment_method, COALESCE(SUM(s.total_amount), 0) AS total
       FROM sales s JOIN outbox o ON o.client_uuid = s.client_uuid
      WHERE o.status = 'pending' AND o.kind = 'sale' AND substr(s.created_at, 1, 10) = ? GROUP BY s.payment_method`,
    [dateKey],
  );
  for (const p of pending) {
    if (p.payment_method === 'credit') continue;
    if (p.payment_method === 'mobile_money') out.momo += p.total ?? 0;
    else if (p.payment_method === 'orange_money') out.orange += p.total ?? 0;
    else out.cash += p.total ?? 0;
  }
  return out;
}

// ===== Shift (ouverture / cloture de caisse par employe) =====

export function getOpenShift(): ShiftRow | null {
  const { user_id } = currentUser();
  return getDb().getFirstSync<ShiftRow>(
    'SELECT * FROM shifts WHERE user_id = ? AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1',
    [user_id],
  ) ?? null;
}

export function listMyShifts(limit = 10): ShiftRow[] {
  const { user_id } = currentUser();
  return getDb().getAllSync<ShiftRow>('SELECT * FROM shifts WHERE user_id = ? ORDER BY opened_at DESC LIMIT ?', [user_id, limit]);
}

export function openShift(openingCash: number): ShiftRow | null {
  if (getOpenShift()) return null;
  const { user_id } = currentUser();
  const client_uuid = generateUuid();
  const opened_at = nowIso();
  const d = getDb();
  d.withTransactionSync(() => {
    d.runSync('INSERT INTO shifts (client_uuid, user_id, opened_at, opening_cash) VALUES (?, ?, ?, ?)', [client_uuid, user_id, opened_at, openingCash]);
    d.runSync(
      `INSERT INTO outbox (client_uuid, kind, payload, status, error, created_at) VALUES (?, 'shift', ?, 'pending', NULL, ?)`,
      [client_uuid, JSON.stringify({ client_uuid, opened_at, opening_cash: openingCash }), opened_at],
    );
  });
  return { client_uuid, user_id, opened_at, opening_cash: openingCash, closed_at: null, counted_cash: null, note: null };
}

export function closeShift(countedCash: number, note: string | null): ShiftRow | null {
  const open = getOpenShift();
  if (!open) return null;
  const closed_at = nowIso();
  const d = getDb();
  d.withTransactionSync(() => {
    d.runSync('UPDATE shifts SET closed_at = ?, counted_cash = ?, note = ? WHERE client_uuid = ?', [closed_at, countedCash, note, open.client_uuid]);
    // Id d'outbox distinct : ouverture et fermeture partagent le client_uuid du shift cote serveur.
    d.runSync(
      `INSERT INTO outbox (client_uuid, kind, payload, status, error, created_at) VALUES (?, 'shift', ?, 'pending', NULL, ?)`,
      [open.client_uuid + ':close', JSON.stringify({
        client_uuid: open.client_uuid,
        opened_at: open.opened_at,
        opening_cash: open.opening_cash,
        closed_at,
        counted_cash: countedCash,
        note,
      }), closed_at],
    );
  });
  return { ...open, closed_at, counted_cash: countedCash, note };
}

// Especes attendues dans le shift ouvert : fond de caisse + flux especes de cet employe depuis l'ouverture.
export function getShiftPreview(shift: ShiftRow): { expected: number; sales: number; salesTotal: number } {
  const d = getDb();
  const flow = d.getFirstSync<{ total: number | null }>(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM money_movements
      WHERE user_id = ? AND created_at >= ? AND (channel IS NULL OR channel = 'cash')`,
    [shift.user_id, shift.opened_at],
  );
  const pendingCash = d.getFirstSync<{ total: number | null }>(
    `SELECT COALESCE(SUM(s.total_amount), 0) AS total FROM sales s JOIN outbox o ON o.client_uuid = s.client_uuid
      WHERE o.status = 'pending' AND o.kind = 'sale' AND s.user_id = ? AND s.created_at >= ? AND s.payment_method = 'cash'`,
    [shift.user_id, shift.opened_at],
  );
  const sales = d.getFirstSync<{ c: number; t: number | null }>(
    'SELECT COUNT(*) AS c, COALESCE(SUM(total_amount), 0) AS t FROM sales WHERE user_id = ? AND created_at >= ?',
    [shift.user_id, shift.opened_at],
  );
  return {
    expected: shift.opening_cash + (flow?.total ?? 0) + (pendingCash?.total ?? 0),
    sales: sales?.c ?? 0,
    salesTotal: sales?.t ?? 0,
  };
}

// ===== Historique personnel (mes operations et leur statut de synchronisation) =====

export interface MyOperation {
  id: string;
  at: string;
  kind: 'sale' | 'money' | 'stock';
  label: string;
  amount: number | null;
  sync: 'pending' | 'rejected' | 'synced';
  error: string | null;
}

export function getMyOperations(limit = 60): MyOperation[] {
  const d = getDb();
  const { user_id } = currentUser();
  const status = (id: string): { sync: MyOperation['sync']; error: string | null } => {
    const o = d.getFirstSync<{ status: string; error: string | null }>('SELECT status, error FROM outbox WHERE client_uuid = ?', [id]);
    if (!o) return { sync: 'synced', error: null };
    return { sync: o.status === 'rejected' ? 'rejected' : 'pending', error: o.error };
  };
  const out: MyOperation[] = [];
  for (const s of d.getAllSync<SaleRow & { product_name: string | null }>(
    `SELECT s.*, p.name AS product_name FROM sales s LEFT JOIN products p ON p.id = s.product_id WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT ?`,
    [user_id, limit],
  )) {
    out.push({ id: s.client_uuid, at: s.created_at, kind: 'sale', label: `${s.quantity} x ${s.product_name ?? 'produit'} (${s.payment_method})`, amount: s.total_amount, ...status(s.client_uuid) });
  }
  for (const m of d.getAllSync<MoneyMovementRow>(
    `SELECT * FROM money_movements WHERE user_id = ? AND type != 'sale' ORDER BY created_at DESC LIMIT ?`,
    [user_id, limit],
  )) {
    out.push({ id: m.client_uuid, at: m.created_at, kind: 'money', label: `${m.type}${m.category ? ' - ' + m.category : ''}${m.reason ? ' : ' + m.reason : ''}`, amount: m.amount, ...status(m.client_uuid) });
  }
  for (const m of d.getAllSync<StockMovementRow & { product_name: string | null }>(
    `SELECT sm.*, p.name AS product_name FROM stock_movements sm LEFT JOIN products p ON p.id = sm.product_id
      WHERE sm.user_id = ? AND sm.type != 'sale' ORDER BY sm.created_at DESC LIMIT ?`,
    [user_id, limit],
  )) {
    out.push({ id: m.client_uuid, at: m.created_at, kind: 'stock', label: `${m.type} ${m.product_name ?? 'produit'}${m.reason ? ' (' + m.reason + ')' : ''}`, amount: m.quantity_delta, ...status(m.client_uuid) });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

// ===== Application d'un pull (upsert par client_uuid, ignore si présent) =====

function str(v: unknown): string | null {
  return v == null || v === '' ? null : String(v);
}
function num(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function applyPullEvents(events: {
  sales?: Record<string, unknown>[];
  money_movements?: Record<string, unknown>[];
  stock_movements?: Record<string, unknown>[];
  daily_closings?: Record<string, unknown>[];
  customers?: Record<string, unknown>[];
}): void {
  const d = getDb();
  d.withTransactionSync(() => {
    // Les clients d'abord : une vente a credit recue juste apres peut les referencer.
    for (const e of events.customers ?? []) {
      d.runSync(
        `INSERT OR IGNORE INTO customers (client_uuid, server_id, business_id, full_name, phone, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [String(e.client_uuid), str(e.id), String(e.business_id), String(e.full_name), str(e.phone), str(e.created_at) ?? nowIso()],
      );
      // Un client cree hors-ligne existe deja localement sous son client_uuid :
      // on complete son server_id des que le serveur le renvoie.
      d.runSync('UPDATE customers SET server_id = ? WHERE client_uuid = ? AND server_id IS NULL', [
        str(e.id),
        String(e.client_uuid),
      ]);
    }
    for (const e of events.sales ?? []) {
      d.runSync(
        `INSERT OR IGNORE INTO sales
          (client_uuid, server_id, business_id, user_id, product_id, quantity, unit_price, total_amount, payment_method, customer_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [String(e.client_uuid), str(e.id), String(e.business_id), String(e.user_id), String(e.product_id), num(e.quantity), num(e.unit_price), num(e.total_amount), String(e.payment_method), str(e.customer_id), str(e.created_at) ?? nowIso()],
      );
    }
    for (const e of events.money_movements ?? []) {
      d.runSync(
        `INSERT OR IGNORE INTO money_movements
          (client_uuid, server_id, business_id, user_id, type, amount, reason, sale_id, channel, customer_id, category, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [String(e.client_uuid), str(e.id), String(e.business_id), String(e.user_id), String(e.type), num(e.amount), str(e.reason), str(e.sale_id), str(e.channel), str(e.customer_id), str(e.category), str(e.created_at) ?? nowIso()],
      );
    }
    for (const e of events.stock_movements ?? []) {
      d.runSync(
        `INSERT OR IGNORE INTO stock_movements
          (client_uuid, server_id, business_id, user_id, product_id, type, quantity_delta, reason, sale_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [String(e.client_uuid), str(e.id), String(e.business_id), String(e.user_id), String(e.product_id), String(e.type), num(e.quantity_delta), str(e.reason), str(e.sale_id), str(e.created_at) ?? nowIso()],
      );
    }
    for (const e of events.daily_closings ?? []) {
      d.runSync(
        `INSERT OR IGNORE INTO daily_closings
          (client_uuid, server_id, business_id, user_id, closing_date, expected_cash, actual_cash, difference,
           expected_momo, actual_momo, difference_momo, expected_orange, actual_orange, difference_orange, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [String(e.client_uuid), str(e.id), String(e.business_id), String(e.user_id), String(e.closing_date), num(e.expected_cash), num(e.actual_cash), str(e.difference) == null ? num(e.actual_cash) - num(e.expected_cash) : num(e.difference),
          e.expected_momo == null ? null : num(e.expected_momo), e.actual_momo == null ? null : num(e.actual_momo), e.difference_momo == null ? null : num(e.difference_momo),
          e.expected_orange == null ? null : num(e.expected_orange), e.actual_orange == null ? null : num(e.actual_orange), e.difference_orange == null ? null : num(e.difference_orange),
          str(e.note), str(e.created_at) ?? nowIso()],
      );
    }
    recomputeProductQuantities(d);
  });
}

// ===== Outbox (après push) =====

export function markOutboxSynced(clientUuid: string): void {
  getDb().runSync('DELETE FROM outbox WHERE client_uuid = ?', [clientUuid]);
}

export function markOutboxRejected(clientUuid: string, detail: string): void {
  getDb().runSync(
    "UPDATE outbox SET status = 'rejected', error = ? WHERE client_uuid = ?",
    [detail, clientUuid],
  );
}