import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Header } from "@/components/ui/Header";
import { Loading } from "@/components/ui/Loading";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { SupportBanner } from "@/components/ui/SupportBanner";
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
      <Screen contentStyle={{ gap: 18, alignItems: "center", paddingTop: 56 }}>
        <View style={[styles.successCircle, { backgroundColor: c.success }]}>
          <Feather name="check" size={40} color="#ffffff" />
        </View>
        <View style={{ alignItems: "center", gap: 8 }}>
          <Text
            style={{
              color: c.foreground,
              fontFamily: "Fraunces_600SemiBold",
              fontSize: 28,
              letterSpacing: -0.6,
              textAlign: "center",
            }}
          >
            Ödeme tamamlandı
          </Text>
          <Text
            style={{
              color: c.mutedForeground,
              fontFamily: "Inter_400Regular",
              fontSize: 14,
              lineHeight: 21,
              textAlign: "center",
              paddingHorizontal: 12,
            }}
          >
            {formatDateTR(booking.lesson_date)} tarihli rezervasyonun
            onaylandı. Görüşürüz!
          </Text>
        </View>
        <View style={{ width: "100%", marginTop: 12 }}>
          <Button
            variant="accent"
            label="Rezervasyonlarıma Git"
            onPress={() => router.replace("/(app)/(tabs)/bookings")}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={{ gap: 18 }}>
      <Header
        eyebrow="Son Adım"
        title="Ödeme"
        subtitle="Param.com entegrasyonu yakında. Şimdilik ödeme simüle edilir."
      />

      <Card tone="ink" padding={22}>
        <Text
          style={{
            color: c.primaryForeground,
            opacity: 0.65,
            fontFamily: "Inter_600SemiBold",
            fontSize: 11,
            letterSpacing: 0.6,
            textTransform: "uppercase",
          }}
        >
          Ödenecek tutar
        </Text>
        <Text
          style={{
            color: c.primaryForeground,
            fontFamily: "Fraunces_700Bold",
            fontSize: 44,
            letterSpacing: -1,
            marginTop: 8,
          }}
        >
          {formatTRY(booking.total_price)}
        </Text>
        <View
          style={{
            height: 1,
            backgroundColor: c.primaryForeground,
            opacity: 0.15,
            marginVertical: 14,
          }}
        />
        <View style={{ gap: 6 }}>
          <BreakdownRow
            label="Ders ücreti"
            value={formatTRY(booking.base_amount)}
          />
          <BreakdownRow
            label="KDV (%20)"
            value={formatTRY(booking.vat_amount)}
          />
        </View>
      </Card>

      <Card padding={16}>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
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
                fontFamily: "Inter_600SemiBold",
                fontSize: 15,
              }}
            >
              Kart ile Öde
            </Text>
            <Text
              style={{
                color: c.mutedForeground,
                fontFamily: "Inter_400Regular",
                fontSize: 12,
              }}
            >
              Demo ortamı · ödeme simüle edilir
            </Text>
          </View>
          <Pill label="Test" tone="warning" size="sm" />
        </View>
      </Card>

      <Button
        variant="accent"
        size="lg"
        label={`${formatTRY(booking.total_price)} öde`}
        onPress={pay}
        loading={paying}
      />

      <Text
        style={{
          color: c.mutedForeground,
          fontFamily: "Inter_400Regular",
          fontSize: 12,
          textAlign: "center",
          paddingHorizontal: 20,
          lineHeight: 18,
        }}
      >
        Ödeme onaylandığında eğitmen takvimindeki saatler otomatik kilitlenir.
      </Text>

      <SupportBanner variant="tinted" />
    </Screen>
  );
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View
      style={{ flexDirection: "row", justifyContent: "space-between" }}
    >
      <Text
        style={{
          color: c.primaryForeground,
          opacity: 0.7,
          fontFamily: "Inter_400Regular",
          fontSize: 13,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: c.primaryForeground,
          fontFamily: "Inter_600SemiBold",
          fontSize: 13,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  successCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
});
