import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { RangeCalendar } from "@/components/ui/RangeCalendar";
import { Screen } from "@/components/ui/Screen";
import { useColors } from "@/hooks/useColors";
import { formatDateShortTR } from "@/lib/format";
import { stripTime } from "@/lib/season";
import { supabase } from "@/lib/supabase";
import type { AppUser, InstructorProfile } from "@/lib/types";

export default function DateRangePicker() {
  const c = useColors();
  const router = useRouter();
  const { instructorId, from: initialFrom, to: initialTo } =
    useLocalSearchParams<{
      instructorId: string;
      from?: string;
      to?: string;
    }>();

  // Allow arriving here with the previous range pre-filled (e.g. back
  // button from the booking grid).
  const [from, setFrom] = useState<string | null>(initialFrom ?? null);
  const [to, setTo] = useState<string | null>(initialTo ?? null);

  const { data: instructor, isLoading } = useQuery({
    queryKey: ["instructor-dates", instructorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instructor_profiles")
        .select("*, user:users!inner(id, name)")
        .eq("user_id", instructorId)
        .maybeSingle();
      if (error) throw error;
      return data as
        | (InstructorProfile & { user: Pick<AppUser, "id" | "name"> })
        | null;
    },
    enabled: !!instructorId,
  });

  const dayCount = useMemo(() => {
    if (!from || !to) return 0;
    const a = stripTime(new Date(from)).getTime();
    const b = stripTime(new Date(to)).getTime();
    return Math.round((b - a) / 86400000) + 1;
  }, [from, to]);

  const canContinue = !!from && !!to;

  function onConfirm() {
    if (!canContinue) return;
    router.push(
      `/(app)/book/${instructorId}?from=${from}&to=${to}` as never,
    );
  }

  function onClear() {
    setFrom(null);
    setTo(null);
  }

  if (isLoading) return <Loading />;

  const instructorName = instructor?.user?.name ?? "Eğitmen";

  return (
    <>
      <Stack.Screen options={{ title: "Tarih seç" }} />
      <Screen contentStyle={{ gap: 16 }}>
        <View style={{ gap: 4 }}>
          <Text style={[styles.h1, { color: c.foreground }]}>
            Ne zaman kayacaksın?
          </Text>
          <Text style={{ color: c.mutedForeground, fontSize: 13 }}>
            {instructorName} ile ders almak istediğin günleri seç.
          </Text>
        </View>

        <Card>
          <View style={styles.summaryRow}>
            <SummarySlot
              label="Başlangıç"
              value={from ? formatDateShortTR(from) : "Tarih seç"}
              empty={!from}
            />
            <View style={[styles.divider, { backgroundColor: c.border }]} />
            <SummarySlot
              label="Bitiş"
              value={to ? formatDateShortTR(to) : "Tarih seç"}
              empty={!to}
            />
          </View>
          {dayCount > 0 ? (
            <Text
              style={{
                color: c.mutedForeground,
                fontSize: 12,
                marginTop: 10,
                textAlign: "center",
              }}
            >
              {dayCount} gün · 1 Aralık – 15 Nisan arası seçilebilir
            </Text>
          ) : (
            <Text
              style={{
                color: c.mutedForeground,
                fontSize: 12,
                marginTop: 10,
                textAlign: "center",
              }}
            >
              Sezon: 1 Aralık – 15 Nisan
            </Text>
          )}
        </Card>

        <Card>
          <RangeCalendar
            from={from}
            to={to}
            onChange={(r) => {
              setFrom(r.from);
              setTo(r.to);
            }}
          />
        </Card>

        <View style={{ flexDirection: "row", gap: 10 }}>
          {(from || to) && (
            <View style={{ flex: 1 }}>
              <Button label="Temizle" variant="ghost" onPress={onClear} />
            </View>
          )}
          <View style={{ flex: 2 }}>
            <Button
              label={canContinue ? "Saatleri seç" : "Tarih seç"}
              onPress={onConfirm}
              disabled={!canContinue}
              icon={
                canContinue ? (
                  <Feather
                    name="arrow-right"
                    size={16}
                    color={c.primaryForeground}
                  />
                ) : undefined
              }
            />
          </View>
        </View>
      </Screen>
    </>
  );
}

function SummarySlot({
  label,
  value,
  empty,
}: {
  label: string;
  value: string;
  empty: boolean;
}) {
  const c = useColors();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text
        style={{
          color: c.mutedForeground,
          fontSize: 11,
          fontFamily: "Inter_500Medium",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: empty ? c.mutedForeground : c.foreground,
          fontFamily: empty ? "Inter_400Regular" : "Inter_700Bold",
          fontSize: 15,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: "Inter_700Bold", fontSize: 22 },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  divider: {
    width: 1,
    height: 30,
  },
});
