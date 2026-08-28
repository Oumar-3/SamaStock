import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SamaStockLogo } from "@/components/SamaStockLogo";
import { useColors } from "@/hooks/useColors";

export default function IntroScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const topPad = Platform.OS === "web" ? 28 : insets.top;
  const bottomPad = Platform.OS === "web" ? 28 : insets.bottom;
  const shellWidth = Platform.OS === "web" ? Math.min(Math.max(width - 32, 320), 460) : undefined;

  return (
    <LinearGradient colors={[colors.background, colors.secondary, colors.background]} style={styles.root}>
      <View style={[styles.shell, shellWidth ? { width: shellWidth } : null, { paddingTop: topPad + 18, paddingBottom: bottomPad + 18 }]}>
        <View style={styles.brandArea}>
          <View style={[styles.logoPlate, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.primary }]}>
            <SamaStockLogo size={82} />
          </View>
          <View style={styles.brandCopy}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>Gestion boutique simple</Text>
            <Text style={[styles.appName, { color: colors.text }]}>SamaStock</Text>
            <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
              Votre caisse, votre stock et vos dettes, toujours sous controle.
            </Text>
          </View>
          <View style={styles.benefitRow}>
            {[
              { icon: "wifi-off" as const, label: "Hors ligne" },
              { icon: "shopping-cart" as const, label: "Vente rapide" },
              { icon: "file-text" as const, label: "Recus PDF" },
            ].map(item => (
              <View key={item.label} style={[styles.benefitPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name={item.icon} size={14} color={colors.primary} />
                <Text style={[styles.benefitText, { color: colors.text }]}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.bottomArea}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
            onPress={() => router.push("/(auth)/register")}
            accessibilityRole="button"
            accessibilityLabel="Creer un compte SamaStock"
            activeOpacity={0.86}
          >
            <Text style={styles.primaryText}>Commencer</Text>
            <Feather name="arrow-right" size={18} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push("/(auth)/login")}
            accessibilityRole="button"
            accessibilityLabel="Se connecter a SamaStock"
            activeOpacity={0.82}
          >
            <Text style={[styles.secondaryText, { color: colors.text }]}>J'ai deja un compte</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.offlineBtn}
            onPress={() => router.push("/onboarding")}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Continuer sans compte"
          >
            <Text style={[styles.offlineText, { color: colors.mutedForeground }]}>Continuer hors ligne</Text>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center" },
  shell: { flex: 1, width: "100%", paddingHorizontal: 22, justifyContent: "space-between" },
  brandArea: { flex: 1, alignItems: "center", justifyContent: "center", gap: 22 },
  logoPlate: {
    width: 118,
    height: 118,
    borderRadius: 30,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 7,
  },
  brandCopy: { alignItems: "center", gap: 8 },
  eyebrow: { fontSize: 12, lineHeight: 16, fontFamily: "Inter_700Bold", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0 },
  appName: { fontSize: 40, lineHeight: 46, fontFamily: "Inter_700Bold", fontWeight: "800", textAlign: "center" },
  tagline: { maxWidth: 330, fontSize: 16, lineHeight: 23, fontFamily: "Inter_500Medium", fontWeight: "500", textAlign: "center" },
  benefitRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 9, marginTop: 4 },
  benefitPill: {
    minHeight: 38,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  benefitText: { fontSize: 12, fontFamily: "Inter_700Bold", fontWeight: "700" },
  bottomArea: { gap: 11 },
  primaryBtn: {
    minHeight: 56,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 5,
  },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontFamily: "Inter_700Bold", fontWeight: "700" },
  secondaryBtn: { minHeight: 54, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  secondaryText: { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "700" },
  offlineBtn: { minHeight: 42, alignItems: "center", justifyContent: "center" },
  offlineText: { fontSize: 13, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
});
