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
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { formatTRY } from "@/lib/format";
import {
  addDays,
  isInSeason,
  isoDate,
  nextSeasonStart,
  stripTime,
} from "@/lib/season";
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

const VISIBLE_DAYS = 7;
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
  date: string | null;
  selectedSlots: string[];
  studentCount: number;
  students: StudentInput[];
}

export default function BookScreen() {
  const c = useColors();
  const router = useRouter();
  const { instructorId } = useLocalSearchParams<{ instructorId: string }>();
  const { session, loading: authLoading } = useAuth();

  const today = stripTime(new Date());
  const initialDate = isInSeason(today) ? today : nextSeasonStart(today);

  const [weekStart, setWeekStart] = useState<Date>(stripTime(initialDate));
  const [resortId, setResortId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [studentCount, setStudentCount] = useState<number>(1);
  const [students, setStudents] = useState<StudentInput[]>([blankStudent()]);
  const [submitting, setSubmitting] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);

  const draftKey = `pending_booking_${instructorId}`;

  // Restore draft from a previous "Onayla" tap that bounced through login.
  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(draftKey).then((str) => {
      if (!mounted) return;
      if (str) {
        try {
          const d = JSON.parse(str) as Draft;
          if (d.resortId) setResortId(d.resortId);
          if (d.date) {
            setDate(d.date);
            setWeekStart(stripTime(new Date(d.date)));
          }
          if (Array.isArray(d.selectedSlots)) setSelectedSlots(d.selectedSlots);
          if (d.studentCount) setStudentCount(d.studentCount);
          if (Array.isArray(d.students) && d.students.length > 0) {
            setStudents(d.students);
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
  }, [draftKey]);

  const visibleDates = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < VISIBLE_DAYS; i++) out.push(addDays(weekStart, i));
    return out;
  }, [weekStart]);
  const rangeStart = useMemo(() => isoDate(visibleDates[0]), [visibleDates]);
  const rangeEnd = useMemo(
    () => isoDate(visibleDates[visibleDates.length - 1]),
    [visibleDates],
  );

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

  // Fetch every existing time_slot for this instructor across the visible
  // 7-day window so the grid can show "Dolu" cells in one query.
  const { data: existingSlots } = useQuery({
    queryKey: ["slots-range", instructorId, rangeStart, rangeEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_slots")
        .select("*")
        .eq("instructor_id", instructorId)
        .gte("date", rangeStart)
        .lte("date", rangeEnd);
      if (error) throw error;
      return (data ?? []) as TimeSlot[];
    },
    enabled: !!instructorId,
  });

  const slotIndex = useMemo(() => {
    const m = new Map<string, TimeSlot>();
    (existingSlots ?? []).forEach((s) => m.set(`${s.date}|${s.slot_time}`, s));
    return m;
  }, [existingSlots]);

  // Prune stale selections after fresh slot data arrives (e.g. someone else
  // booked one of the user's selected slots while they were filling in
  // student info, or a hydrated draft references a now-unavailable slot).
  // Without this, a "selected but disabled" cell would persist in state and
  // submit() would 409 against the server's slot lock.
  useEffect(() => {
    if (!date || selectedSlots.length === 0) return;
    const stillValid = selectedSlots.filter((slotId) => {
      const existing = slotIndex.get(`${date}|${slotId}`);
      return !existing || existing.status === "available";
    });
    if (stillValid.length !== selectedSlots.length) {
      setSelectedSlots(stillValid);
    }
  }, [slotIndex, date, selectedSlots]);

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

  const totals = useMemo(() => {
    const base = (instructor?.base_price ?? 0) * selectedSlots.length;
    const vat = Math.round(base * 0.2);
    return { base, vat, total: base + vat };
  }, [instructor, selectedSlots.length]);

  if (isLoading || !instructor || !draftHydrated) return <Loading />;

  function tapCell(cellDate: string, slotId: string) {
    if (date !== cellDate) {
      // Switching dates resets the slot selection — bookings are single-date.
      setDate(cellDate);
      setSelectedSlots([slotId]);
      return;
    }
    setSelectedSlots((cur) =>
      cur.includes(slotId) ? cur.filter((s) => s !== slotId) : [...cur, slotId],
    );
  }

  function shiftWeek(delta: number) {
    setWeekStart((cur) => {
      const next = addDays(cur, delta * VISIBLE_DAYS);
      return next.getTime() < today.getTime() ? today : next;
    });
  }

  async function persistDraft(): Promise<Draft> {
    const draft: Draft = {
      resortId,
      date,
      selectedSlots,
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
    if (!date) return "Lütfen tarih ve saat seçin.";
    if (selectedSlots.length === 0) return "En az bir saat seçin.";
    const ok = students.every(
      (s) => s.firstName.trim() && s.lastName.trim() && s.age > 0,
    );
    if (!ok) return "Tüm öğrenciler için ad, soyad ve yaş girilmeli.";
    return null;
  }

  async function submit() {
    const err = validate();
    if (err) {
      Alert.alert("Eksik bilgi", err);
      return;
    }

    // AUTH GATE — only at the final confirmation step. If the user is
    // browsing as a guest, persist the draft and bounce to login. They
    // come back to this screen with the draft re-hydrated.
    //
    // Note: we intentionally do NOT short-circuit on `authLoading`. If
    // session is still resolving when the user taps "Onayla", we wait for
    // it before deciding whether to bounce — otherwise a slow auth resolve
    // could let a guest tap through to the create_booking RPC, which then
    // 401s and loses the in-memory state.
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
        const next = encodeURIComponent(`/(app)/book/${instructorId}`);
        router.push(`/(auth)/login?next=${next}` as never);
        return;
      }
    } else if (!session) {
      await persistDraft();
      const next = encodeURIComponent(`/(app)/book/${instructorId}`);
      router.push(`/(auth)/login?next=${next}` as never);
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase.rpc("create_booking", {
      p_instructor: instructorId,
      p_resort: resortId,
      p_date: date,
      p_slot_times: selectedSlots,
      p_students: students,
    });
    setSubmitting(false);
    if (error) {
      Alert.alert("Rezervasyon başarısız", translateError(error.message));
      return;
    }
    await clearDraft();
    const bookingId = (data as { booking_id: string }).booking_id;
    router.replace(`/(app)/payment/${bookingId}`);
  }

  return (
    <Screen contentStyle={{ gap: 16 }}>
      {!session ? (
        <Pill
          label="Misafir olarak inceleyebilirsiniz · ödeme öncesi giriş gerekir"
          tone="accent"
        />
      ) : null}

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
                    paddingVertical: 8,
                    borderRadius: c.radius,
                    borderWidth: 1,
                    borderColor: active ? c.primary : c.border,
                    backgroundColor: active ? c.secondary : c.card,
                  }}
                >
                  <Text
                    style={{
                      color: active ? c.primary : c.foreground,
                      fontFamily: "Inter_500Medium",
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
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={[styles.h, { color: c.foreground }]}>
            Tarih & saat seç
          </Text>
          <View style={{ flexDirection: "row", gap: 4 }}>
            <Pressable
              onPress={() => shiftWeek(-1)}
              hitSlop={10}
              disabled={weekStart.getTime() <= today.getTime()}
              style={{
                opacity: weekStart.getTime() <= today.getTime() ? 0.3 : 1,
                padding: 4,
              }}
            >
              <Feather name="chevron-left" size={22} color={c.foreground} />
            </Pressable>
            <Pressable
              onPress={() => shiftWeek(1)}
              hitSlop={10}
              style={{ padding: 4 }}
            >
              <Feather name="chevron-right" size={22} color={c.foreground} />
            </Pressable>
          </View>
        </View>

        <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
          Boş bir saat seçin · her ders 50 dakika
        </Text>

        <SlotGrid
          dates={visibleDates}
          selectedDate={date}
          selectedSlots={selectedSlots}
          slotIndex={slotIndex}
          onTap={tapCell}
        />
      </View>

      {selectedSlots.length > 0 ? (
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
                    borderColor: active ? c.primary : c.border,
                    backgroundColor: active ? c.secondary : c.card,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: active ? c.primary : c.foreground,
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 15,
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
                                    experienceLevel: lvl.value as ExperienceLevel,
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
                          borderColor: active ? c.primary : c.border,
                          backgroundColor: active ? c.secondary : c.card,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <Text
                          style={{
                            color: active ? c.primary : c.foreground,
                            fontFamily: "Inter_500Medium",
                          }}
                        >
                          {lvl.label}
                        </Text>
                        {active ? (
                          <Feather
                            name="check"
                            size={16}
                            color={c.primary}
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
            <PriceRow label="Ders ücreti" value={formatTRY(totals.base)} />
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

          <Button
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
  selectedDate,
  selectedSlots,
  slotIndex,
  onTap,
}: {
  dates: Date[];
  selectedDate: string | null;
  selectedSlots: string[];
  slotIndex: Map<string, TimeSlot>;
  onTap: (date: string, slotId: string) => void;
}) {
  const c = useColors();
  const dateColW = 72;
  const cellW = 58;
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

        {/* Body rows: one per date */}
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
                const existing = slotIndex.get(`${iso}|${s.id}`);
                const taken =
                  !!existing && existing.status !== "available";
                const disabled = !inSeason || taken;
                // Disabled wins over selected — a slot that became taken
                // after the user picked it (e.g. draft restored from
                // AsyncStorage) should render gray, not navy.
                const selected =
                  !disabled &&
                  selectedDate === iso &&
                  selectedSlots.includes(s.id);

                // Visual hierarchy (disabled checked FIRST):
                //  - taken/out → flat muted gray, no dot, low opacity
                //  - selected  → solid dark navy fill, white text
                //  - available → white card with subtle dot affordance
                const bg = disabled
                  ? c.muted
                  : selected
                    ? c.primary
                    : c.card;
                const fg = disabled
                  ? c.mutedForeground
                  : selected
                    ? c.primaryForeground
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
                          selected || disabled ? "transparent" : c.primary,
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
