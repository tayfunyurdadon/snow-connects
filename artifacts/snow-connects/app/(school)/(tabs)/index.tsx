import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { supabase } from "@/lib/supabase";
import type { SchoolApprovalStatus } from "@/lib/types";

type Row = {
  user_id: string;
  name: string | null;
  email: string | null;
  bio: string | null;
  experience_years: number | null;
  certifications: string[] | null;
  rating: number | null;
  resort_ids: string[] | null;
  verification_status: string;
  school_approval_status: SchoolApprovalStatus;
  cert_type: string | null;
  cert_number: string | null;
  iban: string | null;
};

type Sub = SchoolApprovalStatus;

export default function SchoolInstructors() {
  const qc = useQueryClient();
  const [sub, setSub] = useState<Sub>("pending");

  const pending = useQuery({
    queryKey: ["school-instructors", "pending"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("school_list_instructors", {
        p_status: "pending",
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["school-instructors", sub],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("school_list_instructors", {
        p_status: sub,
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const setStatus = useMutation({
    mutationFn: async (v: { id: string; status: SchoolApprovalStatus }) => {
      const { error } = await supabase.rpc("school_set_instructor_status", {
        p_instructor: v.id,
        p_status: v.status,
        p_reason: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["school-instructors"] });
      qc.invalidateQueries({ queryKey: ["school-summary"] });
    },
    onError: (e: Error) => Alert.alert("Hata", e.message),
  });

  return (
    <AdminScreen>
      <AdminTabRow
        value={sub}
        onChange={setSub}
        options={[
          {
            id: "pending",
            label: "Bekleyen",
            count: pending.data?.length ?? 0,
          },
          { id: "approved", label: "Onaylı" },
          { id: "rejected", label: "Reddedilen" },
        ]}
      />

      {isLoading ? (
        <AdminSpinner />
      ) : !data || data.length === 0 ? (
        <AdminEmpty
          icon="users"
          title="Liste boş"
          description={
            sub === "pending"
              ? "Yeni başvurular geldiğinde burada görünecek."
              : undefined
          }
        />
      ) : (
        data.map((r) => (
          <AdminCard key={r.user_id}>
            <View style={{ gap: 8 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: 8,
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
                    {r.name || "İsimsiz"}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: adminTheme.textMuted,
                      fontFamily: adminTheme.fontBody,
                      fontSize: 12,
                      marginTop: 2,
                    }}
                  >
                    {r.email ?? "—"}
                  </Text>
                </View>
                <AdminPill
                  label={
                    r.school_approval_status === "approved"
                      ? "Onaylı"
                      : r.school_approval_status === "rejected"
                        ? "Reddedildi"
                        : "Bekliyor"
                  }
                  tone={
                    r.school_approval_status === "approved"
                      ? "success"
                      : r.school_approval_status === "rejected"
                        ? "danger"
                        : "warning"
                  }
                  size="sm"
                />
              </View>
              {r.bio ? (
                <Text
                  style={{
                    color: adminTheme.textMuted,
                    fontFamily: adminTheme.fontBody,
                    fontSize: 12,
                    lineHeight: 17,
                  }}
                  numberOfLines={3}
                >
                  {r.bio}
                </Text>
              ) : null}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {r.cert_type ? (
                  <AdminPill label={r.cert_type} tone="default" size="sm" />
                ) : null}
                {r.experience_years ? (
                  <AdminPill
                    label={`${r.experience_years} yıl`}
                    tone="default"
                    size="sm"
                  />
                ) : null}
                {r.iban ? (
                  <AdminPill label="IBAN var" tone="info" size="sm" />
                ) : null}
              </View>
              {sub !== "approved" ? (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                  <View style={{ flex: 1 }}>
                    <AdminButton
                      label="Onayla"
                      icon="check"
                      size="sm"
                      onPress={() =>
                        setStatus.mutate({
                          id: r.user_id,
                          status: "approved",
                        })
                      }
                    />
                  </View>
                  {sub === "pending" ? (
                    <View style={{ flex: 1 }}>
                      <AdminButton
                        label="Reddet"
                        tone="danger"
                        icon="x"
                        size="sm"
                        onPress={() =>
                          setStatus.mutate({
                            id: r.user_id,
                            status: "rejected",
                          })
                        }
                      />
                    </View>
                  ) : null}
                </View>
              ) : (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                  <View style={{ flex: 1 }}>
                    <AdminButton
                      label="Pasifleştir"
                      tone="ghost"
                      icon="pause"
                      size="sm"
                      onPress={() =>
                        setStatus.mutate({
                          id: r.user_id,
                          status: "pending",
                        })
                      }
                    />
                  </View>
                </View>
              )}
            </View>
          </AdminCard>
        ))
      )}
    </AdminScreen>
  );
}
