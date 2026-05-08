import { Feather } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";

import { adminTheme } from "@/lib/adminTheme";

export default function SchoolTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: adminTheme.bg },
        headerShadowVisible: false,
        headerTitleStyle: {
          color: adminTheme.text,
          fontFamily: adminTheme.fontTitle,
          fontSize: 15,
          letterSpacing: 0.2,
        },
        headerTintColor: adminTheme.text,
        tabBarActiveTintColor: adminTheme.accent,
        tabBarInactiveTintColor: adminTheme.textDim,
        tabBarStyle: {
          backgroundColor: adminTheme.surface,
          borderTopColor: adminTheme.border,
          borderTopWidth: 1,
          elevation: 0,
          height: Platform.OS === "ios" ? 84 : 64,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontFamily: "Inter_600SemiBold",
          fontSize: 10,
          letterSpacing: 0.3,
          marginBottom: Platform.OS === "ios" ? 0 : 6,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Eğitmenler",
          headerTitle: "Okul Eğitmenleri",
          tabBarIcon: ({ color }) => (
            <Feather name="users" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: "Rezervasyonlar",
          headerTitle: "Rezervasyonlar",
          tabBarIcon: ({ color }) => (
            <Feather name="calendar" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="payouts"
        options={{
          title: "Gelirler",
          headerTitle: "Gelirler",
          tabBarIcon: ({ color }) => (
            <Feather name="dollar-sign" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          headerTitle: "Okul Profili",
          tabBarIcon: ({ color }) => (
            <Feather name="settings" size={20} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
