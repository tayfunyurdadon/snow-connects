import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { MonthCalendar } from "@/components/ui/MonthCalendar";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { useColors } from "@/hooks/useColors";
import { formatDateTR, formatTRY } from "@/lib/format";
import { isInSeason, nextSeasonStart } from "@/lib/season";
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

type Step = "date" | "slots" | "students" | "summary";

export default function BookScreen() {
  const c = useColors();
  const router = useRouter();
  const { instructorId } = useLocalSearchParams<{ instructorId: string }>();
  const today = new Date();
  const initial = isInSeason(today) ? today : nextSeasonStart(today);

  const [step, setStep] = useState<Step>("date");
  const [date, setDate] = useState<string | null>(
    initial.toISOString().slice(0, 10),
  );
  const [resortId, setResortId] = useState<string | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [studentCount, setStudentCount] = useState<number>(1);
  const [students, setStudents] = useState<StudentInput[]>([blankStudent()]);
  const [submitting, setSubmitting] = useState(false);

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

  const { data: existingSlots } = useQuery({
    queryKey: ["slots", instructorId, date],
    queryFn: async () => {
      if (!date) return [] as TimeSlot[];
      const { data, error } = await supabase
        .from("time_slots")
        .select("*")
        .eq("instructor_id", instructorId)
        .eq("date", date);
      if (error) throw error;
      return (data ?? []) as TimeSlot[];
    },
    enabled: !!date && !!instructorId,
  });

  const takenSlots = useMemo(
    () => new Set((existingSlots ?? []).map((s) => s.slot_time)),
    [existingSlots],
  );

  const totals = useMemo(() => {
    // Price is per slot, not per student — group lessons share the rate.
    const base = (instructor?.base_price ?? 0) * selectedSlots.length;
    const vat = Math.round(base * 0.2);
    return { base, vat, total: base + vat };
  }, [instructor, selectedSlots.length]);

  React.useEffect(() => {
    if (resorts && resorts.length === 1 && !resortId) {
      setResortId(resorts[0].id);
    }
  }, [resorts, resortId]);

  React.useEffect(() => {
    setStudents((prev) => {
      const next = [...prev];
      while (next.length < studentCount) next.push(blankStudent());
      while (next.length > studentCount) next.pop();
      return next;
    });
  }, [studentCount]);

  if (isLoading || !instructor) return <Loading />;

  function toggleSlot(id: string) {
    setSelectedSlots((cur) =>
      cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id],
    );
  }

  function next() {
    if (step === "date") {
      if (!date || !resortId) {
        Alert.alert("Eksik bilgi", "Tarih ve pist seçimi gerekli.");
        return;
      }
      setStep("slots");
    } else if (step === "slots") {
      if (selectedSlots.length === 0) {
        Alert.alert("Saat seçilmedi", "En az bir ders saati seç.");
        return;
      }
      setStep("students");
    } else if (step === "students") {
      const ok = students.every(
        (s) => s.firstName.trim() && s.lastName.trim() && s.age > 0,
      );
      if (!ok) {
        Alert.alert(
          "Eksik bilgi",
          "Tüm öğrenciler için ad, soyad ve yaş girilmeli.",
        );
        return;
      }
      setStep("summary");
    }
  }

  function back() {
    if (step === "summary") setStep("students");
    else if (step === "students") setStep("slots");
    else if (step === "slots") setStep("date");
    else router.back();
  }

  async function submit() {
    if (!date || !resortId) return;
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
    const bookingId = (data as { booking_id: string }).booking_id;
    router.replace(`/(app)/payment/${bookingId}`);
  }

  return (
    <Screen contentStyle={{ gap: 16 }}>
      <Stepper step={step} />

      {step === "date" && (
        <>
          <Text style={[styles.h, { color: c.foreground }]}>Pist seç</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(resorts ?? []).map((r) => {
              const active = r.id === resortId;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => setResortId(r.id)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
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
                    }}
                  >
                    {r.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.h, { color: c.foreground, marginTop: 8 }]}>
            Tarih seç
          </Text>
          <Card>
            <MonthCalendar value={date} onChange={setDate} seasonGate />
          </Card>
          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
            Sezon 15 Aralık – 15 Nisan tarihleri arasında geçerlidir.
          </Text>
        </>
      )}

      {step === "slots" && (
        <>
          <Text style={[styles.h, { color: c.foreground }]}>Saat seç</Text>
          <Text style={{ color: c.mutedForeground, fontSize: 13 }}>
            {date ? formatDateTR(date) : ""}
          </Text>
          <View style={{ gap: 8 }}>
            {TIME_SLOTS.map((s) => {
              const taken = takenSlots.has(s.id);
              const selected = selectedSlots.includes(s.id);
              return (
                <Pressable
                  key={s.id}
                  disabled={taken}
                  onPress={() => toggleSlot(s.id)}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderRadius: c.radius,
                    borderWidth: 1,
                    borderColor: selected ? c.primary : c.border,
                    backgroundColor: selected
                      ? c.secondary
                      : taken
                        ? c.muted
                        : c.card,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    opacity: taken ? 0.6 : 1,
                  }}
                >
                  <Text
                    style={{
                      color: selected ? c.primary : c.foreground,
                      fontFamily: "Inter_600SemiBold",
                    }}
                  >
                    {s.label}
                  </Text>
                  {taken ? (
                    <Pill label="Dolu" tone="danger" />
                  ) : selected ? (
                    <Feather name="check-circle" size={18} color={c.primary} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {step === "students" && (
        <>
          <Text style={[styles.h, { color: c.foreground }]}>Öğrenci sayısı</Text>
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
                                ? { ...x, experienceLevel: lvl.value as ExperienceLevel }
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
        </>
      )}

      {step === "summary" && (
        <>
          <Text style={[styles.h, { color: c.foreground }]}>Özet</Text>
          <Card>
            <SummaryRow
              icon="calendar"
              label="Tarih"
              value={date ? formatDateTR(date) : ""}
            />
            <SummaryRow
              icon="clock"
              label="Saatler"
              value={selectedSlots.sort().join(", ")}
            />
            <SummaryRow
              icon="users"
              label="Öğrenci sayısı"
              value={String(studentCount)}
            />
          </Card>
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
        </>
      )}

      <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Button label="Geri" variant="ghost" onPress={back} />
        </View>
        <View style={{ flex: 2 }}>
          {step === "summary" ? (
            <Button
              label="Ödemeye Geç"
              onPress={submit}
              loading={submitting}
            />
          ) : (
            <Button label="Devam" onPress={next} />
          )}
        </View>
      </View>
    </Screen>
  );
}

function blankStudent(): StudentInput {
  return { firstName: "", lastName: "", age: 0, experienceLevel: "first_time" };
}

function translateError(msg: string): string {
  if (msg.includes("season closed")) return "Bu tarih sezon dışında.";
  if (msg.includes("slot taken")) return "Seçili saatlerden biri dolu.";
  if (msg.includes("blocked")) return "Hesabınız bloke. Lütfen destek ile iletişime geçin.";
  if (msg.includes("not authenticated")) return "Oturum süreniz doldu, tekrar giriş yapın.";
  return msg;
}

function Stepper({ step }: { step: Step }) {
  const c = useColors();
  const order: Step[] = ["date", "slots", "students", "summary"];
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {order.map((s, i) => {
        const idx = order.indexOf(step);
        const active = i <= idx;
        return (
          <View
            key={s}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 4,
              backgroundColor: active ? c.primary : c.muted,
            }}
          />
        );
      })}
    </View>
  );
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
}) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 6,
      }}
    >
      <Feather name={icon} size={18} color={c.primary} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{label}</Text>
        <Text
          style={{
            color: c.foreground,
            fontFamily: "Inter_500Medium",
            fontSize: 14,
          }}
        >
          {value}
        </Text>
      </View>
    </View>
  );
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
