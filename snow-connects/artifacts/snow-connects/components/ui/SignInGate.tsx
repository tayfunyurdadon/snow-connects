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
        paddingTop: insets.top + 80,
        gap: 18,
        alignItems: "center",
      }}
    >
      <View style={[styles.iconWrap, { backgroundColor: c.accentSoft }]}>
        <Feather name="lock" size={28} color={c.accentDeep} />
      </View>
      <View style={{ alignItems: "center", gap: 8, paddingHorizontal: 8 }}>
        <Text style={[styles.title, { color: c.foreground }]}>{title}</Text>
        <Text style={[styles.desc, { color: c.mutedForeground }]}>
          {description}
        </Text>
      </View>
      <View style={{ width: "100%", gap: 10, marginTop: 16 }}>
        <Button
          variant="accent"
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
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: "Fraunces_600SemiBold",
    fontSize: 24,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  desc: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 16,
    lineHeight: 21,
  },
});
