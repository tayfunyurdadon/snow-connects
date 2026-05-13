import React from "react";
import { ActivityIndicator, View } from "react-native";

import { useColors } from "@/hooks/useColors";

export function Loading({ inline = false }: { inline?: boolean }) {
  const c = useColors();
  if (inline) {
    return (
      <View style={{ paddingVertical: 24, alignItems: "center" }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: c.background,
      }}
    >
      <ActivityIndicator color={c.primary} size="large" />
    </View>
  );
}
