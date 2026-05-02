import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";
import type { UserRole } from "@/lib/types";

export default function RegisterScreen() {
  const c = useColors();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("customer");
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    if (!name.trim() || !email.trim() || password.length < 6) {
      Alert.alert(
        "Eksik bilgi",
        "Tüm alanları doldurun. Şifre en az 6 karakter olmalı.",
      );
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() } },
    });
    if (error) {
      setLoading(false);
      Alert.alert("Kayıt başarısız", error.message);
      return;
    }
    // Set role on the profile row created by trigger.
    const userId = data.user?.id;
    if (userId) {
      await supabase
        .from("users")
        .update({ name: name.trim(), role })
        .eq("id", userId);
    }
    setLoading(false);
    router.replace("/(app)/(tabs)");
  }

  return (
    <Screen hasHeader={false} contentStyle={{ gap: 18, paddingTop: 64 }}>
      <Text style={[styles.title, { color: c.foreground }]}>Kayıt Ol</Text>
      <Text style={[styles.subtitle, { color: c.mutedForeground }]}>
        Ücretsiz hesap oluştur, dakikalar içinde dersini ayarla
      </Text>

      <View style={{ gap: 12, marginTop: 8 }}>
        <Input
          label="Ad Soyad"
          value={name}
          onChangeText={setName}
          placeholder="Adınız Soyadınız"
        />
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
          placeholder="En az 6 karakter"
        />

        <Text
          style={{
            color: c.foreground,
            fontFamily: "Inter_500Medium",
            fontSize: 13,
            marginTop: 4,
          }}
        >
          Hesap türü
        </Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {(["customer", "instructor"] as const).map((r) => {
            const active = r === role;
            return (
              <Pressable
                key={r}
                onPress={() => setRole(r)}
                style={{
                  flex: 1,
                  borderRadius: c.radius,
                  borderWidth: 1,
                  borderColor: active ? c.primary : c.border,
                  backgroundColor: active ? c.secondary : c.card,
                  paddingVertical: 14,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: active ? c.primary : c.foreground,
                    fontFamily: "Inter_600SemiBold",
                  }}
                >
                  {r === "customer" ? "Öğrenci" : "Eğitmen"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Button label="Hesap Oluştur" loading={loading} onPress={onSubmit} />
      </View>

      <View style={styles.footer}>
        <Text
          style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular" }}
        >
          Zaten hesabın var mı?{" "}
        </Text>
        <Link href="/(auth)/login" replace>
          <Text style={{ color: c.primary, fontFamily: "Inter_600SemiBold" }}>
            Giriş yap
          </Text>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: "Inter_700Bold", fontSize: 26, letterSpacing: -0.5 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 14 },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 8,
  },
});
