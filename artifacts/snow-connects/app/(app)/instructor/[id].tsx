import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { useColors } from "@/hooks/useColors";
import { formatTRY } from "@/lib/format";
import { pickTierKurus, withVat } from "@/lib/pricing";
import { supabase } from "@/lib/supabase";
import type { AppUser, InstructorProfile, Resort } from "@/lib/types";

export default function InstructorDetail() {
  const c = useColors();
  const router = useRouter();
  const { id, resort: resortFromQuery } = useLocalSearchParams<{
    id: string;
    resort?: string;
  }>();

  const { data, isLoading } = useQuery({
    queryKey: ["instructor", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instructor_profiles")
        .select(
          "*, user:users!inner(id, name, email), school:ski_schools(id, name, description)",
        )
        .eq("user_id", id)
        // Defense-in-depth: even if the URL is shared, customers can never
        // open the detail page for a non-approved instructor.
        .eq("verification_status", "approved")
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as InstructorProfile & {
        user: Pick<AppUser, "id" | "name" | "email">;
        school?: { id: string; name: string; description: string } | null;
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

  const tiers = [
    { count: 1, label: "1 kişilik ders", suffix: "/saat" },
    { count: 2, label: "2 kişilik ders", suffix: "/kişi" },
    { count: 3, label: "3 kişilik ders", suffix: "/kişi" },
    { count: 4, label: "4+ kişilik ders", suffix: "/kişi" },
  ].map((t) => ({ ...t, price: withVat(pickTierKurus(data, t.count)) }));
  const headlinePrice = tiers[0].price;
  const initial = (data.user.name || "?").slice(0, 1).toUpperCase();
  const rating = data.rating ?? 5;
  const reviewCount = data.review_count ?? 0;

  return (
    <Screen contentStyle={{ gap: 18, paddingBottom: 120 }}>
      {/* HERO — large editorial portrait card */}
      <View style={{ alignItems: "center", gap: 14, paddingTop: 8 }}>
        <View
          style={[
            styles.avatar,
            {
              backgroundColor: c.primary,
              ...(Platform.OS !== "android"
                ? ({ boxShadow: c.shadowLift } as object)
                : { elevation: 6 }),
            },
          ]}
        >
          <Text
            style={{
              color: c.primaryForeground,
              fontFamily: "Fraunces_600SemiBold",
              fontSize: 44,
              letterSpacing: -1.5,
            }}
          >
            {initial}
          </Text>
          <View style={[styles.ratingBadge, { backgroundColor: c.accent }]}>
            <Feather name="star" size={11} color={c.accentForeground} />
            <Text
              style={{
                color: c.accentForeground,
                fontFamily: "Inter_700Bold",
                fontSize: 12,
              }}
            >
              {rating.toFixed(1)}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: "center", gap: 4 }}>
          <Text style={[styles.name, { color: c.foreground }]}>
            {data.user.name || "Eğitmen"}
          </Text>
          {data.school ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                marginTop: 2,
              }}
            >
              <Feather name="home" size={12} color={c.accentDeep} />
              <Text
                style={{
                  color: c.accentDeep,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 12,
                  letterSpacing: 0.2,
                }}
              >
                {data.school.name}
              </Text>
            </View>
          ) : null}
          <Text
            style={{
              color: c.mutedForeground,
              fontFamily: "Inter_500Medium",
              fontSize: 13,
            }}
          >
            {data.experience_years} yıl deneyim
            {data.resorts.length > 0
              ? ` · ${data.resorts.map((r) => r.name).join(", ")}`
              : ""}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginTop: 2,
            }}
          >
            <Feather name="star" size={12} color={c.accent} />
            <Text
              style={{
                color: c.mutedForeground,
                fontFamily: "Inter_500Medium",
                fontSize: 12,
              }}
            >
              {rating.toFixed(1)} ·{" "}
              {reviewCount === 0
                ? "henüz yorum yok"
                : `${reviewCount} değerlendirme`}
            </Text>
          </View>
        </View>
      </View>

      {/* PRICE — tiered per-person rates */}
      <Card tone="soft" padding={18}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <View>
            <Text
              style={{
                color: c.mutedForeground,
                fontFamily: "Inter_500Medium",
                fontSize: 11,
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              Ders ücretleri · 50 dk
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                gap: 6,
                marginTop: 4,
              }}
            >
              <Text
                style={{
                  color: c.foreground,
                  fontFamily: "Fraunces_700Bold",
                  fontSize: 30,
                  letterSpacing: -0.8,
                }}
              >
                {formatTRY(headlinePrice)}
              </Text>
              <Text
                style={{
                  color: c.mutedForeground,
                  fontFamily: "Inter_500Medium",
                  fontSize: 12,
                }}
              >
                'den başlayan · KDV dahil
              </Text>
            </View>
          </View>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: c.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="users" size={20} color={c.accentForeground} />
          </View>
        </View>

        <View
          style={{
            gap: 8,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: c.borderSoft,
          }}
        >
          {tiers.map((t) => (
            <View
              key={t.count}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <Text
                style={{
                  color: c.foreground,
                  fontFamily: "Inter_500Medium",
                  fontSize: 13,
                }}
              >
                {t.label}
              </Text>
              <Text
                style={{
                  color: c.foreground,
                  fontFamily: "Inter_700Bold",
                  fontSize: 14,
                }}
              >
                {formatTRY(t.price)}
                <Text
                  style={{
                    color: c.mutedForeground,
                    fontFamily: "Inter_500Medium",
                    fontSize: 12,
                  }}
                >
                  {t.suffix}
                </Text>
              </Text>
            </View>
          ))}
        </View>
      </Card>

      {data.bio ? (
        <Card>
          <Text style={[styles.section, { color: c.accentDeep }]}>
            HAKKINDA
          </Text>
          <Text
            style={{
              color: c.foreground,
              fontFamily: "Fraunces_400Regular",
              fontSize: 17,
              lineHeight: 26,
              marginTop: 8,
              letterSpacing: -0.1,
            }}
          >
            "{data.bio}"
          </Text>
        </Card>
      ) : null}

      {data.certifications && data.certifications.length > 0 ? (
        <Card>
          <Text style={[styles.section, { color: c.accentDeep }]}>
            SERTİFİKALAR
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 12,
            }}
          >
            {data.certifications.map((cert) => (
              <Pill key={cert} label={cert} tone="accent" />
            ))}
          </View>
        </Card>
      ) : null}

      {data.resorts.length > 0 ? (
        <Card>
          <Text style={[styles.section, { color: c.accentDeep }]}>
            ÇALIŞTIĞI PİSTLER
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 12,
            }}
          >
            {data.resorts.map((r) => (
              <View
                key={r.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: c.muted,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                }}
              >
                <Feather name="triangle" size={11} color={c.foreground} />
                <Text
                  style={{
                    color: c.foreground,
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 12,
                  }}
                >
                  {r.name}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <View style={{ marginTop: 8 }}>
        <Button
          variant="accent"
          size="lg"
          label="Rezervasyon Yap"
          iconRight={
            <Feather name="arrow-right" size={18} color={c.accentForeground} />
          }
          onPress={() =>
            router.push(
              (resortFromQuery
                ? `/(app)/dates/${data.user_id}?resort=${resortFromQuery}`
                : `/(app)/dates/${data.user_id}`) as never,
            )
          }
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  ratingBadge: {
    position: "absolute",
    bottom: -4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  name: {
    fontFamily: "Fraunces_600SemiBold",
    fontSize: 28,
    letterSpacing: -0.6,
    textAlign: "center",
  },
  section: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 1.4,
  },
});
