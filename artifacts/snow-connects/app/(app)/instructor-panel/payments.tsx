import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Header } from "@/components/ui/Header";
import { Loading } from "@/components/ui/Loading";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { SignInGate } from "@/components/ui/SignInGate";
import { VerificationBanner } from "@/components/VerificationBanner";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { formatDateTR, formatTRY } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { TIME_SLOTS } from "@/lib/timeSlots";
import type { Booking, Payout, Resort } from "@/lib/types";

type TabKey = "pending" | "completed" | "all";
type StatusFilter = "all" | "pending" | "released" | "cancelled";

interface PayoutRow extends Payout {
  booking?: Pick<
    Booking,
    | "id"
    | "customer_id"
    | "resort_id"
    | "slot_ids"
    | "student_count"
    | "lesson_status"
  >;
  customerName?: string;
  resortName?: string;
  slotTimes?: string[];
  derivedStatus: "pending" | "released" | "cancelled";
}

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

function formatSlotRange(slotIds: string[] | undefined): string {
  if (!slotIds || slotIds.length === 0) return "—";
  const sorted = [...slotIds].sort();
  const firstId = sorted[0];
  const lastId = sorted[sorted.length - 1];
  const first = TIME_SLOTS.find((s) => s.id === firstId);
  const last = TIME_SLOTS.find((s) => s.id === lastId);
  if (!first || !last) return `${slotIds.length} saat`;
  return `${first.start} - ${last.end} (${slotIds.length} saat)`;
}

export default function PaymentsScreen() {
  const c = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabKey>("pending");
  const [filterOpen, setFilterOpen] = useState(false);
  const [resortFilter, setResortFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const { data: payoutsRaw, isLoading } = useQuery({
    queryKey: ["payments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payouts")
        .select("*")
        .eq("instructor_id", user!.id)
        .order("lesson_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Payout[];
    },
    enabled: !!user,
  });

  const bookingIds = useMemo(
    () => Array.from(new Set((payoutsRaw ?? []).map((p) => p.booking_id))),
    [payoutsRaw],
  );

  const { data: bookings } = useQuery({
    queryKey: ["payments-bookings", bookingIds],
    queryFn: async () => {
      if (bookingIds.length === 0) return [] as Booking[];
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, customer_id, instructor_id, resort_id, slot_ids, student_count, base_amount, vat_amount, commission_amount, total_price, payment_status, lesson_status, lesson_date, created_at",
        )
        .in("id", bookingIds);
      if (error) throw error;
      return (data ?? []) as Booking[];
    },
    enabled: bookingIds.length > 0,
  });

  const customerIds = useMemo(
    () => Array.from(new Set((bookings ?? []).map((b) => b.customer_id))),
    [bookings],
  );

  const { data: customers } = useQuery({
    queryKey: ["payments-customers", customerIds],
    queryFn: async () => {
      if (customerIds.length === 0)
        return [] as { id: string; name: string }[];
      const { data, error } = await supabase
        .from("users")
        .select("id, name")
        .in("id", customerIds);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: customerIds.length > 0,
  });

  const { data: resorts } = useQuery({
    queryKey: ["payments-resorts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resorts")
        .select("id, name");
      if (error) throw error;
      return (data ?? []) as Resort[];
    },
  });

  if (!user) return <SignInGate />;
  if (isLoading) return <Loading />;

  const customerById = new Map((customers ?? []).map((u) => [u.id, u.name]));
  const bookingById = new Map((bookings ?? []).map((b) => [b.id, b]));
  const resortById = new Map((resorts ?? []).map((r) => [r.id, r.name]));

  const enriched: PayoutRow[] = (payoutsRaw ?? []).map((p) => {
    const b = bookingById.get(p.booking_id);
    const cancelled = b?.lesson_status === "cancelled";
    return {
      ...p,
      booking: b,
      customerName: b ? customerById.get(b.customer_id) : undefined,
      resortName: b ? resortById.get(b.resort_id) : undefined,
      slotTimes: b?.slot_ids,
      derivedStatus: cancelled
        ? "cancelled"
        : (p.status as "pending" | "released"),
    };
  });

  // Apply filters
  const filtered = enriched.filter((p) => {
    if (tab === "pending" && p.derivedStatus !== "pending") return false;
    if (tab === "completed" && p.derivedStatus !== "released") return false;
    if (statusFilter !== "all" && p.derivedStatus !== statusFilter)
      return false;
    if (resortFilter && p.booking?.resort_id !== resortFilter) return false;
    if (fromDate && p.lesson_date < fromDate) return false;
    if (toDate && p.lesson_date > toDate) return false;
    return true;
  });

  // Summary calculations across ALL payouts (not filtered) for top cards
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const totalPending = enriched
    .filter((p) => p.derivedStatus === "pending")
    .reduce((s, p) => s + p.net_amount, 0);
  const monthEarnings = enriched
    .filter(
      (p) =>
        p.derivedStatus === "released" && p.release_date >= monthStart,
    )
    .reduce((s, p) => s + p.net_amount, 0);
  const lifetimeEarnings = enriched
    .filter((p) => p.derivedStatus === "released")
    .reduce((s, p) => s + p.net_amount, 0);

  async function exportPdf() {
    if (filtered.length === 0) {
      Alert.alert("Bilgi", "Dışa aktarılacak ödeme yok.");
      return;
    }
    const lines: string[] = [];
    lines.push("Snow Connects — Kazanç Raporu");
    lines.push(`Eğitmen: ${user!.name}`);
    lines.push(`Oluşturuldu: ${formatDateTR(new Date())}`);
    lines.push("");
    lines.push(
      "Ders Tarihi | Müşteri | Pist | Brüt | Komisyon | Net | Durum",
    );
    lines.push("─".repeat(60));
    let totalGross = 0;
    let totalCommission = 0;
    let totalNet = 0;
    filtered.forEach((p) => {
      lines.push(
        `${formatDateTR(p.lesson_date)} | ${p.customerName ?? "—"} | ${
          p.resortName ?? "—"
        } | ${formatTRY(p.gross_amount)} | -${formatTRY(p.commission)} | ${formatTRY(
          p.net_amount,
        )} | ${
          p.derivedStatus === "released"
            ? "Aktarıldı"
            : p.derivedStatus === "cancelled"
              ? "İptal"
              : "Bekliyor"
        }`,
      );
      totalGross += p.gross_amount;
      totalCommission += p.commission;
      totalNet += p.net_amount;
    });
    lines.push("─".repeat(60));
    lines.push(`Toplam Brüt: ${formatTRY(totalGross)}`);
    lines.push(`Toplam Komisyon: -${formatTRY(totalCommission)}`);
    lines.push(`Toplam Net: ${formatTRY(totalNet)}`);
    try {
      await Share.share({
        message: lines.join("\n"),
        title: "Snow Connects Kazanç Raporu",
      });
    } catch (e: unknown) {
      Alert.alert(
        "Hata",
        e instanceof Error ? e.message : "Paylaşım başarısız.",
      );
    }
  }

  const activeFilterCount =
    (resortFilter ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0) +
    (fromDate ? 1 : 0) +
    (toDate ? 1 : 0);

  return (
    <Screen contentStyle={{ gap: 20 }}>
      <VerificationBanner />
      <Header
        eyebrow="Ödemelerim"
        title="Kazançlarını takip et."
        subtitle="Bekleyen ve hesabına aktarılan tüm ödemeler tek bir yerde."
      />

      {/* SUMMARY CARDS */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <SummaryCard
          icon="clock"
          iconColor={c.warning}
          label="Bekleyen"
          value={formatTRY(totalPending)}
        />
        <SummaryCard
          icon="trending-up"
          iconColor={c.accentDeep}
          label="Bu Ay"
          value={formatTRY(monthEarnings)}
        />
        <SummaryCard
          icon="award"
          iconColor={c.success}
          label="Toplam"
          value={formatTRY(lifetimeEarnings)}
        />
      </View>

      {/* TABS */}
      <View
        style={{
          flexDirection: "row",
          backgroundColor: c.muted,
          padding: 4,
          borderRadius: 999,
        }}
      >
        {(
          [
            { key: "pending", label: "Bekleyen" },
            { key: "completed", label: "Tamamlanan" },
            { key: "all", label: "Tümü" },
          ] as { key: TabKey; label: string }[]
        ).map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 999,
                alignItems: "center",
                backgroundColor: active ? c.card : "transparent",
                ...((active ? { boxShadow: c.shadow } : {}) as object),
              }}
            >
              <Text
                style={{
                  color: active ? c.foreground : c.mutedForeground,
                  fontFamily: active ? "Inter_700Bold" : "Inter_500Medium",
                  fontSize: 13,
                }}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* FILTER + EXPORT ROW */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={() => setFilterOpen(true)}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 12,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: c.borderSoft,
            backgroundColor: c.card,
          }}
        >
          <Feather name="sliders" size={14} color={c.foreground} />
          <Text
            style={{
              color: c.foreground,
              fontFamily: "Inter_600SemiBold",
              fontSize: 13,
            }}
          >
            Filtrele
            {activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
          </Text>
        </Pressable>
        <Pressable
          onPress={exportPdf}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 12,
            borderRadius: 999,
            backgroundColor: c.foreground,
          }}
        >
          <Feather name="download" size={14} color={c.background} />
          <Text
            style={{
              color: c.background,
              fontFamily: "Inter_600SemiBold",
              fontSize: 13,
            }}
          >
            PDF olarak indir
          </Text>
        </Pressable>
      </View>

      {/* LIST */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="Ödeme bulunamadı"
          description="Bu kriterlere uyan bir ödeme yok."
        />
      ) : (
        <View style={{ gap: 12 }}>
          {filtered.map((p) => (
            <PaymentRow
              key={p.id}
              row={p}
              onPress={() =>
                router.push(`/(app)/instructor-panel/payment/${p.id}`)
              }
            />
          ))}
        </View>
      )}

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        resorts={resorts ?? []}
        resortFilter={resortFilter}
        setResortFilter={setResortFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        fromDate={fromDate}
        setFromDate={setFromDate}
        toDate={toDate}
        setToDate={setToDate}
        onClear={() => {
          setResortFilter(null);
          setStatusFilter("all");
          setFromDate("");
          setToDate("");
        }}
      />
    </Screen>
  );
}

function SummaryCard({
  icon,
  iconColor,
  label,
  value,
}: {
  icon: keyof typeof Feather.glyphMap;
  iconColor: string;
  label: string;
  value: string;
}) {
  const c = useColors();
  return (
    <Card style={{ flex: 1 }} padding={14}>
      <Feather name={icon} size={15} color={iconColor} />
      <Text
        style={{
          color: c.foreground,
          fontFamily: "Fraunces_700Bold",
          fontSize: 17,
          letterSpacing: -0.4,
          marginTop: 8,
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text
        style={{
          color: c.mutedForeground,
          fontFamily: "Inter_500Medium",
          fontSize: 10,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          marginTop: 2,
        }}
      >
        {label}
      </Text>
    </Card>
  );
}

function PaymentRow({
  row,
  onPress,
}: {
  row: PayoutRow;
  onPress: () => void;
}) {
  const c = useColors();
  const today = new Date();
  const releaseDate = new Date(row.release_date);
  const daysLeft = businessDaysBetween(today, releaseDate);

  let badge: { label: string; tone: "default" | "success" | "danger" };
  let countdown: string | null = null;
  if (row.derivedStatus === "released") {
    badge = { label: "Hesabınıza Aktarıldı", tone: "success" };
  } else if (row.derivedStatus === "cancelled") {
    badge = { label: "İptal Edildi", tone: "danger" };
  } else {
    badge = { label: "Bekliyor", tone: "default" };
    countdown = daysLeft > 0 ? `${daysLeft} iş günü kaldı` : "Yakında";
  }

  return (
    <Card onPress={onPress}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            style={{
              color: c.foreground,
              fontFamily: "Inter_700Bold",
              fontSize: 15,
            }}
            numberOfLines={1}
          >
            {row.customerName ?? "Müşteri"}
          </Text>
          <Text
            style={{
              color: c.mutedForeground,
              fontFamily: "Inter_400Regular",
              fontSize: 12,
            }}
          >
            {formatDateTR(row.lesson_date)} · {formatSlotRange(row.slotTimes)}
          </Text>
          <Text
            style={{
              color: c.mutedForeground,
              fontFamily: "Inter_400Regular",
              fontSize: 12,
            }}
          >
            {row.resortName ?? "—"} ·{" "}
            {row.booking?.student_count ?? 1} öğrenci
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <Pill size="sm" label={badge.label} tone={badge.tone} />
          {countdown ? (
            <Text
              style={{
                color: c.mutedForeground,
                fontFamily: "Inter_500Medium",
                fontSize: 11,
              }}
            >
              {countdown}
            </Text>
          ) : null}
        </View>
      </View>

      <View
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: c.borderSoft,
          gap: 4,
        }}
      >
        <AmountRow
          label="Brüt tutar"
          value={formatTRY(row.gross_amount)}
          color={c.foreground}
        />
        <AmountRow
          label="Komisyon -%3"
          value={`-${formatTRY(row.commission)}`}
          color={c.danger}
        />
        <AmountRow
          label="Net kazanç"
          value={formatTRY(row.net_amount)}
          color={c.success}
          bold
        />
      </View>
    </Card>
  );
}

function AmountRow({
  label,
  value,
  color,
  bold,
}: {
  label: string;
  value: string;
  color: string;
  bold?: boolean;
}) {
  const c = useColors();
  return (
    <View
      style={{ flexDirection: "row", justifyContent: "space-between" }}
    >
      <Text
        style={{
          color: c.mutedForeground,
          fontFamily: "Inter_500Medium",
          fontSize: 13,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color,
          fontFamily: bold ? "Inter_700Bold" : "Inter_600SemiBold",
          fontSize: bold ? 15 : 13,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function FilterSheet({
  open,
  onClose,
  resorts,
  resortFilter,
  setResortFilter,
  statusFilter,
  setStatusFilter,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  resorts: Resort[];
  resortFilter: string | null;
  setResortFilter: (v: string | null) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (v: StatusFilter) => void;
  fromDate: string;
  setFromDate: (v: string) => void;
  toDate: string;
  setToDate: (v: string) => void;
  onClear: () => void;
}) {
  const c = useColors();
  const presets = [
    { label: "Son 30 gün", days: 30 },
    { label: "Son 90 gün", days: 90 },
    { label: "Bu sezon", days: 180 },
  ];
  const applyPreset = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    setFromDate(from.toISOString().slice(0, 10));
    setToDate(to.toISOString().slice(0, 10));
  };

  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(27, 34, 48, 0.45)",
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: c.background,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingHorizontal: 22,
            paddingTop: 18,
            paddingBottom: 28,
            maxHeight: "85%",
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 44,
              height: 4,
              borderRadius: 2,
              backgroundColor: c.borderSoft,
              marginBottom: 16,
            }}
          />
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                color: c.foreground,
                fontFamily: "Fraunces_600SemiBold",
                fontSize: 22,
                letterSpacing: -0.4,
              }}
            >
              Filtrele
            </Text>
            <Pressable onPress={onClear}>
              <Text
                style={{
                  color: c.accentDeep,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 13,
                }}
              >
                Temizle
              </Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <FilterGroup label="Tarih aralığı">
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {presets.map((p) => (
                  <Pressable
                    key={p.label}
                    onPress={() => applyPreset(p.days)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: c.borderSoft,
                      backgroundColor: c.card,
                    }}
                  >
                    <Text
                      style={{
                        color: c.foreground,
                        fontFamily: "Inter_500Medium",
                        fontSize: 12,
                      }}
                    >
                      {p.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {fromDate && toDate ? (
                <Text
                  style={{
                    color: c.mutedForeground,
                    fontFamily: "Inter_500Medium",
                    fontSize: 12,
                    marginTop: 8,
                  }}
                >
                  {formatDateTR(fromDate)} → {formatDateTR(toDate)}
                </Text>
              ) : null}
            </FilterGroup>

            <FilterGroup label="Pist">
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <FilterChip
                  active={resortFilter === null}
                  label="Tümü"
                  onPress={() => setResortFilter(null)}
                />
                {resorts.map((r) => (
                  <FilterChip
                    key={r.id}
                    active={resortFilter === r.id}
                    label={r.name}
                    onPress={() => setResortFilter(r.id)}
                  />
                ))}
              </View>
            </FilterGroup>

            <FilterGroup label="Durum">
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {(
                  [
                    { v: "all", label: "Tümü" },
                    { v: "pending", label: "Bekliyor" },
                    { v: "released", label: "Aktarıldı" },
                    { v: "cancelled", label: "İptal" },
                  ] as { v: StatusFilter; label: string }[]
                ).map((s) => (
                  <FilterChip
                    key={s.v}
                    active={statusFilter === s.v}
                    label={s.label}
                    onPress={() => setStatusFilter(s.v)}
                  />
                ))}
              </View>
            </FilterGroup>
          </ScrollView>

          <Button
            label="Uygula"
            onPress={onClose}
            variant="accent"
            size="lg"
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const c = useColors();
  return (
    <View style={{ marginBottom: 22 }}>
      <Text
        style={{
          color: c.mutedForeground,
          fontFamily: "Inter_700Bold",
          fontSize: 11,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function FilterChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? c.accent : c.borderSoft,
        backgroundColor: active ? c.accentSoft : c.card,
      }}
    >
      <Text
        style={{
          color: active ? c.accentDeep : c.foreground,
          fontFamily: active ? "Inter_700Bold" : "Inter_500Medium",
          fontSize: 12,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
