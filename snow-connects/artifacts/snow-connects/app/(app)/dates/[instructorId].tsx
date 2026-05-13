import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Header } from "@/components/ui/Header";
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
  const {
    instructorId,
    from: initialFrom,
    to: initialTo,
    resort: resortFromQuery,
  } = useLocalSearchParams<{
    instructorId: string;
    from?: string;
    to?: string;
    resort?: string;
  }>();

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
    const resortQS = resortFromQuery ? `&resort=${resortFromQuery}` : "";
    router.push(
      `/(app)/book/${instructorId}?from=${from}&to=${to}${resortQS}` as never,
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
      <Stack.Screen options={{ title: "" }} />
      <Screen contentStyle={{ gap: 18 }}>
        <Header
          eyebrow="Tarih seç"
          title={`Ne zaman\nkayacaksın?`}
          subtitle={`${instructorName} ile ders almak istediğin günleri seç. Tek gün veya birden çok gün seçebilirsin.`}
        />

        <Card padding={18}>
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
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              justifyContent: "center",
              marginTop: 14,
              paddingTop: 12,
              borderTopWidth: 1,
              borderTopColor: c.borderSoft,
            }}
          >
            <Feather name="info" size={12} color={c.accentDeep} />
            <Text
              style={{
                color: c.mutedForeground,
                fontFamily: "Inter_500Medium",
                fontSize: 12,
              }}
            >
              {dayCount > 0
                ? `${dayCount} gün · 1 Aralık – 15 Nisan arası`
                : "Sezon: 1 Aralık – 15 Nisan"}
            </Text>
          </View>
        </Card>

        <Card padding={14}>
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
              variant={canContinue ? "accent" : "primary"}
              onPress={onConfirm}
              disabled={!canContinue}
              iconRight={
                canContinue ? (
                  <Feather
                    name="arrow-right"
                    size={16}
                    color={c.accentForeground}
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
    <View style={{ flex: 1, gap: 4 }}>
      <Text
        style={{
          color: c.mutedForeground,
          fontFamily: "Inter_600SemiBold",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 0.8,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: empty ? c.taupeSoft ?? c.mutedForeground : c.foreground,
          fontFamily: empty ? "Inter_500Medium" : "Fraunces_600SemiBold",
          fontSize: empty ? 14 : 18,
          letterSpacing: -0.3,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  divider: {
    width: 1,
    height: 32,
  },
});
