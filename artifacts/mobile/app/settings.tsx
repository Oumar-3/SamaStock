import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
import {
  deleteAllProductImagesAsync,
  deleteSelectedProductImagesAsync,
  deleteUnusedProductImagesAsync,
  formatProductImagesSize,
  getProductImagesOverviewAsync,
  listProductImagesAsync,
  type ProductImageFileInfo,
} from "@/utils/productImages";

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
  const { products, lowStockSuggestions, refreshProducts, clearAllImages, clearImageUris } = useProducts();
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
  const [photoOverview, setPhotoOverview] = useState({ count: 0, totalBytes: 0, unusedCount: 0, unusedBytes: 0 });
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<ProductImageFileInfo[]>([]);
  const [selectedPhotoUris, setSelectedPhotoUris] = useState<string[]>([]);

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

  useEffect(() => {
    void loadPhotoOverview();
  }, [products]);

  async function loadBackupOverview() {
    setBackupLoading(true);
    try {
      setBackupOverview(await getBackupOverviewAsync());
    } finally {
      setBackupLoading(false);
    }
  }

  async function loadPhotoOverview() {
    setPhotoOverview(await getProductImagesOverviewAsync(products.map(product => product.imageUri)));
  }

  async function loadPhotoFiles() {
    setPhotoFiles(await listProductImagesAsync(products.map(product => product.imageUri)));
  }

  async function openPhotoManager() {
    await loadPhotoFiles();
    setSelectedPhotoUris([]);
    setPhotoModalVisible(true);
  }

  function togglePhotoSelection(uri: string) {
    setSelectedPhotoUris(prev => prev.includes(uri) ? prev.filter(item => item !== uri) : [...prev, uri]);
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
      if (user) {
        try {
          await syncBasicTablesAsync();
        } catch (syncError) {
          console.warn("Logout backup failed", syncError);
        }
      }
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
        sent + received > 0 ? `Envoyes: ${sent} - Recuperes: ${received}` : "Tout est deja a jour.",
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


  async function handleDeleteUnusedPhotos() {
    setPhotoBusy(true);
    try {
      const deleted = await deleteUnusedProductImagesAsync(products.map(product => product.imageUri));
      await loadPhotoOverview();
      Alert.alert("Photos nettoyees", deleted > 0 ? `${deleted} photo${deleted > 1 ? "s" : ""} supprimee${deleted > 1 ? "s" : ""}.` : "Aucune photo inutile a supprimer.");
    } catch (err) {
      Alert.alert("Photos produits", err instanceof Error ? err.message : "Impossible de nettoyer les photos.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleDeleteSelectedPhotos() {
    if (selectedPhotoUris.length === 0) return;

    Alert.alert(
      "Supprimer la selection ?",
      "Les produits lies a ces photos resteront dans l'app, mais l'image sera retiree.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            setPhotoBusy(true);
            try {
              const deleted = await deleteSelectedProductImagesAsync(selectedPhotoUris);
              await clearImageUris(selectedPhotoUris);
              await refreshProducts();
              await loadPhotoOverview();
              await loadPhotoFiles();
              setSelectedPhotoUris([]);
              Alert.alert("Photos supprimees", `${deleted} photo${deleted > 1 ? "s" : ""} supprimee${deleted > 1 ? "s" : ""}.`);
            } catch (err) {
              Alert.alert("Photos produits", err instanceof Error ? err.message : "Impossible de supprimer la selection.");
            } finally {
              setPhotoBusy(false);
            }
          },
        },
      ],
    );
  }
  async function handleDeleteAllPhotos() {
    Alert.alert(
      "Supprimer les photos ?",
      "Les produits resteront dans l'app, mais leurs images seront retirees de ce telephone.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            setPhotoBusy(true);
            try {
              const deleted = await deleteAllProductImagesAsync();
              await clearAllImages();
              await loadPhotoOverview();
              Alert.alert("Photos supprimees", `${deleted} photo${deleted > 1 ? "s" : ""} supprimee${deleted > 1 ? "s" : ""}.`);
            } catch (err) {
              Alert.alert("Photos produits", err instanceof Error ? err.message : "Impossible de supprimer les photos.");
            } finally {
              setPhotoBusy(false);
            }
          },
        },
      ],
    );
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
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  const appBuild = Constants.expoConfig?.android?.versionCode ? "Build " + Constants.expoConfig.android.versionCode : "Beta";

  const isProfileDirty =
    !profile ||
    form.shopName !== profile.shopName ||
    form.ownerName !== profile.ownerName ||
    form.phone !== profile.phone ||
    form.address !== profile.address;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
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
          <Text style={[styles.title, { color: colors.text }]}>Parametres</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: bottomPad + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Compte</Text>
              <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>Connexion et sauvegarde cloud.</Text>
            </View>
            <View style={[styles.accountCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.accountTopRow}>
                <View style={[styles.accountIcon, { backgroundColor: user ? colors.primary + "16" : colors.warning + "16" }]}>
                  <Feather name={user ? "shield" : "smartphone"} size={22} color={user ? colors.primary : colors.warning} />
                </View>
                <View style={styles.accountText}>
                  <Text style={[styles.accountTitle, { color: colors.text }]}>{user ? "Compte connecte" : "Mode local"}</Text>
                  <Text style={[styles.accountSubtitle, { color: colors.mutedForeground }]} numberOfLines={2}>
                    {user?.email ?? "Vos donnees restent sur ce telephone tant que vous ne connectez pas un compte."}
                  </Text>
                </View>
              </View>

              {!isConfigured ? (
                <View style={[styles.notice, { backgroundColor: colors.destructive + "12", borderColor: colors.destructive + "25" }]}>
                  <Feather name="alert-circle" size={16} color={colors.destructive} />
                  <Text style={[styles.noticeText, { color: colors.destructive }]}>La connexion n'est pas disponible sur cette installation.</Text>
                </View>
              ) : null}

              {!user ? (
                <View style={styles.accountActions}>
                  <TouchableOpacity
                    style={[styles.cloudBtn, { backgroundColor: colors.primary }, !isConfigured && { opacity: 0.55 }]}
                    onPress={() => router.push("/(auth)/login")}
                    disabled={!isConfigured}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Se connecter"
                    accessibilityState={{ disabled: !isConfigured }}
                  >
                    <Feather name="log-in" size={18} color="#fff" />
                    <Text style={styles.cloudBtnText}>Se connecter</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.secondaryBtn, { borderColor: colors.border }]}
                    onPress={() => router.push("/(auth)/register")}
                    disabled={!isConfigured}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Creer un compte"
                    accessibilityState={{ disabled: !isConfigured }}
                  >
                    <Feather name="user-plus" size={18} color={colors.primary} />
                    <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Creer un compte</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[styles.notice, { backgroundColor: colors.success + "12", borderColor: colors.success + "25" }]}>
                  <Feather name="check-circle" size={16} color={colors.success} />
                  <Text style={[styles.noticeText, { color: colors.success }]}>Vos donnees peuvent etre recuperees avec ce compte.</Text>
                </View>
              )}
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
            style={[styles.saveBtn, { backgroundColor: colors.primary }, (saving || isLoading || !isProfileDirty) && { opacity: 0.5 }]}
            onPress={handleSave}
            disabled={saving || isLoading || !isProfileDirty}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Enregistrer le profil boutique"
            accessibilityState={{ disabled: saving || isLoading || !isProfileDirty, busy: saving }}
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

              {user ? (
                <TouchableOpacity
                  style={[styles.cloudBtn, { backgroundColor: colors.primary }, (backupBusy || backupLoading) && { opacity: 0.7 }]}
                  onPress={handleBackupNow}
                  disabled={backupBusy || backupLoading}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Sauvegarder maintenant"
                  accessibilityState={{ disabled: backupBusy || backupLoading, busy: backupBusy }}
                >
                  {backupBusy ? <ActivityIndicator color="#fff" /> : <Feather name="upload-cloud" size={18} color="#fff" />}
                  {!backupBusy ? <Text style={styles.cloudBtnText}>Sauvegarder maintenant</Text> : null}
                </TouchableOpacity>
              ) : null}
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
                    Un rappel quotidien pour le stock faible et les dettes.
                  </Text>
                </View>
              </View>

              <View style={[styles.notice, { backgroundColor: colors.info + "12", borderColor: colors.info + "25" }]}>
                <Feather name="bell" size={16} color={colors.info} />
                <Text style={[styles.noticeText, { color: colors.info }]}>
                  Aujourd'hui : {lowStockSuggestions.length} stock faible - {Math.round(totalOpenDebt).toLocaleString("fr-FR")} FCFA a recuperer.
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.cloudBtn, { backgroundColor: notificationsEnabled ? colors.destructive : colors.primary }, notificationsBusy && { opacity: 0.7 }]}
                onPress={handleToggleNotifications}
                disabled={notificationsBusy}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={notificationsEnabled ? "Desactiver les notifications" : "Activer les notifications"}
                accessibilityState={{ disabled: notificationsBusy, busy: notificationsBusy }}
              >
                {notificationsBusy ? <ActivityIndicator color="#fff" /> : <Feather name={notificationsEnabled ? "bell-off" : "bell"} size={18} color="#fff" />}
                {!notificationsBusy && <Text style={styles.cloudBtnText}>{notificationsEnabled ? "Desactiver" : "Activer les notifications"}</Text>}
              </TouchableOpacity>

            </View>
          </View>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Photos produits</Text>
              <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>Stockees uniquement sur ce telephone.</Text>
            </View>
            <View style={[styles.cloudCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
              <View style={styles.cloudHeader}>
                <View style={[styles.cloudIcon, { backgroundColor: colors.primary + "16" }]}> 
                  <Feather name="image" size={20} color={colors.primary} />
                </View>
                <View style={styles.cloudText}>
                  <Text style={[styles.cloudTitle, { color: colors.text }]}>Photos locales</Text>
                  <Text style={[styles.cloudSubtitle, { color: colors.mutedForeground }]} numberOfLines={2}>
                    {photoOverview.count} photo{photoOverview.count > 1 ? "s" : ""} - {formatProductImagesSize(photoOverview.totalBytes)} utilise{photoOverview.totalBytes > 0 ? "s" : ""}.
                  </Text>
                </View>
              </View>

              <View style={[styles.notice, { backgroundColor: colors.info + "12", borderColor: colors.info + "25" }]}> 
                <Feather name="smartphone" size={16} color={colors.info} />
                <Text style={[styles.noticeText, { color: colors.info }]}>Les photos ne sont pas envoyees au cloud. En changeant de telephone, les produits reviennent sans photo.</Text>
              </View>

              <TouchableOpacity
                style={[styles.cloudBtn, { backgroundColor: colors.primary }, photoBusy && { opacity: 0.65 }]}
                onPress={openPhotoManager}
                disabled={photoBusy || photoOverview.count === 0}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Voir les photos produits"
                accessibilityState={{ disabled: photoBusy || photoOverview.count === 0, busy: photoBusy }}
              >
                <Feather name="grid" size={18} color="#fff" />
                <Text style={styles.cloudBtnText}>Voir les photos</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.border }, photoBusy && { opacity: 0.65 }]}
                onPress={handleDeleteUnusedPhotos}
                disabled={photoBusy || photoOverview.unusedCount === 0}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Supprimer les photos inutilisees"
                accessibilityState={{ disabled: photoBusy || photoOverview.unusedCount === 0, busy: photoBusy }}
              >
                <Feather name="trash-2" size={18} color={colors.primary} />
                <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Nettoyer inutilisees</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.logoutBtn, { borderColor: colors.destructive + "45", backgroundColor: colors.destructive + "10" }, photoBusy && { opacity: 0.65 }]}
                onPress={handleDeleteAllPhotos}
                disabled={photoBusy || photoOverview.count === 0}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Supprimer toutes les photos produits"
                accessibilityState={{ disabled: photoBusy || photoOverview.count === 0, busy: photoBusy }}
              >
                <Feather name="trash" size={18} color={colors.destructive} />
                <Text style={[styles.logoutBtnText, { color: colors.destructive }]}>Supprimer toutes les photos</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Application</Text>
              <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>Quelques reperes utiles.</Text>
            </View>
            <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <InfoRow icon="dollar-sign" label="Devise" value="FCFA" helper="Prix, ventes et dettes" />
              <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />
              <InfoRow
                icon={user ? "cloud" : "smartphone"}
                label="Stockage"
                value={user ? "Telephone + cloud" : "Telephone"}
                helper={user ? "Donnees cloud, photos telephone" : "Mode local active"}
              />
              <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />
              <InfoRow icon="info" label="Version" value={appVersion} helper={appBuild} />
            </View>
          </View>
          {user ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.destructive }]}>Session</Text>
                <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>Quitter ce compte sur cet appareil.</Text>
              </View>
              <View style={[styles.dangerCard, { backgroundColor: colors.card, borderColor: colors.destructive + "25" }]}>
                <View style={styles.cloudHeader}>
                  <View style={[styles.cloudIcon, { backgroundColor: colors.destructive + "12" }]}>
                    <Feather name="log-out" size={20} color={colors.destructive} />
                  </View>
                  <View style={styles.cloudText}>
                    <Text style={[styles.cloudTitle, { color: colors.text }]}>Deconnexion</Text>
                    <Text style={[styles.cloudSubtitle, { color: colors.mutedForeground }]} numberOfLines={2}>
                      Vos donnees locales restent sur ce telephone.
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.logoutBtn, { borderColor: colors.destructive + "45", backgroundColor: colors.destructive + "10" }]}
                  onPress={handleLogout}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Se deconnecter"
                >
                  <Feather name="log-out" size={18} color={colors.destructive} />
                  <Text style={[styles.logoutBtnText, { color: colors.destructive }]}>Se deconnecter</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </ScrollView>

        <Modal
          visible={photoModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setPhotoModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.photoSheet, { backgroundColor: colors.background, paddingBottom: bottomPad + 14 }]}> 
              <View style={styles.photoSheetHeader}>
                <View>
                  <Text style={[styles.photoSheetTitle, { color: colors.text }]}>Photos produits</Text>
                  <Text style={[styles.photoSheetHint, { color: colors.mutedForeground }]}>
                    {selectedPhotoUris.length > 0 ? `${selectedPhotoUris.length} selectionnee${selectedPhotoUris.length > 1 ? "s" : ""}` : `${photoFiles.length} photo${photoFiles.length > 1 ? "s" : ""} locale${photoFiles.length > 1 ? "s" : ""}`}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.iconBtn, { backgroundColor: colors.muted }]}
                  onPress={() => setPhotoModalVisible(false)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Fermer les photos produits"
                >
                  <Feather name="x" size={22} color={colors.text} />
                </TouchableOpacity>
              </View>

              {photoFiles.length === 0 ? (
                <View style={[styles.emptyPhotos, { borderColor: colors.border, backgroundColor: colors.card }]}> 
                  <Feather name="image" size={28} color={colors.mutedForeground} />
                  <Text style={[styles.emptyPhotosTitle, { color: colors.text }]}>Aucune photo locale</Text>
                  <Text style={[styles.emptyPhotosText, { color: colors.mutedForeground }]}>Les images ajoutees aux produits apparaitront ici.</Text>
                </View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.photoGrid}>
                  {photoFiles.map(file => {
                    const selected = selectedPhotoUris.includes(file.uri);
                    return (
                      <TouchableOpacity
                        key={file.uri}
                        style={[styles.photoTile, { backgroundColor: colors.card, borderColor: selected ? colors.primary : colors.border }]}
                        onPress={() => togglePhotoSelection(file.uri)}
                        activeOpacity={0.85}
                        accessibilityRole="checkbox"
                        accessibilityLabel={file.isUsed ? "Photo utilisee par un produit" : "Photo inutilisee"}
                        accessibilityState={{ checked: selected }}
                      >
                        <Image source={{ uri: file.uri }} style={styles.photoThumb} resizeMode="cover" />
                        <View style={[styles.photoCheck, { backgroundColor: selected ? colors.primary : colors.background, borderColor: selected ? colors.primary : colors.border }]}> 
                          {selected ? <Feather name="check" size={14} color="#fff" /> : null}
                        </View>
                        <View style={styles.photoMeta}>
                          <Text style={[styles.photoBadge, { color: file.isUsed ? colors.primary : colors.warning }]}>{file.isUsed ? "Utilisee" : "Inutilisee"}</Text>
                          <Text style={[styles.photoSize, { color: colors.mutedForeground }]}>{formatProductImagesSize(file.size)}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              <TouchableOpacity
                style={[styles.logoutBtn, { borderColor: colors.destructive + "45", backgroundColor: colors.destructive + "10" }, (photoBusy || selectedPhotoUris.length === 0) && { opacity: 0.55 }]}
                onPress={handleDeleteSelectedPhotos}
                disabled={photoBusy || selectedPhotoUris.length === 0}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Supprimer les photos selectionnees"
                accessibilityState={{ disabled: photoBusy || selectedPhotoUris.length === 0, busy: photoBusy }}
              >
                {photoBusy ? <ActivityIndicator color={colors.destructive} /> : <Feather name="trash" size={18} color={colors.destructive} />}
                {!photoBusy && <Text style={[styles.logoutBtnText, { color: colors.destructive }]}>Supprimer la selection</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );

  function InfoRow({ icon, label, value, helper }: { icon: keyof typeof Feather.glyphMap; label: string; value: string; helper: string }) {
    return (
      <View style={styles.infoRow}>
        <View style={[styles.infoIcon, { backgroundColor: colors.primary + "12" }]}>
          <Feather name={icon} size={17} color={colors.primary} />
        </View>
        <View style={styles.infoText}>
          <Text style={[styles.infoLabel, { color: colors.text }]}>{label}</Text>
          <Text style={[styles.infoHelper, { color: colors.mutedForeground }]}>{helper}</Text>
        </View>
        <Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, gap: 12 },
  iconBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 20, fontFamily: "Inter_700Bold", fontWeight: "700", textAlign: "center" },
  body: { padding: 16, gap: 16 },
  section: { gap: 10 },
  sectionHeader: { gap: 2, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_700Bold", fontWeight: "700", textTransform: "uppercase" },
  sectionHint: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  accountCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 15,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  accountTopRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  accountIcon: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  accountText: { flex: 1, gap: 3 },
  accountTitle: { fontSize: 17, fontFamily: "Inter_700Bold", fontWeight: "800" },
  accountSubtitle: { fontSize: 12, lineHeight: 17, fontFamily: "Inter_400Regular" },
  accountActions: { gap: 10 },
  formCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 14 },
  field: { gap: 7 },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  inputBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 12, gap: 10 },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  loadingBox: { padding: 24 },
  saveBtn: { minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9 },
  saveBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "700" },
  cloudCard: { borderRadius: 16, borderWidth: 1, padding: 15, gap: 12 },
  dangerCard: { borderRadius: 16, borderWidth: 1, padding: 15, gap: 12 },
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
  infoCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  infoRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, gap: 12, minHeight: 66 },
  infoIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  infoText: { flex: 1, gap: 2 },
  infoLabel: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700" },
  infoHelper: { fontSize: 12, lineHeight: 16, fontFamily: "Inter_400Regular" },
  infoValue: { flexShrink: 1, textAlign: "right", fontSize: 13, fontFamily: "Inter_700Bold", fontWeight: "700" },
  infoDivider: { height: 1 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  photoSheet: { maxHeight: "86%", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, gap: 14 },
  photoSheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  photoSheetTitle: { fontSize: 21, fontFamily: "Inter_700Bold", fontWeight: "800" },
  photoSheetHint: { fontSize: 13, fontFamily: "Inter_500Medium", fontWeight: "500", marginTop: 3 },
  emptyPhotos: { minHeight: 170, borderWidth: 1, borderRadius: 16, alignItems: "center", justifyContent: "center", padding: 18, gap: 8 },
  emptyPhotosTitle: { fontSize: 16, fontFamily: "Inter_700Bold", fontWeight: "700" },
  emptyPhotosText: { fontSize: 13, textAlign: "center", lineHeight: 18, fontFamily: "Inter_400Regular" },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingBottom: 6 },
  photoTile: { width: "48%", borderWidth: 1, borderRadius: 16, padding: 8, gap: 8, position: "relative" },
  photoThumb: { width: "100%", aspectRatio: 1, borderRadius: 12, backgroundColor: "#E5E7EB" },
  photoCheck: { position: "absolute", top: 14, right: 14, width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  photoMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  photoBadge: { flexShrink: 1, fontSize: 12, fontFamily: "Inter_700Bold", fontWeight: "700" },
  photoSize: { fontSize: 12, fontFamily: "Inter_500Medium", fontWeight: "500" },
});
