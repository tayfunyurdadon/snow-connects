import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";

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
import type { AppUser, UserStatus } from "@/lib/types";

type SubTab = "instructors" | "customers";

export default function AdminUsers() {
  const qc = useQueryClient();
  const [sub, setSub] = useState<SubTab>("instructors");
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", sub],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("role", sub === "instructors" ? "instructor" : "customer")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as AppUser[];
    },
  });

  // For instructors, also pull verification_status so admins can see who's
  // approved at a glance.
  const { data: verifMap } = useQuery({
    enabled: sub === "instructors",
    queryKey: ["admin-users-verif"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instructor_profiles")
        .select("user_id, verification_status");
      if (error) throw error;
      const m = new Map<string, string>();
      (data ?? []).forEach((r: any) => m.set(r.user_id, r.verification_status));
      return m;
    },
  });

  const filtered = useMemo(() => {
    const src = data ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return src;
    return src.filter(
      (u) =>
        (u.name ?? "").toLowerCase().includes(term) ||
        (u.email ?? "").toLowerCase().includes(term) ||
        (u.phone ?? "").toLowerCase().includes(term),
    );
  }, [data, q]);

  async function setStatus(id: string, status: UserStatus) {
    const { error } = await supabase.rpc("admin_set_user_status", {
      p_user: id,
      p_status: status,
    });
    if (error) {
      Alert.alert("Hata", error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  }

  return (
    <AdminScreen>
      <AdminTabRow
        value={sub}
        onChange={setSub}
        options={[
          { id: "instructors", label: "Eğitmenler" },
          { id: "customers", label: "Müşteriler" },
        ]}
      />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: adminTheme.surfaceMuted,
          borderRadius: adminTheme.radiusSm,
          borderWidth: 1,
          borderColor: adminTheme.border,
          paddingHorizontal: 10,
        }}
      >
        <Feather name="search" size={14} color={adminTheme.textMuted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Ad, e-posta, telefon ara"
          placeholderTextColor={adminTheme.textDim}
          style={{
            flex: 1,
            color: adminTheme.text,
            paddingVertical: 10,
            paddingHorizontal: 8,
            fontFamily: adminTheme.fontBody,
            fontSize: 13,
          }}
        />
      </View>

      {isLoading ? (
        <AdminSpinner />
      ) : filtered.length === 0 ? (
        <AdminEmpty
          icon="users"
          title="Kullanıcı bulunamadı"
          description={
            q ? "Arama kriterlerine uygun kullanıcı yok." : undefined
          }
        />
      ) : (
        filtered.map((u) => {
          const verif = verifMap?.get(u.id);
          return (
            <AdminCard key={u.id}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: adminTheme.text,
                      fontFamily: adminTheme.fontTitle,
                      fontSize: 14,
                    }}
                  >
                    {u.name || "İsimsiz"}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: adminTheme.textMuted,
                      fontFamily: adminTheme.fontBody,
                      fontSize: 12,
                    }}
                  >
                    {u.email ?? "—"}
                    {u.phone ? `  ·  ${u.phone}` : ""}
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
                      label={u.status}
                      tone={
                        u.status === "active"
                          ? "success"
                          : u.status === "blocked"
                            ? "danger"
                            : "warning"
                      }
                      size="sm"
                    />
                    {verif ? (
                      <AdminPill
                        label={verif}
                        tone={
                          verif === "approved"
                            ? "success"
                            : verif === "rejected" || verif === "suspended"
                              ? "danger"
                              : "warning"
                        }
                        size="sm"
                      />
                    ) : null}
                    {u.strike_count > 0 ? (
                      <AdminPill
                        label={`${u.strike_count} uyarı`}
                        tone="warning"
                        size="sm"
                      />
                    ) : null}
                  </View>
                </View>
                <View style={{ gap: 6 }}>
                  {u.status !== "active" ? (
                    <AdminButton
                      label="Aç"
                      tone="success"
                      size="sm"
                      onPress={() => setStatus(u.id, "active")}
                    />
                  ) : null}
                  {u.status !== "blocked" ? (
                    <AdminButton
                      label="Bloke"
                      tone="danger"
                      size="sm"
                      onPress={() => setStatus(u.id, "blocked")}
                    />
                  ) : null}
                </View>
              </View>
            </AdminCard>
          );
        })
      )}
    </AdminScreen>
  );
}
