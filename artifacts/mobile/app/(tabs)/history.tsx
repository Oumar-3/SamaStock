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
  const tone = isCredit ? colors.warning : colors.success;

  return (
    <TouchableOpacity
      style={[styles.saleCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push({ pathname: "/receipt/[id]", params: { id: sale.id } })}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={"Ouvrir le recu " + sale.receiptNumber + ", " + money(sale.total)}
      accessibilityHint="Affiche le detail du recu"
    >
      <View style={[styles.saleIcon, { backgroundColor: tone + "16" }]}>
        <Feather name={isCredit ? "clock" : "check-circle"} size={20} color={tone} />
      </View>

      <View style={styles.saleInfo}>
        <View style={styles.saleTitleRow}>
          <Text style={[styles.saleTitle, { color: colors.text }]} numberOfLines={1}>Recu {sale.receiptNumber}</Text>
          <View style={[styles.badge, { backgroundColor: tone + "14" }]}>
            <Text style={[styles.badgeText, { color: tone }]}>{isCredit ? "Credit" : "Paye"}</Text>
          </View>
        </View>
        <View style={styles.saleMetaRow}>
          <Feather name="calendar" size={13} color={colors.mutedForeground} />
          <Text style={[styles.saleDate, { color: colors.mutedForeground }]}>{saleDate(sale.createdAt)}</Text>
        </View>
        <Text style={[styles.saleProfit, { color: sale.estimatedProfit >= 0 ? colors.success : colors.destructive }]}>
          Marge: {money(sale.estimatedProfit)}
        </Text>
      </View>

      <View style={styles.saleRight}>
        <Text style={[styles.saleTotal, { color: colors.text }]}>{money(sale.total)}</Text>
        <View style={styles.saleRightActions}>
          <TouchableOpacity
            style={[styles.deleteBtn, { backgroundColor: colors.destructive + "12" }]}
            onPress={event => {
              event.stopPropagation();
              onDelete();
            }}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={"Supprimer le recu " + sale.receiptNumber}
          >
            <Feather name="trash-2" size={15} color={colors.destructive} />
          </TouchableOpacity>
          <View style={[styles.chevronBox, { backgroundColor: colors.muted }]}> 
            <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
          </View>
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
  const [searchDraft, setSearchDraft] = useState("");
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
    const timeout = setTimeout(() => setSearch(searchDraft.trim()), 300);
    return () => clearTimeout(timeout);
  }, [searchDraft]);

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
      <View style={[styles.header, { paddingTop: topPad + 14, backgroundColor: colors.background, borderBottomColor: colors.border }]}> 
        <View style={styles.headerTopRow}>
          <View style={styles.headerCopy}>
            <Text style={[styles.kicker, { color: colors.primary }]}>Registre</Text>
            <Text style={[styles.title, { color: colors.text }]}>Historique</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>10 derniers recus, recherche par date ou numero.</Text>
          </View>
          <View style={[styles.headerIcon, { backgroundColor: colors.primary + "14" }]}> 
            <Feather name="archive" size={23} color={colors.primary} />
          </View>
        </View>

        <View style={[styles.totalPanel, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <View style={styles.totalPanelTop}>
            <View style={styles.totalCopy}>
              <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Ventes enregistrees</Text>
              <Text style={[styles.totalValue, { color: colors.text }]}>{money(summary.totalRevenue)}</Text>
            </View>
            <View style={[styles.profitBadge, { backgroundColor: (summary.totalProfit >= 0 ? colors.success : colors.destructive) + "14" }]}> 
              <Feather name="trending-up" size={15} color={summary.totalProfit >= 0 ? colors.success : colors.destructive} />
              <Text style={[styles.profitBadgeText, { color: summary.totalProfit >= 0 ? colors.success : colors.destructive }]}>
                {money(summary.totalProfit)}
              </Text>
            </View>
          </View>
          <View style={styles.summaryRow}>
            <View style={[styles.summaryBox, { backgroundColor: colors.primary + "10" }]}> 
              <Text style={[styles.summaryValue, { color: colors.primary }]}>{summary.todayCount}</Text>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Aujourd'hui</Text>
            </View>
            <View style={[styles.summaryBox, { backgroundColor: colors.warning + "12" }]}> 
              <Text style={[styles.summaryValue, { color: colors.warning }]}>{summary.creditCount}</Text>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>A credit</Text>
            </View>
            <View style={[styles.summaryBox, { backgroundColor: colors.info + "12" }]}> 
              <Text style={[styles.summaryValue, { color: colors.info }]}>{summary.visibleCount}</Text>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Recus</Text>
            </View>
          </View>
        </View>

        <View style={[styles.documentsPanel, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <View style={styles.documentsHeader}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Documents</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>Fiches simples a partager ou imprimer</Text>
            </View>
            <Feather name="download" size={18} color={colors.mutedForeground} />
          </View>
          <View style={styles.reportRow}>
            <TouchableOpacity
              style={[styles.reportBtn, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "24" }, productSheetBusy && { opacity: 0.7 }]}
              onPress={shareProductSheet}
              disabled={productSheetBusy}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel="Generer la fiche produits en PDF"
              accessibilityState={{ disabled: productSheetBusy, busy: productSheetBusy }}
            >
              {productSheetBusy ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="package" size={16} color={colors.primary} />}
              <Text style={[styles.reportBtnText, { color: colors.primary }]}>Produits PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.reportBtn, { backgroundColor: colors.muted, borderColor: colors.border }, reportBusy !== null && { opacity: 0.7 }]}
              onPress={() => shareReport("month")}
              disabled={reportBusy !== null}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel="Generer le rapport mensuel en PDF"
              accessibilityState={{ disabled: reportBusy !== null, busy: reportBusy === "month" }}
            >
              {reportBusy === "month" ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="file-text" size={16} color={colors.text} />}
              <Text style={[styles.reportBtnText, { color: colors.text }]}>Mois PDF</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Feather name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Numero de recu ou date"
            placeholderTextColor={colors.mutedForeground}
            value={searchDraft}
            onChangeText={setSearchDraft}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Rechercher un recu par date ou numero"
          />
          {searchDraft ? (
            <TouchableOpacity
              style={styles.clearSearchBtn}
              onPress={() => {
                setSearchDraft("");
                setSearch("");
              }}
              accessibilityRole="button"
              accessibilityLabel="Effacer la recherche"
            >
              <Feather name="x" size={18} color={colors.mutedForeground} />
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
          <View>
            <Text style={[styles.resultTitle, { color: colors.text }]}>Recus recents</Text>
            <Text style={[styles.resultText, { color: colors.mutedForeground }]}> 
              {pageSales.length} affiche{pageSales.length > 1 ? "s" : ""}{totalCount > pageSales.length ? ` sur ${totalCount}` : ""}
            </Text>
          </View>
          {search ? (
            <View style={[styles.searchBadge, { backgroundColor: colors.primary + "12" }]}> 
              <Text style={[styles.searchBadgeText, { color: colors.primary }]}>Recherche</Text>
            </View>
          ) : null}
        </View>

        {loadingPage ? (
          <SkeletonCard count={5} />
        ) : pageSales.length === 0 ? (
          <EmptyState
            icon="file-text"
            title="Aucune vente"
            subtitle={search ? "Aucun recu ne correspond a cette recherche" : "Les ventes validees apparaitront ici"}
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
                accessibilityRole="button"
                accessibilityLabel="Afficher plus de recus"
                accessibilityState={{ disabled: loadingMore, busy: loadingMore }}
              >
                <Feather name="chevron-down" size={17} color={colors.primary} />
                <Text style={[styles.loadMoreText, { color: colors.primary }]}>{loadingMore ? "Chargement..." : "Voir plus de recus"}</Text>
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
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerCopy: { flex: 1, gap: 2 },
  kicker: { fontSize: 11, fontFamily: "Inter_700Bold", fontWeight: "800", textTransform: "uppercase" },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", fontWeight: "700" },
  subtitle: { fontSize: 12, lineHeight: 17, fontFamily: "Inter_400Regular", marginTop: 2 },
  headerIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  totalPanel: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  totalPanelTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  totalCopy: { flex: 1, gap: 3 },
  totalLabel: { fontSize: 11, fontFamily: "Inter_700Bold", fontWeight: "800", textTransform: "uppercase" },
  totalValue: { fontSize: 27, lineHeight: 33, fontFamily: "Inter_700Bold", fontWeight: "800" },
  profitBadge: { minHeight: 38, borderRadius: 12, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  profitBadgeText: { fontSize: 12, fontFamily: "Inter_700Bold", fontWeight: "800" },
  summaryRow: { flexDirection: "row", gap: 8 },
  summaryBox: { flex: 1, borderRadius: 13, paddingHorizontal: 10, paddingVertical: 10, gap: 2 },
  summaryLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  summaryValue: { fontSize: 18, fontFamily: "Inter_700Bold", fontWeight: "800" },
  documentsPanel: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 12 },
  documentsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "800" },
  sectionSubtitle: { fontSize: 12, lineHeight: 17, fontFamily: "Inter_400Regular", marginTop: 2 },
  reportRow: { flexDirection: "row", gap: 10 },
  reportBtn: { flex: 1, minHeight: 46, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  reportBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", fontWeight: "700" },
  searchBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, gap: 10 },
  searchInput: { flex: 1, minHeight: 44, fontSize: 15, fontFamily: "Inter_400Regular" },
  clearSearchBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -10 },
  list: { flex: 1 },
  resultRow: { marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  resultTitle: { fontSize: 17, fontFamily: "Inter_700Bold", fontWeight: "800" },
  resultText: { fontSize: 12, fontFamily: "Inter_600SemiBold", fontWeight: "600", marginTop: 2 },
  searchBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  searchBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold", fontWeight: "800" },
  saleCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    padding: 13,
    gap: 12,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1,
  },
  saleIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  saleInfo: { flex: 1, gap: 4 },
  saleTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  saleTitle: { flex: 1, fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "800" },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold", fontWeight: "800" },
  saleMetaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  saleDate: { fontSize: 12, fontFamily: "Inter_400Regular" },
  saleProfit: { fontSize: 12, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  saleRight: { alignItems: "flex-end", gap: 8 },
  saleRightActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  deleteBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  chevronBox: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  saleTotal: { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "800" },
  loadMoreBtn: { minHeight: 48, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 4 },
  loadMoreText: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700" },
});
