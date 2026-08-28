import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SamaStockLogo } from "@/components/SamaStockLogo";
import { useAuth } from "@/context/AuthContext";
import { useDebts } from "@/context/DebtsContext";
import { useProducts } from "@/context/ProductsContext";
import { useSales } from "@/context/SalesContext";
import { useShopProfile } from "@/context/ShopProfileContext";
import { useColors } from "@/hooks/useColors";
import { syncBasicTablesAsync } from "@/services/sync/basicSync";

type RowProps = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
};

function money(value: number) {
  return `${Math.round(value).toLocaleString()} FCFA`;
}

function Row({ icon, label, value, onPress }: RowProps) {
  const colors = useColors();
  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <View style={[styles.rowIcon, { backgroundColor: colors.primary + "12" }]}>
        <Feather name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      {value ? <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{value}</Text> : null}
      {onPress ? <Feather name="chevron-right" size={16} color={colors.mutedForeground} /> : null}
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isConfigured, logout } = useAuth();
  const { profile, refreshProfile } = useShopProfile();
  const { products, refreshProducts } = useProducts();
  const { sales, refreshSales } = useSales();
  const { clients, totalOpenDebt, refreshDebts } = useDebts();
  const [isSyncing, setIsSyncing] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const totalRevenue = sales.reduce((sum, sale) => sum + sale.total, 0);

  const shopName = profile?.shopName ?? "SamaStock";
  const ownerName = profile?.ownerName ?? "Boutique";

  async function handleSync() {
    if (!isConfigured) {
      Alert.alert("Supabase non configurÃ©", "CrÃ©ez artifacts/mobile/.env avec l'URL et la publishable key Supabase.");
      return;
    }
    if (!user) {
      router.push("/(auth)/login");
      return;
    }

    setIsSyncing(true);
    try {
      const results = await syncBasicTablesAsync();
      const pushed = results.reduce((sum, result) => sum + result.pushed, 0);
      const pulled = results.reduce((sum, result) => sum + result.pulled, 0);
      const conflicts = results.reduce((sum, result) => sum + result.conflicts, 0);
      Alert.alert("Synchronisation terminÃ©e", `EnvoyÃ©s: ${pushed}\nRÃ©cupÃ©rÃ©s: ${pulled}\nConflits: ${conflicts}`);
    } catch (error) {
      Alert.alert("Sync impossible", error instanceof Error ? error.message : "Une erreur est survenue.");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: bottomPad + 90 }}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={[styles.header, { paddingTop: topPad + 24 }]}>
        <View style={styles.avatar}>
          <SamaStockLogo size={58} />
        </View>
        <Text style={styles.userName}>{shopName}</Text>
        <Text style={styles.shopName}>{ownerName}</Text>
        {profile?.phone ? <Text style={styles.userEmail}>{profile.phone}</Text> : null}
      </LinearGradient>

      <View style={styles.statsBar}>
        {[
          { label: "Produits", value: `${products.length}` },
          { label: "Ventes", value: `${sales.length}` },
          { label: "Clients", value: `${clients.length}` },
        ].map(item => (
          <View key={item.label} style={[styles.statItem, { borderRightColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{item.value}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Ma boutique</Text>
        <Row icon="shopping-bag" label="Chiffre d'affaires" value={money(totalRevenue)} />
        <Row icon="credit-card" label="Dettes ouvertes" value={money(totalOpenDebt)} />
        <Row icon="settings" label="ParamÃ¨tres boutique" onPress={() => router.push("/settings")} />
        <Row icon="bell" label="Notifications stock" onPress={() => router.push("/notifications")} />
      </View>

      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 16 }]}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Cloud Supabase</Text>
        <Row
          icon={user ? "cloud" : "log-in"}
          label={user ? "Synchroniser maintenant" : "Se connecter"}
          value={isSyncing ? "En cours..." : user?.email}
          onPress={handleSync}
        />
      </View>

      <Text style={[styles.version, { color: colors.mutedForeground }]}>SamaStock Front V1 locale</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { alignItems: "center", paddingBottom: 32, gap: 6 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  userName: { fontSize: 22, fontFamily: "Inter_700Bold", fontWeight: "700", color: "#fff" },
  shopName: { fontSize: 15, fontFamily: "Inter_500Medium", fontWeight: "500", color: "rgba(255,255,255,0.85)" },
  userEmail: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.7)" },
  statsBar: { flexDirection: "row", backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  statItem: { flex: 1, alignItems: "center", paddingVertical: 20, borderRightWidth: 1, gap: 2 },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold", fontWeight: "700" },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  section: {
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, gap: 14 },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium", fontWeight: "500" },
  rowValue: { fontSize: 13, fontFamily: "Inter_400Regular" },
  version: { textAlign: "center", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 32 },
});
