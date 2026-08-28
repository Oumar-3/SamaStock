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
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthInput } from "@/components/AuthInput";
import { GoogleLogo } from "@/components/GoogleLogo";
import { SamaStockLogo } from "@/components/SamaStockLogo";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { useDebts } from "@/context/DebtsContext";
import { useProducts } from "@/context/ProductsContext";
import { useSales } from "@/context/SalesContext";
import { useShopProfile } from "@/context/ShopProfileContext";
import { getShopProfileAsync } from "@/database";
import { createLocalMainShopForCloudUserAsync, prepareLocalDataForCloudUserAsync } from "@/services/localAccountData";
import { syncBasicTablesAsync } from "@/services/sync/basicSync";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
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
  const passwordRef = useRef<TextInput>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    if (typeof params.email === "string" && params.email.trim()) {
      setEmail(params.email.trim());
    }
  }, [params.email]);

  async function completeCloudLogin(nextUser: Awaited<ReturnType<typeof login>>) {
    await prepareLocalDataForCloudUserAsync(nextUser.id);
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
  const shellWidth = Platform.OS === "web" ? Math.min(Math.max(width - 32, 320), 460) : undefined;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        style={[styles.root, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.content, { paddingBottom: keyboardBottomSpace }]}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.shell, shellWidth ? { width: shellWidth } : null]}>
        <View style={[styles.topBar, { paddingTop: topPad + 10 }]}>
          <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.muted }]} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Retour">
            <Feather name="arrow-left" size={21} color={colors.text} />
          </TouchableOpacity>
        </View>

        <LinearGradient
          colors={[colors.background, colors.primary + "18", colors.background]}
          style={styles.header}
        >
          <View style={[styles.logoBox, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.primary }]}>
            <SamaStockLogo size={56} />
          </View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>Compte boutique</Text>
            <Text style={[styles.appName, { color: colors.text }]}>SamaStock</Text>
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>Retrouvez votre boutique et vos donnees sauvegardees.</Text>
        </LinearGradient>

        <View style={styles.form}>
          <Text style={[styles.title, { color: colors.text }]}>Bon retour</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Connectez-vous pour continuer.</Text>

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.destructive + "15" }]}>
              <Feather name="alert-circle" size={16} color={colors.destructive} />
              <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.fields}>
            <AuthInput
              label="Email"
              icon="mail"
              placeholder="nom@exemple.com"
              value={email}
              onChangeText={value => {
                setEmail(value);
                setError("");
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <AuthInput
              ref={passwordRef}
              label="Mot de passe"
              icon="lock"
              placeholder="Votre mot de passe"
              value={password}
              onChangeText={value => {
                setPassword(value);
                setError("");
              }}
              secureTextEntry={!showPass}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              passwordVisible={showPass}
              onTogglePassword={() => setShowPass(value => !value)}
            />
          </View>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Se connecter"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.btnText}>Se connecter</Text>
            )}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>ou</Text>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
          </View>

          <TouchableOpacity
            style={[styles.googleBtn, { backgroundColor: colors.card, borderColor: colors.border }, loading && styles.btnDisabled]}
            onPress={handleGoogleLogin}
            disabled={loading}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel="Continuer avec Google"
          >
            <GoogleLogo size={18} />
            <Text style={[styles.googleBtnText, { color: colors.text }]}>Continuer avec Google</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
            onPress={() => router.push("/(auth)/register")}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Creer un compte"
          >
            <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Creer un compte</Text>
          </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, alignItems: "center" },
  shell: { width: "100%" },
  topBar: { paddingHorizontal: 22 },
  backBtn: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  header: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 24,
    paddingHorizontal: 24,
    gap: 8,
  },
  logoBox: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    borderWidth: 1,
    shadowColor: "#00A86B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: "700", fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0 },
  appName: { fontSize: 30, lineHeight: 36, fontWeight: "800", fontFamily: "Inter_700Bold" },
  tagline: { maxWidth: 300, textAlign: "center", fontSize: 14, lineHeight: 20, fontFamily: "Inter_500Medium", fontWeight: "500" },
  form: { paddingHorizontal: 24, paddingTop: 22, gap: 16 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: "800", fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 15, lineHeight: 21, fontFamily: "Inter_400Regular", marginBottom: 6 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 13,
  },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
  fields: { gap: 12 },
  btn: {
    minHeight: 54,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    shadowColor: "#00A86B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold", color: "#fff" },
  secondaryBtn: {
    minHeight: 52,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 2 },
  divider: { flex: 1, height: 1 },
  dividerText: { fontSize: 12, fontFamily: "Inter_500Medium", fontWeight: "500" },
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
