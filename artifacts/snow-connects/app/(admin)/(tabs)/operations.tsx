import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import {
  AdminButton,
  AdminCard,
  AdminEmpty,
  AdminInput,
  AdminPill,
  AdminScreen,
  AdminSpinner,
  AdminTabRow,
} from "@/components/admin/AdminUI";
import { adminTheme } from "@/lib/adminTheme";
import { formatDateTR, formatTRY } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import {
  DISPUTE_REASONS,
  type Booking,
  type Dispute,
  type Message,
  type Payout,
} from "@/lib/types";

type SubTab = "bookings" | "payouts" | "flags" | "disputes";

export default function AdminOperations() {
  const [sub, setSub] = useState<SubTab>("bookings");

  const { data: flagCount } = useQuery({
    queryKey: ["admin-flag-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("flagged", true);
      return count ?? 0;
    },
  });

  const { data: disputeCount } = useQuery({
    queryKey: ["admin-dispute-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("disputes")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      return count ?? 0;
    },
  });

  return (
    <AdminScreen>
      <AdminTabRow
        value={sub}
        onChange={setSub}
        options={[
          { id: "bookings", label: "Rezervasyon" },
          { id: "payouts", label: "Ödemeler" },
          { id: "flags", label: "Şikayetler", count: flagCount ?? 0 },
          { id: "disputes", label: "İtirazlar", count: disputeCount ?? 0 },
        ]}
      />
      {sub === "bookings" && <BookingsTab />}
      {sub === "payouts" && <PayoutsTab />}
      {sub === "flags" && <FlagsTab />}
      {sub === "disputes" && <DisputesTab />}
    </AdminScreen>
  );
}

function BookingsTab() {
  type Row = Booking & {
    resort: { name: string } | null;
    customer: { name: string | null } | null;
    instructor: { name: string | null } | null;
  };
  const { data, isLoading } = useQuery({
    queryKey: ["admin-bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        // Use column-name FK hints (e.g. users!customer_id) so we don't depend
        // on auto-generated constraint names that can drift after schema edits.
        .select(
          "*, resort:resorts(name), customer:users!customer_id(name), instructor:users!instructor_id(name)",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  if (isLoading) return <AdminSpinner />;
  if (!data || data.length === 0)
    return <AdminEmpty icon="calendar" title="Rezervasyon yok" />;

  return (
    <>
      {data.map((b) => (
        <AdminCard key={b.id}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Text
                numberOfLines={1}
                style={{
                  color: adminTheme.text,
                  fontFamily: adminTheme.fontTitle,
                  fontSize: 14,
                }}
              >
                {b.resort?.name ?? "Pist"} · {formatDateTR(b.lesson_date)}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  color: adminTheme.textMuted,
                  fontFamily: adminTheme.fontBody,
                  fontSize: 12,
                }}
              >
                {b.customer?.name ?? "Müşteri"} → {b.instructor?.name ?? "Eğitmen"}
                {"  ·  "}
                {b.student_count} öğrenci
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  gap: 6,
                  marginTop: 4,
                  flexWrap: "wrap",
                }}
              >
                <AdminPill
                  label={`Ödeme: ${b.payment_status}`}
                  tone={
                    b.payment_status === "paid"
                      ? "success"
                      : b.payment_status === "pending"
                        ? "warning"
                        : "danger"
                  }
                  size="sm"
                />
                <AdminPill
                  label={b.lesson_status}
                  tone={
                    b.lesson_status === "completed"
                      ? "success"
                      : b.lesson_status === "cancelled"
                        ? "danger"
                        : "info"
                  }
                  size="sm"
                />
                {b.is_test_booking ? (
                  <AdminPill label="TEST" tone="info" size="sm" />
                ) : null}
              </View>
            </View>
            <Text
              style={{
                color: adminTheme.text,
                fontFamily: adminTheme.fontHeadline,
                fontSize: 16,
              }}
            >
              {formatTRY(b.total_price)}
            </Text>
          </View>
        </AdminCard>
      ))}
    </>
  );
}

function PayoutsTab() {
  type Row = Payout & {
    instructor: { name: string | null } | null;
    booking: { lesson_date: string | null } | null;
  };
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-payouts"],
    queryFn: async () => {
      // payouts has no created_at column — order by lesson_date so the
      // most recent lessons surface first. (Querying created_at silently
      // 400s and the screen showed "Ödeme kaydı yok" even when there were
      // pending payouts.)
      const { data, error } = await supabase
        .from("payouts")
        .select(
          "*, instructor:users!instructor_id(name), booking:bookings(lesson_date)",
        )
        .order("lesson_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  async function release(id: string) {
    const { error } = await supabase.rpc("admin_release_payout", {
      p_payout: id,
    });
    if (error) Alert.alert("Hata", error.message);
    else qc.invalidateQueries({ queryKey: ["admin-payouts"] });
  }

  if (isLoading) return <AdminSpinner />;
  if (!data || data.length === 0)
    return <AdminEmpty icon="dollar-sign" title="Ödeme kaydı yok" />;

  return (
    <>
      {data.map((p) => (
        <AdminCard key={p.id}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Text
                numberOfLines={1}
                style={{
                  color: adminTheme.text,
                  fontFamily: adminTheme.fontTitle,
                  fontSize: 14,
                }}
              >
                {p.instructor?.name ?? "Eğitmen"}
              </Text>
              <Text
                style={{
                  color: adminTheme.textMuted,
                  fontFamily: adminTheme.fontBody,
                  fontSize: 12,
                }}
              >
                Ders: {formatDateTR(p.lesson_date)}
                {"  ·  "}Vade: {formatDateTR(p.release_date)}
              </Text>
              <View
                style={{ flexDirection: "row", gap: 6, marginTop: 4 }}
              >
                <AdminPill
                  label={p.status}
                  tone={p.status === "released" ? "success" : "warning"}
                  size="sm"
                />
                <AdminPill
                  label={`Banka -${formatTRY(p.commission)}`}
                  tone="default"
                  size="sm"
                />
              </View>
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              <Text
                style={{
                  color: adminTheme.text,
                  fontFamily: adminTheme.fontHeadline,
                  fontSize: 16,
                }}
              >
                {formatTRY(p.net_amount)}
              </Text>
              {p.status === "pending" ? (
                <AdminButton
                  label="Aktar"
                  size="sm"
                  tone="success"
                  icon="check"
                  onPress={() => release(p.id)}
                />
              ) : null}
            </View>
          </View>
        </AdminCard>
      ))}
    </>
  );
}

function FlagsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-flagged"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("flagged", true)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });

  async function resolve(id: string) {
    const { error } = await supabase.rpc("admin_resolve_flag", {
      p_message: id,
    });
    if (error) Alert.alert("Hata", error.message);
    else {
      qc.invalidateQueries({ queryKey: ["admin-flagged"] });
      qc.invalidateQueries({ queryKey: ["admin-flag-count"] });
    }
  }

  if (isLoading) return <AdminSpinner />;
  if (!data || data.length === 0)
    return (
      <AdminEmpty
        icon="check-circle"
        title="Açık bayrak yok"
        description="Otomatik filtre tarafından işaretlenen mesajlar burada listelenir."
      />
    );

  return (
    <>
      {data.map((m) => (
        <AdminCard key={m.id}>
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <Feather name="flag" size={13} color={adminTheme.warning} />
            <AdminPill
              label={m.flag_reason ?? "ihlal"}
              tone="warning"
              size="sm"
            />
            <Text
              style={{
                color: adminTheme.textDim,
                fontSize: 11,
                marginLeft: "auto",
              }}
            >
              {new Date(m.created_at).toLocaleString("tr-TR")}
            </Text>
          </View>
          <Text
            style={{
              color: adminTheme.text,
              fontFamily: adminTheme.fontBody,
              fontSize: 13,
              lineHeight: 19,
            }}
          >
            {m.content}
          </Text>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              marginTop: 10,
            }}
          >
            <AdminButton
              label="İncelendi"
              tone="ghost"
              size="sm"
              icon="check"
              onPress={() => resolve(m.id)}
            />
          </View>
        </AdminCard>
      ))}
    </>
  );
}

function DisputesTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">(
    "pending",
  );

  type Row = Dispute & {
    booking:
      | (Pick<
          Booking,
          | "lesson_date"
          | "total_price"
          | "slot_ids"
          | "student_count"
          | "payment_status"
        > & {
          resort: { name: string } | null;
        })
      | null;
    customer: { name: string | null } | null;
    instructor: { name: string | null } | null;
  };

  const { data, isLoading } = useQuery({
    queryKey: ["admin-disputes", filter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("disputes")
        .select(
          "*, booking:bookings(lesson_date,total_price,slot_ids,student_count,payment_status,resort:resorts(name)), customer:users!customer_id(name), instructor:users!instructor_id(name)",
        )
        .eq("status", filter)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  return (
    <>
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 4 }}>
        {(
          [
            { id: "pending", label: "Bekleyen" },
            { id: "approved", label: "Kabul" },
            { id: "rejected", label: "Ret" },
          ] as const
        ).map((f) => {
          const active = filter === f.id;
          return (
            <Pressable key={f.id} onPress={() => setFilter(f.id)}>
              <AdminPill
                label={f.label}
                tone={active ? "info" : "default"}
              />
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <AdminSpinner />
      ) : !data || data.length === 0 ? (
        <AdminEmpty
          icon="alert-triangle"
          title="İtiraz yok"
          description="Müşteriler ders sonrası sorun bildirdiğinde burada görünür."
        />
      ) : (
        data.map((d) => (
          <DisputeRow
            key={d.id}
            dispute={d}
            onResolved={() => {
              qc.invalidateQueries({ queryKey: ["admin-disputes"] });
              qc.invalidateQueries({ queryKey: ["admin-dispute-count"] });
            }}
          />
        ))
      )}
    </>
  );
}

function DisputeRow({
  dispute,
  onResolved,
}: {
  dispute: Dispute & {
    booking:
      | (Pick<
          Booking,
          | "lesson_date"
          | "total_price"
          | "slot_ids"
          | "student_count"
          | "payment_status"
        > & {
          resort: { name: string } | null;
        })
      | null;
    customer: { name: string | null } | null;
    instructor: { name: string | null } | null;
  };
  onResolved: () => void;
}) {
  const total = dispute.booking?.total_price ?? 0;
  const [refundLira, setRefundLira] = useState(
    String(Math.round(total / 100)),
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const isPending = dispute.status === "pending";
  const reasonLabel =
    DISPUTE_REASONS.find((r) => r.value === dispute.reason)?.label ??
    dispute.reason;

  async function decide(approve: boolean) {
    let refundKurus = 0;
    if (approve) {
      const lira = Number(refundLira.replace(/[^0-9.]/g, ""));
      if (!Number.isFinite(lira) || lira <= 0) {
        Alert.alert("Geçersiz tutar", "Lütfen iade tutarını TL olarak gir.");
        return;
      }
      refundKurus = Math.round(lira * 100);
      if (refundKurus > total) {
        Alert.alert(
          "Tutar çok yüksek",
          `İade tutarı toplam ödeme (${formatTRY(total)}) üzerinde olamaz.`,
        );
        return;
      }
    }
    setBusy(true);
    const { error } = await supabase.rpc("admin_resolve_dispute", {
      p_dispute: dispute.id,
      p_action: approve ? "approve" : "reject",
      p_refund_kurus: approve ? refundKurus : null,
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (error) {
      Alert.alert("Hata", error.message);
      return;
    }
    onResolved();
  }

  return (
    <AdminCard>
      <View
        style={{
          flexDirection: "row",
          gap: 8,
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <Feather
          name="alert-triangle"
          size={13}
          color={adminTheme.warning}
        />
        <AdminPill label={reasonLabel} tone="warning" size="sm" />
        <Text
          style={{
            color: adminTheme.textDim,
            fontSize: 11,
            marginLeft: "auto",
          }}
        >
          {new Date(dispute.created_at).toLocaleString("tr-TR")}
        </Text>
      </View>
      <Text
        style={{
          color: adminTheme.text,
          fontFamily: adminTheme.fontTitle,
          fontSize: 14,
          marginBottom: 2,
        }}
      >
        {dispute.booking?.resort?.name ?? "Pist"} ·{" "}
        {dispute.booking
          ? formatDateTR(dispute.booking.lesson_date)
          : "—"}
      </Text>
      <Text
        style={{
          color: adminTheme.textMuted,
          fontFamily: adminTheme.fontBody,
          fontSize: 12,
          marginBottom: 8,
        }}
      >
        {dispute.customer?.name ?? "Müşteri"} →{" "}
        {dispute.instructor?.name ?? "Eğitmen"}
        {dispute.booking
          ? `  ·  ${dispute.booking.slot_ids.length} slot · ${dispute.booking.student_count} öğr.`
          : ""}
        {"  ·  "}Toplam: {formatTRY(total)}
      </Text>
      <Text
        style={{
          color: adminTheme.text,
          fontFamily: adminTheme.fontBody,
          fontSize: 13,
          lineHeight: 19,
          marginBottom: isPending ? 12 : 0,
        }}
      >
        {dispute.description}
      </Text>

      {!isPending ? (
        <>
          <View
            style={{
              flexDirection: "row",
              gap: 6,
              marginTop: 10,
              flexWrap: "wrap",
            }}
          >
            <AdminPill
              label={
                dispute.status === "approved" ? "Kabul edildi" : "Reddedildi"
              }
              tone={dispute.status === "approved" ? "success" : "danger"}
              size="sm"
            />
            {dispute.status === "approved" && dispute.refund_amount ? (
              <AdminPill
                label={`İade ${formatTRY(dispute.refund_amount)}`}
                tone="info"
                size="sm"
              />
            ) : null}
          </View>
          {dispute.resolution_note ? (
            <Text
              style={{
                color: adminTheme.textMuted,
                fontFamily: adminTheme.fontBody,
                fontSize: 12,
                lineHeight: 18,
                marginTop: 8,
              }}
            >
              Not: {dispute.resolution_note}
            </Text>
          ) : null}
        </>
      ) : (
        <View style={{ gap: 10 }}>
          <AdminInput
            label="İade tutarı (TL)"
            value={refundLira}
            onChangeText={setRefundLira}
            keyboardType="numeric"
            helper={`Maks: ${formatTRY(total)} · Yalnız Kabul'de uygulanır`}
            editable={!busy}
          />
          <AdminInput
            label="Karar notu (opsiyonel)"
            value={note}
            onChangeText={setNote}
            placeholder="Müşteriye gösterilecek kısa açıklama"
            editable={!busy}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <AdminButton
                label="Reddet"
                tone="ghost"
                size="sm"
                icon="x"
                onPress={() => decide(false)}
                disabled={busy}
              />
            </View>
            <View style={{ flex: 1 }}>
              <AdminButton
                label="Kabul et & iade"
                tone="success"
                size="sm"
                icon="check"
                onPress={() => decide(true)}
                disabled={busy}
              />
            </View>
          </View>
        </View>
      )}
    </AdminCard>
  );
}
