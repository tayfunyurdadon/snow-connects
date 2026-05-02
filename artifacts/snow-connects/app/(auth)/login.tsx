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
    setLoading(false);
    const target = resolveTarget(next, profile?.role);
    router.replace(target as never);
  }

  return (
    <Screen hasHeader={false} contentStyle={{ gap: 18, paddingTop: 64 }}>
      <Pressable
        onPress={() => router.replace("/(app)/(tabs)")}
        style={styles.cancel}
      >
        <Feather name="x" size={20} color={c.mutedForeground} />
        <Text style={{ color: c.mutedForeground, fontFamily: "Inter_500Medium" }}>
          Misafir olarak gez
        </Text>
      </Pressable>

      <View style={styles.brand}>
        <View
          style={[
            styles.logoCircle,
            { backgroundColor: c.primary, borderRadius: 100 },
          ]}
        >
          <Feather name="cloud-snow" size={36} color={c.primaryForeground} />
        </View>
        <Text style={[styles.title, { color: c.foreground }]}>
          Snow Connects
        </Text>
        <Text style={[styles.subtitle, { color: c.mutedForeground }]}>
          Türkiye'nin en iyi kayak eğitmenleriyle buluşun
        </Text>
      </View>

      <View style={{ gap: 12, marginTop: 12 }}>
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
        <Button label="Giriş Yap" loading={loading} onPress={onSubmit} />
      </View>

      <View style={styles.footer}>
        <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular" }}>
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
          <Text style={{ color: c.primary, fontFamily: "Inter_600SemiBold" }}>
            Kayıt ol
          </Text>
        </Link>
      </View>
    </Screen>
  );
}

function resolveTarget(next: string | undefined, role: string | undefined): string {
  if (next) return next;
  // Role-aware landing handled inside the home tab itself.
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
    padding: 6,
    zIndex: 10,
  },
  brand: { alignItems: "center", gap: 12 },
  logoCircle: {
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 28, letterSpacing: -0.5 },
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
