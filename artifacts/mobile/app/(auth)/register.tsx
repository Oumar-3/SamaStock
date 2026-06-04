import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { useDebts } from "@/context/DebtsContext";
import { useProducts } from "@/context/ProductsContext";
import { useSales } from "@/context/SalesContext";
import { useShopProfile } from "@/context/ShopProfileContext";
import { getShopProfileAsync } from "@/database";
import { createLocalMainShopForCloudUserAsync, resetLocalDataForCloudUserAsync } from "@/services/localAccountData";
import { syncBasicTablesAsync } from "@/services/sync/basicSync";

export default function RegisterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { register, loginWithGoogle } = useAuth();
  const { saveProfile, refreshProfile } = useShopProfile();
  const { refreshProducts } = useProducts();
  const { refreshSales } = useSales();
  const { refreshDebts } = useDebts();

  const [name, setName] = useState("");
  const [shopName, setShopName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const submittingRef = useRef(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  async function completeGoogleRegister() {
    const nextUser = await loginWithGoogle();
    await resetLocalDataForCloudUserAsync(nextUser.id);
    await createLocalMainShopForCloudUserAsync(
      nextUser.id,
      nextUser.shopName || "Ma boutique",
      nextUser.name || nextUser.email,
    );
    try {
      await syncBasicTablesAsync();
    } catch (syncError) {
      console.warn("Google register sync failed", syncError);
    }
    const existingProfile = await getShopProfileAsync();
    if (!existingProfile) {
      await saveProfile({
        shopName: nextUser.shopName || "Ma boutique",
        ownerName: nextUser.name || nextUser.email,
        phone: "",
        address: "",
      });
    }
    await Promise.all([refreshProfile(), refreshProducts(), refreshSales(), refreshDebts()]);
    router.replace("/(tabs)");
  }

  async function handleGoogleRegister() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError("");
    setLoading(true);
    try {
      await completeGoogleRegister();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de connexion Google");
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  async function handleRegister() {
    if (submittingRef.current) return;
    if (!name.trim() || !shopName.trim() || !email.trim() || !password) {
      return setError("Remplissez tous les champs");
    }
    if (password.length < 6) return setError("Mot de passe trop court (min 6 caractères)");
    submittingRef.current = true;
    setError("");
    setLoading(true);
    try {
      const nextUser = await register(name, email, password, shopName);
      await resetLocalDataForCloudUserAsync(nextUser.id);
      await createLocalMainShopForCloudUserAsync(nextUser.id, shopName, name);
      await Promise.all([refreshProducts(), refreshSales(), refreshDebts()]);
      await saveProfile({
        shopName: shopName.trim(),
        ownerName: name.trim(),
        phone: "",
        address: "",
      });
      try {
        await syncBasicTablesAsync();
        await refreshProfile();
      } catch (syncError) {
        console.warn("Register sync failed", syncError);
        // The account and local shop are ready even if the first sync fails.
      }
      router.replace("/(tabs)");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erreur d'inscription";
      if (message.toLowerCase().includes("confirmez votre email")) {
        setConfirmationEmail(email.trim().toLowerCase());
        setPassword("");
        setError("");
      } else {
        setError(message);
      }
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  function goToLoginAfterConfirmation() {
    router.replace({
      pathname: "/(auth)/login",
      params: { email: confirmationEmail },
    });
  }

  if (confirmationEmail) {
    return (
      <View style={[styles.root, styles.confirmRoot, { backgroundColor: colors.background, paddingTop: topPad + 24, paddingBottom: bottomPad + 24 }]}>
        <View style={[styles.iconBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="mail" size={30} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Confirmez votre email</Text>
        <Text style={[styles.confirmText, { color: colors.mutedForeground }]}>
          Nous avons envoye un lien a {confirmationEmail}. Ouvrez-le sur ce telephone pour activer le compte et revenir dans SamaStock.
        </Text>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.primary }]}
          onPress={goToLoginAfterConfirmation}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>Continuer vers connexion</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryAction, { borderColor: colors.border }]}
          onPress={() => setConfirmationEmail("")}
          activeOpacity={0.8}
        >
          <Text style={[styles.secondaryActionText, { color: colors.primary }]}>Modifier l'email</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const keyboardBottomSpace = bottomPad + 190;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        style={[styles.root, { backgroundColor: colors.background }]}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: keyboardBottomSpace }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.topBar, { paddingTop: topPad + 12 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          <View style={[styles.iconBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SamaStockLogo size={54} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Créer un compte</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Commencez à gérer votre boutique
          </Text>

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.destructive + "15" }]}>
              <Feather name="alert-circle" size={16} color={colors.destructive} />
              <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.fields}>
            {[
              { label: "Votre nom", icon: "user" as const, value: name, set: setName, kb: "default" as const, auto: "words" as const },
              { label: "Nom de la boutique", icon: "shopping-bag" as const, value: shopName, set: setShopName, kb: "default" as const, auto: "words" as const },
              { label: "Email", icon: "mail" as const, value: email, set: setEmail, kb: "email-address" as const, auto: "none" as const },
            ].map(f => (
              <View key={f.label} style={[styles.inputBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name={f.icon} size={18} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder={f.label}
                  placeholderTextColor={colors.mutedForeground}
                  value={f.value}
                  onChangeText={f.set}
                  keyboardType={f.kb}
                  autoCapitalize={f.auto}
                />
              </View>
            ))}
            <View style={[styles.inputBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="lock" size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Mot de passe"
                placeholderTextColor={colors.mutedForeground}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
                returnKeyType="done"
                onSubmitEditing={handleRegister}
              />
              <TouchableOpacity onPress={() => setShowPass(s => !s)}>
                <Feather name={showPass ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }, loading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.btnText}>Créer mon compte</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.googleBtn, { backgroundColor: colors.card, borderColor: colors.border }, loading && styles.btnDisabled]}
            onPress={handleGoogleRegister}
            disabled={loading}
            activeOpacity={0.82}
          >
            <Feather name="chrome" size={18} color={colors.text} />
            <Text style={[styles.googleBtnText, { color: colors.text }]}>Continuer avec Google</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  confirmRoot: { justifyContent: "center", paddingHorizontal: 24, gap: 18 },
  topBar: { paddingHorizontal: 20, paddingBottom: 8 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  form: { paddingHorizontal: 24, paddingTop: 16, gap: 16 },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    borderWidth: 1,
    shadowColor: "#00A86B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  title: { fontSize: 24, fontWeight: "700", fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 4 },
  confirmText: { fontSize: 15, lineHeight: 22, fontFamily: "Inter_400Regular" },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
  },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
  fields: { gap: 12 },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  btn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
    shadowColor: "#00A86B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold", color: "#fff" },
  googleBtn: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  googleBtnText: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  secondaryAction: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionText: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
});
