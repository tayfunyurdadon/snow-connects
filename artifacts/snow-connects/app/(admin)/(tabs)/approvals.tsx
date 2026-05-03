import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";

import {
  AdminCard,
  AdminEmpty,
  AdminPill,
  AdminScreen,
  AdminSpinner,
  AdminTabRow,
} from "@/components/admin/AdminUI";
import { Feather } from "@expo/vector-icons";
import { adminTheme } from "@/lib/adminTheme";
import { supabase } from "@/lib/supabase";
import type { VerificationListRow, VerificationStatus } from "@/lib/types";
import { VERIFICATION_LABELS } from "@/lib/verification";

type SubTab = Extract<
  VerificationStatus,
  "pending_review" | "approved" | "rejected"
>;

export default function AdminApprovals() {
  const router = useRouter();
  const [sub, setSub] = useState<SubTab>("pending_review");

  // Pending count drives the badge on the "Bekleyen" sub-tab.
  const { data: pendingRows } = useQuery({
    queryKey: ["admin-verifications", "pending_review"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_verifications", {
        p_status: "pending_review",
      });
      if (error) throw error;
      return (data ?? []) as VerificationListRow[];
    },
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-verifications", sub],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_verifications", {
        p_status: sub,
      });
      if (error) throw error;
      return (data ?? []) as VerificationListRow[];
    },
  });

  return (
    <AdminScreen>
      <AdminTabRow
        value={sub}
        onChange={setSub}
        options={[
          {
            id: "pending_review",
            label: "Bekleyen",
            count: pendingRows?.length ?? 0,
          },
          { id: "approved", label: "Onaylı" },
          { id: "rejected", label: "Reddedilen" },
        ]}
      />

      {isLoading ? (
        <AdminSpinner />
      ) : !rows || rows.length === 0 ? (
        <AdminEmpty
          icon="check-circle"
          title="Bu listede başvuru yok"
          description={
            sub === "pending_review"
              ? "Yeni başvurular geldikçe burada görünecek."
              : undefined
          }
        />
      ) : (
        rows.map((row) => {
          const meta = VERIFICATION_LABELS[row.verification_status];
          const tone =
            meta.tone === "default"
              ? "warning"
              : (meta.tone as "warning" | "success" | "danger" | "accent");
          return (
            <AdminCard
              key={row.user_id}
              onPress={() =>
                router.push(`/(admin)/verification/${row.user_id}`)
              }
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: adminTheme.text,
                      fontFamily: adminTheme.fontTitle,
                      fontSize: 14,
                    }}
                  >
                    {row.name || "İsimsiz"}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: adminTheme.textMuted,
                      fontFamily: adminTheme.fontBody,
                      fontSize: 12,
                    }}
                  >
                    {row.email ?? "—"}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 6,
                      marginTop: 2,
                      flexWrap: "wrap",
                    }}
                  >
                    <AdminPill label={meta.label} tone={tone} size="sm" />
                    {row.cert_type ? (
                      <AdminPill
                        label={row.cert_type}
                        tone="default"
                        size="sm"
                      />
                    ) : null}
                    {row.submitted_at ? (
                      <AdminPill
                        label={new Date(row.submitted_at).toLocaleDateString(
                          "tr-TR",
                        )}
                        tone="default"
                        size="sm"
                      />
                    ) : null}
                  </View>
                </View>
                <Feather
                  name="chevron-right"
                  size={18}
                  color={adminTheme.textMuted}
                />
              </View>
            </AdminCard>
          );
        })
      )}
    </AdminScreen>
  );
}
