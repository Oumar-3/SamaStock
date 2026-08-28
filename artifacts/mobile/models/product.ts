export type ProductRecord = {
  id: string;
  name: string;
  category: string;
  brand: string | null;
  format: string | null;
  buyPrice: number;
  sellPrice: number;
  stock: number;
  alertThreshold: number;
  barcode: string | null;
  imageUri: string | null;
  imagePath: string | null;
  estimatedAveragePrice: number | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StockMovementType = "initial" | "purchase" | "sale" | "adjustment" | "archive";

export type StockMovement = {
  id: string;
  productId: string;
  type: StockMovementType;
  quantityDelta: number;
  quantityAfter: number;
  note: string | null;
  saleId: string | null;
  createdAt: string;
};

export type LowStockSuggestion = {
  product: ProductRecord;
  soldLast30Days: number;
  averageDailySales: number;
  suggestedReorderQuantity: number;
  urgency: "out" | "low" | "watch";
};
