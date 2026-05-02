import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { useColors } from "@/hooks/useColors";
import { formatDateTR, formatTRY } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { Booking } from "@/lib/types";

export default function PaymentScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const [paying, setPaying] = useState(false);

  const { data: booking, isLoading } = useQuery({
    queryKey: ["booking", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", bookingId)
        .maybeSingle();
      if (error) throw error;
      return data as Booking | null;
    },
    enabled: !!bookingId,
  });

  if (isLoading) return <Loading />;
  if (!booking) {
    return (
      <Screen>
        <Text style={{ color: c.foreground }}>Rezervasyon bulunamadı.</Text>
      </Screen>
    );
  }

  async function pay() {
    setPaying(true);
    // TODO: Replace with Param.com payment gateway integration.
    // For now we simulate a successful charge and call the server-side
    // confirm_payment RPC which marks the booking paid and creates the
    // payout record (release date = lesson_date + 21 business days).
    await new Promise((r) => setTimeout(r, 900));
    const { error } = await supabase.rpc("confirm_payment", {
      p_booking: bookingId,
    });
    setPaying(false);
    if (error) {
      Alert.alert("Ödeme alınamadı", error.message);
      return;
    }
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    qc.invalidateQueries({ queryKey: ["bookings"] });
    qc.invalidateQueries({ queryKey: ["booking", bookingId] });
    Alert.alert(
      "Ödeme başarılı",
      "Rezervasyonunuz onaylandı. Eğitmeninizle mesajlaşmaya başlayabilirsiniz.",
      [
        {
          text: "Tamam",
          onPress: () => router.replace("/(app)/(tabs)/bookings"),
        },
      ],
    );
  }

  if (booking.payment_status === "paid") {
    return (
      <Screen contentStyle={{ gap: 14, alignItems: "center", paddingTop: 40 }}>
        <View
          style={[
            styles.successCircle,
            { backgroundColor: c.success, borderRadius: 100 },
          ]}
        >
          <Feather name="check" size={36} color="#ffffff" />
        </View>
        <Text style={[styles.title, { color: c.foreground }]}>
          Ödeme tamamlandı
        </Text>
        <Text
          style={{
            color: c.mutedForeground,
            textAlign: "center",
            paddingHorizontal: 12,
          }}
        >
          {formatDateTR(booking.lesson_date)} tarihli rezervasyonunuz onaylandı.
        </Text>
        <Button
          label="Rezervasyonlarıma Git"
          onPress={() => router.replace("/(app)/(tabs)/bookings")}
        />
      </Screen>
    );
  }

  return (
    <Screen contentStyle={{ gap: 14 }}>
      <Pill label="Test ortamı · Param.com entegrasyonu yakında" tone="warning" />

      <Card>
        <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
          Ödenecek tutar
        </Text>
        <Text
          style={{
            color: c.foreground,
            fontFamily: "Inter_700Bold",
            fontSize: 32,
            marginTop: 4,
          }}
        >
          {formatTRY(booking.total_price)}
        </Text>
        <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 4 }}>
          {formatTRY(booking.base_amount)} ders + {formatTRY(booking.vat_amount)}{" "}
          KDV
        </Text>
      </Card>

      <Card>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <Feather name="credit-card" size={22} color={c.primary} />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: c.foreground,
                fontFamily: "Inter_600SemiBold",
              }}
            >
              Kart ile Öde
            </Text>
            <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
              Demo: butona basıldığında ödeme simüle edilir
            </Text>
          </View>
        </View>
      </Card>

      <Button
        label={`${formatTRY(booking.total_price)} öde`}
        onPress={pay}
        loading={paying}
      />

      <Text
        style={{
          color: c.mutedForeground,
          fontSize: 11,
          textAlign: "center",
          paddingHorizontal: 12,
        }}
      >
        Ödeme onaylandığında eğitmen takvimindeki saatler otomatik olarak kilitlenir.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  successCircle: {
    width: 84,
    height: 84,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 22 },
});
