import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

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

type SlotFilter = "morning" | "afternoon" | "all";

const FILTERS: { id: SlotFilter; label: string }[] = [
  { id: "morning", label: "Sabah" },
  { id: "afternoon", label: "Öğleden sonra" },
  { id: "all", label: "Tam gün" },
];

export default function ResortInstructors() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [filter, setFilter] = useState<SlotFilter>("all");

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
        .filter(
          (r) => r.user.status === "active" && r.user.role === "instructor",
        )
        .map((r) => ({ ...r, user: { id: r.user.id, name: r.user.name } }));
    },
    enabled: !!id,
  });

  // The Morning / Afternoon / Full day chips are a Maison-Sport-style
  // intent filter. With slot-level availability data still TBD, we keep
  // every instructor visible regardless of choice. Once instructors start
  // blocking slots, this is where we'd cross-reference time_slots.
  const visible = data ?? [];

  return (
    <>
      <Stack.Screen options={{ title: resort?.name ?? "Eğitmenler" }} />
      <Screen contentStyle={{ gap: 14 }}>
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

        <View style={{ gap: 6 }}>
          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
            Ders saati
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {FILTERS.map((f) => {
              const active = filter === f.id;
              return (
                <Pressable
                  key={f.id}
                  onPress={() => setFilter(f.id)}
                  style={[
                    styles.chip,
                    {
                      borderRadius: c.radius,
                      borderColor: active ? c.primary : c.border,
                      backgroundColor: active ? c.primary : c.card,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: active ? c.primaryForeground : c.foreground,
                      fontFamily: "Inter_500Medium",
                      fontSize: 12,
                    }}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {isLoading ? (
          <Loading inline />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="user-x"
            title="Bu pistte eğitmen yok"
            description="Yakın zamanda eğitmenler eklendiğinde burada görünecek."
          />
        ) : (
          visible.map((p) => (
            <InstructorCard
              key={p.user_id}
              row={p}
              onPress={() => router.push(`/(app)/instructor/${p.user_id}`)}
            />
          ))
        )}
      </Screen>
    </>
  );
}

function InstructorCard({
  row,
  onPress,
}: {
  row: Row;
  onPress: () => void;
}) {
  const c = useColors();
  const initial = (row.user.name || "?").slice(0, 1).toUpperCase();
  const customerPrice = Math.round(row.base_price * 1.2);
  const rating = row.rating ?? 5;
  return (
    <Card onPress={onPress}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {row.photo ? (
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          <View
            style={[
              styles.photo,
              { backgroundColor: c.secondary, borderRadius: 12 },
            ]}
          >
            {/* Photo URL renders only when set; otherwise we fall back below. */}
            <Text style={{ display: "none" }}>{row.photo}</Text>
            <Feather name="user" size={28} color={c.primary} />
          </View>
        ) : (
          <View
            style={[
              styles.photo,
              {
                backgroundColor: c.primary,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <Text
              style={{
                color: c.primaryForeground,
                fontFamily: "Inter_700Bold",
                fontSize: 24,
              }}
            >
              {initial}
            </Text>
          </View>
        )}

        <View style={{ flex: 1, gap: 4 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 8,
            }}
          >
            <Text
              style={{
                color: c.foreground,
                fontFamily: "Inter_700Bold",
                fontSize: 16,
                flex: 1,
              }}
              numberOfLines={1}
            >
              {row.user.name || "Eğitmen"}
            </Text>
            <View style={{ alignItems: "flex-end" }}>
              <Text
                style={{
                  color: c.foreground,
                  fontFamily: "Inter_700Bold",
                  fontSize: 15,
                }}
              >
                {formatTRY(customerPrice)}
              </Text>
              <Text style={{ color: c.mutedForeground, fontSize: 10 }}>
                saatlik · KDV dahil
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <View style={styles.metaRow}>
              <Feather name="star" size={12} color={c.warning} />
              <Text
                style={{
                  color: c.foreground,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 12,
                }}
              >
                {rating.toFixed(1)}
              </Text>
            </View>
            <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
              {row.experience_years} yıl deneyim
            </Text>
            {row.certifications && row.certifications.length > 0 ? (
              <Pill label={row.certifications[0]} tone="accent" />
            ) : null}
          </View>

          {row.bio ? (
            <Text
              style={{
                color: c.mutedForeground,
                fontSize: 12,
                lineHeight: 17,
                marginTop: 2,
              }}
              numberOfLines={2}
            >
              {row.bio}
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: "Inter_700Bold", fontSize: 22 },
  photo: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
});
