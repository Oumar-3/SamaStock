import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useDebts } from "@/context/DebtsContext";
import { useDatabase } from "@/context/DatabaseContext";
import { useProducts } from "@/context/ProductsContext";
import { useSales } from "@/context/SalesContext";
import { useShopProfile } from "@/context/ShopProfileContext";
import { useColors } from "@/hooks/useColors";
import { clearCloudUserLocalDataAsync, getActiveCloudOwnerIdAsync, isOfflineModeAsync, prepareLocalDataForCloudUserAsync } from "@/services/localAccountData";
import { syncBasicTablesAsync } from "@/services/sync/basicSync";

export default function Index() {
  const router = useRouter();
  const colors = useColors();
  const { error } = useDatabase();
  const { user, isLoading: authLoading, sessionKey } = useAuth();
  const { refreshDebts } = useDebts();
  const { refreshProducts } = useProducts();
  const { refreshSales } = useSales();
  const { profile, isLoading, refreshProfile } = useShopProfile();
  const [restoring, setRestoring] = useState(false);
  const [refreshingLoggedOut, setRefreshingLoggedOut] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const restoredSessionKey = useRef<number | null>(null);
  const refreshedLoggedOutSessionKey = useRef<number | null>(null);

  useEffect(() => {
    if (authLoading || isLoading || error || restoring || refreshingLoggedOut) return;

    if (user && restoredSessionKey.current !== sessionKey) {
      restoredSessionKey.current = sessionKey;
      refreshedLoggedOutSessionKey.current = null;
      setRestoring(true);
      prepareLocalDataForCloudUserAsync(user.id)
        .then(() => syncBasicTablesAsync())
        .then(() => Promise.all([refreshProfile(), refreshProducts(), refreshSales(), refreshDebts()]))
        .catch(error => console.warn("Startup restore failed", error))
        .finally(() => {
          setRestoring(false);
          router.replace("/(tabs)");
        });
      return;
    }

    if (!user && refreshedLoggedOutSessionKey.current !== sessionKey) {
      restoredSessionKey.current = null;
      refreshedLoggedOutSessionKey.current = sessionKey;
      setRefreshingLoggedOut(true);
      getActiveCloudOwnerIdAsync()
        .then(async ownerId => {
          if (ownerId) {
            setOfflineMode(false);
            router.replace("/intro");
            await clearCloudUserLocalDataAsync();
            await Promise.all([refreshProfile(), refreshProducts(), refreshSales(), refreshDebts()]);
            return;
          }

          const isOffline = await isOfflineModeAsync();
          setOfflineMode(isOffline);
          router.replace(isOffline && profile ? "/(tabs)" : "/intro");
          await Promise.all([refreshProfile(), refreshProducts(), refreshSales(), refreshDebts()]);
        })
        .catch(error => console.warn("Logged-out refresh failed", error))
        .finally(() => {
          setRefreshingLoggedOut(false);
        });
      return;
    }

    if (user) {
      router.replace("/(tabs)");
    } else if (offlineMode && profile) {
      router.replace("/(tabs)");
    } else {
      router.replace("/intro");
    }
  }, [authLoading, error, isLoading, offlineMode, profile, refreshDebts, refreshProducts, refreshProfile, refreshSales, refreshingLoggedOut, restoring, router, sessionKey, user]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: 24 }}>
      {error ? (
        <Text style={{ color: colors.destructive, textAlign: "center" }}>{error.message}</Text>
      ) : (
        <ActivityIndicator size="large" color={colors.primary} />
      )}
    </View>
  );
}
