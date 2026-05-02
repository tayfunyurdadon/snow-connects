import React from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";

import { useColors } from "@/hooks/useColors";

interface Props {
  label: string;
  tone?: "default" | "success" | "warning" | "danger" | "accent";
  style?: ViewStyle;
}

export function Pill({ label, tone = "default", style }: Props) {
  const c = useColors();
  const map = {
    default: { bg: c.muted, fg: c.mutedForeground },
    success: { bg: "#dcfce7", fg: "#15803d" },
    warning: { bg: "#fef3c7", fg: "#a16207" },
    danger: { bg: "#fee2e2", fg: "#b91c1c" },
    accent: { bg: c.secondary, fg: c.primary },
  } as const;
  const colors = map[tone];
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: colors.bg, borderRadius: 999 },
        style,
      ]}
    >
      <Text style={[styles.text, { color: colors.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  text: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
});
