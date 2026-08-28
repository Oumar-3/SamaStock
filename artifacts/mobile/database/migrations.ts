import type { SQLiteDatabase } from "expo-sqlite";

const DATABASE_VERSION = 8;

const MIGRATION_1 = `
CREATE TABLE IF NOT EXISTS shop_profile (
  id TEXT PRIMARY KEY NOT NULL,
  shop_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  brand TEXT,
  format TEXT,
  buy_price REAL NOT NULL DEFAULT 0,
  sell_price REAL NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  alert_threshold INTEGER NOT NULL DEFAULT 5,
  barcode TEXT,
  image_uri TEXT,
  estimated_average_price REAL,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_search ON products(name, category, brand, format, barcode);
CREATE INDEX IF NOT EXISTS idx_products_archived ON products(is_archived);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_unique ON products(barcode) WHERE barcode IS NOT NULL AND barcode != '';

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY NOT NULL,
  receipt_number TEXT NOT NULL UNIQUE,
  total REAL NOT NULL DEFAULT 0,
  estimated_profit REAL NOT NULL DEFAULT 0,
  payment_type TEXT NOT NULL CHECK(payment_type IN ('cash', 'credit')),
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY NOT NULL,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  buy_price REAL NOT NULL DEFAULT 0,
  sell_price REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0,
  estimated_profit REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  type TEXT NOT NULL CHECK(type IN ('initial', 'purchase', 'sale', 'adjustment', 'archive')),
  quantity_delta INTEGER NOT NULL,
  quantity_after INTEGER NOT NULL,
  note TEXT,
  sale_id TEXT REFERENCES sales(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_sale ON stock_movements(sale_id);

CREATE TABLE IF NOT EXISTS debts (
  id TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL REFERENCES clients(id),
  amount REAL NOT NULL,
  paid_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'paid')),
  description TEXT,
  sale_id TEXT REFERENCES sales(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_debts_client ON debts(client_id);
CREATE INDEX IF NOT EXISTS idx_debts_status ON debts(status);

CREATE TABLE IF NOT EXISTS debt_payments (
  id TEXT PRIMARY KEY NOT NULL,
  debt_id TEXT NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_debt_payments_debt ON debt_payments(debt_id);
`;

const MIGRATION_2 = `
ALTER TABLE shop_profile ADD COLUMN remote_id TEXT;
ALTER TABLE shop_profile ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE shop_profile ADD COLUMN last_synced_at TEXT;
ALTER TABLE shop_profile ADD COLUMN deleted_at TEXT;

ALTER TABLE products ADD COLUMN remote_id TEXT;
ALTER TABLE products ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE products ADD COLUMN last_synced_at TEXT;
ALTER TABLE products ADD COLUMN deleted_at TEXT;

ALTER TABLE clients ADD COLUMN remote_id TEXT;
ALTER TABLE clients ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE clients ADD COLUMN last_synced_at TEXT;
ALTER TABLE clients ADD COLUMN deleted_at TEXT;

ALTER TABLE sales ADD COLUMN remote_id TEXT;
ALTER TABLE sales ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE sales ADD COLUMN last_synced_at TEXT;
ALTER TABLE sales ADD COLUMN deleted_at TEXT;

ALTER TABLE sale_items ADD COLUMN remote_id TEXT;
ALTER TABLE sale_items ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE sale_items ADD COLUMN last_synced_at TEXT;
ALTER TABLE sale_items ADD COLUMN deleted_at TEXT;

ALTER TABLE stock_movements ADD COLUMN remote_id TEXT;
ALTER TABLE stock_movements ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE stock_movements ADD COLUMN last_synced_at TEXT;
ALTER TABLE stock_movements ADD COLUMN deleted_at TEXT;

ALTER TABLE debts ADD COLUMN remote_id TEXT;
ALTER TABLE debts ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE debts ADD COLUMN last_synced_at TEXT;
ALTER TABLE debts ADD COLUMN deleted_at TEXT;

ALTER TABLE debt_payments ADD COLUMN remote_id TEXT;
ALTER TABLE debt_payments ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE debt_payments ADD COLUMN last_synced_at TEXT;
ALTER TABLE debt_payments ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_products_sync_status ON products(sync_status);
CREATE INDEX IF NOT EXISTS idx_clients_sync_status ON clients(sync_status);
CREATE INDEX IF NOT EXISTS idx_sales_sync_status ON sales(sync_status);
CREATE INDEX IF NOT EXISTS idx_debts_sync_status ON debts(sync_status);
`;

const MIGRATION_3 = `
CREATE TABLE IF NOT EXISTS shops (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  owner_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 0,
  remote_id TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  last_synced_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO shops (
  id, name, owner_name, phone, address, is_active,
  remote_id, sync_status, last_synced_at, deleted_at, created_at, updated_at
)
SELECT
  COALESCE(remote_id, id),
  shop_name,
  owner_name,
  phone,
  address,
  1,
  remote_id,
  sync_status,
  last_synced_at,
  deleted_at,
  created_at,
  updated_at
FROM shop_profile
WHERE deleted_at IS NULL
LIMIT 1;

INSERT OR IGNORE INTO shops (
  id, name, owner_name, phone, address, is_active, created_at, updated_at
)
SELECT
  'local-main',
  'Ma boutique',
  '',
  '',
  '',
  1,
  datetime('now'),
  datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM shops WHERE deleted_at IS NULL);

ALTER TABLE shop_profile ADD COLUMN shop_id TEXT;
ALTER TABLE products ADD COLUMN shop_id TEXT;
ALTER TABLE clients ADD COLUMN shop_id TEXT;
ALTER TABLE sales ADD COLUMN shop_id TEXT;
ALTER TABLE sale_items ADD COLUMN shop_id TEXT;
ALTER TABLE stock_movements ADD COLUMN shop_id TEXT;
ALTER TABLE debts ADD COLUMN shop_id TEXT;
ALTER TABLE debt_payments ADD COLUMN shop_id TEXT;

UPDATE shop_profile SET shop_id = COALESCE(shop_id, (SELECT id FROM shops WHERE is_active = 1 LIMIT 1));
UPDATE products SET shop_id = COALESCE(shop_id, (SELECT id FROM shops WHERE is_active = 1 LIMIT 1));
UPDATE clients SET shop_id = COALESCE(shop_id, (SELECT id FROM shops WHERE is_active = 1 LIMIT 1));
UPDATE sales SET shop_id = COALESCE(shop_id, (SELECT id FROM shops WHERE is_active = 1 LIMIT 1));
UPDATE sale_items SET shop_id = COALESCE(shop_id, (SELECT id FROM shops WHERE is_active = 1 LIMIT 1));
UPDATE stock_movements SET shop_id = COALESCE(shop_id, (SELECT id FROM shops WHERE is_active = 1 LIMIT 1));
UPDATE debts SET shop_id = COALESCE(shop_id, (SELECT id FROM shops WHERE is_active = 1 LIMIT 1));
UPDATE debt_payments SET shop_id = COALESCE(shop_id, (SELECT id FROM shops WHERE is_active = 1 LIMIT 1));

CREATE INDEX IF NOT EXISTS idx_shops_active ON shops(is_active);
CREATE INDEX IF NOT EXISTS idx_shop_profile_shop ON shop_profile(shop_id);
CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id);
CREATE INDEX IF NOT EXISTS idx_clients_shop ON clients(shop_id);
CREATE INDEX IF NOT EXISTS idx_sales_shop ON sales(shop_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_shop ON sale_items(shop_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_shop ON stock_movements(shop_id);
CREATE INDEX IF NOT EXISTS idx_debts_shop ON debts(shop_id);
CREATE INDEX IF NOT EXISTS idx_debt_payments_shop ON debt_payments(shop_id);
`;

const MIGRATION_4 = `
DROP INDEX IF EXISTS idx_products_barcode_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_shop_barcode_unique
  ON products(shop_id, barcode)
  WHERE barcode IS NOT NULL AND barcode != '' AND shop_id IS NOT NULL;
`;

const MIGRATION_5 = `
CREATE INDEX IF NOT EXISTS idx_products_shop_updated ON products(shop_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_products_shop_archived_name ON products(shop_id, is_archived, name);
CREATE INDEX IF NOT EXISTS idx_products_shop_barcode ON products(shop_id, barcode);

CREATE INDEX IF NOT EXISTS idx_clients_shop_name_phone ON clients(shop_id, name, phone);

CREATE INDEX IF NOT EXISTS idx_sales_shop_deleted_created ON sales(shop_id, deleted_at, created_at);
CREATE INDEX IF NOT EXISTS idx_sales_shop_receipt ON sales(shop_id, receipt_number);
CREATE INDEX IF NOT EXISTS idx_sales_shop_payment_created ON sales(shop_id, payment_type, created_at);

CREATE INDEX IF NOT EXISTS idx_sale_items_shop_sale ON sale_items(shop_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_shop_product ON sale_items(shop_id, product_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_shop_created ON stock_movements(shop_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_shop_product_created ON stock_movements(shop_id, product_id, created_at);

CREATE INDEX IF NOT EXISTS idx_debts_shop_status_updated ON debts(shop_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_debts_shop_client ON debts(shop_id, client_id);

CREATE INDEX IF NOT EXISTS idx_debt_payments_shop_created ON debt_payments(shop_id, created_at);
CREATE INDEX IF NOT EXISTS idx_debt_payments_shop_debt_created ON debt_payments(shop_id, debt_id, created_at);
`;

const MIGRATION_6 = `
CREATE TABLE IF NOT EXISTS sync_state (
  table_name TEXT PRIMARY KEY NOT NULL,
  last_pulled_at TEXT,
  updated_at TEXT NOT NULL
);
`;

const MIGRATION_7 = `
ALTER TABLE products ADD COLUMN image_path TEXT;
`;

const MIGRATION_8 = `
DROP INDEX IF EXISTS idx_products_shop_barcode_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_shop_barcode_unique
  ON products(shop_id, barcode)
  WHERE barcode IS NOT NULL
    AND barcode != ''
    AND shop_id IS NOT NULL
    AND is_archived = 0
    AND deleted_at IS NULL;
`;

export async function runMigrationsAsync(db: SQLiteDatabase) {
  const versionRow = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion < 1) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATION_1);
      await db.execAsync("PRAGMA user_version = 1;");
    });
  }

  if (currentVersion < 2) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATION_2);
      await db.execAsync("PRAGMA user_version = 2;");
    });
  }

  if (currentVersion < 3) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATION_3);
      await db.execAsync("PRAGMA user_version = 3;");
    });
  }

  if (currentVersion < 4) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATION_4);
      await db.execAsync("PRAGMA user_version = 4;");
    });
  }

  if (currentVersion < 5) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATION_5);
      await db.execAsync("PRAGMA user_version = 5;");
    });
  }

  if (currentVersion < 6) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATION_6);
      await db.execAsync("PRAGMA user_version = 6;");
    });
  }

  if (currentVersion < 7) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATION_7);
      await db.execAsync("PRAGMA user_version = 7;");
    });
  }


  if (currentVersion < 8) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATION_8);
      await db.execAsync("PRAGMA user_version = 8;");
    });
  }
  if (currentVersion > DATABASE_VERSION) {
    throw new Error(`Unsupported database version: ${currentVersion}`);
  }
}
