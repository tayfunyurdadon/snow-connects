import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { Alert, Text, View } from "react-native";

import {
  AdminButton,
  AdminCard,
  AdminEmpty,
  AdminPill,
  AdminScreen,
  AdminSpinner,
  AdminTabRow,
} from "@/components/admin/AdminUI";
import { adminTheme } from "@/lib/adminTheme";
import { formatDateTR, formatTRY } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { Booking, Message, Payout } from "@/lib/types";

type SubTab = "bookings" | "payouts" | "flags";

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

  return (
    <AdminScreen>
      <AdminTabRow
        value={sub}
        onChange={setSub}
        options={[
          { id: "bookings", label: "Rezervasyon" },
          { id: "payouts", label: "Ödemeler" },
          { id: "flags", label: "Şikayetler", count: flagCount ?? 0 },
        ]}
      />
      {sub === "bookings" && <BookingsTab />}
      {sub === "payouts" && <PayoutsTab />}
      {sub === "flags" && <FlagsTab />}
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
      const { data, error } = await supabase
        .from("payouts")
        .select(
          "*, instructor:users!instructor_id(name), booking:bookings(lesson_date)",
        )
        .order("created_at", { ascending: false })
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
                  label={`Komisyon ${formatTRY(p.commission)}`}
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
