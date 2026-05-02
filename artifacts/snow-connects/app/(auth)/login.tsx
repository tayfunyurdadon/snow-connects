import { Feather } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";

export default function LoginScreen() {
  const c = useColors();
  const router = useRouter();
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
    setLoading(false);
    if (error) {
      Alert.alert("Giriş başarısız", error.message);
      return;
    }
    router.replace("/(app)/(tabs)");
  }

  return (
    <Screen hasHeader={false} contentStyle={{ gap: 18, paddingTop: 64 }}>
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
        <Link href="/(auth)/register" replace>
          <Text style={{ color: c.primary, fontFamily: "Inter_600SemiBold" }}>
            Kayıt ol
          </Text>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
