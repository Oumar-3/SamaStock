import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useProducts } from "@/context/ProductsContext";
import { useColors } from "@/hooks/useColors";
import type { ProductRecord, StockMovement } from "@/models";

type FeatherIconName = React.ComponentProps<typeof Feather>["name"];

function money(value: number) {
  return `${Math.round(value).toLocaleString()} FCFA`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function movementDisplay(move: StockMovement, colors: ReturnType<typeof useColors>) {
  const isPositive = move.quantityDelta > 0;
  const isNegative = move.quantityDelta < 0;
  const baseColor = isPositive ? colors.success : isNegative ? colors.destructive : colors.mutedForeground;

  switch (move.type) {
    case "initial":
      return { title: "Stock initial", icon: "package" as FeatherIconName, color: colors.info };
    case "purchase":
      return { title: "Réception / achat", icon: "truck" as FeatherIconName, color: colors.success };
    case "sale":
      return { title: "Vente", icon: "shopping-cart" as FeatherIconName, color: colors.destructive };
    case "adjustment":
      return { title: "Correction inventaire", icon: "clipboard" as FeatherIconName, color: baseColor };
    case "archive":
      return { title: "Produit archivé", icon: "archive" as FeatherIconName, color: colors.mutedForeground };
    default:
      return { title: move.type, icon: "minus" as FeatherIconName, color: baseColor };
  }
}

function InfoRow({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export default function ProductDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { products, getProduct, adjustStock, archiveProduct, listMovements } = useProducts();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const cachedProduct = useMemo(() => products.find(item => item.id === id) ?? null, [id, products]);
  const [product, setProduct] = useState<ProductRecord | null>(cachedProduct);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [editStock, setEditStock] = useState(false);
  const [stockInput, setStockInput] = useState(cachedProduct ? `${cachedProduct.stock}` : "");

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!id) return;
      const [freshProduct, freshMovements] = await Promise.all([getProduct(id), listMovements(id)]);
      if (mounted) {
        setProduct(freshProduct);
        setMovements(freshMovements);
        if (freshProduct) setStockInput(`${freshProduct.stock}`);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [getProduct, id, listMovements, products]);

  if (!product) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <Text style={[styles.notFound, { color: colors.mutedForeground }]}>Produit introuvable</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.back, { color: colors.primary }]}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentProduct = product;
  const averageCost = currentProduct.estimatedAveragePrice ?? currentProduct.buyPrice;
  const unitProfit = currentProduct.sellPrice - averageCost;
  const margin = averageCost > 0 ? ((unitProfit / averageCost) * 100).toFixed(0) : null;
  const stockValue = currentProduct.stock * averageCost;
  const potentialRevenue = currentProduct.stock * currentProduct.sellPrice;
  const potentialProfit = currentProduct.stock * unitProfit;
  const isLow = currentProduct.stock <= currentProduct.alertThreshold;
  const stockStatus = currentProduct.stock === 0 ? "Rupture" : isLow ? "Stock faible" : "Stock correct";

  async function reload(productId: string) {
    const [freshProduct, freshMovements] = await Promise.all([getProduct(productId), listMovements(productId)]);
    setProduct(freshProduct);
    setMovements(freshMovements);
    if (freshProduct) setStockInput(`${freshProduct.stock}`);
  }

  async function handleStockSave() {
    const next = parseInt(stockInput, 10);
    if (!Number.isFinite(next) || next < 0) return;
    await adjustStock(currentProduct.id, next, `Ajustement manuel: ${currentProduct.stock} -> ${next}`);
    setEditStock(false);
    await reload(currentProduct.id);
  }

  function handleArchive() {
    Alert.alert("Archiver le produit", `Archiver "${currentProduct.name}" ? L'historique sera conservé.`, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Archiver",
        style: "destructive",
        onPress: async () => {
          await archiveProduct(currentProduct.id);
          router.back();
        },
      },
    ]);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: topPad + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{currentProduct.name}</Text>
        <View style={styles.topActions}>
          <TouchableOpacity
            onPress={() => router.push({ pathname: "/product/edit/[id]", params: { id: currentProduct.id } })}
            style={styles.iconBtn}
          >
            <Feather name="edit-2" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleArchive} style={styles.iconBtn}>
            <Feather name="archive" size={20} color={colors.destructive} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: bottomPad + 24 }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroCard, { backgroundColor: colors.primary }]}>
          {currentProduct.imageUri ? <Image source={{ uri: currentProduct.imageUri }} style={styles.heroImage} /> : null}
          <View style={styles.heroRow}>
            <View style={styles.heroMain}>
              <Text style={styles.heroLabel}>Prix de vente</Text>
              <Text style={styles.heroPrice}>{money(currentProduct.sellPrice)}</Text>
            </View>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>{currentProduct.category}</Text>
            </View>
          </View>
          <View style={styles.heroRow}>
            <Text style={styles.heroCost}>Coût moyen: {money(averageCost)}</Text>
            <Text style={styles.heroMargin}>Marge: {margin ? `${margin}%` : "-"}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          {[
            { label: "Stock", value: `${currentProduct.stock}`, icon: "layers" as const, color: isLow ? colors.warning : colors.primary },
            { label: "Seuil", value: `${currentProduct.alertThreshold}`, icon: "alert-triangle" as const, color: colors.warning },
            { label: "Marge/u", value: Math.round(unitProfit).toLocaleString(), icon: "trending-up" as const, color: unitProfit >= 0 ? colors.success : colors.destructive },
          ].map(item => (
            <View key={item.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name={item.icon} size={18} color={item.color} />
              <Text style={[styles.statVal, { color: colors.text }]}>{item.value}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <InfoRow label="État stock" value={stockStatus} colors={colors} />
          <InfoRow label="Marque" value={currentProduct.brand ?? "-"} colors={colors} />
          <InfoRow label="Format" value={currentProduct.format ?? "-"} colors={colors} />
          <InfoRow label="Code-barres" value={currentProduct.barcode ?? "-"} colors={colors} />
          <InfoRow label="Prix d'achat" value={money(currentProduct.buyPrice)} colors={colors} />
          <InfoRow label="Prix moyen estimé" value={money(averageCost)} colors={colors} />
          <InfoRow label="Valeur du stock" value={money(stockValue)} colors={colors} />
          <InfoRow label="Vente possible" value={money(potentialRevenue)} colors={colors} />
          <InfoRow label="Bénéfice potentiel" value={money(potentialProfit)} colors={colors} />
        </View>

        <View style={[styles.stockCard, { backgroundColor: colors.card, borderColor: isLow ? colors.warning : colors.border }]}>
          <View style={styles.stockRow}>
            <View>
              <Text style={[styles.stockLabel, { color: colors.mutedForeground }]}>Stock actuel</Text>
              <View style={styles.stockValueRow}>
                {editStock ? (
                  <TextInput
                    style={[styles.stockInput, { color: colors.text, borderColor: colors.primary }]}
                    value={stockInput}
                    onChangeText={setStockInput}
                    keyboardType="numeric"
                    autoFocus
                  />
                ) : (
                  <Text style={[styles.stockValue, { color: isLow ? colors.warning : colors.text }]}>{currentProduct.stock}</Text>
                )}
                <Text style={[styles.stockUnit, { color: colors.mutedForeground }]}>unités</Text>
              </View>
            </View>
            {editStock ? (
              <View style={styles.stockActions}>
                <TouchableOpacity style={[styles.stockBtn, { backgroundColor: colors.primary }]} onPress={handleStockSave}>
                  <Feather name="check" size={18} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.stockBtn, { backgroundColor: colors.muted }]}
                  onPress={() => {
                    setEditStock(false);
                    setStockInput(`${currentProduct.stock}`);
                  }}
                >
                  <Feather name="x" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={[styles.editBtn, { borderColor: colors.border }]} onPress={() => setEditStock(true)}>
                <Feather name="edit-2" size={16} color={colors.primary} />
                <Text style={[styles.editBtnText, { color: colors.primary }]}>Ajuster</Text>
              </TouchableOpacity>
            )}
          </View>
          {isLow && (
            <View style={[styles.alertBox, { backgroundColor: colors.warning + "15" }]}>
              <Feather name="alert-triangle" size={14} color={colors.warning} />
              <Text style={[styles.alertText, { color: colors.warning }]}>Stock faible - pensez à réapprovisionner</Text>
            </View>
          )}
        </View>

        <View style={styles.historySection}>
          <Text style={[styles.historyTitle, { color: colors.text }]}>Mouvements de stock</Text>
          {movements.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucun mouvement enregistré</Text>
            </View>
          ) : (
            movements.slice(0, 16).map(move => {
              const display = movementDisplay(move, colors);
              return (
                <View key={move.id} style={[styles.movementRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[styles.movementIcon, { backgroundColor: display.color + "18" }]}>
                    <Feather name={display.icon} size={14} color={display.color} />
                  </View>
                  <View style={styles.movementInfo}>
                    <Text style={[styles.movementTitle, { color: colors.text }]}>{display.title}</Text>
                    <Text style={[styles.movementNote, { color: colors.mutedForeground }]} numberOfLines={2}>
                      {move.note ?? "Mouvement enregistré"}
                    </Text>
                    <Text style={[styles.movementDate, { color: colors.mutedForeground }]}>
                      {formatDateTime(move.createdAt)} • Stock après: {move.quantityAfter}
                    </Text>
                  </View>
                  <Text style={[styles.movementQty, { color: display.color }]}>
                    {move.quantityDelta > 0 ? "+" : ""}{move.quantityDelta}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, gap: 12 },
  topActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", fontWeight: "700" },
  body: { padding: 16, gap: 16 },
  heroCard: { borderRadius: 20, padding: 20, gap: 10 },
  heroImage: { width: "100%", height: 150, borderRadius: 14, marginBottom: 6 },
  heroRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  heroMain: { flex: 1 },
  heroLabel: { fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "Inter_400Regular" },
  heroPrice: { fontSize: 28, color: "#fff", fontFamily: "Inter_700Bold", fontWeight: "700" },
  heroBadge: { backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  heroBadgeText: { fontSize: 13, color: "#fff", fontFamily: "Inter_500Medium", fontWeight: "500" },
  heroCost: { fontSize: 13, color: "rgba(255,255,255,0.75)", fontFamily: "Inter_400Regular" },
  heroMargin: { fontSize: 13, color: "rgba(255,255,255,0.75)", fontFamily: "Inter_500Medium", fontWeight: "500" },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, borderRadius: 14, padding: 14, borderWidth: 1, alignItems: "center", gap: 4 },
  statVal: { fontSize: 18, fontFamily: "Inter_700Bold", fontWeight: "700" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  infoCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderBottomWidth: 1, gap: 10 },
  infoLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  infoValue: { flex: 1, textAlign: "right", fontSize: 13, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  stockCard: { borderRadius: 16, padding: 16, borderWidth: 1.5, gap: 12 },
  stockRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stockLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 4 },
  stockValueRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  stockValue: { fontSize: 36, fontFamily: "Inter_700Bold", fontWeight: "700" },
  stockInput: { fontSize: 36, fontFamily: "Inter_700Bold", fontWeight: "700", borderBottomWidth: 2, minWidth: 60, textAlign: "center" },
  stockUnit: { fontSize: 14, fontFamily: "Inter_400Regular" },
  stockActions: { flexDirection: "row", gap: 8 },
  stockBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderWidth: 1 },
  editBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  alertBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 8 },
  alertText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  historySection: { gap: 12 },
  historyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", fontWeight: "700" },
  emptyCard: { borderRadius: 14, borderWidth: 1, padding: 20, alignItems: "center" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  movementRow: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 12, borderWidth: 1, gap: 12, marginBottom: 8 },
  movementIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  movementInfo: { flex: 1, gap: 2 },
  movementTitle: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700" },
  movementNote: { fontSize: 12, fontFamily: "Inter_400Regular" },
  movementDate: { fontSize: 12, fontFamily: "Inter_400Regular" },
  movementQty: { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "700" },
  notFound: { fontSize: 16, fontFamily: "Inter_400Regular", marginBottom: 12 },
  back: { fontSize: 15, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
});
