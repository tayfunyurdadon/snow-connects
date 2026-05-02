import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface Props {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  description?: string;
}

export function EmptyState({ icon = "inbox", title, description }: Props) {
  const c = useColors();
  return (
    <View style={styles.wrap}>
      <Feather name={icon} size={42} color={c.mutedForeground} />
      <Text style={[styles.title, { color: c.foreground }]}>{title}</Text>
      {description ? (
        <Text style={[styles.desc, { color: c.mutedForeground }]}>
          {description}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 8,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    textAlign: "center",
  },
  desc: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 24,
    lineHeight: 20,
  },
});
