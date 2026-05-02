import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loading } from "@/components/ui/Loading";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { useColors } from "@/hooks/useColors";
import { formatTRY } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { AppUser, InstructorProfile, Resort } from "@/lib/types";

type Row = InstructorProfile & { user: Pick<AppUser, "id" | "name"> };

export default function ResortInstructors() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: resort } = useQuery({
    queryKey: ["resort", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resorts")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as Resort | null;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["instructors", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instructor_profiles")
        .select("*, user:users!inner(id, name, status, role)")
        .contains("resort_ids", [id]);
      if (error) throw error;
      return ((data ?? []) as (Row & { user: AppUser })[])
        .filter((r) => r.user.status === "active" && r.user.role === "instructor")
        .map((r) => ({ ...r, user: { id: r.user.id, name: r.user.name } }));
    },
    enabled: !!id,
  });

  return (
    <>
      <Stack.Screen
        options={{ title: resort?.name ?? "Eğitmenler" }}
      />
      <Screen contentStyle={{ gap: 12 }}>
        {resort ? (
          <View style={{ gap: 4 }}>
            <Text style={[styles.h1, { color: c.foreground }]}>
              {resort.name}
            </Text>
            <Text style={{ color: c.mutedForeground, fontSize: 13 }}>
              {resort.region}
            </Text>
          </View>
        ) : null}

        {isLoading ? (
          <Loading inline />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon="user-x"
            title="Bu pistte eğitmen yok"
            description="Yakın zamanda eğitmenler eklendiğinde burada görünecek."
          />
        ) : (
          data.map((p) => (
            <Card
              key={p.user_id}
              onPress={() => router.push(`/(app)/instructor/${p.user_id}`)}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: c.secondary, borderRadius: 100 },
                  ]}
                >
                  <Feather name="user" size={22} color={c.primary} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text
                    style={{
                      color: c.foreground,
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 16,
                    }}
                  >
                    {p.user.name || "Eğitmen"}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={styles.metaRow}>
                      <Feather name="star" size={12} color={c.warning} />
                      <Text
                        style={{ color: c.foreground, fontSize: 12 }}
                      >
                        {p.rating?.toFixed(1) ?? "5.0"}
                      </Text>
                    </View>
                    <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
                      {p.experience_years} yıl deneyim
                    </Text>
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={{
                      color: c.foreground,
                      fontFamily: "Inter_700Bold",
                      fontSize: 15,
                    }}
                  >
                    {formatTRY(Math.round(p.base_price * 1.2))}
                  </Text>
                  <Text style={{ color: c.mutedForeground, fontSize: 11 }}>
                    saatlik · KDV dahil
                  </Text>
                </View>
              </View>
            </Card>
          ))
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: "Inter_700Bold", fontSize: 22 },
  avatar: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
});
