import { Feather } from "@expo/vector-icons";
import React, { forwardRef } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View, type TextInputProps } from "react-native";

import { useColors } from "@/hooks/useColors";

type Props = TextInputProps & {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  passwordVisible?: boolean;
  onTogglePassword?: () => void;
};

export const AuthInput = forwardRef<TextInput, Props>(function AuthInput(
  { label, icon, passwordVisible, onTogglePassword, ...inputProps },
  ref,
) {
  const colors = useColors();

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <View style={[styles.inputBox, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        <Feather name={icon} size={18} color={colors.mutedForeground} />
        <TextInput
          ref={ref}
          style={[styles.input, { color: colors.text }]}
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel={label}
          {...inputProps}
        />
        {onTogglePassword ? (
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={onTogglePassword}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={passwordVisible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          >
            <Feather name={passwordVisible ? "eye-off" : "eye"} size={19} color={colors.mutedForeground} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  field: { gap: 7 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  inputBox: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingLeft: 14,
    paddingRight: 6,
    gap: 10,
  },
  input: { flex: 1, minHeight: 50, fontSize: 16, fontFamily: "Inter_400Regular" },
  eyeBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});