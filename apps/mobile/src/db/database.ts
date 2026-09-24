import * as SQLite from 'expo-sqlite';

export const DB_NAME = 'korah.db';

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync(DB_NAME);
  }
  return db;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  base_quantity INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  purchase_price INTEGER NOT NULL DEFAULT 0,
  selling_price INTEGER NOT NULL DEFAULT 0,
  minimum_stock INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee',
  can_view_purchase_prices INTEGER NOT NULL DEFAULT 0,
  can_view_owner_dashboard INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS customers (
  client_uuid TEXT PRIMARY KEY,
  server_id TEXT,
  business_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sales (
  client_uuid TEXT PRIMARY KEY,
  server_id TEXT,
  business_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  total_amount INTEGER NOT NULL,
  payment_method TEXT NOT NULL,
  customer_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS money_movements (
  client_uuid TEXT PRIMARY KEY,
  server_id TEXT,
  business_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT,
  sale_id TEXT,
  channel TEXT,
  customer_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_movements (
  client_uuid TEXT PRIMARY KEY,
  server_id TEXT,
  business_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  type TEXT NOT NULL,
  quantity_delta INTEGER NOT NULL,
  reason TEXT,
  sale_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_closings (
  client_uuid TEXT PRIMARY KEY,
  server_id TEXT,
  business_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  closing_date TEXT NOT NULL,
  expected_cash INTEGER NOT NULL,
  actual_cash INTEGER NOT NULL,
  difference INTEGER NOT NULL,
  expected_momo INTEGER,
  actual_momo INTEGER,
  difference_momo INTEGER,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shifts (
  client_uuid TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  opening_cash INTEGER NOT NULL DEFAULT 0,
  closed_at TEXT,
  counted_cash INTEGER,
  note TEXT
);

CREATE TABLE IF NOT EXISTS outbox (
  client_uuid TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

// Colonnes ajoutées après la v1 du schéma. `CREATE TABLE IF NOT EXISTS` ne les
// ajoute pas sur une base déjà créée par une version antérieure de l'app : il
// faut un ALTER TABLE, qui échoue si la colonne existe déjà — d'où le try/catch
// (SQLite n'a pas d'`ADD COLUMN IF NOT EXISTS`).
const ADDED_COLUMNS: [table: string, column: string, type: string][] = [
  ['sales', 'customer_id', 'TEXT'],
  ['money_movements', 'channel', 'TEXT'],
  ['money_movements', 'customer_id', 'TEXT'],
  ['daily_closings', 'expected_momo', 'INTEGER'],
  ['daily_closings', 'actual_momo', 'INTEGER'],
  ['daily_closings', 'difference_momo', 'INTEGER'],
  ['daily_closings', 'expected_orange', 'INTEGER'],
  ['daily_closings', 'actual_orange', 'INTEGER'],
  ['daily_closings', 'difference_orange', 'INTEGER'],
  ['money_movements', 'category', 'TEXT'],
  ['products', 'barcode', 'TEXT'],
  ['products', 'category', 'TEXT'],
  ['products', 'is_stockable', 'INTEGER NOT NULL DEFAULT 1'],
];

export function initDatabase(): void {
  const d = getDb();
  d.execSync(SCHEMA);
  for (const [table, column, type] of ADDED_COLUMNS) {
    try {
      d.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    } catch {
      /* colonne déjà présente */
    }
  }
  recomputeProductQuantities(d);
}

// Le stock de chaque produit est TOUJOURS recalculé à partir de la base
// (dernière quantité serveur connue) + l'ensemble des mouvements reçus, moins
// les ventes encore en file locale (optimiste, SYNC_DESIGN §4).
export function recomputeProductQuantities(d: SQLite.SQLiteDatabase): void {
  d.runSync(`
    UPDATE products SET quantity = CASE WHEN is_stockable = 0 THEN base_quantity ELSE base_quantity
      + COALESCE((
          SELECT SUM(quantity_delta) FROM stock_movements
          WHERE stock_movements.product_id = products.id
        ), 0)
      - COALESCE((
          SELECT SUM(s.quantity) FROM sales s
          JOIN outbox o ON o.client_uuid = s.client_uuid
          WHERE o.status = 'pending' AND o.kind = 'sale' AND s.product_id = products.id
        ), 0) END
  `);
}