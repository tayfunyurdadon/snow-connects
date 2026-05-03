import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { MonthCalendar } from "@/components/ui/MonthCalendar";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { VerificationBanner } from "@/components/VerificationBanner";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { formatDateTR } from "@/lib/format";
import { isInSeason, nextSeasonStart } from "@/lib/season";
import { supabase } from "@/lib/supabase";
import { TIME_SLOTS } from "@/lib/timeSlots";
import type { TimeSlot } from "@/lib/types";

export default function InstructorCalendar() {
  const c = useColors();
  const qc = useQueryClient();
  const router = useRouter();
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

  return (
    <Screen contentStyle={{ gap: 18 }}>
      <VerificationBanner />
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

      <Card
        onPress={() => router.push("/(app)/instructor-panel/payments")}
        padding={18}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: c.accentSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="credit-card" size={20} color={c.accentDeep} />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: c.foreground,
                fontFamily: "Fraunces_600SemiBold",
                fontSize: 18,
                letterSpacing: -0.3,
              }}
            >
              Ödemelerim
            </Text>
            <Text
              style={{
                color: c.mutedForeground,
                fontFamily: "Inter_400Regular",
                fontSize: 12,
                marginTop: 2,
              }}
            >
              Kazanç özetin, ödeme listesi ve PDF rapor.
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color={c.mutedForeground} />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({});
