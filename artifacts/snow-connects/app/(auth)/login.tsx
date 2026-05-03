import { Feather } from "@expo/vector-icons";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

export default function LoginScreen() {
  const c = useColors();
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { refreshUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    if (!email.trim() || !password) {
      Alert.alert("Eksik bilgi", "Lütfen e-posta ve şifrenizi girin.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setLoading(false);
      Alert.alert("Giriş başarısız", error.message);
      return;
    }
    const profile = await refreshUser();
    console.log(
      "[login] signIn ok, profile role=",
      profile?.role,
      "id=",
      profile?.id,
      "next=",
      next,
    );
    setLoading(false);
    const target = resolveTarget(next, profile?.role);
    console.log("[login] redirecting to", target);
    router.replace(target as never);
  }

  return (
    <Screen hasHeader={false} contentStyle={{ gap: 22, paddingTop: 72 }}>
      <Pressable
        onPress={() => router.replace("/(app)/(tabs)")}
        style={styles.cancel}
      >
        <Text
          style={{
            color: c.mutedForeground,
            fontFamily: "Inter_500Medium",
            fontSize: 13,
          }}
        >
          Misafir gez
        </Text>
        <Feather name="arrow-right" size={14} color={c.mutedForeground} />
      </Pressable>

      <View style={styles.brand}>
        <View style={[styles.logoCircle, { backgroundColor: c.primary }]}>
          <Feather name="triangle" size={28} color={c.accent} />
        </View>
        <View style={{ alignItems: "center", gap: 8, marginTop: 4 }}>
          <Text style={[styles.eyebrow, { color: c.accentDeep }]}>
            SNOW CONNECTS
          </Text>
          <Text style={[styles.title, { color: c.foreground }]}>
            {`Hoş geldin\ntekrar.`}
          </Text>
          <Text style={[styles.subtitle, { color: c.mutedForeground }]}>
            Türkiye'nin en sevilen kayak eğitmenleriyle.
          </Text>
        </View>
      </View>

      <View style={{ gap: 12, marginTop: 8 }}>
        <Input
          label="E-posta"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
          placeholder="ornek@mail.com"
        />
        <Input
          label="Şifre"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
        />
        <View style={{ marginTop: 4 }}>
          <Button
            variant="accent"
            size="lg"
            label="Giriş Yap"
            loading={loading}
            onPress={onSubmit}
          />
        </View>
      </View>

      <View style={styles.footer}>
        <Text
          style={{
            color: c.mutedForeground,
            fontFamily: "Inter_400Regular",
            fontSize: 13,
          }}
        >
          Hesabın yok mu?{" "}
        </Text>
        <Link
          href={
            next
              ? { pathname: "/(auth)/register", params: { next } }
              : "/(auth)/register"
          }
          replace
        >
          <Text
            style={{
              color: c.accentDeep,
              fontFamily: "Inter_700Bold",
              fontSize: 13,
            }}
          >
            Kayıt ol
          </Text>
        </Link>
      </View>
    </Screen>
  );
}

function resolveTarget(next: string | undefined, role: string | undefined): string {
  // Admins always land on the admin panel — never the customer app, even if a
  // `next` redirect param is set, since they don't have customer flows.
  if (role === "admin") return "/(admin)/(tabs)";
  if (next) return next;
  return "/(app)/(tabs)";
}

const styles = StyleSheet.create({
  cancel: {
    position: "absolute",
    top: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    zIndex: 10,
  },
  brand: { alignItems: "center", gap: 14 },
  logoCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 2.5,
  },
  title: {
    fontFamily: "Fraunces_600SemiBold",
    fontSize: 36,
    letterSpacing: -1,
    textAlign: "center",
    lineHeight: 40,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 8,
  },
});
