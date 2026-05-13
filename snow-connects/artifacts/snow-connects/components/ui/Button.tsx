import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
type Size = "md" | "lg";

interface Props {
  label: string;
  onPress?: () => void | Promise<void>;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  testID?: string;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

/**
 * Button — pill shaped, generous touch targets, soft press feedback.
 *
 * Variants:
 *  - primary  → deep ink, white text. The default action.
 *  - accent   → alpenglow coral, white text. Use for the "moment of joy"
 *               — final confirms, primary marketing CTAs. Use sparingly.
 *  - secondary→ warm sand, ink text. Quiet support actions.
 *  - ghost    → transparent with hairline border. Tertiary actions.
 *  - danger   → red. Destructive only.
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  fullWidth = true,
  testID,
  icon,
  iconRight,
}: Props) {
  const c = useColors();
  const styles = makeStyles(c, variant, size);
  const isDisabled = disabled || loading;

  return (
    <Pressable
      testID={testID}
      onPress={() => {
        if (isDisabled) return;
        // Fire-and-forget haptics. Awaiting it can hang on web/Expo
        // and silently swallow the actual onPress (button looks dead).
        try {
          void Haptics.selectionAsync().catch(() => {});
        } catch {}
        try {
          const r = onPress?.();
          if (r && typeof (r as Promise<unknown>).catch === "function") {
            (r as Promise<unknown>).catch(() => {});
          }
        } catch {
          /* swallow — caller handles errors */
        }
      }}
      style={({ pressed }) => [
        styles.base,
        fullWidth && { alignSelf: "stretch" },
        pressed && !isDisabled && { transform: [{ scale: 0.98 }], opacity: 0.92 },
        isDisabled && { opacity: 0.45 },
      ]}
    >
      <View style={styles.inner}>
        {loading ? (
          <ActivityIndicator color={styles.label.color} size="small" />
        ) : (
          <>
            {icon}
            <Text style={styles.label}>{label}</Text>
            {iconRight}
          </>
        )}
      </View>
    </Pressable>
  );
}

function makeStyles(
  c: ReturnType<typeof useColors>,
  variant: Variant,
  size: Size,
) {
  const bg =
    variant === "primary"
      ? c.primary
      : variant === "accent"
        ? c.accent
        : variant === "secondary"
          ? c.secondary
          : variant === "danger"
            ? c.destructive
            : "transparent";
  const fg =
    variant === "primary"
      ? c.primaryForeground
      : variant === "accent"
        ? c.accentForeground
        : variant === "secondary"
          ? c.secondaryForeground
          : variant === "danger"
            ? c.destructiveForeground
            : c.foreground;
  const padV = size === "lg" ? 18 : 15;
  const fontSize = size === "lg" ? 17 : 15;
  return StyleSheet.create({
    base: {
      backgroundColor: bg,
      borderRadius: 999,
      paddingVertical: padV,
      paddingHorizontal: 22,
      borderWidth: variant === "ghost" ? 1 : 0,
      borderColor: c.border,
    },
    inner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },
    label: {
      color: fg,
      fontFamily: "Inter_600SemiBold",
      fontSize,
      letterSpacing: -0.1,
    },
  });
}
