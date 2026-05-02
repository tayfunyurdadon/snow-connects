import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loading } from "@/components/ui/Loading";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { formatDateTR } from "@/lib/format";
import { getResortHero } from "@/lib/resortImages";
import { getSeasonForDate, isInSeason } from "@/lib/season";
import { supabase } from "@/lib/supabase";
import type { Resort } from "@/lib/types";

export default function HomeTab() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;

  if (user?.role === "instructor") return <InstructorHome />;
  if (user?.role === "admin") return <AdminHome />;
  return <CustomerHome />;
}

function CustomerHome() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const seasonOpen = isInSeason(new Date());
  const season = getSeasonForDate(new Date());

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["resorts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resorts")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Resort[];
    },
  });

  return (
    <Screen
      padded={false}
      contentStyle={{ paddingBottom: 110, gap: 0 }}
      refreshing={isRefetching}
      onRefresh={refetch}
      hasHeader
    >
      <BrandHeader
        topInset={insets.top}
        userName={user?.name?.split(" ")[0]}
        onSignIn={!user ? () => router.push("/(auth)/login") : undefined}
      />

      <View style={{ paddingHorizontal: 22, paddingTop: 28, gap: 8 }}>
        <Text
          style={{
            color: c.accent,
            fontFamily: "Inter_700Bold",
            fontSize: 11,
            letterSpacing: 2.5,
            textTransform: "uppercase",
          }}
        >
          The Collection · 2026
        </Text>
        <Text
          style={{
            color: c.foreground,
            fontFamily: "PlayfairDisplay_700Bold",
            fontSize: 38,
            lineHeight: 44,
            letterSpacing: -0.5,
          }}
        >
          Türkiye'nin{"\n"}zirvesi seni bekliyor.
        </Text>
        <Text
          style={{
            color: c.mutedForeground,
            fontSize: 14,
            lineHeight: 21,
            marginTop: 6,
          }}
        >
          Yedi efsane pist · seçkin eğitmenler · özel ders.
        </Text>
      </View>

      {!seasonOpen && (
        <View style={{ paddingHorizontal: 22, marginTop: 18 }}>
          <View
            style={{
              flexDirection: "row",
              gap: 10,
              alignItems: "center",
              borderLeftWidth: 3,
              borderLeftColor: c.accent,
              paddingLeft: 12,
              paddingVertical: 8,
            }}
          >
            <Text
              style={{
                color: c.foreground,
                fontFamily: "Inter_500Medium",
                fontSize: 12,
                flex: 1,
              }}
            >
              Sezon kapalı. Yeni sezon {formatDateTR(season.start)} tarihinde
              başlıyor.
            </Text>
          </View>
        </View>
      )}

      <View style={{ paddingHorizontal: 22, marginTop: 32, gap: 18 }}>
        {isLoading ? (
          <Loading inline />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon="map"
            title="Pistler yüklenemedi"
            description="Lütfen bağlantını kontrol et ve sayfayı yenile."
          />
        ) : (
          data.map((r, i) => (
            <ResortHeroCard
              key={r.id}
              resort={r}
              index={i}
              onPress={() => router.push(`/(app)/resort/${r.id}`)}
            />
          ))
        )}
      </View>
    </Screen>
  );
}

function BrandHeader({
  topInset,
  userName,
  onSignIn,
}: {
  topInset: number;
  userName?: string;
  onSignIn?: () => void;
}) {
  const c = useColors();
  return (
    <View
      style={{
        backgroundColor: c.primary,
        paddingTop: topInset + 14,
        paddingBottom: 16,
        paddingHorizontal: 22,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: 8,
            borderRightWidth: 8,
            borderBottomWidth: 14,
            borderLeftColor: "transparent",
            borderRightColor: "transparent",
            borderBottomColor: c.accent,
          }}
        />
        <Text
          style={{
            color: c.primaryForeground,
            fontFamily: "PlayfairDisplay_700Bold",
            fontSize: 20,
            letterSpacing: 0.5,
          }}
        >
          Snow Connects
        </Text>
      </View>
      {onSignIn ? (
        <Pressable onPress={onSignIn} hitSlop={8}>
          <Text
            style={{
              color: c.primaryForeground,
              fontFamily: "Inter_600SemiBold",
              fontSize: 11,
              letterSpacing: 1.2,
              textTransform: "uppercase",
            }}
          >
            Giriş yap
          </Text>
        </Pressable>
      ) : userName ? (
        <Text
          style={{
            color: c.primaryForeground,
            opacity: 0.85,
            fontSize: 12,
            fontFamily: "Inter_500Medium",
          }}
        >
          {userName}
        </Text>
      ) : null}
    </View>
  );
}

function ResortHeroCard({
  resort,
  index,
  onPress,
}: {
  resort: Resort;
  index: number;
  onPress: () => void;
}) {
  const c = useColors();
  const hero = getResortHero(resort.name);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [
      styles.hero,
      pressed && { opacity: 0.95 },
    ]}>
      <Image
        source={{ uri: hero }}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        transition={250}
      />
      <LinearGradient
        colors={["rgba(10,22,40,0.05)", "rgba(10,22,40,0.85)"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.heroIndex}>
        <Text
          style={{
            color: "#fff",
            fontFamily: "PlayfairDisplay_700Bold_Italic",
            fontSize: 14,
            letterSpacing: 1,
          }}
        >
          № {String(index + 1).padStart(2, "0")}
        </Text>
      </View>
      <View style={styles.heroBody}>
        <Text style={styles.heroRegion}>{resort.region.toUpperCase()}</Text>
        <Text style={styles.heroTitle}>{resort.name}</Text>
        <View style={styles.heroCta}>
          <Text style={styles.heroCtaText}>Eğitmenleri keşfet</Text>
          <View
            style={{
              width: 0,
              height: 0,
              borderTopWidth: 5,
              borderBottomWidth: 5,
              borderLeftWidth: 8,
              borderTopColor: "transparent",
              borderBottomColor: "transparent",
              borderLeftColor: c.accent,
              marginLeft: 10,
            }}
          />
        </View>
      </View>
    </Pressable>
  );
}

function InstructorHome() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const { data: bookings } = useQuery({
    queryKey: ["instructor-upcoming", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("instructor_id", user!.id)
        .eq("payment_status", "paid")
        .gte("lesson_date", new Date().toISOString().slice(0, 10))
        .order("lesson_date")
        .limit(5);
      if (error) throw error;
      return data as { id: string; lesson_date: string; total_price: number }[];
    },
    enabled: !!user,
  });

  return (
    <Screen contentStyle={{ paddingTop: insets.top + 18, gap: 18 }}>
      <View>
        <Text style={[styles.eyebrow, { color: c.accent }]}>
          Eğitmen Paneli
        </Text>
        <Text style={[styles.displayLg, { color: c.foreground }]}>
          {user?.name?.split(" ")[0] || "Eğitmen"}
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <Card
          style={{ flex: 1 }}
          onPress={() => router.push("/(app)/instructor-panel/calendar")}
        >
          <Feather name="calendar" size={22} color={c.accent} />
          <Text style={[styles.tileTitle, { color: c.foreground }]}>
            Takvimim
          </Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
            Slotlarını yönet
          </Text>
        </Card>
        <Card
          style={{ flex: 1 }}
          onPress={() => router.push("/(app)/instructor-panel/setup")}
        >
          <Feather name="user-check" size={22} color={c.accent} />
          <Text style={[styles.tileTitle, { color: c.foreground }]}>
            Profilim
          </Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
            Bilgi & fiyat
          </Text>
        </Card>
      </View>

      <Text style={[styles.h2Serif, { color: c.foreground }]}>
        Yaklaşan dersler
      </Text>
      {!bookings || bookings.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="Henüz ders yok"
          description="Yaklaşan derslerin burada görünecek."
        />
      ) : (
        bookings.map((b) => (
          <Card key={b.id}>
            <Text
              style={{ color: c.foreground, fontFamily: "Inter_600SemiBold" }}
            >
              {formatDateTR(b.lesson_date)}
            </Text>
          </Card>
        ))
      )}
    </Screen>
  );
}

function AdminHome() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [u, b, m] = await Promise.all([
        supabase.from("users").select("id", { count: "exact", head: true }),
        supabase.from("bookings").select("id", { count: "exact", head: true }),
        supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("flagged", true),
      ]);
      return {
        users: u.count ?? 0,
        bookings: b.count ?? 0,
        flagged: m.count ?? 0,
      };
    },
  });

  return (
    <Screen contentStyle={{ paddingTop: insets.top + 18, gap: 18 }}>
      <View>
        <Text style={[styles.eyebrow, { color: c.accent }]}>Yönetici</Text>
        <Text style={[styles.displayLg, { color: c.foreground }]}>
          {user?.name?.split(" ")[0] || "Admin"}
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <StatCard label="Kullanıcı" value={stats?.users ?? 0} icon="users" />
        <StatCard
          label="Rezervasyon"
          value={stats?.bookings ?? 0}
          icon="calendar"
        />
        <StatCard
          label="Bildirim"
          value={stats?.flagged ?? 0}
          icon="flag"
          tone="warning"
        />
      </View>

      <Card onPress={() => router.push("/(app)/admin")}>
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: c.secondary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="shield" size={22} color={c.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: c.foreground,
                fontFamily: "Inter_600SemiBold",
                fontSize: 16,
              }}
            >
              Yönetici Paneli
            </Text>
            <Text style={{ color: c.mutedForeground, fontSize: 13 }}>
              Eğitmenler, rezervasyonlar ve bildirilen mesajlar
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color={c.accent} />
        </View>
      </Card>
    </Screen>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: keyof typeof Feather.glyphMap;
  tone?: "warning";
}) {
  const c = useColors();
  return (
    <Card style={{ flex: 1, padding: 14 }}>
      <Feather
        name={icon}
        size={18}
        color={tone === "warning" ? c.warning : c.accent}
      />
      <Text
        style={{
          color: c.foreground,
          fontFamily: "PlayfairDisplay_700Bold",
          fontSize: 26,
          marginTop: 8,
        }}
      >
        {value}
      </Text>
      <Text style={{ color: c.mutedForeground, fontSize: 11, marginTop: 2 }}>
        {label}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  displayLg: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 32,
    letterSpacing: -0.5,
    marginTop: 4,
  },
  h2Serif: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 22,
  },
  tileTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    marginTop: 8,
  },
  hero: {
    height: 360,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#0A1628",
    justifyContent: "flex-end",
  },
  heroIndex: {
    position: "absolute",
    top: 18,
    right: 20,
  },
  heroBody: {
    padding: 22,
    gap: 6,
  },
  heroRegion: {
    color: "rgba(255,255,255,0.85)",
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 2.5,
  },
  heroTitle: {
    color: "#ffffff",
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 38,
    letterSpacing: -0.5,
    lineHeight: 44,
  },
  heroCta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  heroCtaText: {
    color: "#ffffff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
});
