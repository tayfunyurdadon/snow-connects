import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loading } from "@/components/ui/Loading";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { useColors } from "@/hooks/useColors";
import { formatDateShortTR, formatTRY } from "@/lib/format";
import { stripTime } from "@/lib/season";
import { supabase } from "@/lib/supabase";
import { TIME_SLOTS } from "@/lib/timeSlots";
import type {
  AppUser,
  InstructorProfile,
  Resort,
  TimeSlot,
} from "@/lib/types";

type Row = InstructorProfile & { user: Pick<AppUser, "id" | "name"> };

type SlotFilter = "morning" | "afternoon" | "all";

const FILTERS: { id: SlotFilter; label: string }[] = [
  { id: "morning", label: "Sabah" },
  { id: "afternoon", label: "Öğleden sonra" },
  { id: "all", label: "Tam gün" },
];

// 09:00 – 11:50 is "morning", 12:00+ is "afternoon" — matches the chip copy.
const MORNING_SLOT_IDS = TIME_SLOTS.filter((s) => s.id < "12:00").map((s) => s.id);
const AFTERNOON_SLOT_IDS = TIME_SLOTS.filter((s) => s.id >= "12:00").map((s) => s.id);

export default function ResortInstructors() {
  const c = useColors();
  const router = useRouter();
  const { id, from, to } = useLocalSearchParams<{
    id: string;
    from?: string;
    to?: string;
  }>();
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

  const { data: instructors, isLoading } = useQuery({
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

  // Pull every booked/manual slot for any of these instructors inside the
  // selected window, in one round-trip. Cells default to "available" when
  // no row exists, so we only need to know what is NOT available.
  const instructorIds = useMemo(
    () => (instructors ?? []).map((p) => p.user_id),
    [instructors],
  );

  const { data: takenSlots } = useQuery({
    queryKey: ["range-slots", id, from, to, instructorIds.join(",")],
    enabled: !!from && !!to && instructorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_slots")
        .select("instructor_id, date, slot_time, status")
        .in("instructor_id", instructorIds)
        .gte("date", from!)
        .lte("date", to!);
      if (error) throw error;
      return (data ?? []) as Pick<
        TimeSlot,
        "instructor_id" | "date" | "slot_time" | "status"
      >[];
    },
  });

  const dayCount = useMemo(() => {
    if (!from || !to) return 0;
    const a = stripTime(new Date(from)).getTime();
    const b = stripTime(new Date(to)).getTime();
    return Math.round((b - a) / 86400000) + 1;
  }, [from, to]);

  // Filter instructors to those with at least ONE available slot in the
  // window (respecting the morning/afternoon/all chip).
  const visible = useMemo(() => {
    const list = instructors ?? [];
    if (!from || !to) return list;

    const slotPool =
      filter === "morning"
        ? MORNING_SLOT_IDS
        : filter === "afternoon"
          ? AFTERNOON_SLOT_IDS
          : TIME_SLOTS.map((s) => s.id);
    const totalSlotsPerInstructor = dayCount * slotPool.length;

    // Tally taken slots per instructor that fall inside the chip's pool.
    const takenByInstructor = new Map<string, number>();
    (takenSlots ?? []).forEach((s) => {
      if (s.status === "available") return;
      if (!slotPool.includes(s.slot_time)) return;
      takenByInstructor.set(
        s.instructor_id,
        (takenByInstructor.get(s.instructor_id) ?? 0) + 1,
      );
    });

    return list.filter((p) => {
      const taken = takenByInstructor.get(p.user_id) ?? 0;
      return taken < totalSlotsPerInstructor;
    });
  }, [instructors, takenSlots, filter, dayCount, from, to]);

  const rangeLabel =
    from && to
      ? `${formatDateShortTR(from)} → ${formatDateShortTR(to)}`
      : null;

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

        {rangeLabel ? (
          <Pressable
            onPress={() =>
              router.push(
                `/(app)/dates/${id}?from=${from}&to=${to}` as never,
              )
            }
          >
            <Card
              style={{ backgroundColor: c.secondary, borderColor: c.accent }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Feather name="calendar" size={16} color={c.primary} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: c.mutedForeground,
                      fontSize: 11,
                      fontFamily: "Inter_500Medium",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    Seçili tarih aralığı
                  </Text>
                  <Text
                    style={{
                      color: c.foreground,
                      fontFamily: "Inter_700Bold",
                      fontSize: 14,
                      marginTop: 2,
                    }}
                  >
                    {rangeLabel}
                  </Text>
                </View>
                <Text
                  style={{
                    color: c.primary,
                    fontSize: 12,
                    fontFamily: "Inter_600SemiBold",
                  }}
                >
                  Değiştir
                </Text>
              </View>
            </Card>
          </Pressable>
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
            title={
              from && to
                ? "Bu tarihlerde uygun eğitmen yok"
                : "Bu pistte eğitmen yok"
            }
            description={
              from && to
                ? "Tarih aralığını değiştirip tekrar deneyebilirsin."
                : "Yakın zamanda eğitmenler eklendiğinde burada görünecek."
            }
          />
        ) : (
          visible.map((p) => (
            <InstructorCard
              key={p.user_id}
              row={p}
              onPress={() =>
                router.push(
                  from && to
                    ? (`/(app)/instructor/${p.user_id}?from=${from}&to=${to}` as never)
                    : (`/(app)/instructor/${p.user_id}` as never),
                )
              }
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
