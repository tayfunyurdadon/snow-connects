import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { useColors } from "@/hooks/useColors";

interface Props {
  title?: string;
  description?: string;
  /** Where to send the user after they finish signing in. */
  returnTo?: string;
}

export function SignInGate({
  title = "Devam etmek için giriş yap",
  description = "Hesabın olmadan da pistleri ve eğitmenleri inceleyebilirsin.",
  returnTo,
}: Props) {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const next = returnTo ? `?next=${encodeURIComponent(returnTo)}` : "";

  return (
    <Screen
      hasHeader={false}
      contentStyle={{
        paddingTop: insets.top + 64,
        gap: 18,
        alignItems: "center",
      }}
    >
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: c.secondary, borderRadius: 100 },
        ]}
      >
        <Feather name="lock" size={32} color={c.primary} />
      </View>
      <Text style={[styles.title, { color: c.foreground }]}>{title}</Text>
      <Text style={[styles.desc, { color: c.mutedForeground }]}>
        {description}
      </Text>
      <View style={{ width: "100%", gap: 10, marginTop: 12 }}>
        <Button
          label="Giriş Yap"
          onPress={() => router.push(`/(auth)/login${next}` as never)}
        />
        <Button
          label="Kayıt Ol"
          variant="ghost"
          onPress={() => router.push(`/(auth)/register${next}` as never)}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    textAlign: "center",
  },
  desc: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 16,
    lineHeight: 20,
  },
});
