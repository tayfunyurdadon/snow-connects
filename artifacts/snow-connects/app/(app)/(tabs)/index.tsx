import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Header } from "@/components/ui/Header";
import { Loading } from "@/components/ui/Loading";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { isInSeason, getSeasonForDate } from "@/lib/season";
import { formatDateTR } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { slotLabel, TIME_SLOTS } from "@/lib/timeSlots";
import { EXPERIENCE_LEVELS, type Resort } from "@/lib/types";

function levelLabel(value: string): string {
  const fromList = EXPERIENCE_LEVELS.find((e) => e.value === value)?.label;
  if (fromList) return fromList;
  // Manual bookings default to 'beginner' (Phase 9) — map to Turkish.
  const fallback: Record<string, string> = {
    beginner: "Başlangıç",
    intermediate: "Orta",
    advanced: "İleri",
  };
  return fallback[value] ?? value;
}

function sessionsLabel(slotIds: string[]): string | null {
  if (!slotIds || slotIds.length === 0) return null;
  const sorted = [...slotIds].sort();
  if (sorted.length === 1) return slotLabel(sorted[0]);
  // Multiple slots — show start of first → end of last for the full range.
  const first = TIME_SLOTS.find((s) => s.id === sorted[0]);
  const last = TIME_SLOTS.find((s) => s.id === sorted[sorted.length - 1]);
  if (first && last) {
    return `${first.start} – ${last.end} (${sorted.length} seans)`;
  }
  return sorted.join(", ");
}

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

  const firstName = user?.name?.split(" ")[0];

  return (
    <Screen
      contentStyle={{ paddingTop: insets.top + 16, gap: 22 }}
      refreshing={isRefetching}
      onRefresh={refetch}
    >
      {/* HERO — editorial greeting that sets the tone */}
      <View style={{ gap: 16 }}>
        <View style={styles.brandRow}>
          <View style={[styles.brandMark, { backgroundColor: c.primary }]}>
            <Feather name="triangle" size={13} color={c.accent} />
          </View>
          <Text style={[styles.brandWord, { color: c.foreground }]}>
            Snow Connects
          </Text>
          <View style={{ flex: 1 }} />
          {seasonOpen ? (
            <View style={[styles.seasonDot, { backgroundColor: c.accent }]} />
          ) : null}
          <Text
            style={{
              color: c.mutedForeground,
              fontFamily: "Inter_500Medium",
              fontSize: 11,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            {seasonOpen ? "Sezon açık" : "Sezon dışı"}
          </Text>
        </View>

        <Header
          eyebrow={firstName ? `Hoş geldin, ${firstName}` : "Hoş geldin"}
          title={`Karın altında\nseni bekleyen biri var.`}
          subtitle="Türkiye'nin en sevilen pistleri ve oradaki en deneyimli eğitmenler. Bir gün seç, gerisi bizde."
        />
      </View>

      {!user && (
        <Card
          tone="ink"
          onPress={() => router.push("/(auth)/login")}
          padding={18}
        >
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: 14 }}
          >
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: c.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="user-plus" size={18} color={c.accentForeground} />
            </View>
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
                  opacity: 0.72,
                  fontFamily: "Inter_400Regular",
                  fontSize: 12,
                  marginTop: 2,
                }}
              >
                Rezervasyon, mesajlaşma ve ders takibi.
              </Text>
            </View>
            <Feather
              name="arrow-up-right"
              size={18}
              color={c.primaryForeground}
            />
          </View>
        </Card>
      )}

      {!seasonOpen && (
        <Card tone="soft" padding={14}>
          <View
            style={{ flexDirection: "row", gap: 10, alignItems: "center" }}
          >
            <Feather name="info" size={16} color={c.accentDeep} />
            <Text
              style={{
                color: c.foreground,
                fontFamily: "Inter_500Medium",
                fontSize: 13,
                flex: 1,
              }}
            >
              Sezon kapalı. Yeni sezon {formatDateTR(season.start)} tarihinde
              başlıyor.
            </Text>
          </View>
        </Card>
      )}

      {/* SECTION — Resorts */}
      <View style={{ gap: 4 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            justifyContent: "space-between",
          }}
        >
          <Text style={[styles.sectionTitle, { color: c.foreground }]}>
            Pistler
          </Text>
          <Text
            style={{
              color: c.mutedForeground,
              fontFamily: "Inter_500Medium",
              fontSize: 12,
            }}
          >
            {data?.length ?? 0} merkez
          </Text>
        </View>
        <Text
          style={{
            color: c.mutedForeground,
            fontFamily: "Inter_400Regular",
            fontSize: 13,
            marginTop: 2,
          }}
        >
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
          {data.map((r, i) => (
            <ResortCard
              key={r.id}
              resort={r}
              index={i}
              onPress={() => router.push(`/(app)/resort/${r.id}`)}
            />
          ))}
        </View>
      )}

      <WhyChooseSection />
    </Screen>
  );
}

function WhyChooseSection() {
  const c = useColors();
  return (
    <View style={{ gap: 16, marginTop: 12 }}>
      <View style={{ gap: 10 }}>
        <Text
          style={{
            color: c.accentDeep,
            fontFamily: "Inter_700Bold",
            fontSize: 11,
            letterSpacing: 1.4,
          }}
        >
          NEDEN SNOW CONNECTS
        </Text>
        <Text
          style={{
            color: c.foreground,
            fontFamily: "Fraunces_600SemiBold",
            fontSize: 26,
            letterSpacing: -0.6,
            lineHeight: 32,
          }}
        >
          Snow Connects ile neden{"\n"}kayak dersi alınır?
        </Text>
        <Text
          style={{
            color: c.mutedForeground,
            fontFamily: "Inter_400Regular",
            fontSize: 14,
            lineHeight: 21,
          }}
        >
          Snow Connects, Türkiye'nin en iyi kayak ve snowboard eğitmenlerini
          bulmanı ve dakikalar içinde rezervasyon yapmanı sağlar. Yeni
          başlayanlar, ileri seviye kayakçılar ve her yaştan çocuklar için özel
          ve grup dersleri.
        </Text>
      </View>

      <View style={{ gap: 12 }}>
        <BenefitCard
          icon="award"
          title="Güvenilir, Sertifikalı Eğitmenler"
          body="ISIA, TKF ve uluslararası sertifikalı eğitmenlerle pistleri en iyi tanıyan profesyonellerden ders al. Her eğitmenimiz titizlikle seçilir; deneyim ve güvenlik ön planda."
          bg="#E4EEF6"
          iconBg="#FFFFFF"
          iconColor="#2F5C7A"
        />
        <BenefitCard
          icon="target"
          title="Sana Özel Ders Deneyimi"
          body="Sıfırdan başlayan biri, tekniğini geliştirmek isteyen orta seviye bir kayakçı ya da off-piste deneyimi arayan ileri seviye biri olabilirsin. Eğitmenin dersi tamamen senin hedeflerine ve seviyene göre planlar."
          bg="#E2EEDF"
          iconBg="#FFFFFF"
          iconColor="#3D7A40"
        />
        <BenefitCard
          icon="message-square"
          title="Doğrulanmış Yorumlar"
          body="Snow Connects'teki tüm yorumlar gerçek dersleri tamamlamış müşterilerden gelir. Eğitmenini seçmeden önce şeffaf değerlendirmeleri okuyabilir, gönül rahatlığıyla rezervasyon yapabilirsin."
          bg="#FBF3E2"
          iconBg="#FFFFFF"
          iconColor="#A66A1A"
        />
      </View>
    </View>
  );
}

function BenefitCard({
  icon,
  title,
  body,
  bg,
  iconBg,
  iconColor,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
  bg: string;
  iconBg: string;
  iconColor: string;
}) {
  const c = useColors();
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: c.radiusLg,
        padding: 22,
        gap: 12,
      }}
    >
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 14,
          backgroundColor: iconBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name={icon} size={20} color={iconColor} />
      </View>
      <Text
        style={{
          color: c.foreground,
          fontFamily: "Fraunces_600SemiBold",
          fontSize: 19,
          letterSpacing: -0.3,
          lineHeight: 25,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          color: c.foreground,
          opacity: 0.78,
          fontFamily: "Inter_400Regular",
          fontSize: 13.5,
          lineHeight: 21,
        }}
      >
        {body}
      </Text>
    </View>
  );
}

function ResortCard({
  resort,
  index,
  onPress,
}: {
  resort: Resort;
  index: number;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Card onPress={onPress} padding={18}>
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: 14 }}
      >
        {/* Numbered editorial marker */}
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 18,
            backgroundColor: c.muted,
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <Feather name="triangle" size={22} color={c.foreground} />
          <Text
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              backgroundColor: c.accent,
              color: c.accentForeground,
              fontFamily: "Fraunces_600SemiBold",
              fontSize: 11,
              width: 20,
              height: 20,
              borderRadius: 10,
              textAlign: "center",
              lineHeight: 20,
            }}
          >
            {String(index + 1).padStart(2, "0")}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            style={{
              color: c.foreground,
              fontFamily: "Fraunces_600SemiBold",
              fontSize: 19,
              letterSpacing: -0.3,
            }}
          >
            {resort.name}
          </Text>
          <Text
            style={{
              color: c.mutedForeground,
              fontFamily: "Inter_500Medium",
              fontSize: 12,
              letterSpacing: 0.2,
            }}
          >
            {resort.region}
          </Text>
        </View>
        <Feather name="arrow-up-right" size={18} color={c.taupeSoft ?? c.mutedForeground} />
      </View>
    </Card>
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
      // Fetch upcoming lessons + customer + students. Time slots are
      // not declared as a FK in the schema, so we fetch them in a
      // second query keyed off slot_ids.
      const { data: rows, error } = await supabase
        .from("bookings")
        .select(
          `id, lesson_date, total_price, source, student_count, slot_ids,
           manual_customer_name,
           customer:users!customer_id(name),
           students(first_name, last_name, age, experience_level)`,
        )
        .eq("instructor_id", user!.id)
        .eq("payment_status", "paid")
        .gte("lesson_date", new Date().toISOString().slice(0, 10))
        .order("lesson_date")
        .limit(5);
      if (error) throw error;
      type Row = {
        id: string;
        lesson_date: string;
        total_price: number;
        source: "online" | "manual";
        student_count: number;
        slot_ids: string[];
        manual_customer_name: string | null;
        customer: { name: string | null } | null;
        students:
          | {
              first_name: string;
              last_name: string;
              age: number;
              experience_level: string;
            }[]
          | null;
        slot_times?: string[];
      };
      // PostgREST types embedded relations as arrays; coerce to our
      // single-object shape (we know `customer` is at most one row).
      const list = ((rows ?? []) as unknown[]).map((r) => {
        const row = r as Omit<Row, "customer"> & {
          customer: { name: string | null }[] | null;
        };
        return {
          ...row,
          customer:
            Array.isArray(row.customer) && row.customer.length > 0
              ? row.customer[0]
              : null,
        } as Row;
      });
      const allSlotIds = Array.from(
        new Set(list.flatMap((b) => b.slot_ids ?? [])),
      );
      if (allSlotIds.length > 0) {
        const { data: slots } = await supabase
          .from("time_slots")
          .select("id, slot_time")
          .in("id", allSlotIds);
        const byId = new Map(
          (slots ?? []).map((s: { id: string; slot_time: string }) => [
            s.id,
            s.slot_time,
          ]),
        );
        for (const b of list) {
          b.slot_times = (b.slot_ids ?? [])
            .map((id) => byId.get(id))
            .filter((t): t is string => !!t)
            .sort();
        }
      }
      return list;
    },
    enabled: !!user,
  });

  return (
    <Screen contentStyle={{ paddingTop: insets.top + 16, gap: 22 }}>
      <Header
        eyebrow="Eğitmen Paneli"
        title={`İyi dersler,\n${user?.name?.split(" ")[0] || "Eğitmen"}.`}
        subtitle="Takvimini ve profilini buradan yönet."
      />

      <View style={{ flexDirection: "row", gap: 12 }}>
        <Card
          style={{ flex: 1 }}
          padding={16}
          onPress={() => router.push("/(app)/instructor-panel/calendar")}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: c.accentSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="calendar" size={18} color={c.accentDeep} />
          </View>
          <Text style={[styles.tileTitle, { color: c.foreground }]}>
            Takvimim
          </Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
            Slotlarını yönet
          </Text>
        </Card>
        <Card
          style={{ flex: 1 }}
          padding={16}
          onPress={() => router.push("/(app)/instructor-panel/payments")}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: c.accentSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="credit-card" size={18} color={c.accentDeep} />
          </View>
          <Text style={[styles.tileTitle, { color: c.foreground }]}>
            Ödemelerim
          </Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
            Kazanç & raporlar
          </Text>
        </Card>
        <Card
          style={{ flex: 1 }}
          padding={16}
          onPress={() => router.push("/(app)/instructor-panel/setup")}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: c.muted,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="user" size={18} color={c.foreground} />
          </View>
          <Text style={[styles.tileTitle, { color: c.foreground }]}>
            Profilim
          </Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
            Bilgi & fiyat
          </Text>
        </Card>
      </View>

      <Text style={[styles.sectionTitle, { color: c.foreground }]}>
        Yaklaşan dersler
      </Text>
      {!bookings || bookings.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="Henüz ders yok"
          description="Yaklaşan derslerin burada görünecek."
        />
      ) : (
        bookings.map((b) => {
          const customerName =
            b.source === "manual"
              ? b.manual_customer_name || "Manuel müşteri"
              : b.customer?.name || "Müşteri";
          const sessions = sessionsLabel(b.slot_times ?? []);
          return (
            <Card key={b.id} style={{ gap: 10 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      color: c.foreground,
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 15,
                    }}
                  >
                    {formatDateTR(b.lesson_date)}
                  </Text>
                  <Text
                    style={{
                      color: c.mutedForeground,
                      fontSize: 12,
                      marginTop: 2,
                    }}
                  >
                    {sessions ? (
                      <>
                        <Feather name="clock" size={11} /> {sessions}
                        {"  ·  "}
                      </>
                    ) : null}
                    {b.student_count} öğrenci
                  </Text>
                </View>
                {b.source === "manual" ? (
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 999,
                      backgroundColor: c.muted,
                    }}
                  >
                    <Text
                      style={{
                        color: c.mutedForeground,
                        fontSize: 10,
                        fontFamily: "Inter_600SemiBold",
                        letterSpacing: 0.5,
                      }}
                    >
                      MANUEL
                    </Text>
                  </View>
                ) : null}
              </View>

              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: c.border,
                  paddingTop: 10,
                  gap: 6,
                }}
              >
                <Text
                  style={{
                    color: c.foreground,
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 13,
                  }}
                >
                  {customerName}
                </Text>
                {(b.students ?? []).length > 0 ? (
                  <View style={{ marginTop: 4, gap: 3 }}>
                    {(b.students ?? []).map((s, idx) => (
                      <Text
                        key={idx}
                        style={{ color: c.mutedForeground, fontSize: 12 }}
                      >
                        • {s.first_name} {s.last_name} ({s.age} yaş ·{" "}
                        {levelLabel(s.experience_level)})
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            </Card>
          );
        })
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
    <Screen contentStyle={{ paddingTop: insets.top + 16, gap: 22 }}>
      <Header
        eyebrow="Yönetici"
        title={user?.name?.split(" ")[0] || "Admin"}
        subtitle="Platformun nabzı."
      />

      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatCard label="Kullanıcı" value={stats?.users ?? 0} icon="users" />
        <StatCard label="Rezervasyon" value={stats?.bookings ?? 0} icon="calendar" />
        <StatCard
          label="Bildirim"
          value={stats?.flagged ?? 0}
          icon="flag"
          tone="warning"
        />
      </View>

      <Card onPress={() => router.push("/(admin)/(tabs)")}>
        <View style={styles.row}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 16,
              backgroundColor: c.accentSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="shield" size={20} color={c.accentDeep} />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: c.foreground,
                fontFamily: "Fraunces_600SemiBold",
                fontSize: 17,
              }}
            >
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
    <Card style={{ flex: 1 }} padding={14}>
      <Feather
        name={icon}
        size={16}
        color={tone === "warning" ? c.warning : c.accent}
      />
      <Text
        style={{
          color: c.foreground,
          fontFamily: "Fraunces_700Bold",
          fontSize: 26,
          letterSpacing: -0.5,
          marginTop: 8,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          color: c.mutedForeground,
          fontFamily: "Inter_500Medium",
          fontSize: 11,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          marginTop: 2,
        }}
      >
        {label}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  brandMark: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  brandWord: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    letterSpacing: -0.2,
  },
  seasonDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  sectionTitle: {
    fontFamily: "Fraunces_600SemiBold",
    fontSize: 22,
    letterSpacing: -0.4,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  tileTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    marginTop: 12,
  },
});
