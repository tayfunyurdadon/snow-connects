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
import type { Booking } from "@/lib/types";

type Row = Booking & {
  instructor: { name: string | null } | null;
  customer: { name: string | null } | null;
};

export default function SchoolBookings() {
  const { data, isLoading } = useQuery({
    queryKey: ["school-bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "*, instructor:users!instructor_id(name), customer:users!customer_id(name)",
        )
        .order("lesson_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  if (isLoading) return <AdminScreen><AdminSpinner /></AdminScreen>;
  return (
    <AdminScreen>
      {!data || data.length === 0 ? (
        <AdminEmpty icon="calendar" title="Henüz rezervasyon yok" />
      ) : (
        data.map((b) => (
          <AdminCard key={b.id}>
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
                  {b.instructor?.name ?? "Eğitmen"}
                </Text>
                <Text
                  style={{
                    color: adminTheme.textMuted,
                    fontFamily: adminTheme.fontBody,
                    fontSize: 12,
                    marginTop: 2,
                  }}
                >
                  Müşteri: {b.customer?.name ?? "—"}
                </Text>
                <Text
                  style={{
                    color: adminTheme.textMuted,
                    fontFamily: adminTheme.fontBody,
                    fontSize: 12,
                    marginTop: 2,
                  }}
                >
                  {new Date(b.lesson_date).toLocaleDateString("tr-TR")}
                  {"  ·  "}
                  {b.student_count} kişi
                  {"  ·  "}
                  {(b.slot_ids ?? []).length} ders
                </Text>
                <View
                  style={{ flexDirection: "row", gap: 6, marginTop: 6 }}
                >
                  <AdminPill
                    label={b.payment_status}
                    tone={b.payment_status === "paid" ? "success" : "warning"}
                    size="sm"
                  />
                  <AdminPill
                    label={b.lesson_status}
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
                  {formatTRY(b.base_amount + b.vat_amount)}
                </Text>
                <Text
                  style={{
                    color: adminTheme.textDim,
                    fontFamily: adminTheme.fontBody,
                    fontSize: 11,
                  }}
                >
                  net (komisyon öncesi)
                </Text>
              </View>
            </View>
          </AdminCard>
        ))
      )}
    </AdminScreen>
  );
}
