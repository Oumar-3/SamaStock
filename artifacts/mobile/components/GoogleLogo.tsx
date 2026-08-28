import React from "react";
import { Image, StyleSheet, View } from "react-native";

export function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <View style={[styles.plate, { width: size + 10, height: size + 10, borderRadius: (size + 10) / 2 }]} pointerEvents="none">
      <Image
        source={require("../assets/images/google-g-transparent.png")}
        style={[styles.logo, { width: size, height: size }]}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
        accessible={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  logo: { flexShrink: 0 },
});