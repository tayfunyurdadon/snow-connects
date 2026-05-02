import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loading } from "@/components/ui/Loading";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { isInSeason, getSeasonForDate } from "@/lib/season";
import { formatDateTR } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { Resort } from "@/lib/types";

export default function HomeTab() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;

  if (user?.role === "instructor") return <InstructorHome />;
  if (user?.role === "admin") return <AdminHome />;
  // Customers AND guests both see the resort browser.
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
      contentStyle={{ paddingTop: insets.top + 12, gap: 16 }}
      refreshing={isRefetching}
      onRefresh={refetch}
    >
      <View>
        <Text style={[styles.greeting, { color: c.mutedForeground }]}>
          Hoş geldin
        </Text>
        <Text style={[styles.name, { color: c.foreground }]}>
          {user?.name?.split(" ")[0] || "Kayakçı"}
        </Text>
      </View>

      {!user && (
        <Card
          onPress={() => router.push("/(auth)/login")}
          style={{ backgroundColor: c.primary }}
        >
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
          >
            <Feather name="user-plus" size={20} color={c.primaryForeground} />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: c.primaryForeground,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 14,
                }}
              >
                Hesabınla daha fazlasını yap
              </Text>
              <Text
                style={{
                  color: c.primaryForeground,
                  opacity: 0.85,
                  fontSize: 12,
                  marginTop: 2,
                }}
              >
                Rezervasyon, mesajlaşma ve ders takibi için giriş yap.
              </Text>
            </View>
            <Feather
              name="chevron-right"
              size={20}
              color={c.primaryForeground}
            />
          </View>
        </Card>
      )}

      {!seasonOpen && (
        <Card style={{ backgroundColor: c.secondary, borderColor: c.accent }}>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <Feather name="info" size={18} color={c.primary} />
            <Text
              style={{
                color: c.foreground,
                fontFamily: "Inter_500Medium",
                fontSize: 13,
                flex: 1,
              }}
            >
              Sezon kapalı. Yeni sezon {formatDateTR(season.start)}
              {" "}
              tarihinde başlıyor.
            </Text>
          </View>
        </Card>
      )}

      <View style={{ gap: 4 }}>
        <Text style={[styles.h2, { color: c.foreground }]}>
          Bir kayak merkezi seç
        </Text>
        <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular" }}>
          Türkiye'nin en iyi 7 pisti, kapındaki gibi.
        </Text>
      </View>

      {isLoading ? (
        <Loading inline />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon="map"
          title="Pistler yüklenemedi"
          description="Lütfen bağlantını kontrol et ve sayfayı yenile."
        />
      ) : (
        <View style={{ gap: 12 }}>
          {data.map((r) => (
            <Card
              key={r.id}
              onPress={() => router.push(`/(app)/dates/${r.id}`)}
            >
              <View style={styles.row}>
                <View
                  style={[
                    styles.iconBox,
                    {
                      backgroundColor: c.secondary,
                      borderRadius: c.radius,
                    },
                  ]}
                >
                  <Feather name="triangle" size={22} color={c.primary} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.cardTitle, { color: c.foreground }]}>
                    {r.name}
                  </Text>
                  <Pill label={r.region} tone="accent" />
                </View>
                <Feather
                  name="chevron-right"
                  size={20}
                  color={c.mutedForeground}
                />
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
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
    <Screen contentStyle={{ paddingTop: insets.top + 12, gap: 16 }}>
      <View>
        <Text style={[styles.greeting, { color: c.mutedForeground }]}>
          Eğitmen Paneli
        </Text>
        <Text style={[styles.name, { color: c.foreground }]}>
          {user?.name?.split(" ")[0] || "Eğitmen"}
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <Card
          style={{ flex: 1 }}
          onPress={() => router.push("/(app)/instructor-panel/calendar")}
        >
          <Feather name="calendar" size={22} color={c.primary} />
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
          <Feather name="user-check" size={22} color={c.primary} />
          <Text style={[styles.tileTitle, { color: c.foreground }]}>
            Profilim
          </Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
            Bilgi & fiyat
          </Text>
        </Card>
      </View>

      <Text style={[styles.h2, { color: c.foreground }]}>Yaklaşan dersler</Text>
      {!bookings || bookings.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="Henüz ders yok"
          description="Yaklaşan derslerin burada görünecek."
        />
      ) : (
        bookings.map((b) => (
          <Card key={b.id}>
            <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold" }}>
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
    <Screen contentStyle={{ paddingTop: insets.top + 12, gap: 16 }}>
      <View>
        <Text style={[styles.greeting, { color: c.mutedForeground }]}>
          Yönetici
        </Text>
        <Text style={[styles.name, { color: c.foreground }]}>
          {user?.name?.split(" ")[0] || "Admin"}
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <StatCard label="Kullanıcı" value={stats?.users ?? 0} icon="users" />
        <StatCard label="Rezervasyon" value={stats?.bookings ?? 0} icon="calendar" />
        <StatCard
          label="Bildirim"
          value={stats?.flagged ?? 0}
          icon="flag"
          tone="warning"
        />
      </View>

      <Card onPress={() => router.push("/(app)/admin")}>
        <View style={styles.row}>
          <View
            style={[
              styles.iconBox,
              { backgroundColor: c.secondary, borderRadius: c.radius },
            ]}
          >
            <Feather name="shield" size={22} color={c.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: c.foreground }]}>
              Yönetici Paneli
            </Text>
            <Text style={{ color: c.mutedForeground, fontSize: 13 }}>
              Eğitmenler, rezervasyonlar ve bildirilen mesajlar
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color={c.mutedForeground} />
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
    <Card style={{ flex: 1, padding: 12 }}>
      <Feather
        name={icon}
        size={18}
        color={tone === "warning" ? c.warning : c.primary}
      />
      <Text
        style={{
          color: c.foreground,
          fontFamily: "Inter_700Bold",
          fontSize: 22,
          marginTop: 6,
        }}
      >
        {value}
      </Text>
      <Text
        style={{ color: c.mutedForeground, fontSize: 11, marginTop: 2 }}
      >
        {label}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  greeting: { fontFamily: "Inter_400Regular", fontSize: 14 },
  name: { fontFamily: "Inter_700Bold", fontSize: 26, letterSpacing: -0.5 },
  h2: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBox: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16 },
  tileTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    marginTop: 8,
  },
});
