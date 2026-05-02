import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { MonthCalendar } from "@/components/ui/MonthCalendar";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { formatDateTR, formatTRY } from "@/lib/format";
import { isInSeason, nextSeasonStart } from "@/lib/season";
import { supabase } from "@/lib/supabase";
import { TIME_SLOTS } from "@/lib/timeSlots";
import type { Payout, TimeSlot } from "@/lib/types";

export default function InstructorCalendar() {
  const c = useColors();
  const qc = useQueryClient();
  const { user } = useAuth();
  const today = new Date();
  const initial = isInSeason(today) ? today : nextSeasonStart(today);
  const [date, setDate] = useState<string>(initial.toISOString().slice(0, 10));

  const { data: slots, isLoading } = useQuery({
    queryKey: ["my-slots", user?.id, date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_slots")
        .select("*")
        .eq("instructor_id", user!.id)
        .eq("date", date);
      if (error) throw error;
      return (data ?? []) as TimeSlot[];
    },
    enabled: !!user,
  });

  const { data: payouts } = useQuery({
    queryKey: ["payouts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payouts")
        .select("*")
        .eq("instructor_id", user!.id)
        .order("release_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Payout[];
    },
    enabled: !!user,
  });

  if (!user) return <Loading />;

  const slotMap = new Map((slots ?? []).map((s) => [s.slot_time, s]));

  async function toggleBlock(slotTime: string) {
    if (!user) return;
    const existing = slotMap.get(slotTime);
    if (existing?.status === "booked") {
      Alert.alert("Bilgi", "Onaylanmış rezervasyon iptal edilemez.");
      return;
    }
    if (existing?.status === "manual") {
      const { error } = await supabase.rpc("unblock_slot", {
        p_slot_id: existing.id,
      });
      if (error) Alert.alert("Hata", error.message);
    } else {
      const { error } = await supabase.rpc("block_slot", {
        p_date: date,
        p_slot_time: slotTime,
        p_note: "Müsait değil",
      });
      if (error) Alert.alert("Hata", error.message);
    }
    qc.invalidateQueries({ queryKey: ["my-slots", user.id, date] });
  }

  const totalPending =
    (payouts ?? [])
      .filter((p) => p.status === "pending")
      .reduce((s, p) => s + p.net_amount, 0) || 0;
  const totalReleased =
    (payouts ?? [])
      .filter((p) => p.status === "released")
      .reduce((s, p) => s + p.net_amount, 0) || 0;

  return (
    <Screen contentStyle={{ gap: 18 }}>
      <Card padding={14}>
        <MonthCalendar value={date} onChange={setDate} seasonGate />
      </Card>

      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{
            color: c.foreground,
            fontFamily: "Fraunces_600SemiBold",
            fontSize: 20,
            letterSpacing: -0.4,
          }}
        >
          {formatDateTR(date)}
        </Text>
        <Text
          style={{
            color: c.mutedForeground,
            fontFamily: "Inter_500Medium",
            fontSize: 12,
          }}
        >
          {TIME_SLOTS.length} saat
        </Text>
      </View>

      {isLoading ? (
        <Loading inline />
      ) : (
        <View style={{ gap: 8 }}>
          {TIME_SLOTS.map((s) => {
            const ts = slotMap.get(s.id);
            const status = ts?.status ?? "available";
            const dotColor =
              status === "booked"
                ? c.accent
                : status === "manual"
                  ? c.taupeSoft ?? c.mutedForeground
                  : c.success;
            return (
              <Pressable
                key={s.id}
                onPress={() => toggleBlock(s.id)}
                disabled={status === "booked"}
                style={({ pressed }) => ({
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderRadius: c.radius,
                  borderWidth: 1,
                  borderColor:
                    status === "booked"
                      ? c.accent
                      : status === "manual"
                        ? c.borderSoft
                        : c.borderSoft,
                  backgroundColor:
                    status === "booked"
                      ? c.accentSoft
                      : status === "manual"
                        ? c.muted
                        : c.card,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: dotColor,
                    }}
                  />
                  <Text
                    style={{
                      color: c.foreground,
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 15,
                    }}
                  >
                    {s.label}
                  </Text>
                </View>
                <Pill
                  label={
                    status === "booked"
                      ? "Rezerve"
                      : status === "manual"
                        ? "Kapalı"
                        : "Açık"
                  }
                  size="sm"
                  tone={
                    status === "booked"
                      ? "accent"
                      : status === "manual"
                        ? "default"
                        : "success"
                  }
                />
              </Pressable>
            );
          })}
        </View>
      )}

      <Text
        style={{
          color: c.foreground,
          fontFamily: "Fraunces_600SemiBold",
          fontSize: 20,
          letterSpacing: -0.4,
          marginTop: 6,
        }}
      >
        Ödemelerim
      </Text>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Card style={{ flex: 1 }} padding={14}>
          <Feather name="clock" size={16} color={c.warning} />
          <Text
            style={{
              color: c.foreground,
              fontFamily: "Fraunces_700Bold",
              fontSize: 22,
              letterSpacing: -0.4,
              marginTop: 8,
            }}
          >
            {formatTRY(totalPending)}
          </Text>
          <Text
            style={{
              color: c.mutedForeground,
              fontFamily: "Inter_500Medium",
              fontSize: 11,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              marginTop: 2,
            }}
          >
            Bekleyen
          </Text>
        </Card>
        <Card style={{ flex: 1 }} padding={14}>
          <Feather name="check-circle" size={16} color={c.success} />
          <Text
            style={{
              color: c.foreground,
              fontFamily: "Fraunces_700Bold",
              fontSize: 22,
              letterSpacing: -0.4,
              marginTop: 8,
            }}
          >
            {formatTRY(totalReleased)}
          </Text>
          <Text
            style={{
              color: c.mutedForeground,
              fontFamily: "Inter_500Medium",
              fontSize: 11,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              marginTop: 2,
            }}
          >
            Aktarılan
          </Text>
        </Card>
      </View>

      {(payouts ?? []).slice(0, 6).map((p) => (
        <Card key={p.id}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: c.foreground,
                  fontFamily: "Inter_700Bold",
                  fontSize: 15,
                }}
              >
                {formatTRY(p.net_amount)}
              </Text>
              <Text
                style={{
                  color: c.mutedForeground,
                  fontFamily: "Inter_400Regular",
                  fontSize: 12,
                  marginTop: 2,
                }}
              >
                Ders {formatDateTR(p.lesson_date)} · Ödeme{" "}
                {formatDateTR(p.release_date)}
              </Text>
            </View>
            <Pill
              size="sm"
              label={p.status === "pending" ? "Bekliyor" : "Aktarıldı"}
              tone={p.status === "pending" ? "warning" : "success"}
            />
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({});
