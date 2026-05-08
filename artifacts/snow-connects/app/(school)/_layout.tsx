import { Redirect, Stack } from "expo-router";
import React from "react";

import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";
import { adminTheme } from "@/lib/adminTheme";

export default function SchoolRootLayout() {
  const { loading, user, session } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Redirect href="/(auth)/login?next=/(school)" />;
  if (!user) return <Loading />;
  if (user.role !== "school_admin") {
    if (user.role === "admin") return <Redirect href="/(admin)/(tabs)" />;
    return <Redirect href="/(app)/(tabs)" />;
  }
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
    </Stack>
  );
}
