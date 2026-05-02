import { Redirect, Stack } from "expo-router";
import React from "react";

import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function AppLayout() {
  const { loading, session } = useAuth();
  const c = useColors();

  if (loading) return <Loading />;
  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.background },
        headerTitleStyle: {
          color: c.foreground,
          fontFamily: "Inter_600SemiBold",
        },
        headerTintColor: c.primary,
        headerBackTitle: "Geri",
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="resort/[id]" options={{ title: "Eğitmenler" }} />
      <Stack.Screen
        name="instructor/[id]"
        options={{ title: "Eğitmen Profili" }}
      />
      <Stack.Screen
        name="book/[instructorId]"
        options={{ title: "Rezervasyon" }}
      />
      <Stack.Screen name="payment/[bookingId]" options={{ title: "Ödeme" }} />
      <Stack.Screen name="messages/[userId]" options={{ title: "Sohbet" }} />
      <Stack.Screen
        name="instructor-panel/calendar"
        options={{ title: "Takvimim" }}
      />
      <Stack.Screen
        name="instructor-panel/setup"
        options={{ title: "Profil Kurulumu" }}
      />
      <Stack.Screen name="admin/index" options={{ title: "Yönetici Paneli" }} />
    </Stack>
  );
}
