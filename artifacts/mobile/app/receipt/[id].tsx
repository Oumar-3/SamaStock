import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Print from "expo-print";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SamaStockLogo } from "@/components/SamaStockLogo";
import { useSales } from "@/context/SalesContext";
import { useShopProfile } from "@/context/ShopProfileContext";
import { useColors } from "@/hooks/useColors";
import type { SaleItemRecord, SaleRecord, ShopProfile } from "@/models";

function money(value: number) {
  return `${Math.round(value).toLocaleString()} FCFA`;
}

function fullDate(value: string) {
  return new Date(value).toLocaleString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortDate(value: string) {
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function paymentLabel(sale: SaleRecord) {
  return sale.paymentType === "credit" ? "Vente a credit" : "Paiement comptant";
}

function paymentHint(sale: SaleRecord) {
  return sale.paymentType === "credit" ? "Enregistre dans les dettes client" : "Montant encaisse";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "S").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildReceiptText(sale: SaleRecord, items: SaleItemRecord[], profile: ShopProfile | null | undefined) {
  const shopName = profile?.shopName || "SamaStock";
  const lines = [
    shopName.toUpperCase(),
    profile?.ownerName ? `Gerant: ${profile.ownerName}` : "",
    profile?.phone ? `Tel: ${profile.phone}` : "",
    profile?.address ? `Adresse: ${profile.address}` : "",
    "",
    `RECU ${sale.receiptNumber}`,
    `Date: ${fullDate(sale.createdAt)}`,
    `Paiement: ${paymentLabel(sale)}`,
    "",
    "Articles",
    ...items.map(item => `${item.productName} | ${item.quantity} x ${money(item.sellPrice)} | ${money(item.lineTotal)}`),
    "",
    `TOTAL: ${money(sale.total)}`,
    sale.paymentType === "credit" ? `A payer: ${money(sale.total)}` : `Encaisse: ${money(sale.total)}`,
    "",
    "Merci pour votre confiance.",
  ];

  return lines.filter((line, index) => line || lines[index - 1]).join("\n");
}

function buildReceiptHtml(sale: SaleRecord, items: SaleItemRecord[], profile: ShopProfile | null | undefined) {
  const shopName = profile?.shopName || "SamaStock";
  const rows = items
    .map(
      item => `
        <tr>
          <td>
            <strong>${escapeHtml(item.productName)}</strong>
            <span>${item.quantity} x ${money(item.sellPrice)}</span>
          </td>
          <td>${item.quantity}</td>
          <td>${money(item.sellPrice)}</td>
          <td>${money(item.lineTotal)}</td>
        </tr>
      `,
    )
    .join("");
  const badgeBg = sale.paymentType === "credit" ? "#FEF3C7" : "#D1FAE5";
  const badgeColor = sale.paymentType === "credit" ? "#92400E" : "#065F46";

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; background: #F7F8F5; color: #17211B; font-family: Arial, sans-serif; padding: 24px; }
          .receipt { max-width: 560px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E3E7DF; border-radius: 18px; overflow: hidden; }
          .top { background: #0B6B4B; color: #FFFFFF; padding: 24px; text-align: center; }
          .logo { width: 54px; height: 54px; border-radius: 18px; background: rgba(255,255,255,0.16); display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; margin-bottom: 10px; }
          h1 { margin: 0; font-size: 25px; }
          .shop-meta { margin: 5px 0 0; font-size: 12px; opacity: 0.84; }
          .content { padding: 22px; }
          .meta { display: flex; justify-content: space-between; gap: 16px; border: 1px solid #E3E7DF; border-radius: 14px; padding: 14px; margin-bottom: 18px; }
          .label { color: #667066; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
          .value { font-weight: 800; font-size: 14px; }
          .badge { display: inline-block; background: ${badgeBg}; color: ${badgeColor}; padding: 7px 10px; border-radius: 999px; font-weight: 800; font-size: 12px; margin-top: 10px; }
          table { width: 100%; border-collapse: collapse; }
          th { color: #667066; font-size: 11px; text-align: right; border-bottom: 1px solid #E3E7DF; padding: 9px 0; text-transform: uppercase; }
          th:first-child { text-align: left; }
          td { border-bottom: 1px solid #EEF1EC; padding: 12px 0; font-size: 13px; text-align: right; vertical-align: top; }
          td:first-child { text-align: left; }
          td span { display: block; color: #667066; font-size: 11px; margin-top: 3px; }
          .summary { margin-top: 18px; border-top: 2px solid #17211B; padding-top: 14px; }
          .row { display: flex; justify-content: space-between; gap: 16px; margin: 8px 0; font-size: 14px; }
          .grand { font-size: 22px; font-weight: 900; }
          .muted { color: #667066; }
          .thanks { text-align: center; color: #667066; margin: 24px 0 4px; font-size: 12px; }
        </style>
      </head>
      <body>
        <section class="receipt">
          <div class="top">
            <div class="logo">${escapeHtml(initials(shopName))}</div>
            <h1>${escapeHtml(shopName)}</h1>
            ${profile?.ownerName ? `<p class="shop-meta">Gerant: ${escapeHtml(profile.ownerName)}</p>` : ""}
            ${profile?.phone ? `<p class="shop-meta">Tel: ${escapeHtml(profile.phone)}</p>` : ""}
            ${profile?.address ? `<p class="shop-meta">${escapeHtml(profile.address)}</p>` : ""}
            <span class="badge">${paymentLabel(sale)}</span>
          </div>
          <div class="content">
            <div class="meta">
              <div>
                <div class="label">Numero</div>
                <div class="value">${escapeHtml(sale.receiptNumber)}</div>
              </div>
              <div style="text-align:right">
                <div class="label">Date</div>
                <div class="value">${escapeHtml(shortDate(sale.createdAt))}</div>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Qte</th>
                  <th>Prix</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <div class="summary">
              <div class="row grand"><span>Total</span><span>${money(sale.total)}</span></div>
              <div class="row"><span class="muted">${sale.paymentType === "credit" ? "A payer" : "Encaisse"}</span><strong>${money(sale.total)}</strong></div>
            </div>
            <p class="thanks">Merci pour votre confiance.</p>
          </div>
        </section>
      </body>
    </html>
  `;
}

function getActionErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isPrintCancellation(error: unknown) {
  const message = getActionErrorMessage(error).toLowerCase();
  return message.includes("printing did not complete") || message.includes("cancel") || message.includes("cancelled") || message.includes("canceled");
}

export default function ReceiptDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sales, getSale, listSaleItems } = useSales();
  const { profile } = useShopProfile();
  const [sale, setSale] = useState<SaleRecord | null>(sales.find(item => item.id === id) ?? null);
  const [items, setItems] = useState<SaleItemRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<"copy" | "pdf" | "print" | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const shopName = profile?.shopName || "SamaStock";

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!id) return;
      setIsLoading(true);
      try {
        const [freshSale, freshItems] = await Promise.all([getSale(id), listSaleItems(id)]);
        if (mounted) {
          setSale(freshSale);
          setItems(freshItems);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [getSale, id, listSaleItems]);


  async function copyReceipt() {
    if (!sale) return;
    setBusyAction("copy");
    try {
      await Clipboard.setStringAsync(buildReceiptText(sale, items, profile));
      Alert.alert("Recu copie", "Le texte du recu est pret a etre partage.");
    } catch {
      Alert.alert("Action impossible", "Le recu n'a pas pu etre copie.");
    } finally {
      setBusyAction(null);
    }
  }

  async function sharePdf() {
    if (!sale) return;
    setBusyAction("pdf");
    try {
      const result = await Print.printToFileAsync({
        html: buildReceiptHtml(sale, items, profile),
        base64: false,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, {
          mimeType: "application/pdf",
          dialogTitle: `Recu ${sale.receiptNumber}`,
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert("PDF genere", result.uri);
      }
    } catch (error) {
      if (!isPrintCancellation(error)) {
        Alert.alert("PDF impossible", "Le recu PDF n'a pas pu etre genere ou partage.");
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function printReceipt() {
    if (!sale) return;
    setBusyAction("print");
    try {
      await Print.printAsync({ html: buildReceiptHtml(sale, items, profile) });
    } catch (error) {
      if (!isPrintCancellation(error)) {
        Alert.alert("Impression impossible", "Verifiez qu'une imprimante est disponible ou partagez le PDF du recu.");
      }
    } finally {
      setBusyAction(null);
    }
  }

  if (isLoading) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!sale) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.notFound, { color: colors.mutedForeground }]}>Recu introuvable</Text>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Retour">
          <Text style={[styles.back, { color: colors.primary }]}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isCredit = sale.paymentType === "credit";
  const paymentColor = isCredit ? colors.warning : colors.success;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: topPad + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}> 
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.iconBtn, { backgroundColor: colors.muted }]}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleBlock}>
          <Text style={[styles.headerKicker, { color: colors.primary }]}>Recu de vente</Text>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{sale.receiptNumber}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: paymentColor + "14" }]}> 
          <Feather name={isCredit ? "clock" : "check-circle"} size={14} color={paymentColor} />
          <Text style={[styles.statusPillText, { color: paymentColor }]}>{isCredit ? "Credit" : "Paye"}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: bottomPad + 24 }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.receiptCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.shopHero, { backgroundColor: colors.primaryDark }]}>
            <View style={styles.logoRow}>
              <View style={styles.logoMark}>
                <SamaStockLogo size={42} />
              </View>
              <View style={styles.shopCopy}>
                <Text style={styles.shopName} numberOfLines={1}>{shopName}</Text>
                <Text style={styles.shopSub} numberOfLines={1}>
                  {[profile?.ownerName, profile?.phone].filter(Boolean).join(" - ") || "Gestion boutique"}
                </Text>
              </View>
            </View>
            {profile?.address ? <Text style={styles.shopAddress} numberOfLines={2}>{profile.address}</Text> : null}
            <View style={styles.heroMeta}>
              <View>
                <Text style={styles.heroLabel}>Numero</Text>
                <Text style={styles.heroValue}>{sale.receiptNumber}</Text>
              </View>
              <View style={styles.heroMetaRight}>
                <Text style={styles.heroLabel}>Date</Text>
                <Text style={styles.heroValue}>{shortDate(sale.createdAt)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.receiptContent}>
            <View style={[styles.paymentCard, { backgroundColor: paymentColor + "12", borderColor: paymentColor + "35" }]}>
              <View style={[styles.paymentIcon, { backgroundColor: paymentColor + "18" }]}>
                <Feather name={isCredit ? "credit-card" : "check-circle"} size={19} color={paymentColor} />
              </View>
              <View style={styles.paymentCopy}>
                <Text style={[styles.paymentTitle, { color: paymentColor }]}>{paymentLabel(sale)}</Text>
                <Text style={[styles.paymentSubtitle, { color: colors.mutedForeground }]}>{paymentHint(sale)}</Text>
              </View>
              <Text style={[styles.paymentAmount, { color: paymentColor }]}>{money(sale.total)}</Text>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Articles vendus</Text>
              <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>{items.length} ligne{items.length > 1 ? "s" : ""}</Text>
            </View>

            <View style={[styles.itemsTable, { borderColor: colors.border }]}>
              {items.map((item, index) => (
                <View key={item.id} style={[styles.itemRow, { borderBottomColor: colors.border }, index === items.length - 1 && styles.lastItemRow]}>
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>{item.productName}</Text>
                    <Text style={[styles.itemMeta, { color: colors.mutedForeground }]}>
                      {item.quantity} x {money(item.sellPrice)}
                    </Text>
                  </View>
                  <Text style={[styles.itemTotal, { color: colors.text }]}>{money(item.lineTotal)}</Text>
                </View>
              ))}
            </View>

            <View style={[styles.totalBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: colors.text }]}>Total</Text>
                <Text style={[styles.totalValue, { color: colors.text }]}>{money(sale.total)}</Text>
              </View>
            </View>

            <Text style={[styles.thanks, { color: colors.mutedForeground }]}>Merci pour votre confiance.</Text>
          </View>
        </View>

        <View style={[styles.actionPanel, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <TouchableOpacity
            style={[styles.primaryAction, { backgroundColor: colors.primary }, busyAction !== null && { opacity: 0.65 }]}
            onPress={sharePdf}
            disabled={busyAction !== null}
            activeOpacity={0.84}
            accessibilityRole="button"
            accessibilityLabel="Partager le recu en PDF"
            accessibilityState={{ disabled: busyAction !== null, busy: busyAction === "pdf" }}
          >
            {busyAction === "pdf" ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="share-2" size={18} color="#fff" />}
            <Text style={styles.primaryActionText}>Partager le PDF</Text>
          </TouchableOpacity>
          <View style={styles.secondaryActions}>
            <ActionButton colors={colors} icon="copy" label="Copier" accessibilityLabel="Copier le recu en texte" loading={busyAction === "copy"} disabled={busyAction !== null} onPress={copyReceipt} />
            <ActionButton colors={colors} icon="printer" label="Imprimer" accessibilityLabel="Imprimer le recu" loading={busyAction === "print"} disabled={busyAction !== null} onPress={printReceipt} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function ActionButton(props: {
  colors: ReturnType<typeof useColors>;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  accessibilityLabel: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionBtn, { backgroundColor: props.colors.card, borderColor: props.colors.border }, props.disabled && { opacity: 0.6 }]}
      onPress={props.onPress}
      disabled={props.disabled}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      accessibilityState={{ disabled: props.disabled, busy: props.loading }}
    >
      {props.loading ? <ActivityIndicator size="small" color={props.colors.primary} /> : <Feather name={props.icon} size={18} color={props.colors.primary} />}
      <Text style={[styles.actionText, { color: props.colors.text }]}>{props.label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, gap: 12 },
  iconBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  headerTitleBlock: { flex: 1, gap: 1 },
  headerKicker: { fontSize: 11, fontFamily: "Inter_700Bold", fontWeight: "800", textTransform: "uppercase" },
  title: { fontSize: 18, fontFamily: "Inter_700Bold", fontWeight: "800" },
  statusPill: { minHeight: 36, borderRadius: 999, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  statusPillText: { fontSize: 11, fontFamily: "Inter_700Bold", fontWeight: "800" },
  body: { padding: 16, gap: 14 },
  receiptCard: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  shopHero: { padding: 18, gap: 14 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  logoMark: { width: 52, height: 52, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  shopCopy: { flex: 1, gap: 2 },
  shopName: { color: "#FFFFFF", fontSize: 22, fontFamily: "Inter_700Bold", fontWeight: "700" },
  shopSub: { color: "rgba(255,255,255,0.78)", fontSize: 12, fontFamily: "Inter_400Regular" },
  shopAddress: { color: "rgba(255,255,255,0.78)", fontSize: 12, lineHeight: 17, fontFamily: "Inter_400Regular" },
  heroMeta: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingTop: 4 },
  heroMetaRight: { alignItems: "flex-end" },
  heroLabel: { color: "rgba(255,255,255,0.62)", fontSize: 11, fontFamily: "Inter_600SemiBold", fontWeight: "600", textTransform: "uppercase" },
  heroValue: { color: "#FFFFFF", fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700", marginTop: 3 },
  receiptContent: { padding: 16, gap: 14 },
  paymentCard: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  paymentIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  paymentCopy: { flex: 1, gap: 2 },
  paymentTitle: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700" },
  paymentSubtitle: { fontSize: 11, fontFamily: "Inter_400Regular" },
  paymentAmount: { fontSize: 13, fontFamily: "Inter_700Bold", fontWeight: "700" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", fontWeight: "700" },
  sectionHint: { fontSize: 12, fontFamily: "Inter_400Regular" },
  itemsTable: { borderWidth: 1, borderRadius: 14, overflow: "hidden" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderBottomWidth: 1 },
  lastItemRow: { borderBottomWidth: 0 },
  itemInfo: { flex: 1, gap: 3 },
  itemName: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700" },
  itemMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  itemTotal: { minWidth: 88, textAlign: "right", fontSize: 13, fontFamily: "Inter_700Bold", fontWeight: "700" },
  totalBox: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 9 },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  totalLabel: { fontSize: 18, fontFamily: "Inter_700Bold", fontWeight: "700" },
  totalValue: { fontSize: 20, fontFamily: "Inter_700Bold", fontWeight: "700" },
  thanks: { textAlign: "center", fontSize: 12, fontFamily: "Inter_500Medium", fontWeight: "500", paddingTop: 2 },
  actionPanel: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 10 },
  primaryAction: { minHeight: 52, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  primaryActionText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "800" },
  secondaryActions: { flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  actionText: { fontSize: 12, fontFamily: "Inter_700Bold", fontWeight: "700" },
  notFound: { fontSize: 16, fontFamily: "Inter_400Regular", marginBottom: 12 },
  back: { fontSize: 15, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
});
