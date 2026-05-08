import { useQuery } from "@tanstack/react-query";
import React from "react";
import { Text, View } from "react-native";

import {
  AdminCard,
  AdminEmpty,
  AdminPill,
  AdminScreen,
  AdminSpinner,
} from "@/components/admin/AdminUI";
import { adminTheme } from "@/lib/adminTheme";
import { formatTRY } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { Payout } from "@/lib/types";

type Row = Payout & {
  instructor: { name: string | null } | null;
  booking: { lesson_date: string | null; customer_id: string } | null;
};

type Summary = {
  pendingKurus: number;
  releasedKurus: number;
  pendingCount: number;
  releasedCount: number;
};

export default function SchoolPayouts() {
  const summary = useQuery({
    queryKey: ["school-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("school_payouts_summary");
      if (error) throw error;
      return data as Summary;
    },
  });
  const { data, isLoading } = useQuery({
    queryKey: ["school-payouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payouts")
        .select(
          "*, instructor:users!instructor_id(name), booking:bookings(lesson_date, customer_id)",
        )
        .eq("recipient_type", "school")
        .order("lesson_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  return (
    <AdminScreen>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatCard
          label="Bekleyen"
          value={formatTRY(summary.data?.pendingKurus ?? 0)}
          sub={`${summary.data?.pendingCount ?? 0} kayıt`}
          tone="warning"
        />
        <StatCard
          label="Ödendi"
          value={formatTRY(summary.data?.releasedKurus ?? 0)}
          sub={`${summary.data?.releasedCount ?? 0} kayıt`}
          tone="success"
        />
      </View>

      {isLoading ? (
        <AdminSpinner />
      ) : !data || data.length === 0 ? (
        <AdminEmpty icon="dollar-sign" title="Ödeme kaydı yok" />
      ) : (
        data.map((p) => (
          <AdminCard key={p.id}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
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
                    marginTop: 2,
                  }}
                >
                  Ders: {new Date(p.lesson_date).toLocaleDateString("tr-TR")}
                  {"  ·  "}Vade:{" "}
                  {new Date(p.release_date).toLocaleDateString("tr-TR")}
                </Text>
                <View
                  style={{ flexDirection: "row", gap: 6, marginTop: 6 }}
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
              <View style={{ alignItems: "flex-end" }}>
                <Text
                  style={{
                    color: adminTheme.text,
                    fontFamily: adminTheme.fontTitle,
                    fontSize: 14,
                  }}
                >
                  {formatTRY(p.net_amount)}
                </Text>
                <Text
                  style={{
                    color: adminTheme.textDim,
                    fontFamily: adminTheme.fontBody,
                    fontSize: 11,
                  }}
                >
                  net
                </Text>
              </View>
            </View>
          </AdminCard>
        ))
      )}
    </AdminScreen>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "warning" | "success";
}) {
  const color = tone === "warning" ? adminTheme.warning : adminTheme.success;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: adminTheme.surface,
        borderRadius: adminTheme.radius,
        borderWidth: 1,
        borderColor: adminTheme.border,
        padding: 14,
      }}
    >
      <Text
        style={{
          color: adminTheme.textMuted,
          fontFamily: adminTheme.fontTitle,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color,
          fontFamily: adminTheme.fontHeadline,
          fontSize: 22,
          marginTop: 6,
          letterSpacing: -0.5,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          color: adminTheme.textDim,
          fontFamily: adminTheme.fontBody,
          fontSize: 11,
          marginTop: 2,
        }}
      >
        {sub}
      </Text>
    </View>
  );
}
