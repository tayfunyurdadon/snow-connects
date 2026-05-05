import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
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
import { Header } from "@/components/ui/Header";
import { Loading } from "@/components/ui/Loading";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { formatDateTR, formatTRY } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { Booking, Resort } from "@/lib/types";

type BookingWithExtras = Booking & {
  resort: Pick<Resort, "name" | "region"> | null;
};

// Mirror of compute_cancel_refund() in SQL. Kept in sync so the
// customer sees the exact tier the server will apply. Server is the
// source of truth — this is just a preview.
function previewRefund(lessonDate: string, total: number) {
  const lesson = new Date(`${lessonDate}T00:00:00Z`).getTime();
  const hours = (lesson - Date.now()) / 3_600_000;
  let pct: number;
  if (hours > 48) pct = 100;
  else if (hours > 24) pct = 50;
  else pct = 0;
  return { pct, amount: Math.round((total * pct) / 100) };
}

export default function BookingDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();

  const { data: booking, isLoading } = useQuery({
    queryKey: ["booking-detail", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, resort:resorts(name, region)")
        .eq("id", bookingId)
        .maybeSingle();
      if (error) throw error;
      return data as BookingWithExtras | null;
    },
    enabled: !!bookingId,
  });

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const refund = useMemo(
    () =>
      booking
        ? previewRefund(booking.lesson_date, booking.total_price)
        : null,
    [booking],
  );

  // Tick once a minute so the refund tier updates if the customer
  // sits on this screen across the 48h/24h boundary.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (isLoading || !booking) return <Loading />;

  const isCustomer = user?.role === "customer";
  const isCancellable =
    booking.lesson_status === "upcoming" &&
    booking.payment_status === "paid" &&
    isCustomer;

  async function confirmCancel() {
    const reason = cancelReason.trim();
    if (reason.length < 3) {
      Alert.alert(
        "Sebep gerekli",
        "Lütfen iptal sebebini en az 3 karakter olarak yaz.",
      );
      return;
    }
    setCancelling(true);
    const { data, error } = await supabase.rpc("customer_cancel_booking", {
      p_booking: bookingId,
      p_reason: reason,
    });
    setCancelling(false);
    if (error) {
      Alert.alert("İptal başarısız", error.message);
      return;
    }
    setCancelOpen(false);
    qc.invalidateQueries({ queryKey: ["bookings"] });
    qc.invalidateQueries({ queryKey: ["booking-detail", bookingId] });
    const result = data as { refund_pct?: number; refund_amount?: number };
    const pct = result?.refund_pct ?? 0;
    const amount = result?.refund_amount ?? 0;
    Alert.alert(
      "Rezervasyon iptal edildi",
      pct === 0
        ? "Ders saatine 24 saatten az kaldığı için iade yapılamadı."
        : pct === 100
          ? `Tam iade işlemi başlatıldı: ${formatTRY(amount)} hesabına geri yüklenecek.`
          : `Kısmi iade işlemi başlatıldı: ${formatTRY(amount)} hesabına geri yüklenecek (%${pct}).`,
      [
        {
          text: "Tamam",
          onPress: () => router.replace("/(app)/(tabs)/bookings"),
        },
      ],
    );
  }

  return (
    <Screen contentStyle={{ gap: 18 }}>
      <Header eyebrow="Rezervasyon" title={booking.resort?.name ?? "Pist"} />

      <Card>
        <View style={{ gap: 14 }}>
          <Row
            icon="calendar"
            label="Ders tarihi"
            value={formatDateTR(booking.lesson_date)}
          />
          <Row
            icon="users"
            label="Öğrenci"
            value={`${booking.student_count} kişi`}
          />
          <Row
            icon="clock"
            label="Saat sayısı"
            value={`${booking.slot_ids.length} ders`}
          />
          <View
            style={{ height: 1, backgroundColor: c.borderSoft, marginVertical: 4 }}
          />
          <Row
            icon="credit-card"
            label="Toplam ödenen"
            value={formatTRY(booking.total_price)}
            bold
          />
        </View>
      </Card>

      <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
        <PaymentPill status={booking.payment_status} />
        {booking.lesson_status === "cancelled" ? (
          <Pill label="İptal Edildi" tone="danger" size="sm" />
        ) : null}
      </View>

      {booking.lesson_status === "cancelled" ? (
        <Card tone="soft" padding={16}>
          <Text
            style={{
              color: c.mutedForeground,
              fontFamily: "Inter_600SemiBold",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 6,
            }}
          >
            İptal sebebi
          </Text>
          <Text
            style={{
              color: c.foreground,
              fontFamily: "Inter_400Regular",
              fontSize: 14,
              lineHeight: 21,
            }}
          >
            {booking.cancellation_reason ?? "Sebep belirtilmedi."}
          </Text>
          {booking.refund_amount && booking.refund_amount > 0 ? (
            <Text
              style={{
                color: c.success,
                fontFamily: "Inter_600SemiBold",
                fontSize: 13,
                marginTop: 10,
              }}
            >
              İade tutarı: {formatTRY(booking.refund_amount)} (%{booking.refund_pct})
            </Text>
          ) : null}
        </Card>
      ) : null}

      {isCancellable && refund ? (
        <>
          <Card tone="soft" padding={16}>
            <Text
              style={{
                color: c.foreground,
                fontFamily: "Fraunces_600SemiBold",
                fontSize: 16,
                marginBottom: 8,
              }}
            >
              İptal politikası
            </Text>
            <PolicyRow text="48+ saat öncesi: tam iade" />
            <PolicyRow text="24-48 saat: %50 iade" />
            <PolicyRow text="24 saatten az: iade yok" />
            <View
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: c.borderSoft,
              }}
            >
              <Text
                style={{
                  color: c.mutedForeground,
                  fontFamily: "Inter_500Medium",
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                Şu an iptal edersen
              </Text>
              <Text
                style={{
                  color: refund.pct === 0 ? c.destructive : c.foreground,
                  fontFamily: "Fraunces_700Bold",
                  fontSize: 22,
                  letterSpacing: -0.4,
                  marginTop: 4,
                }}
              >
                {refund.pct === 0
                  ? "İade yok"
                  : `${formatTRY(refund.amount)} iade (%${refund.pct})`}
              </Text>
            </View>
          </Card>

          <Button
            variant="danger"
            label="Rezervasyonu İptal Et"
            onPress={() => {
              setCancelReason("");
              setCancelOpen(true);
            }}
          />
        </>
      ) : null}

      <Modal
        visible={cancelOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !cancelling && setCancelOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => !cancelling && setCancelOpen(false)}
        >
          <Pressable
            style={[
              styles.modalCard,
              { backgroundColor: c.card, borderColor: c.border },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text
              style={{
                color: c.foreground,
                fontFamily: "Fraunces_600SemiBold",
                fontSize: 20,
                letterSpacing: -0.4,
              }}
            >
              İptali onayla
            </Text>
            {refund ? (
              <Text
                style={{
                  color: c.mutedForeground,
                  fontFamily: "Inter_400Regular",
                  fontSize: 13,
                  lineHeight: 19,
                }}
              >
                {refund.pct === 0
                  ? "Ders saatine 24 saatten az kaldı, iade alamayacaksın."
                  : refund.pct === 100
                    ? `${formatTRY(refund.amount)} (tam tutar) hesabına iade edilecek.`
                    : `${formatTRY(refund.amount)} (%${refund.pct}) hesabına iade edilecek.`}
              </Text>
            ) : null}
            <TextInput
              value={cancelReason}
              onChangeText={setCancelReason}
              placeholder="İptal sebebin"
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
              editable={!cancelling}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button
                  variant="secondary"
                  label="Vazgeç"
                  onPress={() => setCancelOpen(false)}
                  disabled={cancelling}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  variant="danger"
                  label="İptal Et"
                  onPress={confirmCancel}
                  loading={cancelling}
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function Row({
  icon,
  label,
  value,
  bold,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  bold?: boolean;
}) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Feather name={icon} size={16} color={c.mutedForeground} />
        <Text
          style={{
            color: c.mutedForeground,
            fontFamily: "Inter_500Medium",
            fontSize: 13,
          }}
        >
          {label}
        </Text>
      </View>
      <Text
        style={{
          color: c.foreground,
          fontFamily: bold ? "Fraunces_700Bold" : "Inter_600SemiBold",
          fontSize: bold ? 18 : 14,
          letterSpacing: bold ? -0.3 : 0,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function PolicyRow({ text }: { text: string }) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginVertical: 2,
      }}
    >
      <Feather name="check" size={13} color={c.mutedForeground} />
      <Text
        style={{
          color: c.foreground,
          fontFamily: "Inter_400Regular",
          fontSize: 13,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

function PaymentPill({ status }: { status: Booking["payment_status"] }) {
  switch (status) {
    case "paid":
      return <Pill label="Ödendi" tone="success" size="sm" />;
    case "pending":
      return <Pill label="Ödeme bekliyor" tone="warning" size="sm" />;
    case "failed":
      return <Pill label="Başarısız" tone="danger" size="sm" />;
    case "refunded":
      return <Pill label="İade Edildi" tone="default" size="sm" />;
    default:
      return null;
  }
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
