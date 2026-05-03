import { Feather } from "@expo/vector-icons";
import { Redirect, Stack, Tabs } from "expo-router";
import React from "react";
import { Platform, View } from "react-native";

import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";
import { adminTheme } from "@/lib/adminTheme";

export default function AdminRootLayout() {
  const { loading, user, session } = useAuth();
  console.log(
    "[admin/_layout] render loading=",
    loading,
    "session?",
    !!session,
    "user?",
    !!user,
    "role=",
    user?.role,
  );
  if (loading) return <Loading />;
  // Hard gate: only authenticated admins can render anything inside (admin).
  if (!session) {
    console.log("[admin/_layout] no session → /(auth)/login");
    return <Redirect href="/(auth)/login?next=/(admin)" />;
  }
  // If session exists but profile hasn't loaded yet, wait — do NOT bounce to
  // the customer app, otherwise admins flicker out before fetchProfile lands.
  if (!user) {
    console.log("[admin/_layout] session present but user null → waiting");
    return <Loading />;
  }
  if (user.role !== "admin") {
    console.log(
      "[admin/_layout] non-admin role=",
      user.role,
      "→ /(app)/(tabs)",
    );
    return <Redirect href="/(app)/(tabs)" />;
  }
  console.log("[admin/_layout] admin authenticated, rendering stack");

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
