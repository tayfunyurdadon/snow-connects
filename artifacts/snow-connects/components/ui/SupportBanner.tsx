import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

export function SupportBanner({
  variant = "soft",
}: {
  variant?: "soft" | "tinted";
}) {
  const c = useColors();
  const router = useRouter();
  const bg = variant === "tinted" ? c.accentSoft : c.muted;
  return (
    <Pressable
      onPress={() => router.push("/(app)/support")}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: c.radiusLg,
        backgroundColor: bg,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: c.card,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name="life-buoy" size={16} color={c.accentDeep} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: c.foreground,
            fontFamily: "Inter_700Bold",
            fontSize: 13,
          }}
        >
          Yardıma mı ihtiyacın var?
        </Text>
        <Text
          style={{
            color: c.mutedForeground,
            fontFamily: "Inter_400Regular",
            fontSize: 12,
            marginTop: 1,
          }}
        >
          Snow Connects ekibi sana hızlıca yardımcı olur.
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={c.mutedForeground} />
    </Pressable>
  );
}
