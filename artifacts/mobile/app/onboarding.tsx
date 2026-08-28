import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SamaStockLogo } from "@/components/SamaStockLogo";
import { useAuth } from "@/context/AuthContext";
import { useShopProfile } from "@/context/ShopProfileContext";
import { useColors } from "@/hooks/useColors";
import {
  createLocalMainShopForCloudUserAsync,
  createLocalMainShopForOfflineAsync,
  enableOfflineModeAsync,
} from "@/services/localAccountData";

type FieldName = "shopName" | "ownerName" | "phone" | "address";

const FIELDS: Array<{
  name: FieldName;
  label: string;
  placeholder: string;
  icon: keyof typeof Feather.glyphMap;
  optional?: boolean;
  keyboardType?: "default" | "phone-pad";
}> = [
  { name: "shopName", label: "Nom de la boutique", placeholder: "Ex: Boutique Awa", icon: "shopping-bag" },
  { name: "ownerName", label: "Proprietaire", placeholder: "Votre nom", icon: "user" },
  { name: "phone", label: "Telephone", placeholder: "77 000 00 00", icon: "phone", optional: true, keyboardType: "phone-pad" },
  { name: "address", label: "Adresse ou quartier", placeholder: "Ex: Medina, Dakar", icon: "map-pin", optional: true },
];

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { saveProfile } = useShopProfile();
  const { user } = useAuth();

  const [form, setForm] = useState<Record<FieldName, string>>({
    shopName: "",
    ownerName: "",
    phone: "",
    address: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm(prev => ({
      ...prev,
      shopName: user.shopName || prev.shopName,
      ownerName: user.name || prev.ownerName,
    }));
  }, [user]);

  const topPad = Platform.OS === "web" ? 24 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const shellWidth = Platform.OS === "web" ? Math.min(Math.max(width - 32, 320), 620) : undefined;

  function updateField(name: FieldName, value: string) {
    setError("");
    setForm(prev => ({ ...prev, [name]: value }));
  }

  async function handleStart() {
    if (!form.shopName.trim()) return setError("Le nom de la boutique est requis.");
    if (!form.ownerName.trim()) return setError("Le nom du proprietaire est requis.");

    setError("");
    setSaving(true);
    try {
      if (user) {
        await createLocalMainShopForCloudUserAsync(user.id, form.shopName, form.ownerName);
      } else {
        await enableOfflineModeAsync();
        await createLocalMainShopForOfflineAsync(form.shopName, form.ownerName);
      }
      await saveProfile(form);
      router.replace("/(tabs)");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de sauvegarder la boutique.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[styles.content, { paddingTop: topPad + 10, paddingBottom: bottomPad + 160 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.shell, shellWidth ? { width: shellWidth } : null]}>
          <View style={styles.topBar}>
            <TouchableOpacity
              style={[styles.backBtn, { backgroundColor: colors.muted }]}
              onPress={() => router.back()}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel="Retour"
            >
              <Feather name="arrow-left" size={21} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.topTitle, { color: colors.text }]}>Configurer la boutique</Text>
            <View style={styles.topSpacer} />
          </View>

          <View style={styles.heading}>
            <View style={[styles.logoPlate, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.primary }]}>
              <SamaStockLogo size={48} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Votre boutique</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Quelques informations suffisent pour commencer.</Text>
          </View>

          {!user ? (
            <View style={[styles.localNotice, { backgroundColor: colors.secondary, borderColor: colors.primary + "25" }]}>
              <View style={[styles.localIcon, { backgroundColor: colors.card }]}>
                <Feather name="smartphone" size={19} color={colors.primary} />
              </View>
              <View style={styles.localCopy}>
                <Text style={[styles.localTitle, { color: colors.secondaryForeground }]}>Mode hors ligne</Text>
                <Text style={[styles.localText, { color: colors.mutedForeground }]}>Les donnees restent sur ce telephone. Un compte pourra etre connecte plus tard.</Text>
              </View>
            </View>
          ) : null}

          <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {error ? (
              <View style={[styles.errorBox, { backgroundColor: colors.destructive + "12" }]}>
                <Feather name="alert-circle" size={17} color={colors.destructive} />
                <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
              </View>
            ) : null}

            {FIELDS.map(field => (
              <View key={field.name} style={styles.field}>
                <View style={styles.labelRow}>
                  <Text style={[styles.label, { color: colors.text }]}>{field.label}</Text>
                  {field.optional ? <Text style={[styles.optional, { color: colors.mutedForeground }]}>Optionnel</Text> : null}
                </View>
                <View style={[styles.inputBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Feather name={field.icon} size={18} color={colors.mutedForeground} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder={field.placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    value={form[field.name]}
                    onChangeText={value => updateField(field.name, value)}
                    keyboardType={field.keyboardType ?? "default"}
                    autoCapitalize={field.name === "phone" ? "none" : "words"}
                    returnKeyType={field.name === "address" ? "done" : "next"}
                  />
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }, saving && styles.disabled]}
            onPress={handleStart}
            disabled={saving}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={user ? "Enregistrer la boutique" : "Commencer hors ligne"}
          >
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Feather name={user ? "check" : "arrow-right"} size={19} color="#FFFFFF" />}
            {!saving ? <Text style={styles.primaryBtnText}>{user ? "Enregistrer la boutique" : "Commencer hors ligne"}</Text> : null}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { alignItems: "center", paddingHorizontal: 16 },
  shell: { width: "100%", gap: 18 },
  topBar: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  topTitle: { flex: 1, textAlign: "center", fontSize: 16, fontFamily: "Inter_700Bold", fontWeight: "700" },
  topSpacer: { width: 44 },
  heading: { alignItems: "center", gap: 7, paddingVertical: 8 },
  logoPlate: {
    width: 68,
    height: 68,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 5,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", fontWeight: "700" },
  subtitle: { fontSize: 14, lineHeight: 20, fontFamily: "Inter_400Regular", textAlign: "center" },
  localNotice: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: "row", alignItems: "center", gap: 11 },
  localIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  localCopy: { flex: 1, gap: 2 },
  localTitle: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700" },
  localText: { fontSize: 12, lineHeight: 17, fontFamily: "Inter_400Regular" },
  formCard: { borderWidth: 1, borderRadius: 16, padding: 15, gap: 15 },
  field: { gap: 7 },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  optional: { fontSize: 11, fontFamily: "Inter_400Regular" },
  inputBox: { minHeight: 50, flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, gap: 10 },
  input: { flex: 1, minHeight: 48, fontSize: 16, fontFamily: "Inter_400Regular" },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 11, borderRadius: 12 },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: "Inter_500Medium", fontWeight: "500" },
  primaryBtn: { minHeight: 54, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9 },
  primaryBtnText: { color: "#FFFFFF", fontSize: 16, fontFamily: "Inter_700Bold", fontWeight: "700" },
  disabled: { opacity: 0.65 },
});
