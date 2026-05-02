import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Header } from "@/components/ui/Header";
import { Loading } from "@/components/ui/Loading";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { SignInGate } from "@/components/ui/SignInGate";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { formatDateTR, formatTRY } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { Booking, Resort } from "@/lib/types";

type Tab = "upcoming" | "past";

export default function BookingsTab() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("upcoming");

  const todayIso = new Date().toISOString().slice(0, 10);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["bookings", user?.id, user?.role],
    queryFn: async () => {
      if (!user) return [];
      const filter =
        user.role === "instructor" ? "instructor_id" : "customer_id";
      const { data, error } = await supabase
        .from("bookings")
        .select("*, resort:resorts(name, region)")
        .eq(filter, user.id)
        .order("lesson_date", { ascending: false });
      if (error) throw error;
      return data as (Booking & { resort: Pick<Resort, "name" | "region"> })[];
    },
    enabled: !!user,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((b) =>
      tab === "upcoming"
        ? b.lesson_date >= todayIso && b.lesson_status !== "cancelled"
        : b.lesson_date < todayIso || b.lesson_status === "completed",
    );
  }, [data, tab, todayIso]);

  if (!user) {
    return (
      <SignInGate
        title="Rezervasyonlarını görüntüle"
        description="Geçmiş ve yaklaşan derslerini görmek için giriş yapmalısın."
      />
    );
  }

  return (
    <Screen
      contentStyle={{ paddingTop: insets.top + 16, gap: 18 }}
      refreshing={isRefetching}
      onRefresh={refetch}
    >
      <Header eyebrow="Derslerim" title="Rezervasyonlar" />

      <View
        style={[
          styles.tabRow,
          { backgroundColor: c.muted, borderRadius: 999 },
        ]}
      >
        {(["upcoming", "past"] as const).map((t) => {
          const active = tab === t;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[
                styles.tabBtn,
                {
                  backgroundColor: active ? c.card : "transparent",
                  borderRadius: 999,
                },
              ]}
            >
              <Text
                style={{
                  color: active ? c.foreground : c.mutedForeground,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 13,
                }}
              >
                {t === "upcoming" ? "Yaklaşan" : "Geçmiş"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <Loading inline />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="calendar"
          title={tab === "upcoming" ? "Yaklaşan ders yok" : "Geçmiş ders yok"}
          description={
            tab === "upcoming"
              ? "Bir pist seçerek ilk dersini ayarlayabilirsin."
              : "Tamamlanan derslerin burada listelenir."
          }
        />
      ) : (
        <View style={{ gap: 12 }}>
          {filtered.map((b) => (
            <Card
              key={b.id}
              onPress={() => {
                if (b.payment_status === "pending" && user.role === "customer") {
                  router.push(`/(app)/payment/${b.id}`);
                }
              }}
              padding={18}
            >
              <View style={{ gap: 12 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={{
                        color: c.mutedForeground,
                        fontFamily: "Inter_600SemiBold",
                        fontSize: 11,
                        letterSpacing: 0.4,
                        textTransform: "uppercase",
                      }}
                    >
                      {b.resort?.region ?? ""}
                    </Text>
                    <Text
                      style={{
                        color: c.foreground,
                        fontFamily: "Fraunces_600SemiBold",
                        fontSize: 19,
                        letterSpacing: -0.3,
                      }}
                    >
                      {b.resort?.name ?? "Pist"}
                    </Text>
                  </View>
                  <PaymentPill status={b.payment_status} />
                </View>

                <View
                  style={{
                    height: 1,
                    backgroundColor: c.borderSoft,
                  }}
                />

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View style={{ flexDirection: "row", gap: 14 }}>
                    <Row icon="calendar" text={formatDateTR(b.lesson_date)} />
                    <Row
                      icon="users"
                      text={`${b.student_count} öğr · ${b.slot_ids.length} ders`}
                    />
                  </View>
                  <Text
                    style={{
                      color: c.foreground,
                      fontFamily: "Fraunces_700Bold",
                      fontSize: 17,
                      letterSpacing: -0.3,
                    }}
                  >
                    {formatTRY(b.total_price)}
                  </Text>
                </View>
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

function Row({
  icon,
  text,
}: {
  icon: keyof typeof Feather.glyphMap;
  text: string;
}) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <Feather name={icon} size={12} color={c.mutedForeground} />
      <Text
        style={{
          color: c.mutedForeground,
          fontFamily: "Inter_500Medium",
          fontSize: 12,
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
    default:
      return <Pill label="İade" size="sm" />;
  }
}

const styles = StyleSheet.create({
  tabRow: { flexDirection: "row", padding: 4 },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
  },
});
