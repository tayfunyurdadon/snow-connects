import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Button } from "@/components/ui/Button";
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
import type { Booking, TimeSlot } from "@/lib/types";

type ActionMode = "menu" | "cancel";

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

  // Bookings for the same day, used to know each booked slot's
  // lesson_status so we can show Start/End/Cancel correctly.
  const { data: dayBookings } = useQuery({
    queryKey: ["my-day-bookings", user?.id, date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("instructor_id", user!.id)
        .eq("lesson_date", date);
      if (error) throw error;
      return (data ?? []) as Booking[];
    },
    enabled: !!user,
  });

  if (!user) return <Loading />;

  const slotMap = new Map((slots ?? []).map((s) => [s.slot_time, s]));
  const bookingMap = new Map((dayBookings ?? []).map((b) => [b.id, b]));

  const todayIso = new Date().toISOString().slice(0, 10);
  const isToday = date === todayIso;

  // Action sheet state for booked slots.
  const [target, setTarget] = useState<{
    bookingId: string;
    slotTime: string;
  } | null>(null);
  const [mode, setMode] = useState<ActionMode>("menu");
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);

  const targetBooking = target ? bookingMap.get(target.bookingId) : null;

  function refreshDay() {
    qc.invalidateQueries({ queryKey: ["my-slots", user!.id, date] });
    qc.invalidateQueries({ queryKey: ["my-day-bookings", user!.id, date] });
    qc.invalidateQueries({ queryKey: ["bookings"] });
  }

  function closeSheet() {
    setTarget(null);
    setMode("menu");
    setCancelReason("");
  }

  async function handleSlotTap(slotTime: string) {
    if (!user) return;
    const existing = slotMap.get(slotTime);
    if (existing?.status === "booked") {
      if (!existing.booking_id) {
        Alert.alert(
          "Hata",
          "Bu rezervasyona bağlı kayıt bulunamadı. Lütfen sayfayı yenile.",
        );
        return;
      }
      setTarget({ bookingId: existing.booking_id, slotTime });
      setMode("menu");
      setCancelReason("");
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

  async function startLesson() {
    if (!target) return;
    setBusy(true);
    const { error } = await supabase.rpc("instructor_start_lesson", {
      p_booking: target.bookingId,
    });
    setBusy(false);
    if (error) {
      Alert.alert("Başlatılamadı", error.message);
      return;
    }
    closeSheet();
    refreshDay();
  }

  async function endLesson() {
    if (!target) return;
    setBusy(true);
    const { error } = await supabase.rpc("instructor_end_lesson", {
      p_booking: target.bookingId,
    });
    setBusy(false);
    if (error) {
      Alert.alert("Bitirilemedi", error.message);
      return;
    }
    closeSheet();
    refreshDay();
    Alert.alert("Ders tamamlandı", "Bu ders ödemelerine eklendi.");
  }

  async function confirmCancel() {
    if (!target) return;
    const reason = cancelReason.trim();
    if (reason.length < 3) {
      Alert.alert(
        "Sebep gerekli",
        "İptal sebebini en az 3 karakter olarak yaz — müşteri bunu görecek.",
      );
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("instructor_cancel_booking", {
      p_booking: target.bookingId,
      p_reason: reason,
    });
    setBusy(false);
    if (error) {
      Alert.alert("İptal başarısız", error.message);
      return;
    }
    closeSheet();
    refreshDay();
    Alert.alert(
      "Rezervasyon iptal edildi",
      "Saat tekrar açıldı. Eğer ödenmiş bir rezervasyondu, müşterinin iadesi muhasebe tarafından yapılır.",
    );
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
            const booking = ts?.booking_id ? bookingMap.get(ts.booking_id) : null;
            const lessonStatus = booking?.lesson_status;

            // Visual tone: in-progress lessons stand out as the
            // instructor's "happening now" focus row.
            const tone =
              status === "booked"
                ? lessonStatus === "in_progress"
                  ? "warning"
                  : lessonStatus === "completed"
                    ? "success"
                    : "accent"
                : status === "manual"
                  ? "default"
                  : "success";
            const label =
              status === "booked"
                ? lessonStatus === "in_progress"
                  ? "Devam ediyor"
                  : lessonStatus === "completed"
                    ? "Tamamlandı"
                    : "Rezerve"
                : status === "manual"
                  ? "Kapalı"
                  : "Açık";
            const dotColor =
              status === "booked"
                ? lessonStatus === "in_progress"
                  ? c.warning ?? c.accent
                  : c.accent
                : status === "manual"
                  ? c.taupeSoft ?? c.mutedForeground
                  : c.success;

            return (
              <Pressable
                key={s.id}
                onPress={() => handleSlotTap(s.id)}
                style={({ pressed }) => ({
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderRadius: c.radius,
                  borderWidth: 1,
                  borderColor:
                    status === "booked" ? c.accent : c.borderSoft,
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
                <Pill label={label} size="sm" tone={tone} />
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

      {/* Action sheet for booked slots */}
      <Modal
        visible={!!target}
        transparent
        animationType="fade"
        onRequestClose={() => !busy && closeSheet()}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => !busy && closeSheet()}
        >
          <Pressable
            style={[
              styles.modalCard,
              { backgroundColor: c.card, borderColor: c.border },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {mode === "menu" && targetBooking ? (
              <>
                <Text
                  style={{
                    color: c.foreground,
                    fontFamily: "Fraunces_600SemiBold",
                    fontSize: 20,
                    letterSpacing: -0.4,
                  }}
                >
                  {formatDateTR(date)} · {target?.slotTime}
                </Text>

                {targetBooking.lesson_status === "upcoming" ? (
                  <>
                    {isToday ? (
                      <Button
                        variant="primary"
                        label="Dersi Başlat"
                        onPress={startLesson}
                        loading={busy}
                      />
                    ) : (
                      <Text
                        style={{
                          color: c.mutedForeground,
                          fontFamily: "Inter_400Regular",
                          fontSize: 13,
                          lineHeight: 19,
                        }}
                      >
                        Dersi yalnızca ders gününde başlatabilirsin.
                      </Text>
                    )}
                    <Button
                      variant="danger"
                      label="Rezervasyonu İptal Et"
                      onPress={() => setMode("cancel")}
                      disabled={busy}
                    />
                  </>
                ) : null}

                {targetBooking.lesson_status === "in_progress" ? (
                  <>
                    <Pill label="Devam ediyor" tone="warning" size="sm" />
                    <Button
                      variant="primary"
                      label="Dersi Bitir"
                      onPress={endLesson}
                      loading={busy}
                    />
                  </>
                ) : null}

                {targetBooking.lesson_status === "completed" ? (
                  <>
                    <Pill label="Tamamlandı" tone="success" size="sm" />
                    <Text
                      style={{
                        color: c.mutedForeground,
                        fontFamily: "Inter_400Regular",
                        fontSize: 13,
                      }}
                    >
                      Bu ders ödemelerine eklendi. Ek bir aksiyon gerekmiyor.
                    </Text>
                  </>
                ) : null}

                <Button
                  variant="secondary"
                  label="Kapat"
                  onPress={closeSheet}
                  disabled={busy}
                />
              </>
            ) : null}

            {mode === "cancel" ? (
              <>
                <Text
                  style={{
                    color: c.foreground,
                    fontFamily: "Fraunces_600SemiBold",
                    fontSize: 20,
                    letterSpacing: -0.4,
                  }}
                >
                  Rezervasyonu iptal et
                </Text>
                <Text
                  style={{
                    color: c.mutedForeground,
                    fontFamily: "Inter_400Regular",
                    fontSize: 13,
                    lineHeight: 19,
                  }}
                >
                  {formatDateTR(date)} · {target?.slotTime} saatindeki ders
                  iptal edilecek. Müşteri bildirim alır ve ödenmiş tutar iade
                  listesine düşer.
                </Text>
                <TextInput
                  value={cancelReason}
                  onChangeText={setCancelReason}
                  placeholder="İptal sebebi (örn. hastalandım, hava muhalefeti)"
                  placeholderTextColor={c.mutedForeground}
                  multiline
                  numberOfLines={3}
                  style={{
                    borderWidth: 1,
                    borderColor: c.borderSoft,
                    borderRadius: 12,
                    padding: 12,
                    color: c.foreground,
                    fontFamily: "Inter_400Regular",
                    fontSize: 14,
                    minHeight: 80,
                    textAlignVertical: "top",
                    backgroundColor: c.muted,
                  }}
                  editable={!busy}
                />
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      variant="secondary"
                      label="Geri"
                      onPress={() => setMode("menu")}
                      disabled={busy}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      variant="danger"
                      label="İptal Et"
                      onPress={confirmCancel}
                      loading={busy}
                    />
                  </View>
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 18,
    borderWidth: 1,
    padding: 22,
    gap: 14,
  },
});
