import React from "react";
import { Platform, Pressable, View, type ViewStyle } from "react-native";

import { useColors } from "@/hooks/useColors";

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle | ViewStyle[];
  padding?: number;
  /**
   * Visual tone:
   * - "default": white card with subtle elevation (premium feel)
   * - "flat":    no shadow, just a hairline border (compact rows / dense grids)
   */
  tone?: "default" | "flat";
}

export function Card({
  children,
  onPress,
  style,
  padding = 18,
  tone = "default",
}: Props) {
  const c = useColors();
  const isWeb = Platform.OS === "web";
  const elevated = tone === "default";

  const base: ViewStyle = {
    backgroundColor: c.card,
    borderRadius: c.radius,
    padding,
    borderWidth: elevated ? 0 : 1,
    borderColor: c.border,
    ...(elevated
      ? isWeb
        ? // RN web logs a deprecation warning for shadow* but boxShadow
          // is the supported equivalent and renders identically.
          ({ boxShadow: "0 4px 18px rgba(10,22,40,0.06)" } as ViewStyle)
        : {
            shadowColor: "#0A1628",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 14,
            elevation: 3,
          }
      : {}),
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          base,
          style as ViewStyle,
          pressed && { opacity: 0.94 },
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}
