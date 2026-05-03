import { Redirect, Stack } from "expo-router";
import React from "react";

import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function AppLayout() {
  const { loading, user } = useAuth();
  const c = useColors();

  // Guest browsing is allowed. Individual screens (booking, payment, chat,
  // panels) gate on session themselves.
  if (loading) return <Loading />;
  // Admins should never see customer/instructor surfaces — bounce them to
  // their own area. The (admin) layout enforces the same gate from its side.
  if (user?.role === "admin") return <Redirect href="/(admin)/(tabs)" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.background },
        headerShadowVisible: false,
        headerTitleStyle: {
          color: c.foreground,
          fontFamily: "Inter_600SemiBold",
          fontSize: 16,
        },
        headerTintColor: c.foreground,
        headerBackTitle: "Geri",
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="resort/[id]" options={{ title: "" }} />
      <Stack.Screen name="instructor/[id]" options={{ title: "" }} />
      <Stack.Screen
        name="dates/[instructorId]"
        options={{ title: "Tarih seç" }}
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
      <Stack.Screen
        name="instructor-panel/payments"
        options={{ title: "Ödemelerim" }}
      />
      <Stack.Screen
        name="instructor-panel/payment/[id]"
        options={{ title: "Ödeme Detayı" }}
      />
      <Stack.Screen
        name="instructor-panel/verification/index"
        options={{ title: "Eğitmenlik Başvurusu" }}
      />
      <Stack.Screen name="support" options={{ title: "Yardım & Destek" }} />
    </Stack>
  );
}
