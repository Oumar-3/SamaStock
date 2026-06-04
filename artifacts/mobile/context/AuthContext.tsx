import type { User as SupabaseUser } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";
import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

import { getSupabaseAuthStorageKey, getSupabaseClient, isSupabaseConfigured } from "@/services/supabase/client";
import { completeOAuthSessionFromUrlAsync } from "@/services/supabase/oauth";
import { cancelCloudBackup } from "@/services/sync/autoBackup";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  shopName: string;
};

type AuthContextType = {
  user: AppUser | null;
  isConfigured: boolean;
  isLoading: boolean;
  sessionKey: number;
  login: (email: string, password: string) => Promise<AppUser>;
  loginWithGoogle: () => Promise<AppUser>;
  register: (name: string, email: string, password: string, shopName: string) => Promise<AppUser>;
  refreshSession: () => Promise<AppUser | null>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

WebBrowser.maybeCompleteAuthSession();

function mapUser(user: SupabaseUser | null): AppUser | null {
  if (!user) return null;
  const metadataName = typeof user.user_metadata.name === "string"
    ? user.user_metadata.name
    : typeof user.user_metadata.full_name === "string"
      ? user.user_metadata.full_name
      : "";
  return {
    id: user.id,
    email: user.email ?? "",
    name: metadataName,
    shopName: typeof user.user_metadata.shop_name === "string" ? user.user_metadata.shop_name : "",
  };
}

function requireSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error("La connexion en ligne n'est pas configuree.");
  }
  return getSupabaseClient();
}

function isInvalidRefreshToken(error: unknown) {
  return error instanceof Error && error.message.toLowerCase().includes("refresh token");
}

async function clearStoredSupabaseSession() {
  const authStorageKey = getSupabaseAuthStorageKey();
  const isSupabaseAuthKey = (key: string) =>
    key === authStorageKey || key.startsWith("sb-") || key.includes("supabase.auth") || key.includes("auth-token");

  if (Platform.OS !== "web") {
    await SecureStore.deleteItemAsync(authStorageKey).catch(() => {});
  }

  try {
    const keys = await AsyncStorage.getAllKeys();
    const authKeys = keys.filter(isSupabaseAuthKey);
    if (authKeys.length > 0) {
      await AsyncStorage.multiRemove(authKeys);
    }
  } catch {
    // Best effort cleanup only.
  }
  try {
    const localStorage = globalThis.localStorage;
    const sessionStorage = globalThis.sessionStorage;
    for (const storage of [localStorage, sessionStorage]) {
      if (!storage) continue;
      const keysToRemove: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key && isSupabaseAuthKey(key)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => storage.removeItem(key));
    }
  } catch {
    // Web storage may be unavailable in some runtimes.
  }
  try {
    if (Platform.OS === "web" && "indexedDB" in globalThis) {
      const indexedDBFactory = globalThis.indexedDB;
      if ("databases" in indexedDBFactory && typeof indexedDBFactory.databases === "function") {
        const databases = await indexedDBFactory.databases();
        await Promise.all(
          databases
            .map(database => database.name)
            .filter((name): name is string => typeof name === "string" && (name.startsWith("sb-") || name.includes("supabase")))
            .map(name => new Promise<void>(resolve => {
              const request = indexedDBFactory.deleteDatabase(name);
              request.onsuccess = () => resolve();
              request.onerror = () => resolve();
              request.onblocked = () => resolve();
            })),
        );
      }
    }
  } catch {
    // IndexedDB cleanup is best effort on web.
  }
}

function warnAuthLogoutError(error: unknown) {
  if (!isInvalidRefreshToken(error)) {
    console.warn("Local logout failed", error);
  }
}

function getFriendlyAuthErrorMessage(message: string) {
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes("network request failed") || lowerMessage.includes("failed to fetch")) {
    return "Connexion Internet impossible. Verifiez le Wi-Fi ou les donnees mobiles, puis reessayez. Si le probleme persiste sur cet appareil uniquement, ouvrez Supabase dans son navigateur pour verifier son acces HTTPS.";
  }
  if (lowerMessage.includes("email rate limit")) {
    return "Trop de tentatives de creation de compte. Patientez quelques minutes, puis reessayez ou connectez-vous si le compte existe deja.";
  }
  if (lowerMessage.includes("invalid refresh token") || lowerMessage.includes("refresh token not found")) {
    return "Votre ancienne session a expire. Reconnectez-vous.";
  }
  if (lowerMessage.includes("user already registered") || lowerMessage.includes("already registered")) {
    return "Ce compte existe deja. Utilisez la page de connexion.";
  }
  if (lowerMessage.includes("invalid login credentials")) {
    return "Email ou mot de passe incorrect.";
  }
  return message;
}

function hasEmptyIdentityList(user: SupabaseUser | null) {
  const identities = (user as SupabaseUser & { identities?: unknown[] } | null)?.identities;
  return Array.isArray(identities) && identities.length === 0;
}

async function getVerifiedCurrentUser() {
  const { data, error } = await requireSupabase().auth.getUser();
  if (error) throw new Error(getFriendlyAuthErrorMessage(error.message));
  if (!data.user) throw new Error("Session Supabase invalide. Reconnectez-vous.");
  return data.user;
}

function getAuthRedirectUrl() {
  const envRedirectUrl = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL?.trim();
  if (envRedirectUrl) return envRedirectUrl;
  const redirectUrl = makeRedirectUri({ path: "auth/callback" });
  if (Platform.OS !== "web" && redirectUrl.includes("localhost")) {
    throw new Error("La redirection de connexion pointe encore vers localhost. Relancez Expo avec pnpm run dev:phone ou renseignez EXPO_PUBLIC_AUTH_REDIRECT_URL avec l'URL exp://.../--/auth/callback affichee par Expo.");
  }
  return redirectUrl;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionKey, setSessionKey] = useState(0);
  const authMutationRef = useRef(0);
  const isLoggingOutRef = useRef(false);
  const isConfigured = isSupabaseConfigured();

  async function expireCurrentSession() {
    authMutationRef.current += 1;
    try {
      getSupabaseClient().auth.stopAutoRefresh();
    } catch {
      // Best effort only.
    }
    await clearStoredSupabaseSession();
    setUser(null);
    setSessionKey(key => key + 1);
  }

  async function restoreCurrentSession() {
    const supabase = getSupabaseClient();
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!data.session) {
      setUser(null);
      setSessionKey(key => key + 1);
      return null;
    }

    const { data: userData, error } = await supabase.auth.getUser();
    if (error || !userData.user) {
      if (error && isInvalidRefreshToken(error)) {
        await expireCurrentSession();
        return null;
      }
      await clearStoredSupabaseSession();
      setUser(null);
      setSessionKey(key => key + 1);
      return null;
    }

    const nextUser = mapUser(userData.user);
    setUser(nextUser);
    setSessionKey(key => key + 1);
    return nextUser;
  }

  useEffect(() => {
    if (!isConfigured) {
      setIsLoading(false);
      return;
    }

    const supabase = getSupabaseClient();
    const initialAuthMutation = authMutationRef.current;
    restoreCurrentSession()
      .then(() => {
        if (authMutationRef.current !== initialAuthMutation) return;
      })
      .catch(async error => {
        if (authMutationRef.current !== initialAuthMutation) return;
        if (isInvalidRefreshToken(error)) {
          await expireCurrentSession();
        } else {
          console.warn("Auth session restore failed", error);
          setUser(null);
          setSessionKey(key => key + 1);
        }
      })
      .finally(() => setIsLoading(false));

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || isLoggingOutRef.current) {
        setUser(null);
        setSessionKey(key => key + 1);
        return;
      }
      const nextUser = mapUser(session?.user ?? null);
      setUser(nextUser);
      setSessionKey(key => key + 1);
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, [isConfigured]);

  useEffect(() => {
    if (!isConfigured) return;
    const supabase = getSupabaseClient();
    if (Platform.OS !== "web" && AppState.currentState === "active") {
      supabase.auth.startAutoRefresh();
    }
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") {
        if (Platform.OS !== "web") {
          supabase.auth.startAutoRefresh();
        }
      } else if (Platform.OS !== "web") {
        supabase.auth.stopAutoRefresh();
      }

      if (state === "active" && !isLoggingOutRef.current) {
        void restoreCurrentSession().catch(error => {
          if (isInvalidRefreshToken(error)) {
            void expireCurrentSession();
          } else {
            console.warn("Auth foreground restore failed", error);
          }
        });
      }
    });
    return () => {
      subscription.remove();
      if (Platform.OS !== "web") {
        supabase.auth.stopAutoRefresh();
      }
    };
  }, [isConfigured]);

  async function login(email: string, password: string) {
    const supabase = requireSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });
    if (error) throw new Error(getFriendlyAuthErrorMessage(error.message));
    if (!data.session) throw new Error("Connexion impossible: aucune session n'a ete ouverte.");
    const verifiedUser = await getVerifiedCurrentUser();
    if (verifiedUser.email?.toLowerCase() !== email.toLowerCase().trim()) {
      await clearStoredSupabaseSession();
      throw new Error("La session ouverte ne correspond pas a ce compte. Reconnectez-vous.");
    }
    const nextUser = mapUser(verifiedUser);
    if (!nextUser) throw new Error("Session introuvable apres connexion.");
    authMutationRef.current += 1;
    setUser(nextUser);
    setSessionKey(key => key + 1);
    return nextUser;
  }

  async function loginWithGoogle() {
    const supabase = requireSupabase();
    const redirectTo = getAuthRedirectUrl();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });
    if (error) throw new Error(getFriendlyAuthErrorMessage(error.message));
    if (!data.url) throw new Error("Connexion Google indisponible.");

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success") {
      throw new Error("Connexion Google annulee.");
    }

    await completeOAuthSessionFromUrlAsync(result.url);

    const verifiedUser = await getVerifiedCurrentUser();
    const nextUser = mapUser(verifiedUser);
    if (!nextUser) throw new Error("Session introuvable apres connexion Google.");
    authMutationRef.current += 1;
    setUser(nextUser);
    setSessionKey(key => key + 1);
    return nextUser;
  }

  async function register(name: string, email: string, password: string, shopName: string) {
    const supabase = requireSupabase();
    const normalizedEmail = email.toLowerCase().trim();
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: getAuthRedirectUrl(),
        data: {
          name: name.trim(),
          shop_name: shopName.trim(),
        },
      },
    });
    if (error) throw new Error(getFriendlyAuthErrorMessage(error.message));
    if (!data.session) {
      await clearStoredSupabaseSession();
      setUser(null);
      if (hasEmptyIdentityList(data.user)) {
        throw new Error("Ce compte semble deja exister. Connectez-vous avec cet email, ou utilisez Google si vous aviez cree le compte avec Google.");
      }
      throw new Error("Compte cree. Confirmez votre email depuis le telephone, puis revenez dans SamaStock.");
    }
    const verifiedUser = await getVerifiedCurrentUser();
    if (verifiedUser.email?.toLowerCase() !== normalizedEmail) {
      await clearStoredSupabaseSession();
      throw new Error("La session creee ne correspond pas a ce compte. Reconnectez-vous.");
    }
    const nextUser = mapUser(verifiedUser);
    if (!nextUser) throw new Error("Compte cree, mais session introuvable.");
    authMutationRef.current += 1;
    setUser(nextUser);
    setSessionKey(key => key + 1);
    return nextUser;
  }

  async function logout() {
    cancelCloudBackup();
    authMutationRef.current += 1;
    isLoggingOutRef.current = true;
    setUser(null);
    setSessionKey(key => key + 1);

    const supabase = requireSupabase();
    let remoteSignOut: Promise<unknown> | null = null;
    try {
      supabase.auth.stopAutoRefresh();
      remoteSignOut = supabase.auth.signOut().then(({ error }) => {
        if (error) warnAuthLogoutError(error);
      });
    } catch (error) {
      warnAuthLogoutError(error);
    }

    await clearStoredSupabaseSession();
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // The in-memory session can already be cleared. Local storage cleanup below is enough.
    } finally {
      await clearStoredSupabaseSession();
      setUser(null);
      setSessionKey(key => key + 1);
      isLoggingOutRef.current = false;
    }

    void remoteSignOut?.catch(warnAuthLogoutError);
  }

  const value = useMemo(
    () => ({ user, isConfigured, isLoading, sessionKey, login, loginWithGoogle, register, refreshSession: restoreCurrentSession, logout }),
    [isConfigured, isLoading, sessionKey, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
