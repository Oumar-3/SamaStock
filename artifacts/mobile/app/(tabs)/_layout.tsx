import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const bottomInset = isWeb ? 34 : Math.max(insets.bottom, 10);
  const dockWidth = isWeb ? Math.min(width - 32, 720) : undefined;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.tabBar,
          borderTopWidth: isWeb ? 0 : 1,
          borderTopColor: colors.tabBarBorder,
          borderWidth: isWeb ? 1 : 0,
          borderColor: colors.tabBarBorder,
          elevation: isWeb ? 0 : 0,
          height: isWeb ? 68 : 62 + bottomInset,
          paddingBottom: isWeb ? 8 : bottomInset,
          paddingTop: isWeb ? 8 : 8,
          ...(isWeb
            ? {
                left: "50%",
                right: undefined,
                bottom: 12,
                width: dockWidth,
                borderRadius: 18,
                transform: [{ translateX: -(dockWidth ?? 0) / 2 }],
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: isDark ? 0.28 : 0.1,
                shadowRadius: 22,
              }
            : null),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.tabBar }]} />
          ) : null,
        tabBarLabelStyle: {
          fontSize: isWeb ? 12 : 10,
          fontFamily: "Inter_600SemiBold",
          fontWeight: "600",
        },
        tabBarItemStyle: {
          borderRadius: isWeb ? 14 : 0,
          marginHorizontal: isWeb ? 4 : 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Accueil",
          tabBarAccessibilityLabel: "Accueil",
          tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: "Produits",
          tabBarAccessibilityLabel: "Produits",
          tabBarIcon: ({ color }) => <Feather name="package" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="sale"
        options={{
          title: "",
          tabBarAccessibilityLabel: "Ouvrir la caisse",
          tabBarLabel: () => null,
          tabBarIcon: ({ color }) => (
            <View style={[styles.saleIconBox, isWeb && styles.saleIconBoxWeb, { backgroundColor: colors.primary }]}>
              <Feather name="shopping-cart" size={22} color="#fff" />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="debts"
        options={{
          title: "Dettes",
          tabBarAccessibilityLabel: "Dettes clients",
          tabBarIcon: ({ color }) => <Feather name="users" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "Historique",
          tabBarAccessibilityLabel: "Historique des ventes",
          tabBarIcon: ({ color }) => <Feather name="file-text" size={22} color={color} />,
        }}
      />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  saleIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
    shadowColor: "#00A86B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  saleIconBoxWeb: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 0,
  },
});
