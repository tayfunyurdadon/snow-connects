import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { useColors } from "@/hooks/useColors";
import { formatTRY } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { AppUser, InstructorProfile, Resort } from "@/lib/types";

export default function InstructorDetail() {
  const c = useColors();
  const router = useRouter();
  const { id, from, to } = useLocalSearchParams<{
    id: string;
    from?: string;
    to?: string;
  }>();

  const { data, isLoading } = useQuery({
    queryKey: ["instructor", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instructor_profiles")
        .select("*, user:users!inner(id, name, email)")
        .eq("user_id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as InstructorProfile & {
        user: Pick<AppUser, "id" | "name" | "email">;
      };
      const { data: resorts } = await supabase
        .from("resorts")
        .select("*")
        .in("id", row.resort_ids ?? []);
      return { ...row, resorts: (resorts ?? []) as Resort[] };
    },
    enabled: !!id,
  });

  if (isLoading) return <Loading />;
  if (!data) {
    return (
      <Screen>
        <Text style={{ color: c.foreground }}>Eğitmen bulunamadı.</Text>
      </Screen>
    );
  }

  const totalPrice = Math.round(data.base_price * 1.2);

  return (
    <Screen contentStyle={{ gap: 14 }}>
      <View style={{ alignItems: "center", gap: 8 }}>
        <View
          style={[
            styles.avatar,
            { backgroundColor: c.primary, borderRadius: 100 },
          ]}
        >
          <Text
            style={{
              color: c.primaryForeground,
              fontFamily: "Inter_700Bold",
              fontSize: 28,
            }}
          >
            {(data.user.name || "?").slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <Text style={[styles.name, { color: c.foreground }]}>
          {data.user.name || "Eğitmen"}
        </Text>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <View style={styles.row}>
            <Feather name="star" size={13} color={c.warning} />
            <Text style={{ color: c.foreground, fontSize: 13 }}>
              {data.rating?.toFixed(1) ?? "5.0"}
            </Text>
          </View>
          <Text style={{ color: c.mutedForeground }}>·</Text>
          <Text style={{ color: c.mutedForeground, fontSize: 13 }}>
            {data.experience_years} yıl deneyim
          </Text>
        </View>
      </View>

      <Card>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View>
            <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
              Saatlik (KDV dahil)
            </Text>
            <Text
              style={{
                color: c.foreground,
                fontFamily: "Inter_700Bold",
                fontSize: 24,
              }}
            >
              {formatTRY(totalPrice)}
            </Text>
          </View>
          <Feather name="tag" size={28} color={c.primary} />
        </View>
      </Card>

      {data.bio ? (
        <Card>
          <Text style={[styles.section, { color: c.foreground }]}>
            Hakkında
          </Text>
          <Text
            style={{
              color: c.mutedForeground,
              fontSize: 14,
              lineHeight: 21,
              marginTop: 6,
            }}
          >
            {data.bio}
          </Text>
        </Card>
      ) : null}

      {data.certifications && data.certifications.length > 0 ? (
        <Card>
          <Text style={[styles.section, { color: c.foreground }]}>
            Sertifikalar
          </Text>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}
          >
            {data.certifications.map((cert) => (
              <Pill key={cert} label={cert} tone="accent" />
            ))}
          </View>
        </Card>
      ) : null}

      {data.resorts.length > 0 ? (
        <Card>
          <Text style={[styles.section, { color: c.foreground }]}>
            Çalıştığı pistler
          </Text>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}
          >
            {data.resorts.map((r) => (
              <Pill key={r.id} label={r.name} />
            ))}
          </View>
        </Card>
      ) : null}

      <Button
        label="Rezervasyon Yap"
        onPress={() =>
          router.push(
            from && to
              ? (`/(app)/book/${data.user_id}?from=${from}&to=${to}` as never)
              : (`/(app)/book/${data.user_id}` as never),
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 84,
    height: 84,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontFamily: "Inter_700Bold", fontSize: 22 },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  section: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
});
