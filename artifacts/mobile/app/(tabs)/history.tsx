import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { SkeletonCard } from "@/components/SkeletonCard";
import { useDebts } from "@/context/DebtsContext";
import { useProducts } from "@/context/ProductsContext";
import { useSales } from "@/context/SalesContext";
import { useShopProfile } from "@/context/ShopProfileContext";
import { useColors } from "@/hooks/useColors";
import type { SaleRecord } from "@/models";
import { shareBusinessReportPdf, type BusinessReportPeriod } from "@/services/reports/businessReport";
import { shareProductSheetPdf } from "@/services/reports/productSheet";

function money(value: number) {
  return `${Math.round(value).toLocaleString()} FCFA`;
}

function saleDate(value: string) {
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SaleCard({ sale, onDelete }: { sale: SaleRecord; onDelete: () => void }) {
  const colors = useColors();
  const router = useRouter();
  const isCredit = sale.paymentType === "credit";

  return (
    <TouchableOpacity
      style={[styles.saleCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push({ pathname: "/receipt/[id]", params: { id: sale.id } })}
      activeOpacity={0.78}
    >
      <View style={[styles.saleIcon, { backgroundColor: isCredit ? colors.warning + "16" : colors.primary + "16" }]}>
        <Feather name={isCredit ? "credit-card" : "file-text"} size={19} color={isCredit ? colors.warning : colors.primary} />
      </View>
      <View style={styles.saleInfo}>
        <View style={styles.saleTitleRow}>
          <Text style={[styles.saleTitle, { color: colors.text }]} numberOfLines={1}>Recu {sale.receiptNumber}</Text>
          <View style={[styles.badge, { backgroundColor: isCredit ? colors.warning + "14" : colors.success + "14" }]}>
            <Text style={[styles.badgeText, { color: isCredit ? colors.warning : colors.success }]}>{isCredit ? "Credit" : "Cash"}</Text>
          </View>
        </View>
        <Text style={[styles.saleDate, { color: colors.mutedForeground }]}>{saleDate(sale.createdAt)}</Text>
        <Text style={[styles.saleProfit, { color: sale.estimatedProfit >= 0 ? colors.success : colors.destructive }]}>
          Benefice estime: {money(sale.estimatedProfit)}
        </Text>
      </View>
      <View style={styles.saleRight}>
        <Text style={[styles.saleTotal, { color: colors.text }]}>{money(sale.total)}</Text>
        <View style={styles.saleRightActions}>
          <TouchableOpacity
            style={[styles.deleteBtn, { backgroundColor: colors.destructive + "12" }]}
            onPress={onDelete}
            activeOpacity={0.75}
          >
            <Feather name="trash-2" size={15} color={colors.destructive} />
          </TouchableOpacity>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile } = useShopProfile();
  const { products, refreshProducts } = useProducts();
  const { openDebts, refreshDebts } = useDebts();
  const { sales, refreshSales, listSalesPage, countSalesPage, getSalesSummary, hideSaleFromHistory } = useSales();
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [pageSales, setPageSales] = useState<SaleRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingPage, setLoadingPage] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reportBusy, setReportBusy] = useState<BusinessReportPeriod | null>(null);
  const [productSheetBusy, setProductSheetBusy] = useState(false);
  const [summary, setSummary] = useState({ totalRevenue: 0, totalProfit: 0, todayCount: 0, creditCount: 0, visibleCount: 0 });

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const pageSize = 10;

  const loadHistory = useCallback(async (mode: "replace" | "append" = "replace", offset = 0) => {
    const nextOffset = mode === "append" ? offset : 0;
    if (mode === "append") {
      setLoadingMore(true);
    } else {
      setLoadingPage(true);
    }

    try {
      const [nextSales, nextCount, nextSummary] = await Promise.all([
        listSalesPage({ limit: pageSize, offset: nextOffset, search }),
        countSalesPage(search),
        getSalesSummary(),
      ]);
      setPageSales(prev => mode === "append" ? [...prev, ...nextSales] : nextSales);
      setTotalCount(nextCount);
      setSummary(nextSummary);
    } finally {
      setLoadingPage(false);
      setLoadingMore(false);
    }
  }, [countSalesPage, getSalesSummary, listSalesPage, search]);

  useEffect(() => {
    loadHistory("replace");
  }, [loadHistory]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refreshSales();
      await Promise.all([refreshProducts(), refreshDebts()]);
      await loadHistory("replace");
    } finally {
      setRefreshing(false);
    }
  }

  async function shareReport(period: BusinessReportPeriod) {
    setReportBusy(period);
    try {
      await Promise.all([refreshSales(), refreshProducts(), refreshDebts()]);
      const mergedSales = [...sales, ...pageSales].filter((sale, index, list) => (
        list.findIndex(item => item.id === sale.id) === index
      ));
      const uri = await shareBusinessReportPdf({
        period,
        profile,
        sales: mergedSales,
        products,
        openDebts,
      });
      if (uri) {
        Alert.alert("Rapport genere", uri);
      }
    } catch (err) {
      Alert.alert("Rapport impossible", err instanceof Error ? err.message : "Impossible de generer le PDF.");
    } finally {
      setReportBusy(null);
    }
  }

  async function shareProductSheet() {
    setProductSheetBusy(true);
    try {
      await refreshProducts();
      const uri = await shareProductSheetPdf({ profile, products });
      if (uri) {
        Alert.alert("Fiche generee", uri);
      }
    } catch (err) {
      Alert.alert("Fiche impossible", err instanceof Error ? err.message : "Impossible de generer la fiche produits.");
    } finally {
      setProductSheetBusy(false);
    }
  }

  function confirmHideReceipt(sale: SaleRecord) {
    Alert.alert(
      "Supprimer ce recu ?",
      "Il sera masque de l'historique, mais la vente reste conservee pour garder le stock et les dettes coherents.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            try {
              await hideSaleFromHistory(sale.id);
              await loadHistory("replace");
            } catch (err) {
              Alert.alert("Suppression impossible", err instanceof Error ? err.message : "Une erreur est survenue.");
            }
          },
        },
      ],
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>Historique</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            10 derniers recus affiches par defaut
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={[styles.summaryBox, { backgroundColor: colors.primary + "12" }]}>
            <Text style={[styles.summaryLabel, { color: colors.primary }]}>Ventes</Text>
            <Text style={[styles.summaryValue, { color: colors.primary }]}>{money(summary.totalRevenue)}</Text>
          </View>
          <View style={[styles.summaryBox, { backgroundColor: colors.success + "12" }]}>
            <Text style={[styles.summaryLabel, { color: colors.success }]}>Benefice</Text>
            <Text style={[styles.summaryValue, { color: summary.totalProfit >= 0 ? colors.success : colors.destructive }]}>{money(summary.totalProfit)}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statPill, { backgroundColor: colors.info + "12" }]}>
            <Feather name="calendar" size={14} color={colors.info} />
            <Text style={[styles.statPillText, { color: colors.info }]}>{summary.todayCount} aujourd'hui</Text>
          </View>
          <View style={[styles.statPill, { backgroundColor: colors.warning + "12" }]}>
            <Feather name="credit-card" size={14} color={colors.warning} />
            <Text style={[styles.statPillText, { color: colors.warning }]}>{summary.creditCount} credit</Text>
          </View>
        </View>

        <View style={styles.reportRow}>
          <TouchableOpacity
            style={[styles.reportBtn, { backgroundColor: colors.card, borderColor: colors.border }, productSheetBusy && { opacity: 0.7 }]}
            onPress={shareProductSheet}
            disabled={productSheetBusy}
            activeOpacity={0.78}
          >
            {productSheetBusy ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="file-text" size={16} color={colors.primary} />}
            <Text style={[styles.reportBtnText, { color: colors.primary }]}>Fiche produits</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.reportBtn, { backgroundColor: colors.card, borderColor: colors.border }, reportBusy !== null && { opacity: 0.7 }]}
            onPress={() => shareReport("month")}
            disabled={reportBusy !== null}
            activeOpacity={0.78}
          >
            {reportBusy === "month" ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="file-text" size={16} color={colors.primary} />}
            <Text style={[styles.reportBtnText, { color: colors.primary }]}>Rapport mois</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Rechercher par date ou numero"
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.resultRow}>
          <Text style={[styles.resultText, { color: colors.mutedForeground }]}>
            {pageSales.length} vente{pageSales.length > 1 ? "s" : ""}
            {totalCount > pageSales.length ? ` sur ${totalCount}` : ""}
          </Text>
        </View>

        {loadingPage ? (
          <SkeletonCard count={5} />
        ) : pageSales.length === 0 ? (
          <EmptyState
            icon="file-text"
            title="Aucune vente"
            subtitle={search ? "Aucun recu ne correspond a cette date ou ce numero" : "Les ventes validees apparaitront ici"}
          />
        ) : (
          <>
            {pageSales.map(sale => <SaleCard key={sale.id} sale={sale} onDelete={() => confirmHideReceipt(sale)} />)}
            {pageSales.length < totalCount ? (
              <TouchableOpacity
                style={[styles.loadMoreBtn, { backgroundColor: colors.card, borderColor: colors.border }, loadingMore && { opacity: 0.65 }]}
                onPress={() => loadHistory("append", pageSales.length)}
                disabled={loadingMore}
                activeOpacity={0.78}
              >
                <Feather name="chevron-down" size={17} color={colors.primary} />
                <Text style={[styles.loadMoreText, { color: colors.primary }]}>{loadingMore ? "Chargement..." : "Voir plus"}</Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 12 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", fontWeight: "700" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  summaryRow: { flexDirection: "row", gap: 10 },
  summaryBox: { flex: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, gap: 2 },
  summaryLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  summaryValue: { fontSize: 17, fontFamily: "Inter_700Bold", fontWeight: "700" },
  statsRow: { flexDirection: "row", gap: 8 },
  statPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  statPillText: { fontSize: 12, fontFamily: "Inter_700Bold", fontWeight: "700" },
  reportRow: { flexDirection: "row", gap: 10 },
  reportBtn: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  reportBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", fontWeight: "700" },
  searchBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, gap: 10 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  list: { flex: 1 },
  resultRow: { marginBottom: 10 },
  resultText: { fontSize: 12, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  saleCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    padding: 13,
    gap: 12,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1,
  },
  saleIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  saleInfo: { flex: 1, gap: 3 },
  saleTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  saleTitle: { flex: 1, fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "700" },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold", fontWeight: "700" },
  saleDate: { fontSize: 12, fontFamily: "Inter_400Regular" },
  saleProfit: { fontSize: 12, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  saleRight: { alignItems: "flex-end", gap: 6 },
  saleRightActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  deleteBtn: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  saleTotal: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700" },
  loadMoreBtn: { minHeight: 46, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  loadMoreText: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700" },
});
