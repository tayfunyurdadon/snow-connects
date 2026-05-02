import React from "react";
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

interface Props {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: ViewStyle;
  hasHeader?: boolean;
}

export function Screen({
  children,
  scroll = true,
  padded = true,
  refreshing,
  onRefresh,
  contentStyle,
  hasHeader = true,
}: Props) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const bottomPad = isWeb ? 34 : 0;
  const topPad = !hasHeader ? insets.top : 0;

  const content: ViewStyle = {
    paddingHorizontal: padded ? 18 : 0,
    paddingBottom: padded ? 24 + bottomPad : bottomPad,
    paddingTop: topPad,
    gap: padded ? 14 : 0,
    ...(contentStyle ?? {}),
  };

  if (scroll) {
    return (
      <ScrollView
        style={[styles.fill, { backgroundColor: c.background }]}
        contentContainerStyle={content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <View style={[styles.fill, { backgroundColor: c.background }, content]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
