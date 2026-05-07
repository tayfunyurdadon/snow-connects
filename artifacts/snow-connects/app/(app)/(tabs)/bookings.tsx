import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
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

// Hard cap on the bookings query. The screen used to show an infinite
// spinner if the request stalled (slow network, dropped websocket,
// stuck session refresh) — race the supabase call against this timer
// so the user always lands on either real data, an empty state, or a
// proper error within 10 seconds.
const QUERY_TIMEOUT_MS = 10_000;

type Tab = "upcoming" | "past";

export default function BookingsTab() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("upcoming");

  const todayIso = new Date().toISOString().slice(0, 10);

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["bookings", user?.id, user?.role],
    queryFn: async () => {
      if (!user) return [];
      // Sweep expired pending bookings before listing. Otherwise an
      // abandoned checkout (customer left the payment screen) keeps
      // showing up in the instructor's list as "Ödeme bekliyor" forever
      // — the customer's list hides pending so they never see it, but
      // the instructor sees a phantom reservation. Cheap RPC, fire and
      // forget on errors so the list still loads.
      try {
        await supabase.rpc("release_expired_pending_bookings");
      } catch {
        // best-effort cleanup — never block the list on this
      }
      const filter =
        user.role === "instructor" ? "instructor_id" : "customer_id";
      console.log(
        "[bookings] query start uid=",
        user.id,
        "role=",
        user.role,
        "filter=",
        filter,
      );
      const t0 = Date.now();
      // Race the actual query against a 10s timeout. Whichever
      // settles first wins; on timeout we throw a typed error that
      // the screen surfaces in its error UI.
      const queryPromise = supabase
        .from("bookings")
        .select(
          "*, resort:resorts(name, region), instructor:users!instructor_id(id, name), customer:users!customer_id(id, name)",
        )
        .eq(filter, user.id)
        .order("lesson_date", { ascending: false });
      // Track the timer handle so we can clear it as soon as the query
      // resolves. Without this the timer keeps firing in the background
      // for the full 10s after a fast response — harmless but wasteful.
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () =>
            reject(
              new Error(
                "Sunucu yanıt vermedi (10s). Bağlantını kontrol edip tekrar dene.",
              ),
            ),
          QUERY_TIMEOUT_MS,
        );
      });
      let raced;
      try {
        raced = await Promise.race([queryPromise, timeoutPromise]);
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
      const { data, error } = raced;
      const ms = Date.now() - t0;
      if (error) {
        console.warn(
          "[bookings] query failed ms=",
          ms,
          "code=",
          error.code,
          "msg=",
          error.message,
          "details=",
          error.details,
          "hint=",
          error.hint,
        );
        throw error;
      }
      console.log("[bookings] query ok ms=", ms, "rows=", data?.length ?? 0);
      return data as (Booking & {
        resort: Pick<Resort, "name" | "region"> | null;
        instructor: { id: string; name: string } | null;
        customer: { id: string; name: string } | null;
      })[];
    },
    enabled: !!user,
    retry: 1,
    staleTime: 30_000,
  });

  // Customer-only "Bekleyen Ödemeler" — bookings the customer started
  // but didn't complete payment for. Each row carries a server-side
  // `payment_deadline` (15 min from creation); after expiry they're
  // swept by release_expired_pending_bookings() and won't appear here.
  const pendingPayments = useMemo(() => {
    if (!data || user?.role !== "customer") return [];
    return data.filter(
      (b) =>
        b.payment_status === "pending" &&
        b.lesson_status !== "cancelled" &&
        b.payment_deadline,
    );
  }, [data, user?.role]);

  // Auto-refresh every 30s while the customer has any pending booking,
  // so the countdown card updates and disappears as soon as the
  // server-side sweep runs.
  useEffect(() => {
    if (pendingPayments.length === 0) return;
    const id = setInterval(() => {
      void qc.invalidateQueries({ queryKey: ["bookings", user?.id, user?.role] });
    }, 30_000);
    return () => clearInterval(id);
  }, [pendingPayments.length, qc, user?.id, user?.role]);

  const filtered = useMemo(() => {
    if (!data) return [];
    // Customers only see paid bookings in the main list — pending ones
    // are surfaced separately in the "Bekleyen Ödemeler" section above.
    // Instructors see every booking that targets them regardless of
    // payment state, since payment is the customer's responsibility.
    const paymentOk = (b: Booking) =>
      user?.role === "instructor" ? true : b.payment_status === "paid";
    return data.filter(
      (b) =>
        paymentOk(b) &&
        (tab === "upcoming"
          ? b.lesson_date >= todayIso && b.lesson_status !== "cancelled"
          : b.lesson_date < todayIso || b.lesson_status === "completed"),
    );
  }, [data, tab, todayIso, user?.role]);

  const cancelPending = async (bookingId: string) => {
    try {
      const { error } = await supabase.rpc("customer_cancel_booking", {
        p_booking: bookingId,
        p_reason: "Ödeme tamamlanmadı",
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["bookings", user?.id, user?.role] });
    } catch (e) {
      Alert.alert(
        "İptal edilemedi",
        e instanceof Error ? e.message : "Bilinmeyen hata.",
      );
    }
  };

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

      {pendingPayments.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text
            style={{
              color: c.foreground,
              fontFamily: "Fraunces_600SemiBold",
              fontSize: 17,
              letterSpacing: -0.3,
            }}
          >
            Bekleyen Ödemeler
          </Text>
          <Text
            style={{
              color: c.mutedForeground,
              fontFamily: "Inter_400Regular",
              fontSize: 12,
              lineHeight: 18,
              marginTop: -4,
            }}
          >
            Süre dolmadan ödemeni tamamla, aksi halde rezervasyon otomatik iptal
            edilecek.
          </Text>
          {pendingPayments.map((b) => (
            <PendingPaymentCard
              key={b.id}
              booking={b}
              onPay={() => router.push(`/(app)/payment/${b.id}`)}
              onCancel={() => {
                Alert.alert(
                  "Rezervasyonu iptal et",
                  "Bu bekleyen rezervasyonu iptal etmek istediğine emin misin?",
                  [
                    { text: "Vazgeç", style: "cancel" },
                    {
                      text: "İptal Et",
                      style: "destructive",
                      onPress: () => void cancelPending(b.id),
                    },
                  ],
                );
              }}
            />
          ))}
        </View>
      ) : null}

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
      ) : error ? (
        // Surface the real error instead of pretending nothing happened.
        // The console log above carries the supabase error code/details
        // for debugging; the user gets a friendly Turkish message + retry.
        <View style={{ alignItems: "center", paddingVertical: 40, gap: 14 }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: c.muted,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="alert-circle" size={28} color={c.destructive} />
          </View>
          <Text
            style={{
              color: c.foreground,
              fontFamily: "Fraunces_600SemiBold",
              fontSize: 19,
              letterSpacing: -0.3,
              textAlign: "center",
            }}
          >
            Rezervasyonlar yüklenemedi
          </Text>
          <Text
            style={{
              color: c.mutedForeground,
              fontFamily: "Inter_400Regular",
              fontSize: 14,
              textAlign: "center",
              paddingHorizontal: 32,
              lineHeight: 21,
            }}
          >
            {error instanceof Error ? error.message : "Bilinmeyen bir hata."}
          </Text>
          <View style={{ width: 200 }}>
            <Button
              label="Tekrar Dene"
              variant="secondary"
              onPress={() => {
                void refetch();
              }}
            />
          </View>
        </View>
      ) : filtered.length === 0 ? (
        // Role-specific empty copy. Customers get a CTA into discovery;
        // instructors get a nudge to keep their calendar live (they
        // can't browse to themselves).
        user.role === "instructor" ? (
          <EmptyState
            icon="calendar"
            title="Henüz rezervasyonun yok"
            description="Profilini öne çıkarmak için takvimini güncel tut."
          />
        ) : (
          <View style={{ gap: 14 }}>
            <EmptyState
              icon="calendar"
              title="Henüz rezervasyonun yok"
              description="Hemen bir eğitmen seç ve kayağa başla! 🎿"
            />
            <View style={{ paddingHorizontal: 24 }}>
              <Button
                label="Eğitmen Bul"
                variant="accent"
                onPress={() => router.push("/(app)/(tabs)")}
              />
            </View>
          </View>
        )
      ) : (
        <View style={{ gap: 12 }}>
          {filtered.map((b) => (
            <Card
              key={b.id}
              onPress={() => {
                // Both customers and instructors open the detail screen
                // (instructors can cancel from there too).
                router.push(`/(app)/booking-detail/${b.id}`);
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
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    {b.is_test_booking ? <TestBadge /> : null}
                    <PaymentPill status={b.payment_status} />
                  </View>
                </View>

                <View
                  style={{
                    height: 1,
                    backgroundColor: c.borderSoft,
                  }}
                />

                {/* Counterparty: instructor name for customers, customer
                    name for instructors. Falls back gracefully if the
                    join failed for any reason. */}
                {(() => {
                  const counterparty =
                    user.role === "instructor"
                      ? b.customer?.name
                      : b.instructor?.name;
                  if (!counterparty) return null;
                  return (
                    <Row
                      icon="user"
                      text={
                        user.role === "instructor"
                          ? counterparty
                          : `Eğitmen: ${counterparty}`
                      }
                    />
                  );
                })()}

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

function TestBadge() {
  return <Pill label="TEST" tone="ink" size="sm" />;
}

function PendingPaymentCard({
  booking,
  onPay,
  onCancel,
}: {
  booking: Booking & {
    resort: Pick<Resort, "name" | "region"> | null;
    instructor: { id: string; name: string } | null;
  };
  onPay: () => void;
  onCancel: () => void;
}) {
  const c = useColors();
  // Live countdown ticker — recompute every second so the user sees
  // the deadline shrink in real time. Server is the source of truth;
  // when it hits zero we just disable the "Pay" CTA, the next
  // refresh sweep will remove the row entirely.
  const deadlineMs = booking.payment_deadline
    ? new Date(booking.payment_deadline).getTime()
    : 0;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.max(0, deadlineMs - now);
  const expired = remaining === 0;
  const mins = Math.floor(remaining / 60_000);
  const secs = Math.floor((remaining % 60_000) / 1000);
  const mmss = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  const warning = remaining < 5 * 60_000;

  return (
    <Card padding={16}>
      <View style={{ gap: 12 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
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
              {booking.resort?.region ?? ""}
            </Text>
            <Text
              style={{
                color: c.foreground,
                fontFamily: "Fraunces_600SemiBold",
                fontSize: 17,
                letterSpacing: -0.3,
              }}
            >
              {booking.resort?.name ?? "Pist"}
            </Text>
            {booking.instructor?.name ? (
              <Text
                style={{
                  color: c.mutedForeground,
                  fontFamily: "Inter_500Medium",
                  fontSize: 12,
                  marginTop: 2,
                }}
              >
                Eğitmen: {booking.instructor.name}
              </Text>
            ) : null}
          </View>
          <Pill
            label={expired ? "Süresi doldu" : `Kalan ${mmss}`}
            tone={expired ? "danger" : warning ? "danger" : "warning"}
            size="sm"
          />
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View style={{ flexDirection: "row", gap: 14 }}>
            <Row icon="calendar" text={formatDateTR(booking.lesson_date)} />
            <Row
              icon="users"
              text={`${booking.student_count} öğr · ${booking.slot_ids.length} ders`}
            />
          </View>
          <Text
            style={{
              color: c.foreground,
              fontFamily: "Fraunces_700Bold",
              fontSize: 16,
              letterSpacing: -0.3,
            }}
          >
            {formatTRY(booking.total_price)}
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button
              label="İptal Et"
              variant="secondary"
              onPress={onCancel}
            />
          </View>
          <View style={{ flex: 1.4 }}>
            <Button
              label={expired ? "Süresi Doldu" : "Ödemeyi Tamamla"}
              variant="accent"
              onPress={onPay}
              disabled={expired}
            />
          </View>
        </View>
      </View>
    </Card>
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
