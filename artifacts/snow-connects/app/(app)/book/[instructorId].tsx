import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { SupportBanner } from "@/components/ui/SupportBanner";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { formatDateShortTR, formatTRY } from "@/lib/format";
import { calcBreakdown } from "@/lib/pricing";
import { isInSeason, isoDate, stripTime } from "@/lib/season";
import { supabase } from "@/lib/supabase";
import { TIME_SLOTS } from "@/lib/timeSlots";
import {
  EXPERIENCE_LEVELS,
  type ExperienceLevel,
  type InstructorProfile,
  type Resort,
  type StudentInput,
  type TimeSlot,
} from "@/lib/types";

const TR_DAYS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const TR_MONTHS_SHORT = [
  "Oca",
  "Şub",
  "Mar",
  "Nis",
  "May",
  "Haz",
  "Tem",
  "Ağu",
  "Eyl",
  "Eki",
  "Kas",
  "Ara",
];

interface Draft {
  resortId: string | null;
  from: string | null;
  to: string | null;
  // Composite "YYYY-MM-DD|HH:MM" keys; bookings can span multiple days.
  selectedKeys: string[];
  studentCount: number;
  students: StudentInput[];
}

function buildDateRange(fromIso: string, toIso: string): Date[] {
  const start = stripTime(new Date(fromIso));
  const end = stripTime(new Date(toIso));
  const out: Date[] = [];
  for (
    let t = start.getTime();
    t <= end.getTime();
    t += 86400000
  ) {
    out.push(new Date(t));
  }
  return out;
}

export default function BookScreen() {
  const c = useColors();
  const router = useRouter();
  const {
    instructorId,
    from: rangeFrom,
    to: rangeTo,
  } = useLocalSearchParams<{
    instructorId: string;
    from?: string;
    to?: string;
  }>();
  const { session, loading: authLoading } = useAuth();

  // Date range is required to enter this screen. If we landed here without
  // it (deep link, stale draft), bounce back to the picker so the user
  // selects their dates first.
  useEffect(() => {
    if (!rangeFrom || !rangeTo) {
      router.replace(`/(app)/dates/${instructorId}` as never);
    }
  }, [rangeFrom, rangeTo, instructorId, router]);

  const [resortId, setResortId] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [studentCount, setStudentCount] = useState<number>(1);
  const [students, setStudents] = useState<StudentInput[]>([blankStudent()]);
  const [submitting, setSubmitting] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);

  const draftKey = `pending_booking_${instructorId}`;

  // Restore draft from a previous "Onayla" tap that bounced through login.
  // IMPORTANT: only restore slot selections when the persisted draft's
  // from/to exactly match the current query params. Otherwise the user
  // came back with a different date range and stale slots from the old
  // range would silently be totaled and submitted (the rows would not
  // even be visible in the grid).
  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(draftKey).then((str) => {
      if (!mounted) return;
      if (str) {
        try {
          const d = JSON.parse(str) as Draft;
          if (d.resortId) setResortId(d.resortId);
          if (d.studentCount) setStudentCount(d.studentCount);
          if (Array.isArray(d.students) && d.students.length > 0) {
            setStudents(d.students);
          }
          const sameRange =
            d.from === (rangeFrom ?? null) && d.to === (rangeTo ?? null);
          if (sameRange && Array.isArray(d.selectedKeys)) {
            setSelectedKeys(d.selectedKeys);
          }
        } catch {
          /* ignore corrupt draft */
        }
      }
      setDraftHydrated(true);
    });
    return () => {
      mounted = false;
    };
  }, [draftKey, rangeFrom, rangeTo]);

  const visibleDates = useMemo(() => {
    if (!rangeFrom || !rangeTo) return [] as Date[];
    return buildDateRange(rangeFrom, rangeTo);
  }, [rangeFrom, rangeTo]);

  const { data: instructor, isLoading } = useQuery({
    queryKey: ["instructor-book", instructorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instructor_profiles")
        .select("*")
        .eq("user_id", instructorId)
        .maybeSingle();
      if (error) throw error;
      return data as InstructorProfile | null;
    },
    enabled: !!instructorId,
  });

  const { data: resorts } = useQuery({
    queryKey: ["resorts-for-book", instructor?.resort_ids],
    queryFn: async () => {
      if (!instructor?.resort_ids?.length) return [] as Resort[];
      const { data, error } = await supabase
        .from("resorts")
        .select("*")
        .in("id", instructor.resort_ids);
      if (error) throw error;
      return (data ?? []) as Resort[];
    },
    enabled: !!instructor,
  });

  // One query covering every existing time_slot for this instructor across
  // the user's chosen date range.
  const { data: existingSlots } = useQuery({
    queryKey: ["slots-range", instructorId, rangeFrom, rangeTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_slots")
        .select("*")
        .eq("instructor_id", instructorId)
        .gte("date", rangeFrom!)
        .lte("date", rangeTo!);
      if (error) throw error;
      return (data ?? []) as TimeSlot[];
    },
    enabled: !!instructorId && !!rangeFrom && !!rangeTo,
  });

  const slotIndex = useMemo(() => {
    const m = new Map<string, TimeSlot>();
    (existingSlots ?? []).forEach((s) => m.set(`${s.date}|${s.slot_time}`, s));
    return m;
  }, [existingSlots]);

  // Prune stale selections after fresh slot data arrives (someone else may
  // have booked one of the user's selected slots while they filled in
  // student info, or a hydrated draft references a now-unavailable slot).
  useEffect(() => {
    if (selectedKeys.length === 0) return;
    const stillValid = selectedKeys.filter((key) => {
      const existing = slotIndex.get(key);
      return !existing || existing.status === "available";
    });
    if (stillValid.length !== selectedKeys.length) {
      setSelectedKeys(stillValid);
    }
  }, [slotIndex, selectedKeys]);

  useEffect(() => {
    if (resorts && resorts.length === 1 && !resortId) {
      setResortId(resorts[0].id);
    }
  }, [resorts, resortId]);

  useEffect(() => {
    setStudents((prev) => {
      const next = [...prev];
      while (next.length < studentCount) next.push(blankStudent());
      while (next.length > studentCount) next.pop();
      return next;
    });
  }, [studentCount]);

  const totals = useMemo(
    () => calcBreakdown(instructor, studentCount, selectedKeys.length),
    [instructor, studentCount, selectedKeys.length],
  );

  if (isLoading || !instructor || !draftHydrated || !rangeFrom || !rangeTo)
    return <Loading />;

  function tapCell(cellDate: string, slotId: string) {
    const key = `${cellDate}|${slotId}`;
    setSelectedKeys((cur) =>
      cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key],
    );
  }

  async function persistDraft(): Promise<Draft> {
    const draft: Draft = {
      resortId,
      from: rangeFrom ?? null,
      to: rangeTo ?? null,
      selectedKeys,
      studentCount,
      students,
    };
    try {
      await AsyncStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      /* non-fatal — proceed without persistence */
    }
    return draft;
  }

  async function clearDraft() {
    try {
      await AsyncStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }

  function validate(): string | null {
    if (!resortId) return "Lütfen bir pist seçin.";
    if (selectedKeys.length === 0) return "En az bir saat seçin.";
    const ok = students.every(
      (s) => s.firstName.trim() && s.lastName.trim() && s.age > 0,
    );
    if (!ok) return "Tüm öğrenciler için ad, soyad ve yaş girilmeli.";
    return null;
  }

  // Group selected slot keys by date so we can issue one create_booking
  // RPC call per day. The server contract is single-day (p_date + slot
  // times[]); spanning multiple days = multiple booking rows.
  function groupByDate(keys: string[]): Map<string, string[]> {
    const m = new Map<string, string[]>();
    for (const k of keys) {
      const [d, slot] = k.split("|");
      if (!d || !slot) continue;
      m.set(d, [...(m.get(d) ?? []), slot]);
    }
    return m;
  }

  async function submit() {
    const err = validate();
    if (err) {
      Alert.alert("Eksik bilgi", err);
      return;
    }

    // AUTH GATE — only at the final confirmation step. If the user is
    // browsing as a guest, persist the draft and bounce to login. They
    // come back to this screen with the draft re-hydrated and the same
    // date range query params restored.
    const rangeQs =
      rangeFrom && rangeTo ? `?from=${rangeFrom}&to=${rangeTo}` : "";
    const nextPath = `/(app)/book/${instructorId}${rangeQs}`;

    if (authLoading) {
      let resolved = session;
      const start = Date.now();
      while (!resolved && Date.now() - start < 2000) {
        await new Promise((r) => setTimeout(r, 100));
        const s = await supabase.auth.getSession();
        resolved = s.data.session;
        if (resolved) break;
      }
      if (!resolved) {
        await persistDraft();
        const next = encodeURIComponent(nextPath);
        router.push(`/(auth)/login?next=${next}` as never);
        return;
      }
    } else if (!session) {
      await persistDraft();
      const next = encodeURIComponent(nextPath);
      router.push(`/(auth)/login?next=${next}` as never);
      return;
    }

    setSubmitting(true);
    const grouped = [...groupByDate(selectedKeys).entries()].sort(
      ([a], [b]) => a.localeCompare(b),
    );
    const createdIds: string[] = [];
    for (const [d, slots] of grouped) {
      const { data, error } = await supabase.rpc("create_booking", {
        p_instructor: instructorId,
        p_resort: resortId,
        p_date: d,
        p_slot_times: slots,
        p_students: students,
      });
      if (error) {
        setSubmitting(false);
        const friendly = translateError(error.message);
        if (createdIds.length === 0) {
          Alert.alert("Rezervasyon başarısız", friendly);
          return;
        }
        // Partial success — don't trap state; clear what was committed
        // and route to the bookings list so the user can pay/manage.
        await clearDraft();
        Alert.alert(
          "Kısmen oluşturuldu",
          `${createdIds.length} gün rezerve edildi. Kalan günler için hata: ${friendly}`,
          [
            {
              text: "Tamam",
              onPress: () => router.replace("/(app)/(tabs)/bookings"),
            },
          ],
        );
        return;
      }
      createdIds.push((data as { booking_id: string }).booking_id);
    }
    setSubmitting(false);
    await clearDraft();

    if (createdIds.length === 1) {
      // Single-day booking → straight to its payment page (no extra tap).
      router.replace(`/(app)/payment/${createdIds[0]}`);
    } else {
      Alert.alert(
        "Rezervasyon onaylandı",
        `${createdIds.length} ders oluşturuldu. Ödemeyi rezervasyonlarım sayfasından tamamlayabilirsin.`,
        [
          {
            text: "Rezervasyonlarım",
            onPress: () => router.replace("/(app)/(tabs)/bookings"),
          },
        ],
      );
    }
  }

  const rangeLabel = `${formatDateShortTR(rangeFrom)} → ${formatDateShortTR(
    rangeTo,
  )}`;

  return (
    <Screen contentStyle={{ gap: 16 }}>
      {!session ? (
        <Pill
          label="Misafir olarak inceleyebilirsiniz · ödeme öncesi giriş gerekir"
          tone="accent"
        />
      ) : null}

      <Card>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={{
                color: c.mutedForeground,
                fontSize: 11,
                fontFamily: "Inter_500Medium",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Seçili tarih aralığı
            </Text>
            <Text
              style={{
                color: c.foreground,
                fontFamily: "Inter_700Bold",
                fontSize: 15,
              }}
            >
              {rangeLabel}
            </Text>
          </View>
          <Pressable
            onPress={() =>
              router.replace(
                `/(app)/dates/${instructorId}?from=${rangeFrom}&to=${rangeTo}` as never,
              )
            }
            hitSlop={8}
          >
            <Text
              style={{
                color: c.accentDeep,
                fontFamily: "Inter_700Bold",
                fontSize: 13,
              }}
            >
              Değiştir
            </Text>
          </Pressable>
        </View>
      </Card>

      {(resorts ?? []).length > 1 ? (
        <View style={{ gap: 6 }}>
          <Text style={[styles.h, { color: c.foreground }]}>Pist</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(resorts ?? []).map((r) => {
              const active = r.id === resortId;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => setResortId(r.id)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 999,
                    borderWidth: 1.5,
                    borderColor: active ? c.accent : c.borderSoft,
                    backgroundColor: active ? c.accentSoft : c.card,
                  }}
                >
                  <Text
                    style={{
                      color: active ? c.accentDeep : c.foreground,
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 13,
                    }}
                  >
                    {r.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <Text style={[styles.h, { color: c.foreground }]}>Saatleri seç</Text>
        <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
          Birden çok güne saat seçebilirsin · her ders 50 dakika
        </Text>

        <SlotGrid
          dates={visibleDates}
          selectedKeys={selectedKeys}
          slotIndex={slotIndex}
          onTap={tapCell}
        />
      </View>

      {selectedKeys.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text style={[styles.h, { color: c.foreground }]}>
            Öğrenci sayısı
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[1, 2, 3, 4].map((n) => {
              const active = studentCount === n;
              return (
                <Pressable
                  key={n}
                  onPress={() => setStudentCount(n)}
                  style={{
                    flex: 1,
                    paddingVertical: 14,
                    borderRadius: c.radius,
                    borderWidth: 1,
                    borderColor: active ? c.accent : c.borderSoft,
                    backgroundColor: active ? c.accentSoft : c.card,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: active ? c.accentDeep : c.foreground,
                      fontFamily: "Fraunces_600SemiBold",
                      fontSize: 18,
                      letterSpacing: -0.3,
                    }}
                  >
                    {n === 4 ? "4+" : n}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {students.map((s, i) => (
            <Card key={i}>
              <Text
                style={{
                  color: c.foreground,
                  fontFamily: "Inter_600SemiBold",
                  marginBottom: 10,
                }}
              >
                Öğrenci {i + 1}
              </Text>
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Input
                      label="Ad"
                      value={s.firstName}
                      onChangeText={(v) =>
                        setStudents((arr) =>
                          arr.map((x, j) =>
                            j === i ? { ...x, firstName: v } : x,
                          ),
                        )
                      }
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Input
                      label="Soyad"
                      value={s.lastName}
                      onChangeText={(v) =>
                        setStudents((arr) =>
                          arr.map((x, j) =>
                            j === i ? { ...x, lastName: v } : x,
                          ),
                        )
                      }
                    />
                  </View>
                </View>
                <Input
                  label="Yaş"
                  keyboardType="number-pad"
                  value={s.age ? String(s.age) : ""}
                  onChangeText={(v) =>
                    setStudents((arr) =>
                      arr.map((x, j) =>
                        j === i ? { ...x, age: parseInt(v) || 0 } : x,
                      ),
                    )
                  }
                />
                <Text
                  style={{
                    color: c.foreground,
                    fontFamily: "Inter_500Medium",
                    fontSize: 13,
                  }}
                >
                  Deneyim seviyesi
                </Text>
                <View style={{ gap: 6 }}>
                  {EXPERIENCE_LEVELS.map((lvl) => {
                    const active = s.experienceLevel === lvl.value;
                    return (
                      <Pressable
                        key={lvl.value}
                        onPress={() =>
                          setStudents((arr) =>
                            arr.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    experienceLevel:
                                      lvl.value as ExperienceLevel,
                                  }
                                : x,
                            ),
                          )
                        }
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          borderRadius: c.radius,
                          borderWidth: 1,
                          borderColor: active ? c.accent : c.borderSoft,
                          backgroundColor: active ? c.accentSoft : c.card,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <Text
                          style={{
                            color: active ? c.accentDeep : c.foreground,
                            fontFamily: "Inter_600SemiBold",
                            fontSize: 14,
                          }}
                        >
                          {lvl.label}
                        </Text>
                        {active ? (
                          <Feather
                            name="check"
                            size={16}
                            color={c.accentDeep}
                          />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </Card>
          ))}

          <Card>
            <Text
              style={{
                color: c.foreground,
                fontFamily: "Inter_600SemiBold",
                fontSize: 14,
                marginBottom: 6,
              }}
            >
              {`${totals.students} kişi × ${totals.slots} saat × ${formatTRY(totals.perPerson)} = ${formatTRY(totals.base)}`}
            </Text>
            <PriceRow label="KDV (%20)" value={formatTRY(totals.vat)} />
            <View
              style={{
                height: 1,
                backgroundColor: c.border,
                marginVertical: 8,
              }}
            />
            <PriceRow
              label="Toplam"
              value={formatTRY(totals.total)}
              bold
            />
          </Card>

          <SupportBanner />

          <Button
            variant="accent"
            size="lg"
            label={
              !session
                ? `Onayla ve giriş yap · ${formatTRY(totals.total)}`
                : `Onayla · ${formatTRY(totals.total)}`
            }
            onPress={submit}
            loading={submitting}
          />
          {!session ? (
            <Text
              style={{
                color: c.mutedForeground,
                fontSize: 11,
                textAlign: "center",
              }}
            >
              Giriş yaptıktan sonra rezervasyonunuz buradan kaldığı yerden devam
              eder.
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={{ alignItems: "center", paddingVertical: 24, gap: 8 }}>
          <Feather name="calendar" size={28} color={c.mutedForeground} />
          <Text
            style={{
              color: c.mutedForeground,
              fontSize: 13,
              textAlign: "center",
            }}
          >
            Devam etmek için yukarıdan en az bir saat seçin.
          </Text>
        </View>
      )}
    </Screen>
  );
}

function SlotGrid({
  dates,
  selectedKeys,
  slotIndex,
  onTap,
}: {
  dates: Date[];
  selectedKeys: string[];
  slotIndex: Map<string, TimeSlot>;
  onTap: (date: string, slotId: string) => void;
}) {
  const c = useColors();
  const dateColW = 72;
  const cellW = 58;
  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingRight: 16 }}
    >
      <View style={{ borderRadius: c.radius, overflow: "hidden" }}>
        {/* Header row: time slot labels */}
        <View style={{ flexDirection: "row" }}>
          <View
            style={[
              gridStyles.headerCell,
              { width: dateColW, backgroundColor: c.muted },
            ]}
          />
          {TIME_SLOTS.map((s) => (
            <View
              key={s.id}
              style={[
                gridStyles.headerCell,
                {
                  width: cellW,
                  backgroundColor: c.muted,
                  borderLeftColor: c.border,
                  borderLeftWidth: 1,
                },
              ]}
            >
              <Text
                style={{
                  color: c.foreground,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 11,
                }}
              >
                {s.id}
              </Text>
            </View>
          ))}
        </View>

        {/* Body rows: one per date in the chosen range */}
        {dates.map((d) => {
          const iso = isoDate(d);
          const inSeason = isInSeason(d);
          const dayLabel = TR_DAYS[d.getDay()];
          const monthLabel = TR_MONTHS_SHORT[d.getMonth()];
          return (
            <View
              key={iso}
              style={{
                flexDirection: "row",
                borderTopWidth: 1,
                borderTopColor: c.border,
              }}
            >
              <View
                style={[
                  gridStyles.dateCell,
                  { width: dateColW, backgroundColor: c.card },
                ]}
              >
                <Text
                  style={{
                    color: c.mutedForeground,
                    fontSize: 10,
                    fontFamily: "Inter_500Medium",
                  }}
                >
                  {dayLabel}
                </Text>
                <Text
                  style={{
                    color: c.foreground,
                    fontFamily: "Inter_700Bold",
                    fontSize: 16,
                  }}
                >
                  {d.getDate()}
                </Text>
                <Text style={{ color: c.mutedForeground, fontSize: 10 }}>
                  {monthLabel}
                </Text>
              </View>
              {TIME_SLOTS.map((s) => {
                const key = `${iso}|${s.id}`;
                const existing = slotIndex.get(key);
                const taken =
                  !!existing && existing.status !== "available";
                const disabled = !inSeason || taken;
                // Disabled wins over selected — a slot that became taken
                // after the user picked it (e.g. draft restored) renders
                // gray, not navy.
                const selected = !disabled && selectedSet.has(key);

                const bg = disabled
                  ? c.muted
                  : selected
                    ? c.accent
                    : c.card;
                const fg = disabled
                  ? c.mutedForeground
                  : selected
                    ? c.accentForeground
                    : c.foreground;

                return (
                  <Pressable
                    key={s.id}
                    disabled={disabled}
                    onPress={() => onTap(iso, s.id)}
                    style={{
                      width: cellW,
                      paddingVertical: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: bg,
                      borderLeftWidth: 1,
                      borderLeftColor: c.border,
                      opacity: disabled ? 0.5 : 1,
                      gap: 4,
                    }}
                  >
                    {/* Tap-affordance dot. Hidden for disabled and selected
                        cells (selection itself signals state). */}
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor:
                          selected || disabled ? "transparent" : c.accent,
                        opacity: selected || disabled ? 0 : 0.85,
                      }}
                    />
                    <Text
                      style={{
                        color: fg,
                        fontFamily: selected
                          ? "Inter_700Bold"
                          : "Inter_500Medium",
                        fontSize: 11,
                      }}
                      numberOfLines={1}
                    >
                      {!inSeason ? "—" : taken ? "Dolu" : "50 dk"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function blankStudent(): StudentInput {
  return { firstName: "", lastName: "", age: 0, experienceLevel: "first_time" };
}

function translateError(msg: string): string {
  if (msg.includes("season closed")) return "Bu tarih sezon dışında.";
  if (msg.includes("slot taken")) return "Seçili saatlerden biri dolu.";
  if (msg.includes("blocked"))
    return "Hesabınız bloke. Lütfen destek ile iletişime geçin.";
  if (msg.includes("not authenticated"))
    return "Oturum süreniz doldu, tekrar giriş yapın.";
  return msg;
}

function PriceRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 4,
      }}
    >
      <Text
        style={{
          color: bold ? c.foreground : c.mutedForeground,
          fontFamily: bold ? "Inter_600SemiBold" : "Inter_400Regular",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: c.foreground,
          fontFamily: bold ? "Inter_700Bold" : "Inter_500Medium",
          fontSize: bold ? 16 : 14,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontFamily: "Inter_700Bold", fontSize: 18 },
});

const gridStyles = StyleSheet.create({
  headerCell: {
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  dateCell: {
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
});
