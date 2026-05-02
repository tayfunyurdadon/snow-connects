import React from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";

interface Props extends TextInputProps {
  label?: string;
  helperText?: string;
  error?: string;
}

export function Input({ label, helperText, error, style, ...rest }: Props) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text
          style={{
            color: c.foreground,
            fontFamily: "Inter_500Medium",
            fontSize: 13,
          }}
        >
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={c.mutedForeground}
        style={[
          {
            backgroundColor: c.card,
            color: c.foreground,
            borderRadius: c.radius,
            borderWidth: 1,
            borderColor: error ? c.destructive : c.border,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontFamily: "Inter_400Regular",
            fontSize: 16,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text style={[styles.helper, { color: c.destructive }]}>{error}</Text>
      ) : helperText ? (
        <Text style={[styles.helper, { color: c.mutedForeground }]}>
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  helper: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
});
