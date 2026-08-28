import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { FlatList, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { ProductCard } from "@/components/ProductCard";
import { SkeletonCard } from "@/components/SkeletonCard";
import { useProducts } from "@/context/ProductsContext";
import { useColors } from "@/hooks/useColors";

const FILTERS = ["Tous", "Stock faible", "Boisson", "Alimentaire", "Menager"] as const;

export default function ProductsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { products, isLoading } = useProducts();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Tous");

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;


  const filtered = useMemo(() => {
    return products.filter(product => {
      const q = search.trim().toLowerCase();
      const category = product.category?.normalize("NFD").replace(/[\u0300-\u036f]/g, "") ?? "";
      const haystack = [product.name, product.category, category, product.brand, product.format, product.barcode]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchSearch = !q || haystack.includes(q);
      const matchFilter =
        filter === "Tous" ||
        (filter === "Stock faible"
          ? product.stock <= product.alertThreshold
          : category.toLowerCase() === filter.toLowerCase());
      return matchSearch && matchFilter;
    });
  }, [filter, products, search]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}> 
      <View style={[styles.header, { paddingTop: topPad + 14, backgroundColor: colors.background, borderBottomColor: colors.border }]}> 
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={[styles.kicker, { color: colors.primary }]}>Catalogue</Text>
            <Text style={[styles.title, { color: colors.text }]}>Produits</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}> 
              {products.length} produit{products.length > 1 ? "s" : ""} actif{products.length > 1 ? "s" : ""}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
            onPress={() => router.push("/product/add")}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Ajouter un produit"
          >
            <Feather name="plus" size={18} color="#fff" />
            <Text style={styles.addBtnText}>Nouveau</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Feather name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Nom, marque, format ou code-barres"
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            returnKeyType="search"
          />
          {search ? (
            <TouchableOpacity
              style={styles.clearSearchBtn}
              onPress={() => setSearch("")}
              accessibilityRole="button"
              accessibilityLabel="Effacer la recherche"
            >
              <Feather name="x" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.utilityRow}>
          <TouchableOpacity
            style={[styles.utilityBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push("/product/scan")}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Scanner un produit pour ajouter du stock"
          >
            <View style={[styles.utilityIcon, { backgroundColor: colors.primary + "12" }]}> 
              <Feather name="camera" size={18} color={colors.primary} />
            </View>
            <View style={styles.utilityCopy}>
              <Text style={[styles.utilityText, { color: colors.text }]}>Scanner</Text>
              <Text style={[styles.utilityHint, { color: colors.mutedForeground }]}>code-barres</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.utilityBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push("/inventory")}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Ouvrir l'inventaire rapide"
          >
            <View style={[styles.utilityIcon, { backgroundColor: colors.info + "12" }]}> 
              <Feather name="clipboard" size={18} color={colors.info} />
            </View>
            <View style={styles.utilityCopy}>
              <Text style={[styles.utilityText, { color: colors.text }]}>Inventaire</Text>
              <Text style={[styles.utilityHint, { color: colors.mutedForeground }]}>comptage</Text>
            </View>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catContent}>
          {FILTERS.map(item => (
            <TouchableOpacity
              key={item}
              style={[
                styles.catBtn,
                { borderColor: filter === item ? colors.primary : colors.border, backgroundColor: filter === item ? colors.primary : colors.card },
              ]}
              onPress={() => setFilter(item)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === item }}
              accessibilityLabel={"Filtrer par " + item}
            >
              <Text style={[styles.catBtnText, { color: filter === item ? "#fff" : colors.mutedForeground }]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        style={styles.list}
        data={isLoading ? [] : filtered}
        keyExtractor={product => product.id}
        renderItem={({ item: product }) => (
          <ProductCard
            product={product}
            onPress={() => router.push({ pathname: "/product/[id]", params: { id: product.id } })}
          />
        )}
        ListHeaderComponent={
          !isLoading && filtered.length > 0 ? (
            <View style={styles.resultRow}>
              <Text style={[styles.resultText, { color: colors.text }]}> 
                {filtered.length} resultat{filtered.length > 1 ? "s" : ""}
              </Text>
              {search || filter !== "Tous" ? (
                <TouchableOpacity
                  onPress={() => {
                    setSearch("");
                    setFilter("Tous");
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Reinitialiser les filtres"
                >
                  <Text style={[styles.resetText, { color: colors.primary }]}>Reinitialiser</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <SkeletonCard count={6} />
          ) : (
            <EmptyState
              icon={search || filter !== "Tous" ? "search" : "package"}
              title={search || filter !== "Tous" ? "Aucun resultat" : "Aucun produit"}
              subtitle={
                search || filter !== "Tous"
                  ? "Modifiez la recherche ou choisissez Tous"
                  : "Ajoutez votre premier produit pour commencer a vendre"
              }
              actionLabel={search || filter !== "Tous" ? "Reinitialiser" : "Ajouter un produit"}
              onAction={
                search || filter !== "Tous"
                  ? () => {
                      setSearch("");
                      setFilter("Tous");
                    }
                  : () => router.push("/product/add")
              }
            />
          )
        }
        contentContainerStyle={[
          styles.listContent,
          !isLoading && filtered.length === 0 ? styles.emptyListContent : null,
          { paddingBottom: bottomPad + 90 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerCopy: { flex: 1, gap: 1 },
  kicker: { fontSize: 12, fontFamily: "Inter_700Bold", fontWeight: "800", textTransform: "uppercase" },
  title: { fontSize: 29, lineHeight: 34, fontFamily: "Inter_700Bold", fontWeight: "800" },
  subtitle: { fontSize: 12, lineHeight: 17, fontFamily: "Inter_400Regular" },
  addBtn: {
    minWidth: 104,
    height: 48,
    borderRadius: 15,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  addBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold", fontWeight: "800" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 7,
    gap: 10,
  },
  searchInput: { flex: 1, minHeight: 44, fontSize: 15, fontFamily: "Inter_400Regular" },
  clearSearchBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -10 },
  utilityRow: { flexDirection: "row", gap: 10 },
  utilityBtn: {
    flex: 1,
    minHeight: 56,
    borderRadius: 15,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  utilityIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  utilityCopy: { flex: 1, minWidth: 0 },
  utilityText: { fontSize: 13, fontFamily: "Inter_700Bold", fontWeight: "800" },
  utilityHint: { fontSize: 11, fontFamily: "Inter_400Regular" },
  catScroll: { flexGrow: 0 },
  catContent: { paddingRight: 2 },
  catBtn: {
    minHeight: 38,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 8,
    justifyContent: "center",
  },
  catBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", fontWeight: "700" },
  list: { flex: 1 },
  listContent: { padding: 16, paddingTop: 12 },
  emptyListContent: { flexGrow: 1 },
  resultRow: { marginBottom: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  resultText: { fontSize: 13, fontFamily: "Inter_700Bold", fontWeight: "800" },
  resetText: { fontSize: 12, fontFamily: "Inter_700Bold", fontWeight: "800" },
});
