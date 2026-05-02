import React from "react";
import { Platform, Pressable, View, type ViewStyle } from "react-native";

import { useColors } from "@/hooks/useColors";

type Tone = "default" | "ink" | "accent" | "soft" | "ghost";

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle | ViewStyle[];
  padding?: number;
  /**
   * Visual tone:
   *  - default → white card, soft shadow, no border (the workhorse)
   *  - ink     → deep ink card, white text (hero CTAs)
   *  - accent  → alpenglow coral fill (marketing moments)
   *  - soft    → warm sand fill, no shadow (quiet support cards)
   *  - ghost   → hairline border only, transparent fill
   */
  tone?: Tone;
  radius?: number;
  /** Add an extra pop of elevation. Use for floating CTAs. */
  elevated?: boolean;
}

/**
 * Card — rounded, softly shadowed surface. Lives on a warm cream
 * background, so the default white-on-cream pairing creates a subtle
 * editorial layering effect without harsh borders.
 */
export function Card({
  children,
  onPress,
  style,
  padding = 18,
  tone = "default",
  radius,
  elevated = false,
}: Props) {
  const c = useColors();

  const bg =
    tone === "ink"
      ? c.primary
      : tone === "accent"
        ? c.accent
        : tone === "soft"
          ? c.muted
          : tone === "ghost"
            ? "transparent"
            : c.card;

  const showShadow = tone === "default" || tone === "ink" || tone === "accent";
  const useBorder = tone === "ghost" || tone === "soft";

  const base: ViewStyle = {
    backgroundColor: bg,
    borderRadius: radius ?? c.radiusLg,
    padding,
    borderWidth: useBorder ? 1 : 0,
    borderColor: c.border,
    // Soft shadow on iOS/web; Android picks up via elevation below.
    ...(showShadow && Platform.OS !== "android"
      ? ({ boxShadow: elevated ? c.shadowLift : c.shadow } as ViewStyle)
      : {}),
    ...(showShadow && Platform.OS === "android"
      ? { elevation: elevated ? 6 : 2 }
      : {}),
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          base,
          style as ViewStyle,
          pressed && {
            transform: [{ scale: 0.995 }],
            opacity: 0.96,
          },
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}
