import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { SignInGate } from "@/components/ui/SignInGate";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { formatDateTR, formatTRY } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { TIME_SLOTS } from "@/lib/timeSlots";
import type { Booking, Payout, Resort } from "@/lib/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function businessDaysBetween(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0;
  let count = 0;
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cursor.getTime() < end.getTime()) {
    cursor.setTime(cursor.getTime() + MS_PER_DAY);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

function slotRange(slotIds: string[] | undefined): string {
  if (!slotIds || slotIds.length === 0) return "—";
  const sorted = [...slotIds].sort();
  const first = TIME_SLOTS.find((s) => s.id === sorted[0]);
  const last = TIME_SLOTS.find((s) => s.id === sorted[sorted.length - 1]);
  if (!first || !last) return `${slotIds.length} saat`;
  return `${first.start} - ${last.end} (${slotIds.length} saat)`;
}

export default function PaymentDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: payout, isLoading } = useQuery({
    queryKey: ["payout-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payouts")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Payout;
    },
    enabled: !!id && !!user,
  });

  const { data: booking } = useQuery({
    queryKey: ["payout-booking", payout?.booking_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", payout!.booking_id)
        .single();
      if (error) throw error;
      return data as Booking;
    },
    enabled: !!payout,
  });

  const { data: customer } = useQuery({
    queryKey: ["payout-customer", booking?.customer_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, phone")
        .eq("id", booking!.customer_id)
        .single();
      if (error) throw error;
      return data as { id: string; name: string; phone: string | null };
    },
    enabled: !!booking,
  });

  const { data: resort } = useQuery({
    queryKey: ["payout-resort", booking?.resort_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resorts")
        .select("*")
        .eq("id", booking!.resort_id)
        .single();
      if (error) throw error;
      return data as Resort;
    },
    enabled: !!booking,
  });

  if (!user) return <SignInGate />;
  if (isLoading || !payout) return <Loading />;

  const cancelled = booking?.lesson_status === "cancelled";
  const completed = booking?.lesson_status === "completed";
  const status: "pending" | "released" | "cancelled" = cancelled
    ? "cancelled"
    : (payout.status as "pending" | "released");

  const today = new Date();
  const release = new Date(payout.release_date);
  const daysLeft = businessDaysBetween(today, release);

  const badge =
    status === "released"
      ? { label: "Hesabınıza Aktarıldı", tone: "success" as const }
      : status === "cancelled"
        ? { label: "İptal Edildi", tone: "danger" as const }
        : { label: "Bekliyor", tone: "default" as const };

  return (
    <Screen contentStyle={{ gap: 18 }}>
      {/* HERO AMOUNT */}
      <Card padding={22} style={{ alignItems: "center", gap: 8 }}>
        <Pill size="sm" label={badge.label} tone={badge.tone} />
        <Text
          style={{
            color: c.foreground,
            fontFamily: "Fraunces_700Bold",
            fontSize: 38,
            letterSpacing: -1,
            marginTop: 6,
          }}
        >
          {formatTRY(payout.net_amount)}
        </Text>
        <Text
          style={{
            color: c.mutedForeground,
            fontFamily: "Inter_500Medium",
            fontSize: 12,
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          Net Kazanç
        </Text>
        {status === "pending" && daysLeft > 0 ? (
          <Text
            style={{
              color: c.warning,
              fontFamily: "Inter_600SemiBold",
              fontSize: 13,
              marginTop: 4,
            }}
          >
            {daysLeft} iş günü kaldı
          </Text>
        ) : null}
      </Card>

      {/* AMOUNT BREAKDOWN */}
      <Card>
        <SectionLabel>Tutar Dağılımı</SectionLabel>
        <DetailRow label="Brüt tutar" value={formatTRY(payout.gross_amount)} />
        <DetailRow
          label={`Banka komisyonu -%${commissionPct(payout.commission, payout.gross_amount)}`}
          value={`-${formatTRY(payout.commission)}`}
          valueColor={c.danger}
        />
        <DividerLine />
        <DetailRow
          label="Net kazanç"
          value={formatTRY(payout.net_amount)}
          valueColor={c.success}
          bold
        />
      </Card>

      {/* LESSON INFO */}
      <Card>
        <SectionLabel>Ders Bilgileri</SectionLabel>
        <DetailRow
          label="Müşteri"
          value={customer?.name ?? "—"}
        />
        <DetailRow
          label="Ders tarihi"
          value={formatDateTR(payout.lesson_date)}
        />
        <DetailRow
          label="Ders saati"
          value={slotRange(booking?.slot_ids)}
        />
        <DetailRow
          label="Kayak merkezi"
          value={resort?.name ?? "—"}
        />
        <DetailRow
          label="Öğrenci sayısı"
          value={`${booking?.student_count ?? 1}`}
        />
      </Card>

      {/* CONFIRMATION */}
      <Card>
        <SectionLabel>Tamamlanma Durumu</SectionLabel>
        <ConfirmRow
          label="Müşteri onayı"
          confirmed={completed}
        />
        <ConfirmRow
          label="Eğitmen onayı"
          confirmed={completed}
        />
      </Card>

      {/* PAYMENT TIMELINE */}
      <Card>
        <SectionLabel>Ödeme Takvimi</SectionLabel>
        <DetailRow
          label="Booking ID"
          value={payout.booking_id.slice(0, 8).toUpperCase()}
          mono
        />
        <DetailRow
          label="Müşteri ödeme tarihi"
          value={
            booking?.created_at ? formatDateTR(booking.created_at) : "—"
          }
        />
        <DetailRow
          label="Beklenen ödeme tarihi"
          value={formatDateTR(payout.release_date)}
          help="Dersten 21 iş günü sonra"
        />
        {status === "released" ? (
          <DetailRow
            label="Aktarılma tarihi"
            value={formatDateTR(payout.release_date)}
            valueColor={c.success}
          />
        ) : null}
      </Card>

      {/* LINKS */}
      <View style={{ gap: 10 }}>
        {customer ? (
          <LinkRow
            icon="user"
            label="Müşteri profilini gör"
            onPress={() =>
              router.push(`/(app)/messages/${customer.id}`)
            }
          />
        ) : null}
        {booking ? (
          <LinkRow
            icon="file-text"
            label="Rezervasyonu gör"
            onPress={() =>
              router.push(`/(app)/payment/${booking.id}`)
            }
          />
        ) : null}
      </View>
    </Screen>
  );
}

function commissionPct(commission: number, gross: number): string {
  if (!gross || gross <= 0) return "0";
  const pct = (commission / gross) * 100;
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return (
    <Text
      style={{
        color: c.mutedForeground,
        fontFamily: "Inter_700Bold",
        fontSize: 11,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        marginBottom: 12,
      }}
    >
      {children}
    </Text>
  );
}

function DetailRow({
  label,
  value,
  valueColor,
  bold,
  mono,
  help,
}: {
  label: string;
  value: string;
  valueColor?: string;
  bold?: boolean;
  mono?: boolean;
  help?: string;
}) {
  const c = useColors();
  return (
    <View style={{ paddingVertical: 8 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
        }}
      >
        <Text
          style={{
            color: c.mutedForeground,
            fontFamily: "Inter_500Medium",
            fontSize: 13,
            flexShrink: 1,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            color: valueColor ?? c.foreground,
            fontFamily: bold ? "Inter_700Bold" : "Inter_600SemiBold",
            fontSize: bold ? 15 : 13,
            ...(mono ? { letterSpacing: 1 } : {}),
            textAlign: "right",
            flexShrink: 0,
          }}
        >
          {value}
        </Text>
      </View>
      {help ? (
        <Text
          style={{
            color: c.mutedForeground,
            fontFamily: "Inter_400Regular",
            fontSize: 11,
            marginTop: 2,
          }}
        >
          {help}
        </Text>
      ) : null}
    </View>
  );
}

function DividerLine() {
  const c = useColors();
  return (
    <View
      style={{
        height: 1,
        backgroundColor: c.borderSoft,
        marginVertical: 6,
      }}
    />
  );
}

function ConfirmRow({
  label,
  confirmed,
}: {
  label: string;
  confirmed: boolean;
}) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 10,
      }}
    >
      <Text
        style={{
          color: c.foreground,
          fontFamily: "Inter_500Medium",
          fontSize: 14,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Feather
          name={confirmed ? "check-circle" : "circle"}
          size={16}
          color={confirmed ? c.success : c.mutedForeground}
        />
        <Text
          style={{
            color: confirmed ? c.success : c.mutedForeground,
            fontFamily: "Inter_600SemiBold",
            fontSize: 13,
          }}
        >
          {confirmed ? "Onaylandı" : "Bekleniyor"}
        </Text>
      </View>
    </View>
  );
}

function LinkRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 18,
        paddingVertical: 14,
        borderRadius: c.radiusLg,
        backgroundColor: c.card,
        opacity: pressed ? 0.85 : 1,
        ...({ boxShadow: c.shadow } as object),
      })}
    >
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
      >
        <Feather name={icon} size={16} color={c.accentDeep} />
        <Text
          style={{
            color: c.foreground,
            fontFamily: "Inter_600SemiBold",
            fontSize: 14,
          }}
        >
          {label}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={c.mutedForeground} />
    </Pressable>
  );
}
