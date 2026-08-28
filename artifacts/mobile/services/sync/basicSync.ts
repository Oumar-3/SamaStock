import { getDatabaseAsync } from "@/database/client";
import { getSupabaseClient } from "@/services/supabase/client";
import type { SyncCheckpoint, SyncResult, SyncableTable } from "./types";

type LocalShopProfileRow = {
  id: string;
  shop_id: string | null;
  shop_name: string;
  owner_name: string;
  phone: string;
  address: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type LocalShopRow = {
  id: string;
  name: string;
  owner_name: string;
  phone: string;
  address: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type LocalClientRow = {
  id: string;
  shop_id: string | null;
  name: string;
  phone: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type LocalProductRow = {
  id: string;
  shop_id: string | null;
  name: string;
  category: string;
  brand: string | null;
  format: string | null;
  buy_price: number;
  sell_price: number;
  stock: number;
  alert_threshold: number;
  barcode: string | null;
  image_uri: string | null;
  image_path: string | null;
  estimated_average_price: number | null;
  is_archived: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type LocalSaleRow = {
  id: string;
  shop_id: string | null;
  receipt_number: string;
  total: number;
  estimated_profit: number;
  payment_type: "cash" | "credit";
  client_id: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
};

type LocalSaleItemRow = {
  id: string;
  shop_id: string | null;
  sale_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  buy_price: number;
  sell_price: number;
  line_total: number;
  estimated_profit: number;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
};

type LocalStockMovementRow = {
  id: string;
  shop_id: string | null;
  product_id: string;
  type: "initial" | "purchase" | "sale" | "adjustment" | "archive";
  quantity_delta: number;
  quantity_after: number;
  note: string | null;
  sale_id: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
};

type LocalDebtRow = {
  id: string;
  shop_id: string | null;
  client_id: string;
  amount: number;
  paid_amount: number;
  status: "open" | "paid";
  description: string | null;
  sale_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type LocalDebtPaymentRow = {
  id: string;
  shop_id: string | null;
  debt_id: string;
  amount: number;
  note: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
};

type RemoteShopProfileRow = Omit<LocalShopProfileRow, "deleted_at"> & {
  owner_id: string;
  deleted_at: string | null;
};

type RemoteShopRow = Omit<LocalShopRow, "deleted_at"> & {
  owner_id: string;
  deleted_at: string | null;
};

type RemoteClientRow = Omit<LocalClientRow, "deleted_at"> & {
  owner_id: string;
  deleted_at: string | null;
};

type RemoteProductRow = Omit<LocalProductRow, "is_archived" | "deleted_at" | "image_uri" | "image_path"> & {
  owner_id: string;
  image_uri?: null;
  image_path?: null;
  image_url?: null;
  is_archived: boolean;
  deleted_at: string | null;
};

type RemoteSaleRow = Omit<LocalSaleRow, "deleted_at"> & {
  owner_id: string;
  updated_at: string;
  deleted_at: string | null;
};

type RemoteSaleItemRow = Omit<LocalSaleItemRow, "created_at" | "updated_at" | "deleted_at"> & {
  owner_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type RemoteStockMovementRow = Omit<LocalStockMovementRow, "updated_at" | "deleted_at"> & {
  owner_id: string;
  updated_at: string;
  deleted_at: string | null;
};

type RemoteDebtRow = Omit<LocalDebtRow, "deleted_at"> & {
  owner_id: string;
  deleted_at: string | null;
};

type RemoteDebtPaymentRow = Omit<LocalDebtPaymentRow, "updated_at" | "deleted_at"> & {
  owner_id: string;
  updated_at: string;
  deleted_at: string | null;
};

type BasicSyncTable =
  | "shops"
  | "shop_profile"
  | "clients"
  | "products"
  | "sales"
  | "sale_items"
  | "stock_movements"
  | "debts"
  | "debt_payments";

const BASIC_TABLES: BasicSyncTable[] = [
  "shops",
  "shop_profile",
  "clients",
  "products",
  "sales",
  "sale_items",
  "stock_movements",
  "debts",
  "debt_payments",
];

const PULL_PAGE_SIZE = 500;

function getSupabaseErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const maybeError = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [maybeError.message, maybeError.details, maybeError.hint, maybeError.code]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0);
    if (parts.length > 0) return parts.join(" ");
  }
  return "Erreur Supabase inconnue.";
}

function getMissingRemoteColumn(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const maybeError = error as { code?: string; message?: string; details?: string };
  if (maybeError.code !== "PGRST204") return null;
  const message = `${maybeError.message ?? ""} ${maybeError.details ?? ""}`;
  const quoted = message.match(/'([^']+)' column/);
  if (quoted?.[1]) return quoted[1];
  const knownColumns = ["image_path", "image_url", "image_uri", "shop_id"];
  return knownColumns.find(column => message.includes(column)) ?? null;
}

function withoutRemoteColumn<T extends Record<string, unknown>>(rows: T[], column: string) {
  return rows.map(row => {
    const { [column]: _removed, ...rest } = row;
    return rest;
  });
}
function throwSupabaseError(error: unknown): never {
  throw new Error(getSupabaseErrorMessage(error));
}

function emptyResult(table: SyncableTable, direction: "push" | "pull"): SyncResult {
  return { table, direction, pushed: 0, pulled: 0, conflicts: 0, failed: 0 };
}

function getRemoteShopProfileId(ownerId: string) {
  return `${ownerId}:main`;
}

function withRemotePushTimestamp<T extends { updated_at?: string | null }>(rows: T[]) {
  const now = new Date().toISOString();
  return rows.map(row => ({ ...row, updated_at: now }));
}

async function getLastPulledAt(table: BasicSyncTable) {
  const db = await getDatabaseAsync();
  const row = await db.getFirstAsync<SyncCheckpoint>(
    "SELECT table_name as syncTable, last_pulled_at as lastPulledAt FROM sync_state WHERE table_name = ?",
    table,
  );
  return row?.lastPulledAt ?? null;
}

function maxUpdatedAt(rows: Array<{ updated_at?: string | null; created_at?: string | null }>) {
  return rows.reduce<string | null>((max, row) => {
    const value = row.updated_at ?? row.created_at ?? null;
    if (!value) return max;
    return !max || value > max ? value : max;
  }, null);
}

async function saveLastPulledAt(table: BasicSyncTable, rows: Array<{ updated_at?: string | null; created_at?: string | null }>) {
  const nextCheckpoint = maxUpdatedAt(rows);
  if (!nextCheckpoint) return;

  const db = await getDatabaseAsync();
  await db.runAsync(
    `INSERT INTO sync_state (table_name, last_pulled_at, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(table_name) DO UPDATE SET
       last_pulled_at = excluded.last_pulled_at,
       updated_at = excluded.updated_at`,
    table,
    nextCheckpoint,
    new Date().toISOString(),
  );
}

async function fetchRemoteChanges<T extends { updated_at?: string | null; created_at?: string | null }>(
  localTable: BasicSyncTable,
  remoteTable: string,
  ownerId: string,
) {
  const supabase = getSupabaseClient();
  const lastPulledAt = await getLastPulledAt(localTable);
  let query = supabase
    .from(remoteTable)
    .select("*")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: true })
    .limit(PULL_PAGE_SIZE);

  if (lastPulledAt) {
    query = query.gt("updated_at", lastPulledAt);
  }

  const { data, error } = await query;
  if (error) throwSupabaseError(error);
  return (data ?? []) as T[];
}

async function getOwnerId() {
  const supabase = getSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) throw new Error("Session Supabase absente. Reconnectez-vous.");

  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Utilisateur Supabase non connectÃƒÂ©.");
  if (data.user.id !== sessionData.session.user.id) {
    throw new Error("Session Supabase incoherente. Deconnectez-vous puis reconnectez-vous.");
  }
  return data.user.id;
}

function toRemoteShop(row: LocalShopRow, ownerId: string): RemoteShopRow & { sync_status: "synced" } {
  return {
    id: row.id,
    owner_id: ownerId,
    name: row.name,
    owner_name: row.owner_name,
    phone: row.phone,
    address: row.address,
    sync_status: "synced",
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  };
}

function toRemoteShopProfile(row: LocalShopProfileRow, ownerId: string): RemoteShopProfileRow & { sync_status: "synced" } {
  const remoteId = row.id === "main" ? getRemoteShopProfileId(ownerId) : row.id;
  const shopId = row.shop_id ?? remoteId;
  return {
    id: remoteId,
    owner_id: ownerId,
    shop_id: shopId,
    shop_name: row.shop_name,
    owner_name: row.owner_name,
    phone: row.phone,
    address: row.address,
    sync_status: "synced",
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  };
}

function toRemoteClient(row: LocalClientRow, ownerId: string): RemoteClientRow & { sync_status: "synced" } {
  return {
    id: row.id,
    owner_id: ownerId,
    shop_id: row.shop_id,
    name: row.name,
    phone: row.phone,
    sync_status: "synced",
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  };
}

function toRemoteProduct(row: LocalProductRow, ownerId: string): RemoteProductRow & { sync_status: "synced" } {
  return {
    id: row.id,
    owner_id: ownerId,
    shop_id: row.shop_id,
    name: row.name,
    category: row.category,
    brand: row.brand,
    format: row.format,
    buy_price: row.buy_price,
    sell_price: row.sell_price,
    stock: row.stock,
    alert_threshold: row.alert_threshold,
    barcode: row.barcode,
    estimated_average_price: row.estimated_average_price,
    is_archived: row.is_archived === 1,
    sync_status: "synced",
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  };
}

function toRemoteSale(row: LocalSaleRow, ownerId: string): RemoteSaleRow & { sync_status: "synced" } {
  return {
    id: row.id,
    owner_id: ownerId,
    shop_id: row.shop_id,
    receipt_number: row.receipt_number,
    total: row.total,
    estimated_profit: row.estimated_profit,
    payment_type: row.payment_type,
    client_id: row.client_id,
    sync_status: "synced",
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
    deleted_at: row.deleted_at,
  };
}

function toRemoteSaleItem(row: LocalSaleItemRow, ownerId: string): RemoteSaleItemRow & { sync_status: "synced" } {
  const timestamp = row.created_at ?? new Date().toISOString();
  return {
    id: row.id,
    owner_id: ownerId,
    shop_id: row.shop_id,
    sale_id: row.sale_id,
    product_id: row.product_id,
    product_name: row.product_name,
    quantity: row.quantity,
    buy_price: row.buy_price,
    sell_price: row.sell_price,
    line_total: row.line_total,
    estimated_profit: row.estimated_profit,
    sync_status: "synced",
    created_at: timestamp,
    updated_at: row.updated_at ?? timestamp,
    deleted_at: row.deleted_at,
  };
}

function toRemoteStockMovement(row: LocalStockMovementRow, ownerId: string): RemoteStockMovementRow & { sync_status: "synced" } {
  return {
    id: row.id,
    owner_id: ownerId,
    shop_id: row.shop_id,
    product_id: row.product_id,
    type: row.type,
    quantity_delta: row.quantity_delta,
    quantity_after: row.quantity_after,
    note: row.note,
    sale_id: row.sale_id,
    sync_status: "synced",
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
    deleted_at: row.deleted_at,
  };
}

function toRemoteDebt(row: LocalDebtRow, ownerId: string): RemoteDebtRow & { sync_status: "synced" } {
  return {
    id: row.id,
    owner_id: ownerId,
    shop_id: row.shop_id,
    client_id: row.client_id,
    amount: row.amount,
    paid_amount: row.paid_amount,
    status: row.status,
    description: row.description,
    sale_id: row.sale_id,
    sync_status: "synced",
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  };
}

function toRemoteDebtPayment(row: LocalDebtPaymentRow, ownerId: string): RemoteDebtPaymentRow & { sync_status: "synced" } {
  return {
    id: row.id,
    owner_id: ownerId,
    shop_id: row.shop_id,
    debt_id: row.debt_id,
    amount: row.amount,
    note: row.note,
    sync_status: "synced",
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
    deleted_at: row.deleted_at,
  };
}

async function markSynced(table: BasicSyncTable, ids: string[]) {
  if (ids.length === 0) return;
  const db = await getDatabaseAsync();
  const now = new Date().toISOString();
  for (const id of ids) {
    await db.runAsync(
      `UPDATE ${table}
       SET sync_status = 'synced', remote_id = ?, last_synced_at = ?
       WHERE id = ?`,
      id,
      now,
      id,
    );
  }
}

async function markSyncedWithRemoteIds(table: BasicSyncTable, rows: Array<{ localId: string; remoteId: string }>) {
  if (rows.length === 0) return;
  const db = await getDatabaseAsync();
  const now = new Date().toISOString();
  for (const row of rows) {
    await db.runAsync(
      `UPDATE ${table}
       SET sync_status = 'synced', remote_id = ?, last_synced_at = ?
       WHERE id = ?`,
      row.remoteId,
      now,
      row.localId,
    );
  }
}

async function getPendingRows<T>(table: BasicSyncTable) {
  const db = await getDatabaseAsync();
  const orderColumn =
    table === "sales" || table === "stock_movements" || table === "debt_payments"
      ? "created_at"
      : table === "sale_items"
        ? "sale_id"
        : "updated_at";
  return db.getAllAsync<T>(
    `SELECT *
     FROM ${table}
     WHERE sync_status IN ('pending', 'deleted') OR remote_id IS NULL
     ORDER BY ${orderColumn} ASC`,
  );
}

async function pushShops(ownerId: string): Promise<SyncResult> {
  const result = emptyResult("shops", "push");
  const rows = await getPendingRows<LocalShopRow>("shops");
  if (rows.length === 0) return result;

  const supabase = getSupabaseClient();
  const { error } = await supabase.from("shops").upsert(withRemotePushTimestamp(rows.map(row => toRemoteShop(row, ownerId))), { onConflict: "id" });
  if (error) {
    result.failed = rows.length;
    throwSupabaseError(error);
  }

  await markSynced("shops", rows.map(row => row.id));
  result.pushed = rows.length;
  return result;
}

async function pushShopProfile(ownerId: string): Promise<SyncResult> {
  const result = emptyResult("shop_profile", "push");
  const rows = await getPendingRows<LocalShopProfileRow>("shop_profile");
  if (rows.length === 0) return result;

  const supabase = getSupabaseClient();
  const { error } = await supabase.from("shop_profiles").upsert(withRemotePushTimestamp(rows.map(row => toRemoteShopProfile(row, ownerId))), { onConflict: "id" });
  if (error) {
    result.failed = rows.length;
    throwSupabaseError(error);
  }

  await markSyncedWithRemoteIds("shop_profile", rows.map(row => ({
    localId: row.id,
    remoteId: row.id === "main" ? getRemoteShopProfileId(ownerId) : row.id,
  })));
  result.pushed = rows.length;
  return result;
}

async function pushClients(ownerId: string): Promise<SyncResult> {
  const result = emptyResult("clients", "push");
  const rows = await getPendingRows<LocalClientRow>("clients");
  if (rows.length === 0) return result;

  const supabase = getSupabaseClient();
  const { error } = await supabase.from("clients").upsert(withRemotePushTimestamp(rows.map(row => toRemoteClient(row, ownerId))), { onConflict: "id" });
  if (error) {
    result.failed = rows.length;
    throwSupabaseError(error);
  }

  await markSynced("clients", rows.map(row => row.id));
  result.pushed = rows.length;
  return result;
}

async function pushProducts(ownerId: string): Promise<SyncResult> {
  const result = emptyResult("products", "push");
  const rows = await getPendingRows<LocalProductRow>("products");
  if (rows.length === 0) return result;

  const remoteRows = rows.map(row => ({
    ...toRemoteProduct(row, ownerId),
    image_uri: null,
    image_path: null,
    image_url: null,
  }));

  const supabase = getSupabaseClient();
  let rowsToPush: Array<Record<string, unknown>> = remoteRows;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { error } = await supabase
      .from("products")
      .upsert(withRemotePushTimestamp(rowsToPush), { onConflict: "id" });
    if (!error) break;

    const missingColumn = getMissingRemoteColumn(error);
    if (missingColumn) {
      rowsToPush = withoutRemoteColumn(rowsToPush, missingColumn);
      continue;
    }

    result.failed = rows.length;
    throwSupabaseError(error);
  }

  await markSynced("products", rows.map(row => row.id));
  result.pushed = rows.length;
  return result;
}

async function pushSales(ownerId: string): Promise<SyncResult> {
  const result = emptyResult("sales", "push");
  const rows = await getPendingRows<LocalSaleRow>("sales");
  if (rows.length === 0) return result;

  const supabase = getSupabaseClient();
  const { error } = await supabase.from("sales").upsert(withRemotePushTimestamp(rows.map(row => toRemoteSale(row, ownerId))), { onConflict: "id" });
  if (error) {
    result.failed = rows.length;
    throwSupabaseError(error);
  }

  await markSynced("sales", rows.map(row => row.id));
  result.pushed = rows.length;
  return result;
}

async function pushSaleItems(ownerId: string): Promise<SyncResult> {
  const result = emptyResult("sale_items", "push");
  const rows = await getPendingRows<LocalSaleItemRow>("sale_items");
  if (rows.length === 0) return result;

  const supabase = getSupabaseClient();
  const { error } = await supabase.from("sale_items").upsert(withRemotePushTimestamp(rows.map(row => toRemoteSaleItem(row, ownerId))), { onConflict: "id" });
  if (error) {
    result.failed = rows.length;
    throwSupabaseError(error);
  }

  await markSynced("sale_items", rows.map(row => row.id));
  result.pushed = rows.length;
  return result;
}

async function pushStockMovements(ownerId: string): Promise<SyncResult> {
  const result = emptyResult("stock_movements", "push");
  const rows = await getPendingRows<LocalStockMovementRow>("stock_movements");
  if (rows.length === 0) return result;

  const supabase = getSupabaseClient();
  const { error } = await supabase.from("stock_movements").upsert(withRemotePushTimestamp(rows.map(row => toRemoteStockMovement(row, ownerId))), { onConflict: "id" });
  if (error) {
    result.failed = rows.length;
    throwSupabaseError(error);
  }

  await markSynced("stock_movements", rows.map(row => row.id));
  result.pushed = rows.length;
  return result;
}

async function pushDebts(ownerId: string): Promise<SyncResult> {
  const result = emptyResult("debts", "push");
  const rows = await getPendingRows<LocalDebtRow>("debts");
  if (rows.length === 0) return result;

  const supabase = getSupabaseClient();
  const { error } = await supabase.from("debts").upsert(withRemotePushTimestamp(rows.map(row => toRemoteDebt(row, ownerId))), { onConflict: "id" });
  if (error) {
    result.failed = rows.length;
    throwSupabaseError(error);
  }

  await markSynced("debts", rows.map(row => row.id));
  result.pushed = rows.length;
  return result;
}

async function pushDebtPayments(ownerId: string): Promise<SyncResult> {
  const result = emptyResult("debt_payments", "push");
  const rows = await getPendingRows<LocalDebtPaymentRow>("debt_payments");
  if (rows.length === 0) return result;

  const supabase = getSupabaseClient();
  const { error } = await supabase.from("debt_payments").upsert(withRemotePushTimestamp(rows.map(row => toRemoteDebtPayment(row, ownerId))), { onConflict: "id" });
  if (error) {
    result.failed = rows.length;
    throwSupabaseError(error);
  }

  await markSynced("debt_payments", rows.map(row => row.id));
  result.pushed = rows.length;
  return result;
}

async function getLocalSyncStatus(table: BasicSyncTable, id: string) {
  const db = await getDatabaseAsync();
  const row = await db.getFirstAsync<{ sync_status: string | null }>(`SELECT sync_status FROM ${table} WHERE id = ?`, id);
  return row?.sync_status ?? null;
}

async function pullShops(ownerId: string): Promise<SyncResult> {
  const result = emptyResult("shops", "pull");
  const data = await fetchRemoteChanges<RemoteShopRow>("shops", "shops", ownerId);

  const db = await getDatabaseAsync();
  for (const row of data) {
    const localStatus = await getLocalSyncStatus("shops", row.id);
    if (localStatus === "pending" || localStatus === "conflict") {
      result.conflicts += 1;
      continue;
    }

    await db.runAsync(
      `INSERT INTO shops (
        id, name, owner_name, phone, address, is_active, created_at, updated_at,
        remote_id, sync_status, last_synced_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 'synced', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        owner_name = excluded.owner_name,
        phone = excluded.phone,
        address = excluded.address,
        updated_at = excluded.updated_at,
        remote_id = excluded.remote_id,
        sync_status = 'synced',
        last_synced_at = excluded.last_synced_at,
        deleted_at = excluded.deleted_at`,
      row.id,
      row.name,
      row.owner_name,
      row.phone,
      row.address,
      row.created_at,
      row.updated_at,
      row.id,
      new Date().toISOString(),
      row.deleted_at,
    );
    result.pulled += 1;
  }
  if (result.conflicts === 0) await saveLastPulledAt("shops", data);
  return result;
}

async function pullShopProfiles(ownerId: string): Promise<SyncResult> {
  const result = emptyResult("shop_profile", "pull");
  const data = await fetchRemoteChanges<RemoteShopProfileRow>("shop_profile", "shop_profiles", ownerId);

  const db = await getDatabaseAsync();
  for (const row of data) {
    const localStatus = await getLocalSyncStatus("shop_profile", row.id);
    if (localStatus === "pending" || localStatus === "conflict") {
      result.conflicts += 1;
      continue;
    }

    await db.runAsync(
      `INSERT INTO shop_profile (
        id, shop_id, shop_name, owner_name, phone, address, created_at, updated_at,
        remote_id, sync_status, last_synced_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        shop_id = excluded.shop_id,
        shop_name = excluded.shop_name,
        owner_name = excluded.owner_name,
        phone = excluded.phone,
        address = excluded.address,
        updated_at = excluded.updated_at,
        remote_id = excluded.remote_id,
        sync_status = 'synced',
        last_synced_at = excluded.last_synced_at,
        deleted_at = excluded.deleted_at`,
      row.id,
      row.shop_id,
      row.shop_name,
      row.owner_name,
      row.phone,
      row.address,
      row.created_at,
      row.updated_at,
      row.id,
      new Date().toISOString(),
      row.deleted_at,
    );
    result.pulled += 1;
  }
  if (result.conflicts === 0) await saveLastPulledAt("shop_profile", data);
  return result;
}

async function pullClients(ownerId: string): Promise<SyncResult> {
  const result = emptyResult("clients", "pull");
  const data = await fetchRemoteChanges<RemoteClientRow>("clients", "clients", ownerId);

  const db = await getDatabaseAsync();
  for (const row of data) {
    const localStatus = await getLocalSyncStatus("clients", row.id);
    if (localStatus === "pending" || localStatus === "conflict") {
      result.conflicts += 1;
      continue;
    }

    await db.runAsync(
      `INSERT INTO clients (
        id, shop_id, name, phone, created_at, updated_at,
        remote_id, sync_status, last_synced_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        shop_id = excluded.shop_id,
        name = excluded.name,
        phone = excluded.phone,
        updated_at = excluded.updated_at,
        remote_id = excluded.remote_id,
        sync_status = 'synced',
        last_synced_at = excluded.last_synced_at,
        deleted_at = excluded.deleted_at`,
      row.id,
      row.shop_id,
      row.name,
      row.phone,
      row.created_at,
      row.updated_at,
      row.id,
      new Date().toISOString(),
      row.deleted_at,
    );
    result.pulled += 1;
  }
  if (result.conflicts === 0) await saveLastPulledAt("clients", data);
  return result;
}

async function pullProducts(ownerId: string): Promise<SyncResult> {
  const result = emptyResult("products", "pull");
  const data = await fetchRemoteChanges<RemoteProductRow>("products", "products", ownerId);

  const db = await getDatabaseAsync();
  for (const row of data) {
    const localStatus = await getLocalSyncStatus("products", row.id);
    if (localStatus === "pending" || localStatus === "conflict") {
      result.conflicts += 1;
      continue;
    }

    const current = await db.getFirstAsync<{ image_uri: string | null }>(
      "SELECT image_uri FROM products WHERE id = ?",
      row.id,
    );
    const imageUri = current?.image_uri ?? null;

    await db.runAsync(
      `INSERT INTO products (
        id, shop_id, name, category, brand, format, buy_price, sell_price, stock,
        alert_threshold, barcode, image_uri, image_path, estimated_average_price,
        is_archived, created_at, updated_at, remote_id, sync_status,
        last_synced_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        shop_id = excluded.shop_id,
        name = excluded.name,
        category = excluded.category,
        brand = excluded.brand,
        format = excluded.format,
        buy_price = excluded.buy_price,
        sell_price = excluded.sell_price,
        stock = excluded.stock,
        alert_threshold = excluded.alert_threshold,
        barcode = excluded.barcode,
        image_uri = COALESCE(products.image_uri, excluded.image_uri),
        image_path = products.image_path,
        estimated_average_price = excluded.estimated_average_price,
        is_archived = excluded.is_archived,
        updated_at = excluded.updated_at,
        remote_id = excluded.remote_id,
        sync_status = 'synced',
        last_synced_at = excluded.last_synced_at,
        deleted_at = excluded.deleted_at`,
      row.id,
      row.shop_id,
      row.name,
      row.category,
      row.brand,
      row.format,
      row.buy_price,
      row.sell_price,
      row.stock,
      row.alert_threshold,
      row.barcode,
      imageUri,
      null,
      row.estimated_average_price,
      row.is_archived ? 1 : 0,
      row.created_at,
      row.updated_at,
      row.id,
      new Date().toISOString(),
      row.deleted_at,
    );
    result.pulled += 1;
  }
  if (result.conflicts === 0) await saveLastPulledAt("products", data);
  return result;
}

async function pullSales(ownerId: string): Promise<SyncResult> {
  const result = emptyResult("sales", "pull");
  const data = await fetchRemoteChanges<RemoteSaleRow>("sales", "sales", ownerId);

  const db = await getDatabaseAsync();
  for (const row of data) {
    const localStatus = await getLocalSyncStatus("sales", row.id);
    if (localStatus === "pending" || localStatus === "conflict") {
      result.conflicts += 1;
      continue;
    }

    await db.runAsync(
      `INSERT INTO sales (
        id, shop_id, receipt_number, total, estimated_profit, payment_type, client_id,
        created_at, remote_id, sync_status, last_synced_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        shop_id = excluded.shop_id,
        receipt_number = excluded.receipt_number,
        total = excluded.total,
        estimated_profit = excluded.estimated_profit,
        payment_type = excluded.payment_type,
        client_id = excluded.client_id,
        created_at = excluded.created_at,
        remote_id = excluded.remote_id,
        sync_status = 'synced',
        last_synced_at = excluded.last_synced_at,
        deleted_at = excluded.deleted_at`,
      row.id,
      row.shop_id,
      row.receipt_number,
      row.total,
      row.estimated_profit,
      row.payment_type,
      row.client_id,
      row.created_at,
      row.id,
      new Date().toISOString(),
      row.deleted_at,
    );
    result.pulled += 1;
  }
  if (result.conflicts === 0) await saveLastPulledAt("sales", data);
  return result;
}

async function pullSaleItems(ownerId: string): Promise<SyncResult> {
  const result = emptyResult("sale_items", "pull");
  const data = await fetchRemoteChanges<RemoteSaleItemRow>("sale_items", "sale_items", ownerId);

  const db = await getDatabaseAsync();
  for (const row of data) {
    const localStatus = await getLocalSyncStatus("sale_items", row.id);
    if (localStatus === "pending" || localStatus === "conflict") {
      result.conflicts += 1;
      continue;
    }

    await db.runAsync(
      `INSERT INTO sale_items (
        id, shop_id, sale_id, product_id, product_name, quantity, buy_price, sell_price,
        line_total, estimated_profit, remote_id, sync_status, last_synced_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        shop_id = excluded.shop_id,
        sale_id = excluded.sale_id,
        product_id = excluded.product_id,
        product_name = excluded.product_name,
        quantity = excluded.quantity,
        buy_price = excluded.buy_price,
        sell_price = excluded.sell_price,
        line_total = excluded.line_total,
        estimated_profit = excluded.estimated_profit,
        remote_id = excluded.remote_id,
        sync_status = 'synced',
        last_synced_at = excluded.last_synced_at,
        deleted_at = excluded.deleted_at`,
      row.id,
      row.shop_id,
      row.sale_id,
      row.product_id,
      row.product_name,
      row.quantity,
      row.buy_price,
      row.sell_price,
      row.line_total,
      row.estimated_profit,
      row.id,
      new Date().toISOString(),
      row.deleted_at,
    );
    result.pulled += 1;
  }
  if (result.conflicts === 0) await saveLastPulledAt("sale_items", data);
  return result;
}

async function pullStockMovements(ownerId: string): Promise<SyncResult> {
  const result = emptyResult("stock_movements", "pull");
  const data = await fetchRemoteChanges<RemoteStockMovementRow>("stock_movements", "stock_movements", ownerId);

  const db = await getDatabaseAsync();
  for (const row of data) {
    const localStatus = await getLocalSyncStatus("stock_movements", row.id);
    if (localStatus === "pending" || localStatus === "conflict") {
      result.conflicts += 1;
      continue;
    }

    await db.runAsync(
      `INSERT INTO stock_movements (
        id, shop_id, product_id, type, quantity_delta, quantity_after, note, sale_id,
        created_at, remote_id, sync_status, last_synced_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        shop_id = excluded.shop_id,
        product_id = excluded.product_id,
        type = excluded.type,
        quantity_delta = excluded.quantity_delta,
        quantity_after = excluded.quantity_after,
        note = excluded.note,
        sale_id = excluded.sale_id,
        created_at = excluded.created_at,
        remote_id = excluded.remote_id,
        sync_status = 'synced',
        last_synced_at = excluded.last_synced_at,
        deleted_at = excluded.deleted_at`,
      row.id,
      row.shop_id,
      row.product_id,
      row.type,
      row.quantity_delta,
      row.quantity_after,
      row.note,
      row.sale_id,
      row.created_at,
      row.id,
      new Date().toISOString(),
      row.deleted_at,
    );
    result.pulled += 1;
  }
  if (result.conflicts === 0) await saveLastPulledAt("stock_movements", data);
  return result;
}

async function pullDebts(ownerId: string): Promise<SyncResult> {
  const result = emptyResult("debts", "pull");
  const data = await fetchRemoteChanges<RemoteDebtRow>("debts", "debts", ownerId);

  const db = await getDatabaseAsync();
  for (const row of data) {
    const localStatus = await getLocalSyncStatus("debts", row.id);
    if (localStatus === "pending" || localStatus === "conflict") {
      result.conflicts += 1;
      continue;
    }

    await db.runAsync(
      `INSERT INTO debts (
        id, shop_id, client_id, amount, paid_amount, status, description, sale_id,
        created_at, updated_at, remote_id, sync_status, last_synced_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        shop_id = excluded.shop_id,
        client_id = excluded.client_id,
        amount = excluded.amount,
        paid_amount = excluded.paid_amount,
        status = excluded.status,
        description = excluded.description,
        sale_id = excluded.sale_id,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        remote_id = excluded.remote_id,
        sync_status = 'synced',
        last_synced_at = excluded.last_synced_at,
        deleted_at = excluded.deleted_at`,
      row.id,
      row.shop_id,
      row.client_id,
      row.amount,
      row.paid_amount,
      row.status,
      row.description,
      row.sale_id,
      row.created_at,
      row.updated_at,
      row.id,
      new Date().toISOString(),
      row.deleted_at,
    );
    result.pulled += 1;
  }
  if (result.conflicts === 0) await saveLastPulledAt("debts", data);
  return result;
}

async function pullDebtPayments(ownerId: string): Promise<SyncResult> {
  const result = emptyResult("debt_payments", "pull");
  const data = await fetchRemoteChanges<RemoteDebtPaymentRow>("debt_payments", "debt_payments", ownerId);

  const db = await getDatabaseAsync();
  for (const row of data) {
    const localStatus = await getLocalSyncStatus("debt_payments", row.id);
    if (localStatus === "pending" || localStatus === "conflict") {
      result.conflicts += 1;
      continue;
    }

    await db.runAsync(
      `INSERT INTO debt_payments (
        id, shop_id, debt_id, amount, note, created_at, remote_id,
        sync_status, last_synced_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        shop_id = excluded.shop_id,
        debt_id = excluded.debt_id,
        amount = excluded.amount,
        note = excluded.note,
        created_at = excluded.created_at,
        remote_id = excluded.remote_id,
        sync_status = 'synced',
        last_synced_at = excluded.last_synced_at,
        deleted_at = excluded.deleted_at`,
      row.id,
      row.shop_id,
      row.debt_id,
      row.amount,
      row.note,
      row.created_at,
      row.id,
      new Date().toISOString(),
      row.deleted_at,
    );
    result.pulled += 1;
  }
  if (result.conflicts === 0) await saveLastPulledAt("debt_payments", data);
  return result;
}

export async function pushBasicTablesAsync(): Promise<SyncResult[]> {
  const ownerId = await getOwnerId();
  return [
    await pushShops(ownerId),
    await pushShopProfile(ownerId),
    await pushClients(ownerId),
    await pushProducts(ownerId),
    await pushSales(ownerId),
    await pushSaleItems(ownerId),
    await pushStockMovements(ownerId),
    await pushDebts(ownerId),
    await pushDebtPayments(ownerId),
  ];
}

export async function pullBasicTablesAsync(): Promise<SyncResult[]> {
  const ownerId = await getOwnerId();
  return [
    await pullShops(ownerId),
    await pullShopProfiles(ownerId),
    await pullClients(ownerId),
    await pullProducts(ownerId),
    await pullSales(ownerId),
    await pullSaleItems(ownerId),
    await pullStockMovements(ownerId),
    await pullDebts(ownerId),
    await pullDebtPayments(ownerId),
  ];
}

export async function syncBasicTablesAsync(): Promise<SyncResult[]> {
  const pushResults = await pushBasicTablesAsync();
  const pullResults = await pullBasicTablesAsync();
  return [...pushResults, ...pullResults].filter(result => BASIC_TABLES.includes(result.table as BasicSyncTable));
}
