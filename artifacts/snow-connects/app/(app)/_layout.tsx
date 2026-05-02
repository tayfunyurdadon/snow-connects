import { Stack } from "expo-router";
import React from "react";

import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function AppLayout() {
  const { loading } = useAuth();
  const c = useColors();

  // Guest browsing is allowed. Individual screens (booking, payment, chat,
  // panels) gate on session themselves.
  if (loading) return <Loading />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.primary },
        headerTitleStyle: {
          color: c.primaryForeground,
          fontFamily: "PlayfairDisplay_700Bold",
          fontSize: 18,
        },
        headerTintColor: c.primaryForeground,
        headerBackTitle: "Geri",
        headerShadowVisible: false,
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
