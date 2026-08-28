import { Feather } from "@expo/vector-icons";
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import type { ProductRecord } from "@/models";

type Props = {
  product: ProductRecord;
  onPress: () => void;
};

export function ProductCard({ product, onPress }: Props) {
  const colors = useColors();
  const isOut = product.stock <= 0;
  const isLow = !isOut && product.stock <= product.alertThreshold;
  const profit = product.sellPrice - product.buyPrice;
  const stockLabel = isOut ? "Rupture" : isLow ? "Stock faible" : "Disponible";
  const stockColor = isOut ? colors.destructive : isLow ? colors.warning : colors.success;
  const details = [product.category, product.brand, product.format].filter(Boolean).join(" / ") || "Sans categorie";

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${product.sellPrice.toLocaleString()} FCFA, stock ${product.stock}`}
      accessibilityHint="Ouvre la fiche du produit"
    >
      {product.imageUri ? (
        <Image source={{ uri: product.imageUri }} style={styles.image} />
      ) : (
        <View style={[styles.iconBox, { backgroundColor: colors.primary + "16" }]}> 
          <Feather name="package" size={24} color={colors.primary} />
        </View>
      )}

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{product.name}</Text>
          <View style={[styles.statusDot, { backgroundColor: stockColor }]} />
        </View>
        <Text style={[styles.category, { color: colors.mutedForeground }]} numberOfLines={1}>{details}</Text>

        <View style={styles.priceRow}>
          <View style={styles.priceBlock}>
            <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>Vente</Text>
            <Text style={[styles.price, { color: colors.text }]}>{product.sellPrice.toLocaleString()} F</Text>
          </View>
          <View style={styles.priceBlock}>
            <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>Gain</Text>
            <Text style={[styles.profit, { color: profit >= 0 ? colors.success : colors.destructive }]}> 
              {profit >= 0 ? "+" : ""}{profit.toLocaleString()} F
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.right}>
        <View style={[styles.stockBadge, { backgroundColor: stockColor + "16" }]}> 
          <Text style={[styles.stockValue, { color: stockColor }]}>{product.stock}</Text>
          <Text style={[styles.stockUnit, { color: stockColor }]}>stock</Text>
        </View>
        <View style={styles.stockStatus}>
          {isOut || isLow ? <Feather name={isOut ? "slash" : "alert-triangle"} size={12} color={stockColor} /> : null}
          <Text style={[styles.stockLabel, { color: stockColor }]} numberOfLines={1}>{stockLabel}</Text>
        </View>
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 96,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1,
    gap: 12,
  },
  iconBox: {
    width: 58,
    height: 58,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  image: { width: 58, height: 58, borderRadius: 15, backgroundColor: "#F1F5F9" },
  info: { flex: 1, gap: 5, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  name: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: "800", fontFamily: "Inter_700Bold" },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  category: { fontSize: 12, lineHeight: 16, fontFamily: "Inter_400Regular" },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 1 },
  priceBlock: { gap: 1, minWidth: 70 },
  priceLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", fontWeight: "600", textTransform: "uppercase" },
  price: { fontSize: 14, fontWeight: "800", fontFamily: "Inter_700Bold" },
  profit: { fontSize: 12, fontFamily: "Inter_700Bold", fontWeight: "800" },
  right: { alignItems: "flex-end", gap: 5, maxWidth: 76 },
  stockBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    minWidth: 50,
    alignItems: "center",
  },
  stockValue: { fontSize: 15, fontWeight: "800", fontFamily: "Inter_700Bold" },
  stockUnit: { fontSize: 9, fontFamily: "Inter_600SemiBold", fontWeight: "600", marginTop: -1 },
  stockStatus: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: 76 },
  stockLabel: { fontSize: 10, fontFamily: "Inter_700Bold", fontWeight: "700" },
});