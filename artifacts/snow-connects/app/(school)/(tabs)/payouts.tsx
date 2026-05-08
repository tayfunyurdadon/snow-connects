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
import type {
  Payout,
  SchoolInstructorBreakdownRow,
  SchoolPayoutsSummary,
} from "@/lib/types";

type Row = Payout & {
  instructor: { name: string | null } | null;
  booking: {
    lesson_date: string | null;
    customer_id: string | null;
    source: "online" | "manual" | null;
    manual_customer_name: string | null;
  } | null;
};

export default function SchoolPayouts() {
  const summary = useQuery({
    queryKey: ["school-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("school_payouts_summary");
      if (error) throw error;
      return data as SchoolPayoutsSummary;
    },
  });
  const breakdown = useQuery({
    queryKey: ["school-instructor-breakdown"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "school_instructor_breakdown",
      );
      if (error) throw error;
      return (data ?? []) as SchoolInstructorBreakdownRow[];
    },
  });
  const { data, isLoading } = useQuery({
    queryKey: ["school-payouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payouts")
        .select(
          "*, instructor:users!instructor_id(name), booking:bookings(lesson_date, customer_id, source, manual_customer_name)",
        )
        .eq("recipient_type", "school")
        .order("lesson_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const sharePct = Math.round((summary.data?.instructorShareRate ?? 0.35) * 100);
  const schoolPct = 100 - sharePct;
  const totalKurus =
    (summary.data?.pendingKurus ?? 0) + (summary.data?.releasedKurus ?? 0);
  const instructorTotal =
    (summary.data?.pendingInstructorKurus ?? 0) +
    (summary.data?.releasedInstructorKurus ?? 0);
  const schoolTotal =
    (summary.data?.pendingSchoolKurus ?? 0) +
    (summary.data?.releasedSchoolKurus ?? 0);

  return (
    <AdminScreen>
      {/* Split summary card */}
      <AdminCard padding={16}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
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
            Toplam Gelir
          </Text>
          <Text
            style={{
              color: adminTheme.text,
              fontFamily: adminTheme.fontHeadline,
              fontSize: 18,
              letterSpacing: -0.3,
            }}
          >
            {formatTRY(totalKurus)}
          </Text>
        </View>

        {/* Stacked split bar */}
        <View
          style={{
            height: 10,
            borderRadius: 5,
            backgroundColor: adminTheme.surfaceMuted,
            overflow: "hidden",
            flexDirection: "row",
          }}
        >
          <View
            style={{
              flex: schoolPct,
              backgroundColor: adminTheme.accent,
            }}
          />
          <View
            style={{
              flex: sharePct,
              backgroundColor: adminTheme.warning,
            }}
          />
        </View>

        <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
          <SplitTile
            label={`Okul · %${schoolPct}`}
            value={formatTRY(schoolTotal)}
            color={adminTheme.accent}
          />
          <SplitTile
            label={`Eğitmen · %${sharePct}`}
            value={formatTRY(instructorTotal)}
            color={adminTheme.warning}
          />
        </View>
        <Text
          style={{
            color: adminTheme.textDim,
            fontFamily: adminTheme.fontBody,
            fontSize: 11,
            marginTop: 8,
          }}
        >
          Eğitmen / okul oranını Profil sekmesinden değiştirebilirsin.
        </Text>
      </AdminCard>

      {/* Pending vs Released */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatCard
          label="Bekleyen"
          value={formatTRY(summary.data?.pendingKurus ?? 0)}
          sub={`${summary.data?.pendingCount ?? 0} kayıt`}
          tone="warning"
        />
        <StatCard
          label="Tahsil edildi"
          value={formatTRY(summary.data?.releasedKurus ?? 0)}
          sub={`${summary.data?.releasedCount ?? 0} kayıt`}
          tone="success"
        />
      </View>

      {/* Per-instructor breakdown */}
      <AdminCard padding={14}>
        <Text
          style={{
            color: adminTheme.textMuted,
            fontFamily: adminTheme.fontTitle,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            marginBottom: 10,
          }}
        >
          Eğitmen Bazında
        </Text>
        {breakdown.isLoading ? (
          <AdminSpinner />
        ) : !breakdown.data || breakdown.data.length === 0 ? (
          <Text
            style={{
              color: adminTheme.textDim,
              fontFamily: adminTheme.fontBody,
              fontSize: 12,
              fontStyle: "italic",
            }}
          >
            Henüz gelir kaydı yok.
          </Text>
        ) : (
          <View style={{ gap: 8 }}>
            {breakdown.data.map((row) => (
              <View
                key={row.instructor_id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingVertical: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: adminTheme.border,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: adminTheme.text,
                      fontFamily: adminTheme.fontTitle,
                      fontSize: 13,
                    }}
                  >
                    {row.instructor_name}
                  </Text>
                  <Text
                    style={{
                      color: adminTheme.textMuted,
                      fontFamily: adminTheme.fontBody,
                      fontSize: 11,
                      marginTop: 2,
                    }}
                  >
                    {row.lesson_count} ders · toplam{" "}
                    {formatTRY(row.total_kurus)}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={{
                      color: adminTheme.warning,
                      fontFamily: adminTheme.fontTitle,
                      fontSize: 13,
                    }}
                  >
                    {formatTRY(row.instructor_share_kurus)}
                  </Text>
                  <Text
                    style={{
                      color: adminTheme.textDim,
                      fontFamily: adminTheme.fontBody,
                      fontSize: 10,
                      marginTop: 2,
                    }}
                  >
                    eğitmen payı
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </AdminCard>

      {/* Per-payout history */}
      <Text
        style={{
          color: adminTheme.textMuted,
          fontFamily: adminTheme.fontTitle,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          marginTop: 4,
        }}
      >
        Hareketler
      </Text>

      {isLoading ? (
        <AdminSpinner />
      ) : !data || data.length === 0 ? (
        <AdminEmpty icon="dollar-sign" title="Ödeme kaydı yok" />
      ) : (
        data.map((p) => {
          const customerLabel =
            p.booking?.source === "manual"
              ? p.booking?.manual_customer_name ?? "Manuel müşteri"
              : null;
          const instructorShare = Math.round(
            p.net_amount * (summary.data?.instructorShareRate ?? 0.35),
          );
          return (
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
                    {customerLabel ? ` · ${customerLabel}` : ""}
                  </Text>
                  <Text
                    style={{
                      color: adminTheme.textMuted,
                      fontFamily: adminTheme.fontBody,
                      fontSize: 12,
                      marginTop: 2,
                    }}
                  >
                    Ders:{" "}
                    {new Date(p.lesson_date).toLocaleDateString("tr-TR")}
                    {"  ·  "}Vade:{" "}
                    {new Date(p.release_date).toLocaleDateString("tr-TR")}
                  </Text>
                  <View
                    style={{ flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" }}
                  >
                    <AdminPill
                      label={p.status}
                      tone={p.status === "released" ? "success" : "warning"}
                      size="sm"
                    />
                    {p.booking?.source === "manual" ? (
                      <AdminPill label="Manuel" tone="warning" size="sm" />
                    ) : (
                      <AdminPill label="Online" tone="info" size="sm" />
                    )}
                    <AdminPill
                      label={`Eğitmen ${formatTRY(instructorShare)}`}
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
                    toplam
                  </Text>
                </View>
              </View>
            </AdminCard>
          );
        })
      )}
    </AdminScreen>
  );
}

function SplitTile({
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: color,
          }}
        />
        <Text
          style={{
            color: adminTheme.textMuted,
            fontFamily: adminTheme.fontTitle,
            fontSize: 10,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          {label}
        </Text>
      </View>
      <Text
        style={{
          color: adminTheme.text,
          fontFamily: adminTheme.fontHeadline,
          fontSize: 18,
          marginTop: 4,
          letterSpacing: -0.3,
        }}
      >
        {value}
      </Text>
    </View>
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
