import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
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

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const { login, loginWithGoogle } = useAuth();
  const { refreshProfile, saveProfile } = useShopProfile();
  const { refreshProducts } = useProducts();
  const { refreshSales } = useSales();
  const { refreshDebts } = useDebts();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submittingRef = useRef(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    if (typeof params.email === "string" && params.email.trim()) {
      setEmail(params.email.trim());
    }
  }, [params.email]);

  async function completeCloudLogin(nextUser: Awaited<ReturnType<typeof login>>) {
    await resetLocalDataForCloudUserAsync(nextUser.id);
    await createLocalMainShopForCloudUserAsync(
      nextUser.id,
      nextUser.shopName || "Ma boutique",
      nextUser.name || nextUser.email,
    );
    try {
      await syncBasicTablesAsync();
    } catch (syncError) {
      console.warn("Login sync failed", syncError);
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

  async function handleLogin() {
    if (submittingRef.current) return;
    if (!email.trim() || !password) return setError("Remplissez tous les champs");
    submittingRef.current = true;
    setError("");
    setLoading(true);
    try {
      await completeCloudLogin(await login(email, password));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de connexion");
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError("");
    setLoading(true);
    try {
      await completeCloudLogin(await loginWithGoogle());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de connexion Google");
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  const keyboardBottomSpace = bottomPad + 180;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        style={[styles.root, { backgroundColor: colors.background }]}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: keyboardBottomSpace }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[colors.primary + "25", colors.background]}
          style={[styles.header, { paddingTop: topPad + 40 }]}
        >
          <View style={[styles.logoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SamaStockLogo size={62} />
          </View>
          <Text style={[styles.appName, { color: colors.text }]}>SamaStock</Text>
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>Gérez votre boutique</Text>
        </LinearGradient>

        <View style={styles.form}>
          <Text style={[styles.title, { color: colors.text }]}>Connexion</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Bon retour parmi nous</Text>

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.destructive + "15" }]}>
              <Feather name="alert-circle" size={16} color={colors.destructive} />
              <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.fields}>
            <View style={[styles.inputBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="mail" size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Email"
                placeholderTextColor={colors.mutedForeground}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                returnKeyType="next"
              />
            </View>
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
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity onPress={() => setShowPass(s => !s)}>
                <Feather name={showPass ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.btnText}>Se connecter</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.googleBtn, { backgroundColor: colors.card, borderColor: colors.border }, loading && styles.btnDisabled]}
            onPress={handleGoogleLogin}
            disabled={loading}
            activeOpacity={0.82}
          >
            <Feather name="chrome" size={18} color={colors.text} />
            <Text style={[styles.googleBtnText, { color: colors.text }]}>Continuer avec Google</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
            onPress={() => router.push("/(auth)/register")}
            activeOpacity={0.75}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Créer un compte</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    alignItems: "center",
    paddingBottom: 40,
    paddingHorizontal: 24,
    gap: 12,
  },
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    borderWidth: 1,
    shadowColor: "#00A86B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  appName: { fontSize: 28, fontWeight: "700", fontFamily: "Inter_700Bold" },
  tagline: { fontSize: 14, fontFamily: "Inter_400Regular" },
  form: { paddingHorizontal: 24, paddingTop: 32, gap: 16 },
  title: { fontSize: 24, fontWeight: "700", fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 8 },
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
  secondaryBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1.5,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
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
});
