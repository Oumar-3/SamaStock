import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  adjustProductStockAsync,
  archiveProductAsync,
  clearAllProductImagesAsync,
  clearProductImageUrisAsync,
  createProductAsync,
  findProductByBarcodeAsync,
  getProductByIdAsync,
  listLowStockSuggestionsAsync,
  listProductsAsync,
  listStockMovementsForProductAsync,
  receiveProductStockAsync,
  updateProductAsync,
  type ProductInput,
  type ProductUpdateInput,
} from "@/database";
import type { LowStockSuggestion, ProductRecord, StockMovement } from "@/models";
import { useDatabase } from "@/context/DatabaseContext";
import { scheduleCloudBackup } from "@/services/sync/autoBackup";

type ProductsContextType = {
  products: ProductRecord[];
  lowStockSuggestions: LowStockSuggestion[];
  isLoading: boolean;
  refreshProducts: () => Promise<void>;
  getProduct: (id: string) => Promise<ProductRecord | null>;
  findByBarcode: (barcode: string) => Promise<ProductRecord | null>;
  createProduct: (input: ProductInput) => Promise<ProductRecord>;
  updateProduct: (id: string, input: ProductUpdateInput) => Promise<ProductRecord>;
  adjustStock: (id: string, nextStock: number, note?: string) => Promise<ProductRecord>;
  receiveStock: (id: string, quantity: number, unitCost?: number) => Promise<ProductRecord>;
  archiveProduct: (id: string) => Promise<void>;
  clearAllImages: () => Promise<void>;
  clearImageUris: (uris: string[]) => Promise<void>;
  listMovements: (productId: string) => Promise<StockMovement[]>;
};

const ProductsContext = createContext<ProductsContextType | null>(null);

export function ProductsProvider({ children }: { children: React.ReactNode }) {
  const { isReady } = useDatabase();
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [lowStockSuggestions, setLowStockSuggestions] = useState<LowStockSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshProducts = useCallback(async () => {
    if (!isReady) return;
    setIsLoading(true);
    try {
      const [nextProducts, nextSuggestions] = await Promise.all([
        listProductsAsync(),
        listLowStockSuggestionsAsync(),
      ]);
      setProducts(nextProducts);
      setLowStockSuggestions(nextSuggestions);
    } finally {
      setIsLoading(false);
    }
  }, [isReady]);

  useEffect(() => {
    if (isReady) {
      refreshProducts();
    }
  }, [isReady, refreshProducts]);

  const createProduct = useCallback(async (input: ProductInput) => {
    const product = await createProductAsync(input);
    await refreshProducts();
    scheduleCloudBackup();
    return product;
  }, [refreshProducts]);

  const updateProduct = useCallback(async (id: string, input: ProductUpdateInput) => {
    const product = await updateProductAsync(id, input);
    await refreshProducts();
    scheduleCloudBackup();
    return product;
  }, [refreshProducts]);

  const adjustStock = useCallback(async (id: string, nextStock: number, note?: string) => {
    const product = await adjustProductStockAsync(id, nextStock, note);
    await refreshProducts();
    scheduleCloudBackup();
    return product;
  }, [refreshProducts]);

  const receiveStock = useCallback(async (id: string, quantity: number, unitCost?: number) => {
    const product = await receiveProductStockAsync(id, quantity, unitCost);
    await refreshProducts();
    scheduleCloudBackup();
    return product;
  }, [refreshProducts]);

  const archiveProduct = useCallback(async (id: string) => {
    await archiveProductAsync(id);
    await refreshProducts();
    scheduleCloudBackup();
  }, [refreshProducts]);

  const clearAllImages = useCallback(async () => {
    await clearAllProductImagesAsync();
    await refreshProducts();
  }, [refreshProducts]);

  const clearImageUris = useCallback(async (uris: string[]) => {
    await clearProductImageUrisAsync(uris);
    await refreshProducts();
  }, [refreshProducts]);

  const value = useMemo(
    () => ({
      products,
      lowStockSuggestions,
      isLoading: !isReady || isLoading,
      refreshProducts,
      getProduct: getProductByIdAsync,
      findByBarcode: findProductByBarcodeAsync,
      createProduct,
      updateProduct,
      adjustStock,
      receiveStock,
      archiveProduct,
      clearAllImages,
      clearImageUris,
      listMovements: listStockMovementsForProductAsync,
    }),
    [adjustStock, archiveProduct, clearAllImages, clearImageUris, createProduct, isLoading, isReady, lowStockSuggestions, products, receiveStock, refreshProducts, updateProduct],
  );

  return <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>;
}

export function useProducts() {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error("useProducts must be used within ProductsProvider");
  return ctx;
}
