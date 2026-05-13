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
import type {
  Booking,
  InstructorSchoolPaymentRow,
  Payout,
  Resort,
} from "@/lib/types";

type TabKey = "pending" | "completed" | "all";
type StatusFilter = "all" | "pending" | "released" | "cancelled";
type ViewKey = "report" | "history";
type PeriodKey = "week" | "month" | "season" | "all";

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
  const [view, setView] = useState<ViewKey>("report");
  const [period, setPeriod] = useState<PeriodKey>("month");
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
    () =>
      Array.from(
        new Set(
          (bookings ?? [])
            .map((b) => b.customer_id)
            .filter((id): id is string => !!id),
        ),
      ),
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
      customerName:
        b && b.customer_id ? customerById.get(b.customer_id) : undefined,
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

  async function exportPdf(rowsOverride?: PayoutRow[], heading?: string) {
    const rows = rowsOverride ?? filtered;
    if (rows.length === 0) {
      Alert.alert("Bilgi", "Dışa aktarılacak ödeme yok.");
      return;
    }
    const lines: string[] = [];
    lines.push(heading ?? "Snow Connects — Kazanç Raporu");
    lines.push(`Eğitmen: ${user!.name}`);
    lines.push(`Oluşturuldu: ${formatDateTR(new Date())}`);
    lines.push("");
    lines.push(
      "Ders Tarihi | Müşteri | Pist | Brüt | Banka Komisyonu | Net | Durum",
    );
    lines.push("─".repeat(60));
    let totalGross = 0;
    let totalCommission = 0;
    let totalNet = 0;
    rows.forEach((p) => {
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
    lines.push(`Toplam Banka Komisyonu: -${formatTRY(totalCommission)}`);
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

      {/* SCHOOL PAYMENTS (Phase 14) — only renders if the instructor
          actually has any school payments. */}
      <SchoolPaymentsCard />


      {/* VIEW TOGGLE */}
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
            { key: "report", label: "Rapor" },
            { key: "history", label: "Geçmiş" },
          ] as { key: ViewKey; label: string }[]
        ).map((v) => {
          const active = view === v.key;
          return (
            <Pressable
              key={v.key}
              onPress={() => setView(v.key)}
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
                {v.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {view === "report" ? (
        <ReportView
          rows={enriched}
          period={period}
          onPeriodChange={setPeriod}
          onExport={(scopedRows, label) =>
            exportPdf(
              scopedRows,
              `Snow Connects — Kazanç Raporu (${label})`,
            )
          }
        />
      ) : null}

      {view === "history" ? (
        <>
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
          onPress={() => exportPdf()}
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
        </>
      ) : null}

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
          label={`Banka komisyonu -%${commissionPct(row.commission, row.gross_amount)}`}
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

function commissionPct(commission: number, gross: number): string {
  if (!gross || gross <= 0) return "0";
  const pct = (commission / gross) * 100;
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
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

// ---------------------------------------------------------------
// Report (Rapor) view: period-scoped earnings dashboard.
// ---------------------------------------------------------------

const PERIOD_LABELS: { key: PeriodKey; label: string }[] = [
  { key: "week", label: "Bu hafta" },
  { key: "month", label: "Bu ay" },
  { key: "season", label: "Bu sezon" },
  { key: "all", label: "Tümü" },
];

function startOfWeek(d: Date): Date {
  // Monday as first day of week.
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const day = out.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  out.setDate(out.getDate() + diff);
  return out;
}

function periodRange(period: PeriodKey): { from: Date | null; to: Date } {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  if (period === "all") return { from: null, to };
  if (period === "week") return { from: startOfWeek(now), to };
  if (period === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from, to };
  }
  // Season: 15 December → 15 April. Pick the season window that contains
  // (or most recently preceded) "now".
  const y = now.getFullYear();
  const dec15 = new Date(y, 11, 15);
  const apr15 = new Date(y, 3, 15, 23, 59, 59, 999);
  if (now <= apr15) {
    return { from: new Date(y - 1, 11, 15), to: apr15 };
  }
  if (now >= dec15) {
    return { from: dec15, to: new Date(y + 1, 3, 15, 23, 59, 59, 999) };
  }
  // Off-season (Apr 16 → Dec 14): show the most recent completed season.
  return { from: new Date(y - 1, 11, 15), to: apr15 };
}

function inPeriod(dateStr: string, range: { from: Date | null; to: Date }) {
  const d = new Date(dateStr + "T00:00:00");
  if (range.from && d < range.from) return false;
  if (d > range.to) return false;
  return true;
}

function ReportView({
  rows,
  period,
  onPeriodChange,
  onExport,
}: {
  rows: PayoutRow[];
  period: PeriodKey;
  onPeriodChange: (p: PeriodKey) => void;
  onExport: (scopedRows: PayoutRow[], periodLabel: string) => void;
}) {
  const c = useColors();

  const range = useMemo(() => periodRange(period), [period]);

  const scoped = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.derivedStatus !== "cancelled" && inPeriod(r.lesson_date, range),
      ),
    [rows, range],
  );

  const releasedNet = scoped
    .filter((r) => r.derivedStatus === "released")
    .reduce((s, r) => s + r.net_amount, 0);
  const pendingNet = scoped
    .filter((r) => r.derivedStatus === "pending")
    .reduce((s, r) => s + r.net_amount, 0);
  const totalNet = releasedNet + pendingNet;
  const totalGross = scoped.reduce((s, r) => s + r.gross_amount, 0);
  const totalCommission = scoped.reduce((s, r) => s + r.commission, 0);
  const lessonCount = scoped.length;
  const studentCount = scoped.reduce(
    (s, r) => s + (r.booking?.student_count ?? 0),
    0,
  );
  const avgPerLesson = lessonCount > 0 ? Math.round(totalNet / lessonCount) : 0;

  // Top resorts inside this period.
  const resortAgg = new Map<
    string,
    { name: string; lessons: number; net: number }
  >();
  scoped.forEach((r) => {
    const key = r.booking?.resort_id ?? "unknown";
    const cur =
      resortAgg.get(key) ?? {
        name: r.resortName ?? "Pist",
        lessons: 0,
        net: 0,
      };
    cur.lessons += 1;
    cur.net += r.net_amount;
    resortAgg.set(key, cur);
  });
  const topResorts = Array.from(resortAgg.values())
    .sort((a, b) => b.net - a.net)
    .slice(0, 3);

  // Weekly bars: last 8 weeks (anchored to this Monday) of net earnings,
  // independent of `period`. Gives a stable trend view.
  const weeks: { label: string; net: number; from: Date }[] = [];
  const thisMonday = startOfWeek(new Date());
  for (let i = 7; i >= 0; i--) {
    const from = new Date(thisMonday);
    from.setDate(from.getDate() - i * 7);
    const to = new Date(from);
    to.setDate(to.getDate() + 6);
    to.setHours(23, 59, 59, 999);
    const net = rows
      .filter(
        (r) =>
          r.derivedStatus !== "cancelled" &&
          inPeriod(r.lesson_date, { from, to }),
      )
      .reduce((s, r) => s + r.net_amount, 0);
    weeks.push({
      label: `${from.getDate()}/${from.getMonth() + 1}`,
      net,
      from,
    });
  }
  const maxWeekNet = Math.max(...weeks.map((w) => w.net), 1);

  return (
    <View style={{ gap: 16 }}>
      {/* PERIOD CHIPS */}
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {PERIOD_LABELS.map((p) => {
          const active = period === p.key;
          return (
            <Pressable
              key={p.key}
              onPress={() => onPeriodChange(p.key)}
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
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* HERO */}
      <Card tone="ink" padding={20}>
        <Text
          style={{
            color: c.background,
            opacity: 0.7,
            fontFamily: "Inter_500Medium",
            fontSize: 11,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          {PERIOD_LABELS.find((p) => p.key === period)?.label ?? ""} · Net
          kazanç
        </Text>
        <Text
          style={{
            color: c.background,
            fontFamily: "Fraunces_700Bold",
            fontSize: 36,
            letterSpacing: -1,
            marginTop: 6,
          }}
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          {formatTRY(totalNet)}
        </Text>
        <View
          style={{
            flexDirection: "row",
            gap: 16,
            marginTop: 14,
            paddingTop: 14,
            borderTopWidth: 1,
            borderTopColor: "rgba(255,255,255,0.15)",
          }}
        >
          <HeroSplit
            label="Aktarıldı"
            value={formatTRY(releasedNet)}
            color={c.background}
          />
          <HeroSplit
            label="Bekleyen"
            value={formatTRY(pendingNet)}
            color={c.background}
          />
        </View>
      </Card>

      {/* STATS GRID */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatTile label="Ders" value={String(lessonCount)} icon="calendar" />
        <StatTile
          label="Öğrenci"
          value={String(studentCount)}
          icon="users"
        />
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatTile
          label="Ort. ders"
          value={formatTRY(avgPerLesson)}
          icon="bar-chart-2"
        />
        <StatTile
          label="Banka komisyonu"
          value={formatTRY(totalCommission)}
          icon="percent"
        />
      </View>

      {/* WEEKLY BARS */}
      <Card padding={18}>
        <Text
          style={{
            color: c.foreground,
            fontFamily: "Fraunces_600SemiBold",
            fontSize: 16,
            letterSpacing: -0.3,
          }}
        >
          Haftalık trend
        </Text>
        <Text
          style={{
            color: c.mutedForeground,
            fontFamily: "Inter_400Regular",
            fontSize: 12,
            marginTop: 2,
          }}
        >
          Son 8 hafta · net kazanç
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 6,
            height: 120,
            marginTop: 16,
          }}
        >
          {weeks.map((w, idx) => {
            const ratio = w.net / maxWeekNet;
            const h = Math.max(4, Math.round(ratio * 110));
            const isLast = idx === weeks.length - 1;
            return (
              <View
                key={w.from.toISOString()}
                style={{ flex: 1, alignItems: "center", gap: 6 }}
              >
                <View
                  style={{
                    width: "100%",
                    height: h,
                    borderRadius: 6,
                    backgroundColor: isLast ? c.accent : c.accentSoft,
                  }}
                />
              </View>
            );
          })}
        </View>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: 6,
          }}
        >
          {weeks.map((w, idx) => (
            <Text
              key={`label-${idx}`}
              style={{
                flex: 1,
                textAlign: "center",
                color: c.mutedForeground,
                fontFamily: "Inter_500Medium",
                fontSize: 9.5,
              }}
              numberOfLines={1}
            >
              {w.label}
            </Text>
          ))}
        </View>
      </Card>

      {/* TOP RESORTS */}
      <Card padding={18}>
        <Text
          style={{
            color: c.foreground,
            fontFamily: "Fraunces_600SemiBold",
            fontSize: 16,
            letterSpacing: -0.3,
            marginBottom: 12,
          }}
        >
          En iyi pistler
        </Text>
        {topResorts.length === 0 ? (
          <Text
            style={{
              color: c.mutedForeground,
              fontFamily: "Inter_400Regular",
              fontSize: 13,
            }}
          >
            Bu dönemde ders yok.
          </Text>
        ) : (
          <View style={{ gap: 10 }}>
            {topResorts.map((r, idx) => {
              const ratio = r.net / (topResorts[0]?.net || 1);
              return (
                <View key={r.name} style={{ gap: 6 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text
                      style={{
                        color: c.foreground,
                        fontFamily: "Inter_600SemiBold",
                        fontSize: 13,
                      }}
                      numberOfLines={1}
                    >
                      {idx + 1}. {r.name}
                    </Text>
                    <Text
                      style={{
                        color: c.foreground,
                        fontFamily: "Inter_700Bold",
                        fontSize: 13,
                      }}
                    >
                      {formatTRY(r.net)}
                    </Text>
                  </View>
                  <View
                    style={{
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: c.muted,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        height: "100%",
                        width: `${Math.max(8, Math.round(ratio * 100))}%`,
                        backgroundColor: c.accent,
                      }}
                    />
                  </View>
                  <Text
                    style={{
                      color: c.mutedForeground,
                      fontFamily: "Inter_500Medium",
                      fontSize: 11,
                    }}
                  >
                    {r.lessons} ders
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </Card>

      {/* EXPORT */}
      <Pressable
        onPress={() =>
          onExport(
            scoped,
            PERIOD_LABELS.find((p) => p.key === period)?.label ?? "",
          )
        }
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingVertical: 14,
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
          Tüm kayıtları paylaş
        </Text>
      </Pressable>

      <Text
        style={{
          color: c.mutedForeground,
          fontFamily: "Inter_400Regular",
          fontSize: 11,
          textAlign: "center",
        }}
      >
        Net kazanç = brüt − banka komisyonu. İptal edilen dersler hariç tutulur.
      </Text>
    </View>
  );
}

function HeroSplit({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text
        style={{
          color,
          opacity: 0.65,
          fontFamily: "Inter_500Medium",
          fontSize: 10.5,
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color,
          fontFamily: "Inter_700Bold",
          fontSize: 16,
          marginTop: 4,
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

function StatTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: keyof typeof Feather.glyphMap;
}) {
  const c = useColors();
  return (
    <Card style={{ flex: 1 }} padding={14}>
      <Feather name={icon} size={14} color={c.accentDeep} />
      <Text
        style={{
          color: c.foreground,
          fontFamily: "Fraunces_700Bold",
          fontSize: 18,
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

// ---------------------------------------------------------------
// Phase 14: school → instructor payment history (read-only).
// Renders nothing if the instructor has no school payments yet,
// so independent (non-school) instructors don't see an empty card.
// ---------------------------------------------------------------
function SchoolPaymentsCard() {
  const c = useColors();
  const { user } = useAuth();
  const [open, setOpen] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ["my-school-payments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "instructor_my_school_payments",
      );
      if (error) throw error;
      return (data ?? []) as InstructorSchoolPaymentRow[];
    },
    enabled: !!user,
  });

  if (isLoading || !data || data.length === 0) return null;

  const total = data.reduce((s, p) => s + p.amount_kurus, 0);
  const last = data[0];

  return (
    <Card padding={16}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            <Feather name="briefcase" size={14} color={c.accentDeep} />
            <Text
              style={{
                color: c.foreground,
                fontFamily: "Inter_700Bold",
                fontSize: 14,
              }}
            >
              Okuldan Aldığım Ödemeler
            </Text>
          </View>
          <Text
            style={{
              color: c.mutedForeground,
              fontFamily: "Inter_500Medium",
              fontSize: 12,
              marginTop: 4,
            }}
          >
            Toplam {formatTRY(total)} · Son: {formatDateTR(last.paid_at)}
          </Text>
        </View>
        <Feather
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={c.mutedForeground}
        />
      </Pressable>

      {open ? (
        <View style={{ marginTop: 12, gap: 10 }}>
          {data.map((p) => (
            <View
              key={p.id}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 10,
                backgroundColor: c.muted,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      color: c.foreground,
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 13,
                    }}
                    numberOfLines={1}
                  >
                    {p.school_name ?? "Okul"}
                  </Text>
                  <Text
                    style={{
                      color: c.mutedForeground,
                      fontFamily: "Inter_500Medium",
                      fontSize: 11,
                      marginTop: 2,
                    }}
                  >
                    {formatDateTR(p.paid_at)}
                  </Text>
                  {p.note ? (
                    <Text
                      style={{
                        color: c.mutedForeground,
                        fontFamily: "Inter_400Regular",
                        fontSize: 12,
                        marginTop: 4,
                      }}
                    >
                      {p.note}
                    </Text>
                  ) : null}
                </View>
                <Text
                  style={{
                    color: c.foreground,
                    fontFamily: "Fraunces_700Bold",
                    fontSize: 15,
                  }}
                >
                  {formatTRY(p.amount_kurus)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
