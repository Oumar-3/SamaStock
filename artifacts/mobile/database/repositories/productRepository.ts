import { getDatabaseAsync } from "@/database/client";
import type { LowStockSuggestion, ProductRecord, StockMovement, StockMovementType } from "@/models";
import { getBarcodeCandidates } from "@/utils/barcode";
import { createId } from "@/utils/id";
import { requireActiveShopIdAsync } from "./shopRepository";

export type ProductInput = {
  name: string;
  category: string;
  brand?: string;
  format?: string;
  buyPrice: number;
  sellPrice: number;
  stock: number;
  alertThreshold: number;
  barcode?: string;
  imageUri?: string;
  estimatedAveragePrice?: number;
};

export type ProductUpdateInput = Partial<Omit<ProductInput, "stock">>;

type ProductRow = {
  id: string;
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
};

type LowStockSuggestionRow = ProductRow & {
  sold_last_30_days: number | null;
};

type StockMovementRow = {
  id: string;
  product_id: string;
  type: StockMovementType;
  quantity_delta: number;
  quantity_after: number;
  note: string | null;
  sale_id: string | null;
  created_at: string;
};

function nullableText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function positiveOrZero(value: number | undefined, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, value ?? fallback) : fallback;
}

function integerOrZero(value: number | undefined, fallback = 0) {
  return Math.trunc(positiveOrZero(value, fallback));
}

function mapProduct(row: ProductRow): ProductRecord {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    brand: row.brand,
    format: row.format,
    buyPrice: row.buy_price,
    sellPrice: row.sell_price,
    stock: row.stock,
    alertThreshold: row.alert_threshold,
    barcode: row.barcode,
    imageUri: row.image_uri,
    imagePath: row.image_path,
    estimatedAveragePrice: row.estimated_average_price,
    isArchived: row.is_archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMovement(row: StockMovementRow): StockMovement {
  return {
    id: row.id,
    productId: row.product_id,
    type: row.type,
    quantityDelta: row.quantity_delta,
    quantityAfter: row.quantity_after,
    note: row.note,
    saleId: row.sale_id,
    createdAt: row.created_at,
  };
}

export async function listProductsAsync(options?: { includeArchived?: boolean }) {
  const db = await getDatabaseAsync();
  const shopId = await requireActiveShopIdAsync();
  const rows = await db.getAllAsync<ProductRow>(
    `SELECT *
     FROM products
     WHERE shop_id = ?
       AND (? = 1 OR is_archived = 0)
     ORDER BY name COLLATE NOCASE ASC`,
    shopId,
    options?.includeArchived ? 1 : 0,
  );
  return rows.map(mapProduct);
}

export async function listLowStockSuggestionsAsync(): Promise<LowStockSuggestion[]> {
  const db = await getDatabaseAsync();
  const shopId = await requireActiveShopIdAsync();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await db.getAllAsync<LowStockSuggestionRow>(
    `SELECT
       p.*,
       COALESCE(SUM(CASE WHEN s.created_at >= ? THEN si.quantity ELSE 0 END), 0) AS sold_last_30_days
     FROM products p
     LEFT JOIN sale_items si ON si.product_id = p.id
     LEFT JOIN sales s ON s.id = si.sale_id
     WHERE p.is_archived = 0
       AND p.shop_id = ?
       AND p.stock <= p.alert_threshold
     GROUP BY p.id
     ORDER BY p.stock ASC, p.name COLLATE NOCASE ASC`,
    since,
    shopId,
  );

  return rows.map(row => {
    const product = mapProduct(row);
    const soldLast30Days = row.sold_last_30_days ?? 0;
    const averageDailySales = soldLast30Days / 30;
    const targetForTwoWeeks = Math.ceil(averageDailySales * 14);
    const minimumTarget = Math.max(product.alertThreshold * 2, product.alertThreshold + 1);
    const targetStock = Math.max(targetForTwoWeeks, minimumTarget);
    const suggestedReorderQuantity = Math.max(1, targetStock - product.stock);

    return {
      product,
      soldLast30Days,
      averageDailySales,
      suggestedReorderQuantity,
      urgency: product.stock === 0 ? "out" : product.stock <= Math.max(1, Math.floor(product.alertThreshold / 2)) ? "low" : "watch",
    };
  });
}

export async function getProductByIdAsync(id: string) {
  const db = await getDatabaseAsync();
  const shopId = await requireActiveShopIdAsync();
  const row = await db.getFirstAsync<ProductRow>("SELECT * FROM products WHERE id = ? AND shop_id = ?", id, shopId);
  return row ? mapProduct(row) : null;
}

export async function findProductByBarcodeAsync(barcode: string) {
  const db = await getDatabaseAsync();
  const shopId = await requireActiveShopIdAsync();
  const candidates = getBarcodeCandidates(barcode);
  if (candidates.length === 0) return null;
  const placeholders = candidates.map(() => "?").join(", ");
  const row = await db.getFirstAsync<ProductRow>(
    `SELECT * FROM products WHERE barcode IN (${placeholders}) AND shop_id = ? AND is_archived = 0`,
    ...candidates,
    shopId,
  );
  return row ? mapProduct(row) : null;
}

async function findProductByBarcodeOwnerAsync(barcode: string) {
  const db = await getDatabaseAsync();
  const shopId = await requireActiveShopIdAsync();
  const candidates = getBarcodeCandidates(barcode);
  if (candidates.length === 0) return null;
  const placeholders = candidates.map(() => "?").join(", ");
  const row = await db.getFirstAsync<ProductRow>(
    `SELECT * FROM products WHERE barcode IN (${placeholders}) AND shop_id = ? AND is_archived = 0`,
    ...candidates,
    shopId,
  );
  return row ? mapProduct(row) : null;
}

export async function createProductAsync(input: ProductInput) {
  const db = await getDatabaseAsync();
  const shopId = await requireActiveShopIdAsync();
  const now = new Date().toISOString();
  const id = createId("prod");
  const name = input.name.trim();
  const category = input.category.trim();
  const buyPrice = positiveOrZero(input.buyPrice);
  const sellPrice = positiveOrZero(input.sellPrice);
  const stock = integerOrZero(input.stock);
  const alertThreshold = integerOrZero(input.alertThreshold);
  const estimatedAveragePrice = positiveOrZero(input.estimatedAveragePrice, buyPrice);
  const barcode = nullableText(input.barcode);

  if (!name) throw new Error("Nom du produit requis");
  if (!category) throw new Error("Categorie requise");
  if (sellPrice <= 0) throw new Error("Prix de vente invalide");

  if (barcode) {
    const existingBarcode = await findProductByBarcodeOwnerAsync(barcode);
    if (existingBarcode) {
      throw new Error("Ce code-barres est deja utilise par un autre produit.");
    }
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO products (
        id, shop_id, name, category, brand, format, buy_price, sell_price, stock,
        alert_threshold, barcode, image_uri, estimated_average_price,
        is_archived, created_at, updated_at, sync_status, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'pending', NULL)`,
      id,
      shopId,
      name,
      category,
      nullableText(input.brand),
      nullableText(input.format),
      buyPrice,
      sellPrice,
      stock,
      alertThreshold,
      barcode,
      nullableText(input.imageUri),
      estimatedAveragePrice,
      now,
      now,
    );

    if (stock > 0) {
      await db.runAsync(
        `INSERT INTO stock_movements (
          id, shop_id, product_id, type, quantity_delta, quantity_after, note, sale_id,
          created_at, sync_status, last_synced_at
        ) VALUES (?, ?, ?, 'initial', ?, ?, ?, NULL, ?, 'pending', NULL)`,
        createId("move"),
        shopId,
        id,
        stock,
        stock,
        "Stock initial",
        now,
      );
    }
  });

  const product = await getProductByIdAsync(id);
  if (!product) throw new Error("Product was not created");
  return product;
}

export async function updateProductAsync(id: string, input: ProductUpdateInput) {
  const db = await getDatabaseAsync();
  const shopId = await requireActiveShopIdAsync();
  const existing = await getProductByIdAsync(id);
  if (!existing) throw new Error("Produit introuvable");

  const next = {
    name: input.name?.trim() || existing.name,
    category: input.category?.trim() || existing.category,
    brand: input.brand !== undefined ? nullableText(input.brand) : existing.brand,
    format: input.format !== undefined ? nullableText(input.format) : existing.format,
    buyPrice: input.buyPrice !== undefined ? positiveOrZero(input.buyPrice) : existing.buyPrice,
    sellPrice: input.sellPrice !== undefined ? positiveOrZero(input.sellPrice) : existing.sellPrice,
    alertThreshold: input.alertThreshold !== undefined ? integerOrZero(input.alertThreshold) : existing.alertThreshold,
    barcode: input.barcode !== undefined ? nullableText(input.barcode) : existing.barcode,
    imageUri: input.imageUri !== undefined ? nullableText(input.imageUri) : existing.imageUri,
    imagePath: input.imageUri !== undefined && nullableText(input.imageUri)
      ? null
      : existing.imagePath,
    estimatedAveragePrice: input.estimatedAveragePrice !== undefined
      ? positiveOrZero(input.estimatedAveragePrice)
      : existing.estimatedAveragePrice,
  };

  if (!next.name) throw new Error("Nom du produit requis");
  if (!next.category) throw new Error("Categorie requise");
  if (next.sellPrice <= 0) throw new Error("Prix de vente invalide");

  if (next.barcode) {
    const barcodeOwner = await findProductByBarcodeOwnerAsync(next.barcode);
    if (barcodeOwner && barcodeOwner.id !== id) {
      throw new Error("Ce code-barres est deja utilise par un autre produit.");
    }
  }

  await db.runAsync(
    `UPDATE products SET
      name = ?, category = ?, brand = ?, format = ?, buy_price = ?, sell_price = ?,
      alert_threshold = ?, barcode = ?, image_uri = ?, image_path = ?, estimated_average_price = ?,
      updated_at = ?, sync_status = 'pending', last_synced_at = NULL
     WHERE id = ? AND shop_id = ?`,
    next.name,
    next.category,
    next.brand,
    next.format,
    next.buyPrice,
    next.sellPrice,
    next.alertThreshold,
    next.barcode,
    next.imageUri,
    next.imagePath,
    next.estimatedAveragePrice,
    new Date().toISOString(),
    id,
    shopId,
  );

  const product = await getProductByIdAsync(id);
  if (!product) throw new Error("Produit introuvable");
  return product;
}

export async function adjustProductStockAsync(id: string, nextStock: number, note?: string) {
  const db = await getDatabaseAsync();
  const shopId = await requireActiveShopIdAsync();
  const product = await getProductByIdAsync(id);
  if (!product) throw new Error("Produit introuvable");

  const safeStock = Math.max(0, Math.trunc(nextStock));
  const delta = safeStock - product.stock;
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE products SET stock = ?, updated_at = ?, sync_status = 'pending', last_synced_at = NULL WHERE id = ? AND shop_id = ?",
      safeStock,
      now,
      id,
      shopId,
    );
    if (delta !== 0) {
      await db.runAsync(
        `INSERT INTO stock_movements (
          id, shop_id, product_id, type, quantity_delta, quantity_after, note, sale_id,
          created_at, sync_status, last_synced_at
        ) VALUES (?, ?, ?, 'adjustment', ?, ?, ?, NULL, ?, 'pending', NULL)`,
        createId("move"),
        shopId,
        id,
        delta,
        safeStock,
        note?.trim() || "Ajustement stock",
        now,
      );
    }
  });

  const updated = await getProductByIdAsync(id);
  if (!updated) throw new Error("Produit introuvable");
  return updated;
}

export async function receiveProductStockAsync(id: string, quantity: number, unitCost?: number) {
  const db = await getDatabaseAsync();
  const shopId = await requireActiveShopIdAsync();
  const product = await getProductByIdAsync(id);
  if (!product) throw new Error("Produit introuvable");

  const receivedQuantity = Math.max(0, Math.trunc(quantity));
  if (receivedQuantity <= 0) throw new Error("QuantitÃ© invalide");

  const now = new Date().toISOString();
  const nextStock = product.stock + receivedQuantity;
  const cleanUnitCost = unitCost && unitCost > 0 ? unitCost : null;
  const currentAverage = product.estimatedAveragePrice ?? product.buyPrice;
  const nextAverage = cleanUnitCost
    ? ((currentAverage * product.stock) + (cleanUnitCost * receivedQuantity)) / Math.max(1, nextStock)
    : currentAverage;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE products
       SET stock = ?, buy_price = ?, estimated_average_price = ?, updated_at = ?
         , sync_status = 'pending', last_synced_at = NULL
       WHERE id = ? AND shop_id = ?`,
      nextStock,
      cleanUnitCost ?? product.buyPrice,
      nextAverage,
      now,
      id,
      shopId,
    );

    await db.runAsync(
      `INSERT INTO stock_movements (
        id, shop_id, product_id, type, quantity_delta, quantity_after, note, sale_id,
        created_at, sync_status, last_synced_at
      ) VALUES (?, ?, ?, 'purchase', ?, ?, ?, NULL, ?, 'pending', NULL)`,
      createId("move"),
      shopId,
      id,
      receivedQuantity,
      nextStock,
      cleanUnitCost
        ? `RÃ©ception stock: ${receivedQuantity} Ã  ${cleanUnitCost.toLocaleString()} FCFA`
        : `RÃ©ception stock: ${receivedQuantity}`,
      now,
    );
  });

  const updated = await getProductByIdAsync(id);
  if (!updated) throw new Error("Produit introuvable");
  return updated;
}

export async function archiveProductAsync(id: string) {
  const db = await getDatabaseAsync();
  const shopId = await requireActiveShopIdAsync();
  const product = await getProductByIdAsync(id);
  if (!product) throw new Error("Produit introuvable");
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE products SET is_archived = 1, updated_at = ?, sync_status = 'pending', last_synced_at = NULL WHERE id = ? AND shop_id = ?",
      now,
      id,
      shopId,
    );
    await db.runAsync(
      `INSERT INTO stock_movements (
        id, shop_id, product_id, type, quantity_delta, quantity_after, note, sale_id,
        created_at, sync_status, last_synced_at
      ) VALUES (?, ?, ?, 'archive', 0, ?, ?, NULL, ?, 'pending', NULL)`,
      createId("move"),
      shopId,
      id,
      product.stock,
      "Produit archivÃ©",
      now,
    );
  });
}

export async function listStockMovementsForProductAsync(productId: string) {
  const db = await getDatabaseAsync();
  const shopId = await requireActiveShopIdAsync();
  const rows = await db.getAllAsync<StockMovementRow>(
    `SELECT *
     FROM stock_movements
     WHERE product_id = ?
       AND shop_id = ?
     ORDER BY created_at DESC`,
    productId,
    shopId,
  );
  return rows.map(mapMovement);
}

export async function clearProductImageUrisAsync(uris: string[]) {
  const uniqueUris = Array.from(new Set(uris.filter(Boolean)));
  if (uniqueUris.length === 0) return;

  const db = await getDatabaseAsync();
  const shopId = await requireActiveShopIdAsync();
  for (const uri of uniqueUris) {
    await db.runAsync(
      "UPDATE products SET image_uri = NULL, image_path = NULL WHERE shop_id = ? AND image_uri = ?",
      shopId,
      uri,
    );
  }
}

export async function clearAllProductImagesAsync() {
  const db = await getDatabaseAsync();
  const shopId = await requireActiveShopIdAsync();
  await db.runAsync(
    "UPDATE products SET image_uri = NULL, image_path = NULL WHERE shop_id = ?",
    shopId,
  );
}
