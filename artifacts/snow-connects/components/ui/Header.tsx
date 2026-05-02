import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface Props {
  /** Tiny eyebrow line above the title (e.g. "HOŞ GELDİN"). */
  eyebrow?: string;
  /** Editorial serif title. */
  title: string;
  /** Body-style subtitle line below. */
  subtitle?: string;
  align?: "left" | "center";
}

/**
 * Editorial header — small uppercase eyebrow, big serif title,
 * comfortable subtitle. Used at the top of most primary screens to set
 * the tone before the content rail begins.
 */
export function Header({ eyebrow, title, subtitle, align = "left" }: Props) {
  const c = useColors();
  const textAlign = align;
  return (
    <View style={{ gap: 6, alignItems: align === "center" ? "center" : "flex-start" }}>
      {eyebrow ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <View
            style={{
              width: 14,
              height: 1,
              backgroundColor: c.accent,
            }}
          />
          <Text
            style={{
              color: c.accentDeep,
              fontFamily: "Inter_600SemiBold",
              fontSize: 11,
              letterSpacing: 1.4,
              textTransform: "uppercase",
            }}
          >
            {eyebrow}
          </Text>
        </View>
      ) : null}
      <Text
        style={{
          color: c.foreground,
          fontFamily: "Fraunces_600SemiBold",
          fontSize: 30,
          lineHeight: 36,
          letterSpacing: -0.6,
          textAlign,
        }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={{
            color: c.mutedForeground,
            fontFamily: "Inter_400Regular",
            fontSize: 14,
            lineHeight: 20,
            textAlign,
            maxWidth: align === "center" ? 320 : undefined,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
