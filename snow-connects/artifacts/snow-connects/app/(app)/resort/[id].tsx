import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Header } from "@/components/ui/Header";
import { Loading } from "@/components/ui/Loading";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { useColors } from "@/hooks/useColors";
import { formatTRY } from "@/lib/format";
import { effectiveTieredProfile, pickTierKurus, withVat } from "@/lib/pricing";
import { supabase } from "@/lib/supabase";
import type { AppUser, InstructorProfile, Resort } from "@/lib/types";

type SchoolPriceColumns = {
  price_1_kurus: number | null;
  price_2_kurus: number | null;
  price_3_kurus: number | null;
  price_4plus_kurus: number | null;
};

type Row = InstructorProfile & {
  user: Pick<AppUser, "id" | "name">;
  school?: ({ id: string; name: string } & SchoolPriceColumns) | null;
};

export default function ResortInstructors() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: resort } = useQuery({
    queryKey: ["resort", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resorts")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as Resort | null;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["instructors", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instructor_profiles")
        .select(
          "*, user:users!inner(id, name, status, role), school:ski_schools(id, name, price_1_kurus, price_2_kurus, price_3_kurus, price_4plus_kurus)",
        )
        .contains("resort_ids", [id])
        // Only verified instructors are bookable. RLS already hides
        // unapproved profiles from non-owners, but we filter explicitly so
        // an instructor browsing their own resort doesn't see themselves.
        .eq("verification_status", "approved");
      if (error) throw error;
      return ((data ?? []) as (Row & { user: AppUser })[])
        .filter(
          (r) => r.user.status === "active" && r.user.role === "instructor",
        )
        .map((r) => ({
          ...r,
          user: { id: r.user.id, name: r.user.name },
          school: r.school ?? null,
        }));
    },
    enabled: !!id,
  });

  const visible = data ?? [];

  return (
    <>
      <Stack.Screen options={{ title: "" }} />
      <Screen contentStyle={{ gap: 20 }}>
        {resort ? (
          <Header
            eyebrow={resort.region}
            title={resort.name}
            subtitle={
              visible.length > 0
                ? `Bu pistte ders veren ${visible.length} eğitmen.`
                : "Eğitmen listesi hazırlanıyor."
            }
          />
        ) : null}

        {isLoading ? (
          <Loading inline />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="user-x"
            title="Bu pistte eğitmen yok"
            description="Yakın zamanda eğitmenler eklendiğinde burada görünecek."
          />
        ) : (
          <View style={{ gap: 12 }}>
            {visible.map((p) => (
              <InstructorCard
                key={p.user_id}
                row={p}
                onPress={() =>
                  router.push(
                    `/(app)/instructor/${p.user_id}?resort=${id}` as never,
                  )
                }
              />
            ))}
          </View>
        )}
      </Screen>
    </>
  );
}

function InstructorCard({
  row,
  onPress,
}: {
  row: Row;
  onPress: () => void;
}) {
  const c = useColors();
  const initial = (row.user.name || "?").slice(0, 1).toUpperCase();
  // School-affiliated instructors price from their school's tariff
  // (Phase 10/15) — same rule as the profile and book screens.
  const effective = effectiveTieredProfile(row, row.school ?? null);
  const price1 = withVat(pickTierKurus(effective, 1));
  const price2 = withVat(pickTierKurus(effective, 2));
  // "3+ kişi" represents the rate any group of 3 or more pays. We surface
  // the 4+ tier (the floor) so customers see the lowest-per-person price
  // they'll get once their party crosses three.
  const price3plus = withVat(pickTierKurus(effective, 4));
  const rating = row.rating ?? 5;
  return (
    <Card onPress={onPress} padding={18}>
      <View style={{ flexDirection: "row", gap: 14 }}>
        <View
          style={[
            styles.photo,
            {
              backgroundColor: c.primary,
              alignItems: "center",
              justifyContent: "center",
            },
          ]}
        >
          <Text
            style={{
              color: c.primaryForeground,
              fontFamily: "Fraunces_600SemiBold",
              fontSize: 28,
              letterSpacing: -1,
            }}
          >
            {initial}
          </Text>
        </View>

        <View style={{ flex: 1, gap: 6 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 8,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={{
                  color: c.foreground,
                  fontFamily: "Fraunces_600SemiBold",
                  fontSize: 18,
                  letterSpacing: -0.3,
                }}
                numberOfLines={1}
              >
                {row.user.name || "Eğitmen"}
              </Text>
              {row.school ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Feather name="home" size={11} color={c.accentDeep} />
                  <Text
                    numberOfLines={1}
                    style={{
                      color: c.accentDeep,
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 11,
                      letterSpacing: 0.2,
                    }}
                  >
                    {row.school.name}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={{ gap: 2 }}>
            <Text
              style={{
                color: c.foreground,
                fontFamily: "Inter_600SemiBold",
                fontSize: 12.5,
                lineHeight: 18,
              }}
            >
              <Text style={{ color: c.mutedForeground }}>1 kişi: </Text>
              {formatTRY(price1)}/saat
              <Text style={{ color: c.mutedForeground }}>  ·  2 kişi: </Text>
              {formatTRY(price2)}/kişi
              <Text style={{ color: c.mutedForeground }}>  ·  3+ kişi: </Text>
              {formatTRY(price3plus)}/kişi
            </Text>
            <Text
              style={{
                color: c.mutedForeground,
                fontFamily: "Inter_500Medium",
                fontSize: 10,
                letterSpacing: 0.3,
                textTransform: "uppercase",
              }}
            >
              KDV dahil
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <View style={styles.metaRow}>
              <Feather name="star" size={12} color={c.accent} />
              <Text
                style={{
                  color: c.foreground,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 12,
                }}
              >
                {rating.toFixed(1)}
              </Text>
            </View>
            <Text
              style={{
                color: c.mutedForeground,
                fontFamily: "Inter_500Medium",
                fontSize: 12,
              }}
            >
              {row.experience_years} yıl deneyim
            </Text>
            {row.certifications && row.certifications.length > 0 ? (
              <Pill label={row.certifications[0]} tone="accent" size="sm" />
            ) : null}
          </View>

          {row.bio ? (
            <Text
              style={{
                color: c.mutedForeground,
                fontFamily: "Inter_400Regular",
                fontSize: 13,
                lineHeight: 19,
                marginTop: 2,
              }}
              numberOfLines={2}
            >
              {row.bio}
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  photo: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
});
