import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
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
import type { SkiSchool, UserRole } from "@/lib/types";

export default function RegisterScreen() {
  const c = useColors();
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { refreshUser } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("customer");
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: schools } = useQuery({
    queryKey: ["public-schools"],
    enabled: role === "instructor",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ski_schools")
        .select("id, name, logo, description, status")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Pick<
        SkiSchool,
        "id" | "name" | "logo" | "description" | "status"
      >[];
    },
  });

  async function onSubmit() {
    if (!name.trim() || !email.trim() || password.length < 6) {
      Alert.alert(
        "Eksik bilgi",
        "Tüm alanları doldurun. Şifre en az 6 karakter olmalı.",
      );
      return;
    }
    setLoading(true);
    const meta: Record<string, unknown> = { name: name.trim(), role };
    if (role === "instructor" && schoolId) meta.school_id = schoolId;
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: meta },
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
      // Belt-and-suspenders: ensure school_id stuck even if trigger missed it
      if (role === "instructor" && schoolId) {
        await supabase
          .from("instructor_profiles")
          .update({
            school_id: schoolId,
            school_approval_status: "pending",
            verification_status: "pending_review",
          })
          .eq("user_id", userId);
      }
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
    router.replace(
      resolveTarget(next, profile?.role ?? role, !!schoolId) as never,
    );
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
                onPress={() => {
                  setRole(r);
                  if (r !== "instructor") setSchoolId(null);
                }}
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

        {role === "instructor" ? (
          <View style={{ gap: 8, marginTop: 6 }}>
            <Text
              style={{
                color: c.mutedForeground,
                fontFamily: "Inter_500Medium",
                fontSize: 11,
                letterSpacing: 0.6,
                textTransform: "uppercase",
              }}
            >
              Bağlı olduğun okul (isteğe bağlı)
            </Text>
            <Pressable
              onPress={() => setSchoolId(null)}
              style={{
                borderRadius: c.radius,
                borderWidth: 1.5,
                borderColor: schoolId === null ? c.accent : c.borderSoft,
                backgroundColor: schoolId === null ? c.accentSoft : c.card,
                padding: 12,
              }}
            >
              <Text
                style={{
                  color: c.foreground,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 13,
                }}
              >
                Bağımsız Eğitmen
              </Text>
              <Text
                style={{
                  color: c.mutedForeground,
                  fontFamily: "Inter_400Regular",
                  fontSize: 12,
                  marginTop: 2,
                }}
              >
                Platform yönetimi onaylar, ödemeler doğrudan sana gelir.
              </Text>
            </Pressable>
            {(schools ?? []).map((s) => {
              const active = s.id === schoolId;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => setSchoolId(s.id)}
                  style={{
                    borderRadius: c.radius,
                    borderWidth: 1.5,
                    borderColor: active ? c.accent : c.borderSoft,
                    backgroundColor: active ? c.accentSoft : c.card,
                    padding: 12,
                  }}
                >
                  <Text
                    style={{
                      color: c.foreground,
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 13,
                    }}
                  >
                    {s.name}
                  </Text>
                  {s.description ? (
                    <Text
                      style={{
                        color: c.mutedForeground,
                        fontFamily: "Inter_400Regular",
                        fontSize: 12,
                        marginTop: 2,
                      }}
                      numberOfLines={2}
                    >
                      {s.description}
                    </Text>
                  ) : null}
                  <Text
                    style={{
                      color: c.mutedForeground,
                      fontFamily: "Inter_500Medium",
                      fontSize: 11,
                      marginTop: 4,
                    }}
                  >
                    Okul yönetimi onaylar, ödemeler okul hesabına yatar.
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

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

function resolveTarget(
  next: string | undefined,
  role: UserRole,
  hasSchool: boolean,
): string {
  if (role === "school_admin") return "/(school)/(tabs)";
  if (role === "instructor") {
    // School-affiliated instructors don't fill the platform verification
    // flow — they wait for school approval.
    if (hasSchool) return "/(app)/(tabs)";
    return "/(app)/instructor-panel/verification";
  }
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
