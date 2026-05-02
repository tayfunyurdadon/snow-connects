import { Feather } from "@expo/vector-icons";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Header } from "@/components/ui/Header";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";
import type { UserRole } from "@/lib/types";

export default function RegisterScreen() {
  const c = useColors();
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { refreshUser } = useAuth();
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
      options: { data: { name: name.trim(), role } },
    });
    if (error) {
      setLoading(false);
      Alert.alert("Kayıt başarısız", error.message);
      return;
    }
    const userId = data.user?.id;
    if (userId && data.session) {
      await supabase
        .from("users")
        .update({ name: name.trim(), role })
        .eq("id", userId);
    }
    if (!data.session) {
      setLoading(false);
      Alert.alert(
        "E-postanı doğrula",
        "Hesabını aktive etmek için e-posta adresine gönderilen bağlantıya tıkla.",
        [{ text: "Tamam", onPress: () => router.replace("/(auth)/login") }],
      );
      return;
    }
    const profile = await refreshUser();
    setLoading(false);
    router.replace(resolveTarget(next, profile?.role ?? role) as never);
  }

  return (
    <Screen hasHeader={false} contentStyle={{ gap: 20, paddingTop: 72 }}>
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

      <Header
        eyebrow="Yeni Hesap"
        title={`Aramıza\nhoş geldin.`}
        subtitle="Birkaç saniye, ve dersini ayarlamaya hazırsın."
      />

      <View style={{ gap: 12, marginTop: 4 }}>
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
            color: c.mutedForeground,
            fontFamily: "Inter_500Medium",
            fontSize: 11,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            marginTop: 6,
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
                  borderWidth: 1.5,
                  borderColor: active ? c.accent : c.borderSoft,
                  backgroundColor: active ? c.accentSoft : c.card,
                  paddingVertical: 16,
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Feather
                  name={r === "customer" ? "user" : "award"}
                  size={20}
                  color={active ? c.accentDeep : c.mutedForeground}
                />
                <Text
                  style={{
                    color: active ? c.accentDeep : c.foreground,
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 14,
                  }}
                >
                  {r === "customer" ? "Öğrenci" : "Eğitmen"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ marginTop: 6 }}>
          <Button
            variant="accent"
            size="lg"
            label="Hesap Oluştur"
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
          Zaten hesabın var mı?{" "}
        </Text>
        <Link
          href={
            next
              ? { pathname: "/(auth)/login", params: { next } }
              : "/(auth)/login"
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
            Giriş yap
          </Text>
        </Link>
      </View>
    </Screen>
  );
}

function resolveTarget(next: string | undefined, role: UserRole): string {
  if (role === "instructor") return "/(app)/instructor-panel/setup";
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
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 8,
  },
});
