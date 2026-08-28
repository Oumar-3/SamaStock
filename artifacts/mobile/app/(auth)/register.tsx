import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
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

import { AuthInput } from "@/components/AuthInput";
import { GoogleLogo } from "@/components/GoogleLogo";
import { SamaStockLogo } from "@/components/SamaStockLogo";
import { useAuth } from "@/context/AuthContext";
import { useDebts } from "@/context/DebtsContext";
import { useProducts } from "@/context/ProductsContext";
import { useSales } from "@/context/SalesContext";
import { useShopProfile } from "@/context/ShopProfileContext";
import { getShopProfileAsync } from "@/database";
import { useColors } from "@/hooks/useColors";
import { createLocalMainShopForCloudUserAsync, prepareLocalDataForCloudUserAsync, resetLocalDataForCloudUserAsync } from "@/services/localAccountData";
import { syncBasicTablesAsync } from "@/services/sync/basicSync";

const STEPS = [
  { title: "Compte", subtitle: "Vos informations de connexion", icon: "user" },
  { title: "Boutique", subtitle: "Les informations de votre magasin", icon: "shopping-bag" },
  { title: "Verification", subtitle: "Confirmez avant de creer", icon: "check-circle" },
] as const;

export default function RegisterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { register, loginWithGoogle } = useAuth();
  const { saveProfile, refreshProfile } = useShopProfile();
  const { refreshProducts } = useProducts();
  const { refreshSales } = useSales();
  const { refreshDebts } = useDebts();

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [shopName, setShopName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const submittingRef = useRef(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const addressRef = useRef<TextInput>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const keyboardBottomSpace = bottomPad + 180;
  const activeStep = STEPS[step];
  const progress = useMemo(() => ((step + 1) / STEPS.length) * 100, [step]);

  function clearError() {
    if (error) setError("");
  }

  function validateCurrentStep() {
    if (step === 0) {
      if (!name.trim() || !email.trim() || !password) {
        setError("Remplissez votre nom, email et mot de passe.");
        return false;
      }
      if (password.length < 6) {
        setError("Le mot de passe doit contenir au moins 6 caracteres.");
        return false;
      }
    }
    if (step === 1 && !shopName.trim()) {
      setError("Ajoutez le nom de votre boutique.");
      return false;
    }
    return true;
  }

  function goNext() {
    if (!validateCurrentStep()) return;
    setError("");
    setStep(value => Math.min(value + 1, STEPS.length - 1));
  }

  function goBack() {
    if (loading) return;
    if (step > 0) {
      setError("");
      setStep(value => value - 1);
      return;
    }
    router.back();
  }

  async function completeGoogleRegister() {
    const nextUser = await loginWithGoogle();
    await prepareLocalDataForCloudUserAsync(nextUser.id);
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
    if (!validateCurrentStep()) return;
    submittingRef.current = true;
    setError("");
    setLoading(true);
    try {
      const cleanName = name.trim();
      const cleanShopName = shopName.trim();
      const nextUser = await register(cleanName, email.trim(), password, cleanShopName);
      await resetLocalDataForCloudUserAsync(nextUser.id);
      await createLocalMainShopForCloudUserAsync(nextUser.id, cleanShopName, cleanName);
      await Promise.all([refreshProducts(), refreshSales(), refreshDebts()]);
      await saveProfile({
        shopName: cleanShopName,
        ownerName: cleanName,
        phone: phone.trim(),
        address: address.trim(),
      });
      try {
        await syncBasicTablesAsync();
        await refreshProfile();
      } catch (syncError) {
        console.warn("Register sync failed", syncError);
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
      <View
        style={[
          styles.root,
          styles.confirmRoot,
          {
            backgroundColor: colors.background,
            paddingTop: topPad + 24,
            paddingBottom: bottomPad + 24,
          },
        ]}
      >
        <View style={[styles.iconBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="mail" size={30} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Confirmez votre email</Text>
        <Text style={[styles.confirmText, { color: colors.mutedForeground }]}> 
          Un lien a ete envoye a {confirmationEmail}. Ouvrez-le sur ce telephone pour activer votre compte.
        </Text>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.primary }]}
          onPress={goToLoginAfterConfirmation}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Continuer vers la connexion"
        >
          <Text style={styles.btnText}>Continuer vers la connexion</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryAction, { borderColor: colors.border }]}
          onPress={() => setConfirmationEmail("")}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Modifier l'adresse email"
        >
          <Text style={[styles.secondaryActionText, { color: colors.primary }]}>Modifier l'email</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        style={[styles.root, { backgroundColor: colors.background }]}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: keyboardBottomSpace }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.topBar, { paddingTop: topPad + 12 }]}>
          <TouchableOpacity
            onPress={goBack}
            style={[styles.backBtn, { backgroundColor: colors.muted }]}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={step > 0 ? "Retour a l'etape precedente" : "Retour"}
          >
            <Feather name="arrow-left" size={21} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          <View style={styles.brandRow}>
            <View style={[styles.iconBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <SamaStockLogo size={54} />
            </View>
            <View style={styles.brandCopy}>
              <Text style={[styles.kicker, { color: colors.primary }]}>SamaStock</Text>
              <Text style={[styles.title, { color: colors.text }]}>Creer votre boutique</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}> 
                Avancez etape par etape. Vous pourrez modifier ces infos plus tard.
              </Text>
            </View>
          </View>

          <View style={styles.progressBlock}>
            <View style={styles.stepHeader}>
              <View style={[styles.stepIcon, { backgroundColor: colors.secondary }]}> 
                <Feather name={activeStep.icon} size={18} color={colors.primary} />
              </View>
              <View style={styles.stepCopy}>
                <Text style={[styles.stepCount, { color: colors.mutedForeground }]}>Etape {step + 1} sur {STEPS.length}</Text>
                <Text style={[styles.stepTitle, { color: colors.text }]}>{activeStep.title}</Text>
                <Text style={[styles.stepSubtitle, { color: colors.mutedForeground }]}>{activeStep.subtitle}</Text>
              </View>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}> 
              <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: colors.primary }]} />
            </View>
          </View>

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.destructive + "15" }]} accessibilityRole="alert">
              <Feather name="alert-circle" size={16} color={colors.destructive} />
              <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
            </View>
          ) : null}

          {step === 0 ? (
            <View style={styles.cardSection}>
              <View style={styles.fields}>
                <AuthInput
                  label="Votre nom"
                  icon="user"
                  placeholder="Ex. Awa Ndiaye"
                  value={name}
                  onChangeText={value => {
                    setName(value);
                    clearError();
                  }}
                  autoCapitalize="words"
                  autoCorrect={false}
                  autoComplete="name"
                  textContentType="name"
                  returnKeyType="next"
                  onSubmitEditing={() => emailRef.current?.focus()}
                />
                <AuthInput
                  ref={emailRef}
                  label="Email"
                  icon="mail"
                  placeholder="nom@exemple.com"
                  value={email}
                  onChangeText={value => {
                    setEmail(value);
                    clearError();
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
                  placeholder="6 caracteres minimum"
                  value={password}
                  onChangeText={value => {
                    setPassword(value);
                    clearError();
                  }}
                  secureTextEntry={!showPass}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={goNext}
                  passwordVisible={showPass}
                  onTogglePassword={() => setShowPass(value => !value)}
                />
              </View>

              <View style={styles.dividerRow}>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>ou</Text>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              </View>

              <TouchableOpacity
                style={[styles.googleBtn, { backgroundColor: colors.card, borderColor: colors.border }, loading && styles.btnDisabled]}
                onPress={handleGoogleRegister}
                disabled={loading}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Continuer avec Google"
              >
                <GoogleLogo size={18} />
                <Text style={[styles.googleBtnText, { color: colors.text }]}>Continuer avec Google</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {step === 1 ? (
            <View style={styles.cardSection}>
              <View style={styles.fields}>
                <AuthInput
                  label="Nom de la boutique"
                  icon="shopping-bag"
                  placeholder="Ex. Boutique Awa"
                  value={shopName}
                  onChangeText={value => {
                    setShopName(value);
                    clearError();
                  }}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => phoneRef.current?.focus()}
                />
                <AuthInput
                  ref={phoneRef}
                  label="Telephone"
                  icon="phone"
                  placeholder="Ex. 77 000 00 00"
                  value={phone}
                  onChangeText={value => {
                    setPhone(value);
                    clearError();
                  }}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  returnKeyType="next"
                  onSubmitEditing={() => addressRef.current?.focus()}
                />
                <AuthInput
                  ref={addressRef}
                  label="Adresse ou quartier"
                  icon="map-pin"
                  placeholder="Ex. Medina, Dakar"
                  value={address}
                  onChangeText={value => {
                    setAddress(value);
                    clearError();
                  }}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={goNext}
                />
              </View>
              <View style={[styles.tipBox, { backgroundColor: colors.secondary }]}> 
                <Feather name="info" size={16} color={colors.primary} />
                <Text style={[styles.tipText, { color: colors.secondaryForeground }]}> 
                  Le telephone et l'adresse sont utiles pour vos recus, mais vous pouvez les completer plus tard.
                </Text>
              </View>
            </View>
          ) : null}

          {step === 2 ? (
            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
              <SummaryRow icon="user" label="Proprietaire" value={name.trim()} />
              <SummaryRow icon="shopping-bag" label="Boutique" value={shopName.trim()} />
              <SummaryRow icon="mail" label="Email" value={email.trim().toLowerCase()} />
              <SummaryRow icon="phone" label="Telephone" value={phone.trim() || "A completer plus tard"} />
              <SummaryRow icon="map-pin" label="Adresse" value={address.trim() || "A completer plus tard"} />
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }, loading && styles.btnDisabled]}
            onPress={step === STEPS.length - 1 ? handleRegister : goNext}
            disabled={loading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={step === STEPS.length - 1 ? "Creer ma boutique" : "Continuer"}
            accessibilityState={{ disabled: loading, busy: loading }}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.btnText}>{step === STEPS.length - 1 ? "Creer ma boutique" : "Continuer"}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loginLink}
            onPress={() => router.replace("/(auth)/login")}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Se connecter a un compte existant"
          >
            <Text style={[styles.loginPrompt, { color: colors.mutedForeground }]}>Vous avez deja un compte ? </Text>
            <Text style={[styles.loginLinkText, { color: colors.primary }]}>Se connecter</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SummaryRow({ icon, label, value }: { icon: keyof typeof Feather.glyphMap; label: string; value: string }) {
  const colors = useColors();

  return (
    <View style={styles.summaryRow}>
      <View style={[styles.summaryIcon, { backgroundColor: colors.muted }]}> 
        <Feather name={icon} size={16} color={colors.primary} />
      </View>
      <View style={styles.summaryText}>
        <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <Text style={[styles.summaryValue, { color: colors.text }]} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  confirmRoot: { justifyContent: "center", paddingHorizontal: 24, gap: 18 },
  topBar: { paddingHorizontal: 20, paddingBottom: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  form: { paddingHorizontal: 24, paddingTop: 8, gap: 16 },
  brandRow: { gap: 14 },
  brandCopy: { gap: 6 },
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
  kicker: { fontSize: 13, fontWeight: "800", fontFamily: "Inter_700Bold", textTransform: "uppercase" },
  title: { fontSize: 25, fontWeight: "800", fontFamily: "Inter_700Bold", lineHeight: 31 },
  subtitle: { fontSize: 14, lineHeight: 20, fontFamily: "Inter_400Regular" },
  confirmText: { fontSize: 15, lineHeight: 22, fontFamily: "Inter_400Regular" },
  progressBlock: { gap: 14, paddingTop: 6 },
  stepHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepCopy: { flex: 1, gap: 2 },
  stepCount: { fontSize: 12, fontWeight: "700", fontFamily: "Inter_700Bold", textTransform: "uppercase" },
  stepTitle: { fontSize: 18, fontWeight: "800", fontFamily: "Inter_700Bold" },
  stepSubtitle: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular" },
  progressTrack: { height: 8, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
  },
  errorText: { fontSize: 14, lineHeight: 20, fontFamily: "Inter_400Regular", flex: 1 },
  cardSection: { gap: 16 },
  fields: { gap: 14 },
  tipBox: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  tipText: { flex: 1, fontSize: 13, lineHeight: 19, fontFamily: "Inter_500Medium", fontWeight: "500" },
  btn: {
    minHeight: 54,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    shadowColor: "#00A86B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnDisabled: { opacity: 0.55 },
  btnText: { fontSize: 16, fontWeight: "800", fontFamily: "Inter_700Bold", color: "#fff" },
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
  loginLink: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  loginPrompt: { fontSize: 14, fontFamily: "Inter_400Regular" },
  loginLinkText: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold" },
  secondaryAction: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionText: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold" },
  summaryCard: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 4 },
  summaryRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12 },
  summaryIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  summaryText: { flex: 1, gap: 2 },
  summaryLabel: { fontSize: 12, fontWeight: "700", fontFamily: "Inter_700Bold", textTransform: "uppercase" },
  summaryValue: { fontSize: 15, lineHeight: 20, fontWeight: "700", fontFamily: "Inter_700Bold" },
});
