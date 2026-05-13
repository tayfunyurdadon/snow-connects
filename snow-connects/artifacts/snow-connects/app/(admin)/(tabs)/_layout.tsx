import { Feather } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";

import { adminTheme } from "@/lib/adminTheme";

export default function AdminTabsLayout() {
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
          title: "Pano",
          headerTitle: "Yönetici Panosu",
          tabBarIcon: ({ color }) => (
            <Feather name="grid" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="approvals"
        options={{
          title: "Onaylar",
          headerTitle: "Eğitmen Onayları",
          tabBarIcon: ({ color }) => (
            <Feather name="check-square" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          title: "Kullanıcılar",
          headerTitle: "Kullanıcılar",
          tabBarIcon: ({ color }) => (
            <Feather name="users" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="operations"
        options={{
          title: "Operasyon",
          headerTitle: "Operasyon",
          tabBarIcon: ({ color }) => (
            <Feather name="activity" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="system"
        options={{
          title: "Sistem",
          headerTitle: "Sistem",
          tabBarIcon: ({ color }) => (
            <Feather name="sliders" size={20} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
