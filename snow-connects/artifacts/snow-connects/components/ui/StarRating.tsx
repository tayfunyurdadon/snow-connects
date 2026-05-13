import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface StarRatingProps {
  value: number;
  onChange?: (next: number) => void;
  size?: number;
  readOnly?: boolean;
}

export function StarRating({
  value,
  onChange,
  size = 32,
  readOnly = false,
}: StarRatingProps) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        const Inner = (
          <Feather
            name="star"
            size={size}
            color={filled ? c.accent : c.borderSoft}
            style={{
              opacity: filled ? 1 : 0.9,
            }}
          />
        );
        if (readOnly || !onChange) {
          return <View key={n}>{Inner}</View>;
        }
        return (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            hitSlop={8}
            accessibilityLabel={`${n} yıldız`}
            accessibilityRole="button"
          >
            {Inner}
          </Pressable>
        );
      })}
    </View>
  );
}
