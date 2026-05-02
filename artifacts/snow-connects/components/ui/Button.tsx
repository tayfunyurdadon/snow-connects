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

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props {
  label: string;
  onPress?: () => void | Promise<void>;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  testID?: string;
  icon?: React.ReactNode;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  fullWidth = true,
  testID,
  icon,
}: Props) {
  const c = useColors();

  const styles = makeStyles(c, variant);
  const isDisabled = disabled || loading;

  return (
    <Pressable
      testID={testID}
      onPress={async () => {
        if (isDisabled) return;
        try {
          await Haptics.selectionAsync();
        } catch {}
        await onPress?.();
      }}
      style={({ pressed }) => [
        styles.base,
        fullWidth && { alignSelf: "stretch" },
        pressed && !isDisabled && { opacity: 0.85 },
        isDisabled && { opacity: 0.5 },
      ]}
    >
      <View style={styles.inner}>
        {loading ? (
          <ActivityIndicator color={styles.label.color} />
        ) : (
          <>
            {icon}
            <Text style={styles.label}>{label}</Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

function makeStyles(c: ReturnType<typeof useColors>, variant: Variant) {
  const bg =
    variant === "primary"
      ? c.primary
      : variant === "secondary"
        ? c.secondary
        : variant === "danger"
          ? c.destructive
          : "transparent";
  const fg =
    variant === "primary"
      ? c.primaryForeground
      : variant === "secondary"
        ? c.secondaryForeground
        : variant === "danger"
          ? c.destructiveForeground
          : c.primary;
  return StyleSheet.create({
    base: {
      backgroundColor: bg,
      borderRadius: c.radius,
      paddingVertical: 14,
      paddingHorizontal: 18,
      borderWidth: variant === "ghost" ? 1 : 0,
      borderColor: c.border,
    },
    inner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    label: {
      color: fg,
      fontFamily: "Inter_600SemiBold",
      fontSize: 16,
    },
  });
}
