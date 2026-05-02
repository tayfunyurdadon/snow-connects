import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loading } from "@/components/ui/Loading";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { useColors } from "@/hooks/useColors";
import { formatDateTR } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { AppUser, Message } from "@/lib/types";

type Tab = "instructors" | "flagged" | "bookings";

export default function AdminPanel() {
  const c = useColors();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("instructors");

  const { data: instructors, isLoading: loadingInstr } = useQuery({
    queryKey: ["admin-instructors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("role", "instructor")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AppUser[];
    },
    enabled: tab === "instructors",
  });

  const { data: flagged, isLoading: loadingFlag } = useQuery({
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
    enabled: tab === "flagged",
  });

  const { data: bookings, isLoading: loadingBk } = useQuery({
    queryKey: ["admin-bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, resort:resorts(name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as { id: string; lesson_date: string; total_price: number; payment_status: string; resort: { name: string } }[];
    },
    enabled: tab === "bookings",
  });

  async function setStatus(userId: string, status: AppUser["status"]) {
    const { error } = await supabase
      .from("users")
      .update({ status, ...(status === "active" ? { strike_count: 0 } : {}) })
      .eq("id", userId);
    if (error) Alert.alert("Hata", error.message);
    else qc.invalidateQueries({ queryKey: ["admin-instructors"] });
  }

  return (
    <Screen contentStyle={{ gap: 14 }}>
      <View
        style={[
          styles.tabRow,
          { backgroundColor: c.secondary, borderRadius: c.radius },
        ]}
      >
        {(
          [
            { id: "instructors", label: "Eğitmenler" },
            { id: "flagged", label: "Bildirilen" },
            { id: "bookings", label: "Rezervasyon" },
          ] as { id: Tab; label: string }[]
        ).map((t) => {
          const active = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              style={[
                styles.tabBtn,
                {
                  backgroundColor: active ? c.card : "transparent",
                  borderRadius: c.radius - 4,
                },
              ]}
            >
              <Text
                style={{
                  color: active ? c.primary : c.mutedForeground,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 12,
                }}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === "instructors" && (
        <>
          {loadingInstr ? (
            <Loading inline />
          ) : !instructors || instructors.length === 0 ? (
            <EmptyState icon="users" title="Eğitmen bulunamadı" />
          ) : (
            instructors.map((u) => (
              <Card key={u.id}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: c.foreground,
                        fontFamily: "Inter_600SemiBold",
                      }}
                    >
                      {u.name || "İsimsiz"}
                    </Text>
                    <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
                      {u.email}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                      <Pill
                        label={u.status}
                        tone={
                          u.status === "active"
                            ? "success"
                            : u.status === "blocked"
                              ? "danger"
                              : "warning"
                        }
                      />
                      {u.strike_count > 0 ? (
                        <Pill
                          label={`${u.strike_count} uyarı`}
                          tone="warning"
                        />
                      ) : null}
                    </View>
                  </View>
                  <View style={{ gap: 6 }}>
                    {u.status !== "active" && (
                      <Pressable
                        onPress={() => setStatus(u.id, "active")}
                        style={[
                          styles.smallBtn,
                          { backgroundColor: c.success },
                        ]}
                      >
                        <Text style={styles.smallBtnText}>Aç</Text>
                      </Pressable>
                    )}
                    {u.status !== "blocked" && (
                      <Pressable
                        onPress={() => setStatus(u.id, "blocked")}
                        style={[
                          styles.smallBtn,
                          { backgroundColor: c.destructive },
                        ]}
                      >
                        <Text style={styles.smallBtnText}>Bloke</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </Card>
            ))
          )}
        </>
      )}

      {tab === "flagged" && (
        <>
          {loadingFlag ? (
            <Loading inline />
          ) : !flagged || flagged.length === 0 ? (
            <EmptyState
              icon="check-circle"
              title="Bildirim yok"
              description="İletişim bilgisi paylaşımı tespit edilmedi."
            />
          ) : (
            flagged.map((m) => (
              <Card key={m.id}>
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <Feather name="flag" size={14} color={c.warning} />
                  <Pill
                    label={m.flag_reason ?? "ihlal"}
                    tone="warning"
                  />
                  <Text
                    style={{
                      color: c.mutedForeground,
                      fontSize: 11,
                      marginLeft: "auto",
                    }}
                  >
                    {new Date(m.created_at).toLocaleString("tr-TR")}
                  </Text>
                </View>
                <Text
                  style={{ color: c.foreground, fontFamily: "Inter_400Regular" }}
                >
                  {m.content}
                </Text>
              </Card>
            ))
          )}
        </>
      )}

      {tab === "bookings" && (
        <>
          {loadingBk ? (
            <Loading inline />
          ) : !bookings || bookings.length === 0 ? (
            <EmptyState icon="calendar" title="Rezervasyon yok" />
          ) : (
            bookings.map((b) => (
              <Card key={b.id}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <View>
                    <Text
                      style={{
                        color: c.foreground,
                        fontFamily: "Inter_600SemiBold",
                      }}
                    >
                      {b.resort?.name ?? "Pist"}
                    </Text>
                    <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
                      {formatDateTR(b.lesson_date)}
                    </Text>
                  </View>
                  <Pill
                    label={b.payment_status}
                    tone={
                      b.payment_status === "paid"
                        ? "success"
                        : b.payment_status === "pending"
                          ? "warning"
                          : "danger"
                    }
                  />
                </View>
              </Card>
            ))
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabRow: { flexDirection: "row", padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: "center" },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  smallBtnText: {
    color: "#ffffff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
});
