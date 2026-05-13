import React from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";

import { useColors } from "@/hooks/useColors";

interface Props {
  label: string;
  tone?: "default" | "success" | "warning" | "danger" | "accent" | "ink";
  style?: ViewStyle;
  size?: "sm" | "md";
  icon?: React.ReactNode;
}

export function Pill({
  label,
  tone = "default",
  style,
  size = "md",
  icon,
}: Props) {
  const c = useColors();
  const map = {
    default: { bg: c.muted, fg: c.mutedForeground },
    success: { bg: c.successSoft, fg: c.success },
    warning: { bg: c.warningSoft, fg: c.warning },
    danger: { bg: c.dangerSoft, fg: c.destructive },
    accent: { bg: c.accentSoft, fg: c.accentDeep },
    ink: { bg: c.primary, fg: c.primaryForeground },
  } as const;
  const colors = map[tone];
  const padH = size === "sm" ? 8 : 11;
  const padV = size === "sm" ? 3 : 5;
  const fontSize = size === "sm" ? 11 : 12;
  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: colors.bg,
          paddingHorizontal: padH,
          paddingVertical: padV,
        },
        style,
      ]}
    >
      {icon}
      <Text
        style={[styles.text, { color: colors.fg, fontSize }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  text: {
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.1,
  },
});
