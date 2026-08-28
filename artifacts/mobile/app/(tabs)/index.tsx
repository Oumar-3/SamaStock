import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDebts } from "@/context/DebtsContext";
import { useProducts } from "@/context/ProductsContext";
import { useSales } from "@/context/SalesContext";
import { useShopProfile } from "@/context/ShopProfileContext";
import { useColors } from "@/hooks/useColors";
import type { SaleRecord } from "@/models";
import { buildStockAlertId, getStockAlertStateAsync } from "@/services/alerts/stockAlertState";

function fmtAmount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${Math.round(n).toLocaleString()}`;
}

function money(n: number) {
  return `${Math.round(n).toLocaleString()} FCFA`;
}

function isToday(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

type QuickAction = {
  label: string;
  hint: string;
  icon: keyof typeof Feather.glyphMap;
  route: string;
  color: string;
  featured?: boolean;
};

function QuickActionButton({ action }: { action: QuickAction }) {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={[
        styles.quickBtn,
        action.featured ? styles.quickBtnFeatured : null,
        { backgroundColor: action.color + (action.featured ? "1F" : "12"), borderColor: action.color + "28" },
      ]}
      onPress={() => router.push(action.route as never)}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={action.label}
    >
      <View style={[styles.quickIcon, { backgroundColor: action.color + "18" }]}>
        <Feather name={action.icon} size={20} color={action.color} />
      </View>
      <View style={styles.quickCopy}>
        <Text style={[styles.quickBtnLabel, { color: action.color }]} numberOfLines={1}>{action.label}</Text>
        <Text style={[styles.quickHint, { color: action.color }]} numberOfLines={2}>{action.hint}</Text>
      </View>
      <Feather name="arrow-right" size={16} color={action.color} />
    </TouchableOpacity>
  );
}

function MiniMetric({ label, value, icon, color }: { label: string; value: string; icon: keyof typeof Feather.glyphMap; color: string }) {
  const colors = useColors();

  return (
    <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.metricIcon, { backgroundColor: color + "16" }]}>
        <Feather name={icon} size={16} color={color} />
      </View>
      <Text style={[styles.metricValue, { color: colors.text }]} numberOfLines={1}>{value}</Text>
      <Text style={[styles.metricLabel, { color: colors.mutedForeground }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function SaleRow({ sale, isLast }: { sale: SaleRecord; isLast: boolean }) {
  const colors = useColors();
  const router = useRouter();
  const time = new Date(sale.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const isCredit = sale.paymentType === "credit";

  return (
    <TouchableOpacity
      style={[styles.saleRow, { borderBottomColor: colors.border }, isLast ? styles.noBorder : null]}
      onPress={() => router.push({ pathname: "/receipt/[id]", params: { id: sale.id } })}
      activeOpacity={0.72}
      accessibilityRole="button"
      accessibilityLabel={"Ouvrir le recu " + sale.receiptNumber + ", " + fmtAmount(sale.total) + " francs"}
    >
      <View style={[styles.saleIcon, { backgroundColor: (isCredit ? colors.warning : colors.success) + "18" }]}>
        <Feather name={isCredit ? "clock" : "check"} size={16} color={isCredit ? colors.warning : colors.success} />
      </View>
      <View style={styles.saleInfo}>
        <Text style={[styles.saleTitle, { color: colors.text }]}>Recu {sale.receiptNumber}</Text>
        <Text style={[styles.saleTime, { color: colors.mutedForeground }]}>{time} - {isCredit ? "credit" : "paye"}</Text>
      </View>
      <Text style={[styles.saleTotal, { color: colors.text }]}>{fmtAmount(sale.total)} F</Text>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useShopProfile();
  const { products, lowStockSuggestions, refreshProducts } = useProducts();
  const { sales, refreshSales } = useSales();
  const { totalOpenDebt, todayPaymentStats, refreshDebts } = useDebts();
  const [refreshing, setRefreshing] = useState(false);
  const [readAlertIds, setReadAlertIds] = useState<string[]>([]);
  const [hiddenAlertIds, setHiddenAlertIds] = useState<string[]>([]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const todaySales = useMemo(() => sales.filter(sale => isToday(sale.createdAt)), [sales]);
  const cashSales = useMemo(() => todaySales.filter(sale => sale.paymentType === "cash"), [todaySales]);
  const cashRevenue = useMemo(() => cashSales.reduce((sum, sale) => sum + sale.total, 0), [cashSales]);
  const cashProfit = useMemo(() => cashSales.reduce((sum, sale) => sum + sale.estimatedProfit, 0), [cashSales]);
  const countedRevenue = cashRevenue + todayPaymentStats.totalPaid;
  const countedProfit = cashProfit + todayPaymentStats.estimatedProfit;
  const totalStock = useMemo(() => products.reduce((sum, product) => sum + product.stock, 0), [products]);
  const stockValue = useMemo(() => products.reduce((sum, product) => sum + product.stock * product.sellPrice, 0), [products]);
  const bestLowStock = lowStockSuggestions.slice(0, 3);
  const recentSales = todaySales.slice(0, 3);
  const unreadAlertCount = useMemo(() => {
    return lowStockSuggestions.filter(suggestion => {
      const id = buildStockAlertId(suggestion.product);
      return !readAlertIds.includes(id) && !hiddenAlertIds.includes(id);
    }).length;
  }, [hiddenAlertIds, lowStockSuggestions, readAlertIds]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bonjour" : hour < 18 ? "Bon apres-midi" : "Bonsoir";

  const quickActions: QuickAction[] = [
    { label: "Vendre", hint: "Ouvrir la caisse", icon: "shopping-cart", route: "/(tabs)/sale", color: colors.primary, featured: true },
    { label: "Scanner", hint: "Produit ou stock", icon: "camera", route: "/product/scan", color: colors.accent },
    { label: "Ajouter stock", hint: "Reception rapide", icon: "plus-square", route: "/inventory", color: colors.info },
    { label: "Alertes", hint: unreadAlertCount > 0 ? `${unreadAlertCount} a voir` : "Tout est calme", icon: "alert-triangle", route: "/notifications", color: unreadAlertCount > 0 ? colors.warning : colors.success },
  ];

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void Promise.all([refreshProducts(), refreshSales(), refreshDebts()]).catch(error => {
        console.warn("Dashboard refresh failed", error);
      });
      getStockAlertStateAsync().then(state => {
        if (!active) return;
        setReadAlertIds(state.readIds);
        setHiddenAlertIds(state.hiddenIds);
      });
      return () => {
        active = false;
      };
    }, [refreshDebts, refreshProducts, refreshSales]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") {
        void Promise.all([refreshProducts(), refreshSales(), refreshDebts()]).catch(error => {
          console.warn("Dashboard foreground refresh failed", error);
        });
      }
    });
    return () => subscription.remove();
  }, [refreshDebts, refreshProducts, refreshSales]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([refreshProducts(), refreshSales(), refreshDebts()]);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: bottomPad + 92 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={[colors.primaryDark, colors.primary]} style={[styles.header, { paddingTop: topPad + 18 }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.shopName} numberOfLines={1}>{profile?.shopName ?? "SamaStock"}</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push("/settings")} accessibilityRole="button" accessibilityLabel="Ouvrir les parametres" hitSlop={8}>
              <Feather name="settings" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push("/notifications")} accessibilityRole="button" accessibilityLabel={`Notifications, ${unreadAlertCount} non lues`} hitSlop={8}>
              <Feather name="bell" size={21} color="#fff" />
              {unreadAlertCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unreadAlertCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.todayCard}>
          <Text style={styles.todayLabel}>Encaisse aujourd'hui</Text>
          <Text style={styles.todayAmount}>{money(countedRevenue)}</Text>
          <Text style={styles.todayNote}>Ventes payees + remboursements recus. Les credits non rembourses ne sont pas comptes.</Text>
          <View style={styles.todayFooter}>
            <View style={styles.todayChip}>
              <Feather name="trending-up" size={14} color="#fff" />
              <Text style={styles.todayChipText}>Benefice {fmtAmount(countedProfit)} F</Text>
            </View>
            <View style={styles.todayChip}>
              <Feather name="shopping-bag" size={14} color="#fff" />
              <Text style={styles.todayChipText}>{todaySales.length} ventes</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <View style={styles.metricGrid}>
          <MiniMetric label="Dettes" value={`${fmtAmount(totalOpenDebt)} F`} icon="credit-card" color={colors.destructive} />
          <MiniMetric label="Articles" value={fmtAmount(totalStock)} icon="layers" color={colors.primary} />
          <MiniMetric label="Valeur stock" value={`${fmtAmount(stockValue)} F`} icon="bar-chart-2" color={colors.info} />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Actions rapides</Text>
          </View>
          <View style={styles.quickGrid}>
            {quickActions.map(action => <QuickActionButton key={action.label} action={action} />)}
          </View>
        </View>

        {bestLowStock.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>A racheter</Text>
              <TouchableOpacity onPress={() => router.push("/notifications")} accessibilityRole="button" accessibilityLabel="Voir toutes les alertes de stock">
                <Text style={[styles.sectionLink, { color: colors.primary }]}>Voir alertes</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {bestLowStock.map((suggestion, index) => (
                <TouchableOpacity
                  key={suggestion.product.id}
                  style={[styles.saleRow, { borderBottomColor: colors.border }, index === bestLowStock.length - 1 ? styles.noBorder : null]}
                  onPress={() => router.push({ pathname: "/product/[id]", params: { id: suggestion.product.id } })}
                  activeOpacity={0.74}
                >
                  <View style={[styles.saleIcon, { backgroundColor: colors.warning + "18" }]}>
                    <Feather name="alert-triangle" size={16} color={colors.warning} />
                  </View>
                  <View style={styles.saleInfo}>
                    <Text style={[styles.saleTitle, { color: colors.text }]} numberOfLines={1}>{suggestion.product.name}</Text>
                    <Text style={[styles.saleTime, { color: colors.mutedForeground }]}>Stock {suggestion.product.stock} - racheter {suggestion.suggestedReorderQuantity}</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Derniers recus</Text>
            {todaySales.length > 0 ? (
              <TouchableOpacity onPress={() => router.push("/(tabs)/history" as never)} accessibilityRole="button" accessibilityLabel="Voir tout l'historique">
                <Text style={[styles.sectionLink, { color: colors.primary }]}>Voir tout</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {recentSales.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="shopping-bag" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Pas encore de vente</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Commencez par ouvrir la caisse ou scanner un produit.</Text>
            </View>
          ) : (
            <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {recentSales.map((sale, index) => <SaleRow key={sale.id} sale={sale} isLast={index === recentSales.length - 1} />)}
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 24, gap: 18 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 14 },
  headerCopy: { flex: 1, gap: 2 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 9 },
  greeting: { fontSize: 14, color: "rgba(255,255,255,0.78)", fontFamily: "Inter_400Regular" },
  shopName: { fontSize: 25, color: "#fff", fontFamily: "Inter_700Bold", fontWeight: "800" },
  headerIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  notifBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: "#D94A4A",
    alignItems: "center",
    justifyContent: "center",
  },
  notifBadgeText: { fontSize: 10, color: "#fff", fontFamily: "Inter_700Bold", fontWeight: "700" },
  todayCard: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    gap: 7,
  },
  todayLabel: { fontSize: 13, color: "rgba(255,255,255,0.76)", fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  todayAmount: { fontSize: 33, lineHeight: 39, color: "#fff", fontFamily: "Inter_700Bold", fontWeight: "800" },
  todayNote: { fontSize: 12, color: "rgba(255,255,255,0.74)", fontFamily: "Inter_400Regular", lineHeight: 17 },
  todayFooter: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 5 },
  todayChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  todayChipText: { fontSize: 12, color: "#fff", fontFamily: "Inter_700Bold", fontWeight: "700" },
  body: { paddingHorizontal: 16, paddingTop: 16, gap: 20 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricCard: {
    flex: 1,
    minWidth: 102,
    minHeight: 92,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1,
  },
  metricIcon: { width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  metricValue: { fontSize: 22, fontFamily: "Inter_700Bold", fontWeight: "800" },
  metricLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  section: { gap: 11 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold", fontWeight: "800" },
  sectionLink: { fontSize: 12, fontFamily: "Inter_700Bold", fontWeight: "700" },
  quickGrid: { gap: 10 },
  quickBtn: {
    minHeight: 68,
    padding: 12,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  quickBtnFeatured: { minHeight: 78 },
  quickIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  quickCopy: { flex: 1, gap: 2 },
  quickBtnLabel: { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "800" },
  quickHint: { fontSize: 12, fontFamily: "Inter_500Medium", fontWeight: "500", opacity: 0.78 },
  listCard: {
    borderRadius: 15,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1,
  },
  saleRow: { flexDirection: "row", alignItems: "center", padding: 13, borderBottomWidth: 1, gap: 12 },
  noBorder: { borderBottomWidth: 0 },
  saleIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  saleInfo: { flex: 1, gap: 2 },
  saleTitle: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700" },
  saleTime: { fontSize: 12, fontFamily: "Inter_400Regular" },
  saleTotal: { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "800" },
  emptyCard: { borderRadius: 15, borderWidth: 1, padding: 28, alignItems: "center", gap: 8 },
  emptyTitle: { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "800" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
});
