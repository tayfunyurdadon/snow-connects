import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Alert, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Header } from "@/components/ui/Header";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { SignInGate } from "@/components/ui/SignInGate";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function ProfileTab() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();

  const roleLabel: Record<string, string> = {
    customer: "Öğrenci",
    instructor: "Eğitmen",
    admin: "Yönetici",
  };

  if (!user) {
    return (
      <SignInGate
        title="Profiline eriş"
        description="Hesabını yönetmek ve bilgilerini güncellemek için giriş yap."
      />
    );
  }

  const initial = (user.name || user.email || "?").slice(0, 1).toUpperCase();

  return (
    <Screen contentStyle={{ paddingTop: insets.top + 16, gap: 18 }}>
      <Header eyebrow="Hesabım" title="Profil" />

      {/* Identity card — large editorial */}
      <Card padding={20}>
        <View style={{ alignItems: "center", gap: 12 }}>
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: c.primary,
                ...(Platform.OS !== "android"
                  ? ({ boxShadow: c.shadow } as object)
                  : { elevation: 2 }),
              },
            ]}
          >
            <Text
              style={{
                color: c.primaryForeground,
                fontFamily: "Fraunces_600SemiBold",
                fontSize: 36,
                letterSpacing: -1.2,
              }}
            >
              {initial}
            </Text>
          </View>
          <View style={{ alignItems: "center", gap: 4 }}>
            <Text
              style={{
                color: c.foreground,
                fontFamily: "Fraunces_600SemiBold",
                fontSize: 22,
                letterSpacing: -0.4,
              }}
            >
              {user?.name || "İsimsiz"}
            </Text>
            <Text
              style={{
                color: c.mutedForeground,
                fontFamily: "Inter_500Medium",
                fontSize: 13,
              }}
            >
              {user?.email}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
            <Pill label={roleLabel[user?.role ?? "customer"]} tone="accent" />
            {user?.status === "blocked" ? (
              <Pill label="Bloke" tone="danger" />
            ) : null}
            {user && user.strike_count > 0 ? (
              <Pill label={`${user.strike_count} uyarı`} tone="warning" />
            ) : null}
          </View>
        </View>
      </Card>

      <View style={{ gap: 8 }}>
        {user?.role === "instructor" ? (
          <>
            <ActionRow
              icon="calendar"
              label="Takvimimi Yönet"
              hint="Açık ve kapalı saatlerini düzenle"
              onPress={() => router.push("/(app)/instructor-panel/calendar")}
            />
            <ActionRow
              icon="user-check"
              label="Profilimi Düzenle"
              hint="Bio, fiyat, çalıştığın pistler"
              onPress={() => router.push("/(app)/instructor-panel/setup")}
            />
          </>
        ) : null}

        {user?.role === "admin" ? (
          <ActionRow
            icon="shield"
            label="Yönetici Paneli"
            hint="Eğitmenler, rezervasyonlar, bildirimler"
            onPress={() => router.push("/(app)/admin")}
          />
        ) : null}
      </View>

      <View style={{ marginTop: 8 }}>
        <Button
          label="Çıkış Yap"
          variant="ghost"
          onPress={() =>
            Alert.alert("Çıkış", "Hesabınızdan çıkmak istiyor musunuz?", [
              { text: "İptal", style: "cancel" },
              {
                text: "Çıkış",
                style: "destructive",
                onPress: async () => {
                  await signOut();
                  router.replace("/(auth)/login");
                },
              },
            ])
          }
        />
      </View>
    </Screen>
  );
}

function ActionRow({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Card onPress={onPress} padding={16}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            backgroundColor: c.accentSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name={icon} size={18} color={c.accentDeep} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              color: c.foreground,
              fontFamily: "Inter_600SemiBold",
              fontSize: 15,
            }}
          >
            {label}
          </Text>
          {hint ? (
            <Text
              style={{
                color: c.mutedForeground,
                fontFamily: "Inter_400Regular",
                fontSize: 12,
              }}
            >
              {hint}
            </Text>
          ) : null}
        </View>
        <Feather name="chevron-right" size={18} color={c.taupeSoft ?? c.mutedForeground} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
  },
});
