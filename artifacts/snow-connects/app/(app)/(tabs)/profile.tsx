import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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

  return (
    <Screen contentStyle={{ paddingTop: insets.top + 12, gap: 14 }}>
      <Text style={[styles.title, { color: c.foreground }]}>Profil</Text>

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View
            style={[
              styles.avatar,
              { backgroundColor: c.primary, borderRadius: 100 },
            ]}
          >
            <Text
              style={{
                color: c.primaryForeground,
                fontFamily: "Inter_700Bold",
                fontSize: 22,
              }}
            >
              {(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text
              style={{
                color: c.foreground,
                fontFamily: "Inter_700Bold",
                fontSize: 18,
              }}
            >
              {user?.name || "İsimsiz"}
            </Text>
            <Text style={{ color: c.mutedForeground, fontSize: 13 }}>
              {user?.email}
            </Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Pill label={roleLabel[user?.role ?? "customer"]} tone="accent" />
              {user?.status === "blocked" ? (
                <Pill label="Bloke" tone="danger" />
              ) : null}
              {user && user.strike_count > 0 ? (
                <Pill
                  label={`${user.strike_count} uyarı`}
                  tone="warning"
                />
              ) : null}
            </View>
          </View>
        </View>
      </Card>

      {user?.role === "instructor" ? (
        <>
          <ActionRow
            icon="calendar"
            label="Takvimimi Yönet"
            onPress={() => router.push("/(app)/instructor-panel/calendar")}
          />
          <ActionRow
            icon="user-check"
            label="Profilimi Düzenle"
            onPress={() => router.push("/(app)/instructor-panel/setup")}
          />
        </>
      ) : null}

      {user?.role === "admin" ? (
        <ActionRow
          icon="shield"
          label="Yönetici Paneli"
          onPress={() => router.push("/(app)/admin")}
        />
      ) : null}

      <Pressable>
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
      </Pressable>
    </Screen>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Card onPress={onPress}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View
          style={[
            styles.iconBox,
            { backgroundColor: c.secondary, borderRadius: c.radius },
          ]}
        >
          <Feather name={icon} size={20} color={c.primary} />
        </View>
        <Text
          style={{
            color: c.foreground,
            fontFamily: "Inter_600SemiBold",
            fontSize: 15,
            flex: 1,
          }}
        >
          {label}
        </Text>
        <Feather name="chevron-right" size={20} color={c.mutedForeground} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: "Inter_700Bold", fontSize: 24 },
  avatar: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBox: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
