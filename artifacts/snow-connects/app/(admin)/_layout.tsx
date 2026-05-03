import { Feather } from "@expo/vector-icons";
import { Redirect, Stack, Tabs } from "expo-router";
import React from "react";
import { Platform, View } from "react-native";

import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";
import { adminTheme } from "@/lib/adminTheme";

export default function AdminRootLayout() {
  const { loading, user, session } = useAuth();
  if (loading) return <Loading />;
  // Hard gate: only authenticated admins can render anything inside (admin).
  if (!session) return <Redirect href="/(auth)/login?next=/(admin)" />;
  if (user?.role !== "admin") return <Redirect href="/(app)/(tabs)" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: adminTheme.bg },
        headerShadowVisible: false,
        headerTitleStyle: {
          color: adminTheme.text,
          fontFamily: adminTheme.fontTitle,
          fontSize: 16,
        },
        headerTintColor: adminTheme.text,
        contentStyle: { backgroundColor: adminTheme.bg },
        headerBackTitle: "Geri",
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="verification/[id]"
        options={{ title: "Başvuru İncelemesi" }}
      />
    </Stack>
  );
}
