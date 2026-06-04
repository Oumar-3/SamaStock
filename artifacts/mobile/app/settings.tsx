import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SamaStockLogo } from "@/components/SamaStockLogo";
import { useAuth } from "@/context/AuthContext";
import { useDebts } from "@/context/DebtsContext";
import { useProducts } from "@/context/ProductsContext";
import { useSales } from "@/context/SalesContext";
import { useShopProfile } from "@/context/ShopProfileContext";
import { useColors } from "@/hooks/useColors";
import {
  disableLocalNotificationsAsync,
  getLocalNotificationsEnabledAsync,
  requestAndEnableLocalNotificationsAsync,
  refreshBusinessRemindersAsync,
} from "@/services/notifications/localNotifications";
import { getBackupOverviewAsync, type BackupOverview } from "@/services/sync/backupStatus";
import { syncBasicTablesAsync } from "@/services/sync/basicSync";

type FieldName = "shopName" | "ownerName" | "phone" | "address";

const FIELDS: Array<{
  name: FieldName;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  keyboardType?: "default" | "phone-pad";
}> = [
  { name: "shopName", label: "Nom de la boutique", icon: "shopping-bag" },
  { name: "ownerName", label: "Proprietaire", icon: "user" },
  { name: "phone", label: "Telephone", icon: "phone", keyboardType: "phone-pad" },
  { name: "address", label: "Adresse / quartier", icon: "map-pin" },
];

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, isLoading, saveProfile, refreshProfile } = useShopProfile();
  const { user, isConfigured, logout } = useAuth();
  const { lowStockSuggestions, refreshProducts } = useProducts();
  const { refreshSales } = useSales();
  const { totalOpenDebt, refreshDebts } = useDebts();

  const [form, setForm] = useState<Record<FieldName, string>>({
    shopName: "",
    ownerName: "",
    phone: "",
    address: "",
  });
  const [saving, setSaving] = useState(false);
  const [backupOverview, setBackupOverview] = useState<BackupOverview>({ pendingCount: 0, lastBackupAt: null });
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationsBusy, setNotificationsBusy] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    if (profile) {
      setForm({
        shopName: profile.shopName,
        ownerName: profile.ownerName,
        phone: profile.phone,
        address: profile.address,
      });
    }
  }, [profile]);

  useEffect(() => {
    void loadBackupOverview();
  }, [user]);

  useEffect(() => {
    void getLocalNotificationsEnabledAsync().then(setNotificationsEnabled).catch(() => setNotificationsEnabled(false));
  }, []);

  async function loadBackupOverview() {
    setBackupLoading(true);
    try {
      setBackupOverview(await getBackupOverviewAsync());
    } finally {
      setBackupLoading(false);
    }
  }

  function updateField(name: FieldName, value: string) {
    setForm(prev => ({ ...prev, [name]: value }));
  }

  async function handleSave() {
    if (!form.shopName.trim()) {
      Alert.alert("Champ requis", "Le nom de la boutique est obligatoire.");
      return;
    }
    if (!form.ownerName.trim()) {
      Alert.alert("Champ requis", "Le nom du proprietaire est obligatoire.");
      return;
    }

    setSaving(true);
    try {
      await saveProfile(form);
      await loadBackupOverview();
      Alert.alert("Profil enregistre", "Les informations de la boutique ont ete mises a jour.");
    } catch (err) {
      Alert.alert("Erreur", err instanceof Error ? err.message : "Impossible d'enregistrer le profil.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    Alert.alert(
      "Se deconnecter ?",
      "Vous pourrez vous reconnecter avec le meme compte pour retrouver vos donnees sauvegardees.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Deconnexion",
          style: "destructive",
          onPress: () => {
            void performLogout();
          },
        },
      ],
    );
  }

  async function performLogout() {
    try {
      await logout();
      router.replace("/intro");
    } catch (err) {
      Alert.alert("Erreur", err instanceof Error ? err.message : "Impossible de se deconnecter.");
    }
  }

  async function handleBackupNow() {
    if (!user) {
      router.push("/(auth)/login");
      return;
    }

    setBackupBusy(true);
    try {
      const results = await syncBasicTablesAsync();
      await Promise.all([refreshProfile(), refreshProducts(), refreshSales(), refreshDebts()]);
      await loadBackupOverview();

      const sent = results.reduce((total, result) => total + result.pushed, 0);
      const received = results.reduce((total, result) => total + result.pulled, 0);
      Alert.alert(
        "Sauvegarde terminee",
        sent + received > 0 ? `Envoyes: ${sent} • Recuperes: ${received}` : "Tout est deja a jour.",
      );
    } catch (err) {
      Alert.alert("Sauvegarde impossible", err instanceof Error ? err.message : "Reessayez dans quelques instants.");
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleToggleNotifications() {
    setNotificationsBusy(true);
    try {
      if (notificationsEnabled) {
        await disableLocalNotificationsAsync();
        setNotificationsEnabled(false);
      } else {
        const enabled = await requestAndEnableLocalNotificationsAsync();
        setNotificationsEnabled(enabled);
        if (!enabled) {
          Alert.alert("Notifications refusees", "Activez les notifications dans les reglages du telephone pour recevoir les rappels.");
        } else {
          await refreshBusinessRemindersAsync({
            lowStockCount: lowStockSuggestions.length,
            totalOpenDebt,
          });
        }
      }
    } catch (err) {
      Alert.alert("Notifications", err instanceof Error ? err.message : "Impossible de modifier les notifications.");
    } finally {
      setNotificationsBusy(false);
    }
  }

  function formatBackupDate(value: string | null) {
    if (!value) return "Jamais";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Jamais";
    return date.toLocaleString("fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const backupTitle = !user
    ? "Sauvegarde locale"
    : backupOverview.pendingCount > 0
      ? "Sauvegarde en attente"
      : "Sauvegarde a jour";
  const backupSubtitle = !user
    ? "Vos donnees restent sur ce telephone."
    : backupOverview.pendingCount > 0
      ? `${backupOverview.pendingCount} changement${backupOverview.pendingCount > 1 ? "s" : ""} a sauvegarder.`
      : `Derniere sauvegarde : ${formatBackupDate(backupOverview.lastBackupAt)}`;
  const accountState = user ? "Connecte" : "Local";
  const backupState = user
    ? backupOverview.pendingCount > 0
      ? `${backupOverview.pendingCount} en attente`
      : "A jour"
    : "Telephone";

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.topBar, { paddingTop: topPad + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: colors.muted }]}>
            <Feather name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Parametres</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: bottomPad + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.brandCard, { backgroundColor: colors.primaryDark }]}>
            <View style={styles.brandMain}>
              <View style={styles.brandIcon}>
                <SamaStockLogo size={38} />
              </View>
              <View style={styles.brandText}>
                <Text style={styles.brandName}>SamaStock</Text>
                <Text style={styles.brandSubtitle}>
                  {user ? "Compte actif et sauvegarde disponible" : "Mode local, sauvegarde sur ce telephone"}
                </Text>
              </View>
            </View>
            <View style={styles.brandMetaRow}>
              <View style={styles.brandPill}>
                <Feather name={user ? "cloud" : "smartphone"} size={14} color="#FFFFFF" />
                <Text style={styles.brandPillText}>{accountState}</Text>
              </View>
              <View style={styles.brandPill}>
                <Feather name={notificationsEnabled ? "bell" : "bell-off"} size={14} color="#FFFFFF" />
                <Text style={styles.brandPillText}>{notificationsEnabled ? "Rappels actifs" : "Rappels off"}</Text>
              </View>
            </View>
          </View>

          <View style={styles.quickGrid}>
            <View style={[styles.quickTile, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.quickIcon, { backgroundColor: colors.primary + "12" }]}>
                <Feather name={user ? "user-check" : "user"} size={18} color={colors.primary} />
              </View>
              <Text style={[styles.quickLabel, { color: colors.mutedForeground }]}>Compte</Text>
              <Text style={[styles.quickValue, { color: colors.text }]} numberOfLines={1}>{user?.email ?? "Non connecte"}</Text>
            </View>
            <View style={[styles.quickTile, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.quickIcon, { backgroundColor: (backupOverview.pendingCount > 0 ? colors.warning : colors.success) + "12" }]}>
                <Feather name={backupOverview.pendingCount > 0 ? "clock" : "check-circle"} size={18} color={backupOverview.pendingCount > 0 ? colors.warning : colors.success} />
              </View>
              <Text style={[styles.quickLabel, { color: colors.mutedForeground }]}>Sauvegarde</Text>
              <Text style={[styles.quickValue, { color: colors.text }]}>{backupLoading ? "Verification..." : backupState}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Profil boutique</Text>
              <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>Informations visibles sur les recus.</Text>
            </View>
            <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {isLoading ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : (
                FIELDS.map(field => (
                  <View key={field.name} style={styles.field}>
                    <Text style={[styles.label, { color: colors.mutedForeground }]}>{field.label}</Text>
                    <View style={[styles.inputBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
                      <Feather name={field.icon} size={17} color={colors.mutedForeground} />
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        value={form[field.name]}
                        onChangeText={value => updateField(field.name, value)}
                        placeholder={field.label}
                        placeholderTextColor={colors.mutedForeground}
                        keyboardType={field.keyboardType ?? "default"}
                      />
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.75 }]}
            onPress={handleSave}
            disabled={saving || isLoading}
            activeOpacity={0.85}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Feather name="save" size={18} color="#fff" />}
            {!saving && <Text style={styles.saveBtnText}>Enregistrer</Text>}
          </TouchableOpacity>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Sauvegarde</Text>
              <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>Protection et recuperation des donnees.</Text>
            </View>
            <View style={[styles.cloudCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cloudHeader}>
                <View style={[styles.cloudIcon, { backgroundColor: user ? colors.primary + "16" : colors.warning + "16" }]}>
                  <Feather name={user ? "cloud" : "smartphone"} size={20} color={user ? colors.primary : colors.warning} />
                </View>
                <View style={styles.cloudText}>
                  <Text style={[styles.cloudTitle, { color: colors.text }]}>{backupTitle}</Text>
                  <Text style={[styles.cloudSubtitle, { color: colors.mutedForeground }]} numberOfLines={2}>
                    {backupLoading ? "Verification en cours..." : backupSubtitle}
                  </Text>
                </View>
              </View>

              {user ? (
                <View style={[styles.notice, { backgroundColor: colors.success + "12", borderColor: colors.success + "25" }]}>
                  <Feather name="check-circle" size={16} color={colors.success} />
                  <Text style={[styles.noticeText, { color: colors.success }]}>Sauvegarde automatique active.</Text>
                </View>
              ) : (
                <View style={[styles.notice, { backgroundColor: colors.warning + "12", borderColor: colors.warning + "25" }]}>
                  <Feather name="info" size={16} color={colors.warning} />
                  <Text style={[styles.noticeText, { color: colors.warning }]}>Connectez un compte pour retrouver vos donnees plus tard.</Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.cloudBtn, { backgroundColor: user ? colors.primary : colors.text }, (backupBusy || backupLoading) && { opacity: 0.7 }]}
                onPress={handleBackupNow}
                disabled={backupBusy || backupLoading}
                activeOpacity={0.85}
              >
                {backupBusy ? <ActivityIndicator color="#fff" /> : <Feather name={user ? "upload-cloud" : "log-in"} size={18} color="#fff" />}
                {!backupBusy && <Text style={styles.cloudBtnText}>{user ? "Sauvegarder maintenant" : "Se connecter"}</Text>}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Notifications</Text>
              <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>Rappels utiles, sans bruit inutile.</Text>
            </View>
            <View style={[styles.cloudCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cloudHeader}>
                <View style={[styles.cloudIcon, { backgroundColor: (notificationsEnabled ? colors.primary : colors.mutedForeground) + "16" }]}>
                  <Feather name="bell" size={20} color={notificationsEnabled ? colors.primary : colors.mutedForeground} />
                </View>
                <View style={styles.cloudText}>
                  <Text style={[styles.cloudTitle, { color: colors.text }]}>
                    {notificationsEnabled ? "Notifications activees" : "Notifications desactivees"}
                  </Text>
                  <Text style={[styles.cloudSubtitle, { color: colors.mutedForeground }]} numberOfLines={2}>
                    Rappel quand le stock ou les dettes changent.
                  </Text>
                </View>
              </View>

              <View style={[styles.notice, { backgroundColor: colors.info + "12", borderColor: colors.info + "25" }]}>
                <Feather name="bell" size={16} color={colors.info} />
                <Text style={[styles.noticeText, { color: colors.info }]}>
                  Aujourd'hui : {lowStockSuggestions.length} stock faible • {Math.round(totalOpenDebt).toLocaleString("fr-FR")} FCFA a recuperer.
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.cloudBtn, { backgroundColor: notificationsEnabled ? colors.destructive : colors.primary }, notificationsBusy && { opacity: 0.7 }]}
                onPress={handleToggleNotifications}
                disabled={notificationsBusy}
                activeOpacity={0.85}
              >
                {notificationsBusy ? <ActivityIndicator color="#fff" /> : <Feather name={notificationsEnabled ? "bell-off" : "bell"} size={18} color="#fff" />}
                {!notificationsBusy && <Text style={styles.cloudBtnText}>{notificationsEnabled ? "Desactiver" : "Activer les notifications"}</Text>}
              </TouchableOpacity>

            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Compte</Text>
              <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>Connexion et acces cloud.</Text>
            </View>
            <View style={[styles.cloudCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cloudHeader}>
                <View style={[styles.cloudIcon, { backgroundColor: colors.primary + "16" }]}>
                  <Feather name={user ? "cloud" : "log-in"} size={20} color={colors.primary} />
                </View>
                <View style={styles.cloudText}>
                  <Text style={[styles.cloudTitle, { color: colors.text }]}>
                    {user ? "Compte connecte" : "Compte non connecte"}
                  </Text>
                  <Text style={[styles.cloudSubtitle, { color: colors.mutedForeground }]} numberOfLines={2}>
                    {user?.email ?? "Connectez-vous pour retrouver vos donnees sur un autre telephone."}
                  </Text>
                </View>
              </View>

              {user ? (
                <TouchableOpacity
                  style={[styles.logoutBtn, { borderColor: colors.destructive + "45", backgroundColor: colors.destructive + "10" }]}
                  onPress={handleLogout}
                  activeOpacity={0.8}
                >
                  <Feather name="log-out" size={18} color={colors.destructive} />
                  <Text style={[styles.logoutBtnText, { color: colors.destructive }]}>Deconnexion</Text>
                </TouchableOpacity>
              ) : null}

              {!isConfigured ? (
                <View style={[styles.notice, { backgroundColor: colors.destructive + "12", borderColor: colors.destructive + "25" }]}>
                  <Feather name="alert-circle" size={16} color={colors.destructive} />
                  <Text style={[styles.noticeText, { color: colors.destructive }]}>La connexion n'est pas disponible sur cette installation.</Text>
                </View>
              ) : null}

              {!user ? (
                <>
                  <TouchableOpacity
                    style={[styles.cloudBtn, { backgroundColor: colors.primary }, !isConfigured && { opacity: 0.55 }]}
                    onPress={() => router.push("/(auth)/login")}
                    disabled={!isConfigured}
                    activeOpacity={0.85}
                  >
                    <Feather name="log-in" size={18} color="#fff" />
                    <Text style={styles.cloudBtnText}>Se connecter</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.secondaryBtn, { borderColor: colors.border }]}
                    onPress={() => router.push("/(auth)/register")}
                    disabled={!isConfigured}
                  >
                    <Feather name="user-plus" size={18} color={colors.primary} />
                    <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Creer un compte</Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Application</Text>
            </View>
            <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <InfoRow label="Devise" value="FCFA" />
              <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />
              <InfoRow label="Stockage" value={user ? "Telephone + compte" : "Telephone"} />
              <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />
              <InfoRow label="Version" value="1.0.0" />
            </View>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );

  function InfoRow({ label, value }: { label: string; value: string }) {
    return (
      <View style={styles.infoRow}>
        <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, gap: 12 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 20, fontFamily: "Inter_700Bold", fontWeight: "700", textAlign: "center" },
  body: { padding: 16, gap: 16 },
  brandCard: { borderRadius: 22, padding: 18, gap: 18, overflow: "hidden" },
  brandMain: { flexDirection: "row", alignItems: "center", gap: 13 },
  brandIcon: { width: 54, height: 54, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.14)" },
  brandText: { flex: 1, gap: 2 },
  brandName: { color: "#FFFFFF", fontSize: 22, fontFamily: "Inter_700Bold", fontWeight: "700" },
  brandSubtitle: { color: "rgba(255,255,255,0.78)", fontSize: 12, lineHeight: 17, fontFamily: "Inter_500Medium", fontWeight: "500" },
  brandMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  brandPill: { minHeight: 31, borderRadius: 999, paddingHorizontal: 11, alignItems: "center", flexDirection: "row", gap: 7, backgroundColor: "rgba(255,255,255,0.13)" },
  brandPillText: { color: "#FFFFFF", fontSize: 12, fontFamily: "Inter_700Bold", fontWeight: "700" },
  quickGrid: { flexDirection: "row", gap: 10 },
  quickTile: { flex: 1, minHeight: 108, borderRadius: 16, borderWidth: 1, padding: 13, gap: 7 },
  quickIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 3 },
  quickLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", fontWeight: "600", textTransform: "uppercase" },
  quickValue: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_700Bold", fontWeight: "700" },
  section: { gap: 10 },
  sectionHeader: { gap: 2, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_700Bold", fontWeight: "700", textTransform: "uppercase" },
  sectionHint: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  formCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 14 },
  field: { gap: 7 },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  inputBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 12, gap: 10 },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  loadingBox: { padding: 24 },
  saveBtn: { minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9 },
  saveBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "700" },
  cloudCard: { borderRadius: 16, borderWidth: 1, padding: 15, gap: 12 },
  cloudHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  cloudIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cloudText: { flex: 1, gap: 2 },
  cloudTitle: { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "700" },
  cloudSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 12, padding: 11 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: "Inter_500Medium", fontWeight: "500" },
  cloudBtn: { minHeight: 48, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9 },
  cloudBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "700" },
  secondaryBtn: { minHeight: 46, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9 },
  secondaryBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700" },
  logoutBtn: { minHeight: 48, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9 },
  logoutBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700" },
  infoCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 15, paddingVertical: 14, gap: 12 },
  infoLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  infoValue: { flexShrink: 1, textAlign: "right", fontSize: 14, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  infoDivider: { height: 1 },
});
