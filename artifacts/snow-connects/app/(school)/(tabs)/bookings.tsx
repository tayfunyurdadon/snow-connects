import { Feather } from "@expo/vector-icons";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  AdminButton,
  AdminCard,
  AdminEmpty,
  AdminInput,
  AdminPill,
  AdminScreen,
  AdminSpinner,
} from "@/components/admin/AdminUI";
import { adminTheme } from "@/lib/adminTheme";
import { formatTRY } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { TIME_SLOTS, slotLabel } from "@/lib/timeSlots";
import type {
  SchoolCalendarDay,
  SchoolCalendarInstructor,
  SchoolCalendarSlot,
} from "@/lib/types";

function isoDate(d: Date) {
  // Local date (YYYY-MM-DD) — toISOString() would shift to UTC and roll
  // the day backwards in TR (UTC+3) timezone.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function dayShort(d: Date) {
  return d.toLocaleDateString("tr-TR", { weekday: "short" });
}
function dayLong(d: Date) {
  return d.toLocaleDateString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default function SchoolCalendar() {
  const qc = useQueryClient();
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [selectedDate, setSelectedDate] = useState<string>(isoDate(today));
  const [weekStart, setWeekStart] = useState<Date>(today);
  const [createOpen, setCreateOpen] = useState(false);

  const days = useMemo(() => {
    return Array.from({ length: 14 }).map((_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["school-calendar", selectedDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("school_day_calendar", {
        p_date: selectedDate,
      });
      if (error) throw error;
      return data as SchoolCalendarDay;
    },
  });

  const [detailSlot, setDetailSlot] = useState<{
    instructor: SchoolCalendarInstructor;
    slot: SchoolCalendarSlot;
  } | null>(null);

  const deleteManual = useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase.rpc("school_delete_manual_booking", {
        p_id: bookingId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDetailSlot(null);
      qc.invalidateQueries({ queryKey: ["school-calendar"] });
    },
    onError: (e: Error) => Alert.alert("Hata", e.message),
  });

  const totalBookings = useMemo(
    () =>
      (data?.instructors ?? []).reduce(
        (sum, ins) =>
          sum + ins.slots.filter((s) => s.status === "booked" && s.is_first_slot)
            .length,
        0,
      ),
    [data],
  );

  return (
    <AdminScreen>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              color: adminTheme.text,
              fontFamily: adminTheme.fontHeadline,
              fontSize: 18,
              letterSpacing: -0.3,
            }}
          >
            {dayLong(new Date(selectedDate))}
          </Text>
          <Text
            style={{
              color: adminTheme.textMuted,
              fontFamily: adminTheme.fontBody,
              fontSize: 12,
              marginTop: 2,
            }}
          >
            {totalBookings} rezervasyon
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <RoundButton
            icon="chevron-left"
            onPress={() => {
              const d = new Date(weekStart);
              d.setDate(d.getDate() - 7);
              setWeekStart(d);
            }}
          />
          <RoundButton
            icon="chevron-right"
            onPress={() => {
              const d = new Date(weekStart);
              d.setDate(d.getDate() + 7);
              setWeekStart(d);
            }}
          />
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingVertical: 4 }}
      >
        {days.map((d) => {
          const iso = isoDate(d);
          const active = iso === selectedDate;
          return (
            <Pressable
              key={iso}
              onPress={() => setSelectedDate(iso)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: adminTheme.radiusSm,
                backgroundColor: active
                  ? adminTheme.accent
                  : adminTheme.surfaceMuted,
                borderWidth: 1,
                borderColor: active ? adminTheme.accent : adminTheme.border,
                minWidth: 60,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: active ? "#fff" : adminTheme.textMuted,
                  fontFamily: adminTheme.fontTitle,
                  fontSize: 10,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                }}
              >
                {dayShort(d)}
              </Text>
              <Text
                style={{
                  color: active ? "#fff" : adminTheme.text,
                  fontFamily: adminTheme.fontHeadline,
                  fontSize: 18,
                  marginTop: 2,
                }}
              >
                {d.getDate()}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <AdminButton
        label="Yeni Rezervasyon"
        icon="plus"
        onPress={() => setCreateOpen(true)}
      />

      {isLoading ? (
        <AdminSpinner />
      ) : !data || data.instructors.length === 0 ? (
        <AdminEmpty
          icon="users"
          title="Eğitmen bulunamadı"
          description="Önce okula eğitmen eklenmesi gerekiyor."
        />
      ) : (
        data.instructors.map((ins) => (
          <InstructorRow
            key={ins.instructor_id}
            instructor={ins}
            onOpen={(slot) => setDetailSlot({ instructor: ins, slot })}
          />
        ))
      )}

      {createOpen ? (
        <ManualBookingModal
          initialDate={selectedDate}
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            refetch();
          }}
        />
      ) : null}

      {detailSlot ? (
        <SlotDetailModal
          slot={detailSlot.slot}
          instructorName={detailSlot.instructor.instructor_name}
          onClose={() => setDetailSlot(null)}
          onDelete={(bid) => deleteManual.mutate(bid)}
        />
      ) : null}
    </AdminScreen>
  );
}

function RoundButton({
  icon,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: adminTheme.surfaceMuted,
        borderWidth: 1,
        borderColor: adminTheme.border,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Feather name={icon} size={14} color={adminTheme.text} />
    </Pressable>
  );
}

function InstructorRow({
  instructor,
  onOpen,
}: {
  instructor: SchoolCalendarInstructor;
  onOpen: (slot: SchoolCalendarSlot) => void;
}) {
  // Only show first-slot rows for booked sessions (so multi-hour lessons
  // appear once) plus any blocked rows. Skip pure available slots — the
  // calendar is meant to highlight the day's actual program.
  const visible = instructor.slots.filter(
    (s) =>
      (s.status === "booked" && s.is_first_slot) || s.status === "manual",
  );
  const bookedCount = instructor.slots.filter(
    (s) => s.status === "booked" && s.is_first_slot,
  ).length;
  const blockedCount = instructor.slots.filter(
    (s) => s.status === "manual",
  ).length;
  const totalUsed = instructor.slots.filter(
    (s) => s.status !== "available",
  ).length;
  const freeCount = 8 - totalUsed;

  return (
    <AdminCard padding={12}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: visible.length ? 10 : 0,
        }}
      >
        <Text
          style={{
            color: adminTheme.text,
            fontFamily: adminTheme.fontTitle,
            fontSize: 14,
          }}
        >
          {instructor.instructor_name || "Eğitmen"}
        </Text>
        <Text
          style={{
            color: adminTheme.textMuted,
            fontFamily: adminTheme.fontBody,
            fontSize: 11,
          }}
        >
          {bookedCount} ders · {freeCount} boş
          {blockedCount ? ` · ${blockedCount} kapalı` : ""}
        </Text>
      </View>
      {visible.length === 0 ? (
        <Text
          style={{
            color: adminTheme.textDim,
            fontFamily: adminTheme.fontBody,
            fontSize: 12,
            fontStyle: "italic",
          }}
        >
          Bu güne kayıt yok
        </Text>
      ) : (
        <View style={{ gap: 6 }}>
          {visible.map((s) => (
            <SlotRow
              key={s.slot_time}
              slot={s}
              onOpen={() => onOpen(s)}
              spanCount={
                s.status === "booked"
                  ? instructor.slots.filter(
                      (x) => x.status === "booked" && x.booking_id === s.booking_id,
                    ).length
                  : 1
              }
            />
          ))}
        </View>
      )}
    </AdminCard>
  );
}

function SlotRow({
  slot,
  onOpen,
  spanCount,
}: {
  slot: SchoolCalendarSlot;
  onOpen: () => void;
  spanCount: number;
}) {
  const isBlocked = slot.status === "manual";
  const isManualBooking = slot.source === "manual";

  const studentLabel =
    slot.students && slot.students.length > 0
      ? slot.students
          .map((s) => `${s.first_name} ${s.last_name}`.trim())
          .join(", ")
      : null;

  const lastSlotIdx = TIME_SLOTS.findIndex((t) => t.id === slot.slot_time);
  const endLabel =
    spanCount > 1 && lastSlotIdx >= 0
      ? TIME_SLOTS[Math.min(lastSlotIdx + spanCount - 1, TIME_SLOTS.length - 1)]
          .end
      : null;

  return (
    <Pressable
      onPress={isBlocked ? undefined : onOpen}
      disabled={isBlocked}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: adminTheme.radiusSm,
        backgroundColor: isBlocked
          ? adminTheme.surfaceMuted
          : isManualBooking
            ? adminTheme.warningSoft
            : adminTheme.accentSoft,
        borderWidth: 1,
        borderColor: adminTheme.border,
        opacity: isBlocked ? 0.55 : 1,
      }}
    >
      <View style={{ width: 88 }}>
        <Text
          style={{
            color: adminTheme.text,
            fontFamily: adminTheme.fontTitle,
            fontSize: 12,
          }}
        >
          {slot.slot_time}
          {endLabel ? ` – ${endLabel}` : ""}
        </Text>
        {!endLabel ? (
          <Text
            style={{
              color: adminTheme.textDim,
              fontFamily: adminTheme.fontBody,
              fontSize: 10,
              marginTop: 2,
            }}
          >
            {slotLabel(slot.slot_time).split(" – ")[1] ?? ""}
          </Text>
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {isBlocked ? (
          <Text
            style={{
              color: adminTheme.textDim,
              fontFamily: adminTheme.fontBody,
              fontSize: 12,
            }}
          >
            Eğitmen kapattı
          </Text>
        ) : (
          <>
            <Text
              numberOfLines={1}
              style={{
                color: adminTheme.text,
                fontFamily: adminTheme.fontTitle,
                fontSize: 12,
              }}
            >
              {slot.customer_name || "—"}
            </Text>
            {studentLabel ? (
              <Text
                numberOfLines={2}
                style={{
                  color: adminTheme.textMuted,
                  fontFamily: adminTheme.fontBody,
                  fontSize: 11,
                  marginTop: 2,
                }}
              >
                {slot.student_count} öğrenci · {studentLabel}
              </Text>
            ) : null}
          </>
        )}
      </View>
      {!isBlocked ? (
        <AdminPill
          label={isManualBooking ? "Manuel" : "Online"}
          tone={isManualBooking ? "warning" : "info"}
          size="sm"
        />
      ) : null}
    </Pressable>
  );
}

function SlotDetailModal({
  slot,
  instructorName,
  onClose,
  onDelete,
}: {
  slot: SchoolCalendarSlot;
  instructorName: string;
  onClose: () => void;
  onDelete: (bookingId: string) => void;
}) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={modalStyles.backdrop}>
        <Pressable style={modalStyles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text
            style={{
              color: adminTheme.text,
              fontFamily: adminTheme.fontHeadline,
              fontSize: 18,
              letterSpacing: -0.3,
            }}
          >
            {slotLabel(slot.slot_time)}
          </Text>
          <Text
            style={{
              color: adminTheme.textMuted,
              fontFamily: adminTheme.fontBody,
              fontSize: 12,
              marginBottom: 8,
            }}
          >
            {instructorName}
          </Text>

          <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
            <AdminPill
              label={slot.source === "manual" ? "Manuel" : "Online"}
              tone={slot.source === "manual" ? "warning" : "info"}
              size="sm"
            />
            {slot.payment_status ? (
              <AdminPill
                label={slot.payment_status}
                tone={slot.payment_status === "paid" ? "success" : "warning"}
                size="sm"
              />
            ) : null}
          </View>

          <Field label="Müşteri" value={slot.customer_name} />
          {slot.customer_phone ? (
            <Field label="Telefon" value={slot.customer_phone} />
          ) : null}
          {slot.notes ? <Field label="Not" value={slot.notes} /> : null}
          {slot.total_price && slot.total_price > 0 ? (
            <Field label="Tutar" value={formatTRY(slot.total_price)} />
          ) : null}

          <Text
            style={{
              color: adminTheme.textMuted,
              fontFamily: adminTheme.fontTitle,
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              marginTop: 10,
              marginBottom: 6,
            }}
          >
            Öğrenciler
          </Text>
          {(slot.students ?? []).map((st, idx) => (
            <Text
              key={idx}
              style={{
                color: adminTheme.text,
                fontFamily: adminTheme.fontBody,
                fontSize: 13,
                marginBottom: 2,
              }}
            >
              · {st.first_name} {st.last_name} ({st.age}, {st.experience_level})
            </Text>
          ))}

          <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
            <View style={{ flex: 1 }}>
              <AdminButton label="Kapat" tone="ghost" onPress={onClose} />
            </View>
            {slot.source === "manual" && slot.booking_id ? (
              <View style={{ flex: 1 }}>
                <AdminButton
                  label="Sil"
                  tone="danger"
                  icon="trash-2"
                  onPress={() => {
                    if (slot.booking_id) onDelete(slot.booking_id);
                  }}
                />
              </View>
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <View style={{ marginTop: 6 }}>
      <Text
        style={{
          color: adminTheme.textDim,
          fontFamily: adminTheme.fontTitle,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: adminTheme.text,
          fontFamily: adminTheme.fontBody,
          fontSize: 13,
          marginTop: 2,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

type StudentDraft = { firstName: string; lastName: string; age: string };

function ManualBookingModal({
  initialDate,
  onClose,
  onSaved,
}: {
  initialDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Multi-day, multi-instructor support: a single "reservation flow" can
  // mix slots from different instructors across multiple days. Each
  // (date, instructor) tuple becomes a separate booking row at save
  // time. Selection shape: { [dateIso]: { [instructorId]: string[] } }.
  const [dates, setDates] = useState<string[]>([initialDate]);
  const [selections, setSelections] = useState<
    Record<string, Record<string, string[]>>
  >({});
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [price, setPrice] = useState("");
  const [priceTouched, setPriceTouched] = useState(false);
  const [students, setStudents] = useState<StudentDraft[]>([
    { firstName: "", lastName: "", age: "" },
  ]);
  const [saving, setSaving] = useState(false);

  // School pricing tiers (per-person, per-50min, kuruş). Used to auto-fill
  // the Tutar field based on student count × total slot count.
  const { data: pricing } = useQuery({
    queryKey: ["school-pricing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ski_schools")
        .select(
          "price_1_kurus,price_2_kurus,price_3_kurus,price_4plus_kurus",
        )
        .eq("admin_user_id", (await supabase.auth.getUser()).data.user?.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as {
        price_1_kurus: number;
        price_2_kurus: number;
        price_3_kurus: number;
        price_4plus_kurus: number;
      } | null;
    },
  });

  // One calendar query per selected date, fetched in parallel.
  const calendarQueries = useQueries({
    queries: dates.map((d) => ({
      queryKey: ["school-calendar", d],
      queryFn: async () => {
        const { data, error } = await supabase.rpc("school_day_calendar", {
          p_date: d,
        });
        if (error) throw error;
        return data as SchoolCalendarDay;
      },
    })),
  });
  const dayDataByDate = useMemo(() => {
    const m: Record<string, SchoolCalendarDay | undefined> = {};
    dates.forEach((d, i) => {
      m[d] = calendarQueries[i]?.data;
    });
    return m;
  }, [dates, calendarQueries]);
  const loadingAny = calendarQueries.some((q) => q.isLoading);

  // 14-day strip starting from today for date picking inside the modal.
  const dateOptions = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }).map((_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  }, []);

  function toggleDate(iso: string) {
    setDates((cur) => {
      if (cur.includes(iso)) {
        // Removing a date also drops its slot selections.
        setSelections((sel) => {
          const { [iso]: _, ...rest } = sel;
          return rest;
        });
        const next = cur.filter((x) => x !== iso);
        return next.length === 0 ? cur : next; // never empty
      }
      return [...cur, iso].sort();
    });
  }

  function pickSlot(insId: string, dateIso: string, slot: string) {
    setSelections((cur) => {
      const dayMap = { ...(cur[dateIso] ?? {}) };
      const arr = dayMap[insId] ?? [];
      const next = arr.includes(slot)
        ? arr.filter((x) => x !== slot)
        : [...arr, slot].sort();
      if (next.length === 0) {
        delete dayMap[insId];
      } else {
        dayMap[insId] = next;
      }
      const out = { ...cur };
      if (Object.keys(dayMap).length === 0) {
        delete out[dateIso];
      } else {
        out[dateIso] = dayMap;
      }
      return out;
    });
  }

  // All (date, instructor, slots[]) tuples that the user has picked.
  // Each tuple becomes one booking row at save time.
  const bookingTuples = useMemo(() => {
    const out: { date: string; instructorId: string; slots: string[] }[] = [];
    Object.keys(selections)
      .sort()
      .forEach((d) => {
        const dayMap = selections[d];
        Object.keys(dayMap).forEach((insId) => {
          out.push({ date: d, instructorId: insId, slots: dayMap[insId] });
        });
      });
    return out;
  }, [selections]);

  const totalSlotCount = useMemo(
    () => bookingTuples.reduce((a, t) => a + t.slots.length, 0),
    [bookingTuples],
  );

  // Effective student count (only rows with at least a first or last name
  // actually become a real student in save()).
  const effectiveStudentCount = useMemo(
    () =>
      students.filter((s) => s.firstName.trim() || s.lastName.trim()).length,
    [students],
  );

  // Per-50min, per-student price for the current bracket (kuruş).
  const perSlotPerStudentKurus = useMemo(() => {
    if (!pricing || effectiveStudentCount < 1) return 0;
    if (effectiveStudentCount === 1) return pricing.price_1_kurus ?? 0;
    if (effectiveStudentCount === 2) return pricing.price_2_kurus ?? 0;
    if (effectiveStudentCount === 3) return pricing.price_3_kurus ?? 0;
    return pricing.price_4plus_kurus ?? 0;
  }, [pricing, effectiveStudentCount]);

  // Auto-suggested total = perSlotPerStudent × studentCount × totalSlotCount.
  const autoTotalKurus = useMemo(
    () => perSlotPerStudentKurus * effectiveStudentCount * totalSlotCount,
    [perSlotPerStudentKurus, effectiveStudentCount, totalSlotCount],
  );

  // kuruş → TL string, preserving cents. Trims trailing zeros for clean
  // display (e.g. 1550 → "15.5", 12000 → "120").
  function kurusToTLString(k: number): string {
    if (!k || k <= 0) return "";
    const tl = (k / 100).toFixed(2);
    if (tl.endsWith(".00")) return tl.slice(0, -3);
    if (tl.endsWith("0")) return tl.slice(0, -1);
    return tl;
  }

  // Auto-fill price field as long as the user hasn't manually edited it.
  useEffect(() => {
    if (priceTouched) return;
    setPrice(kurusToTLString(autoTotalKurus));
  }, [autoTotalKurus, priceTouched]);

  async function save() {
    if (!customerName.trim()) {
      Alert.alert("Eksik", "Müşteri adını gir.");
      return;
    }
    if (bookingTuples.length === 0) {
      Alert.alert("Eksik", "En az bir eğitmen + saat seç.");
      return;
    }
    const studentPayload = students
      .filter((s) => s.firstName.trim() || s.lastName.trim())
      .map((s) => ({
        firstName: s.firstName.trim(),
        lastName: s.lastName.trim(),
        age: parseInt(s.age, 10) || 0,
        experienceLevel: "beginner",
      }));
    if (studentPayload.length === 0) {
      Alert.alert("Eksik", "En az bir öğrenci adı gir.");
      return;
    }

    // Split price across the (date, instructor) tuples proportionally to
    // slot counts so each booking row gets its share. Remainder goes to
    // the last tuple.
    const totalKurus = price ? Math.round(parseFloat(price) * 100) : 0;
    const perTupleKurus: number[] = bookingTuples.map(() => 0);
    if (totalKurus > 0 && totalSlotCount > 0) {
      // Floor each non-last share so the cumulative assignment can never
      // exceed totalKurus; the last tuple absorbs the remainder and is
      // guaranteed non-negative.
      let assigned = 0;
      bookingTuples.forEach((t, idx) => {
        if (idx === bookingTuples.length - 1) {
          perTupleKurus[idx] = Math.max(0, totalKurus - assigned);
        } else {
          const share = Math.floor(
            (totalKurus * t.slots.length) / totalSlotCount,
          );
          perTupleKurus[idx] = share;
          assigned += share;
        }
      });
    }

    setSaving(true);
    console.log("[manual-booking] save start", {
      bookingTuples,
      studentPayload,
      totalKurus,
    });
    try {
      // Sequential so a partial failure stops cleanly with a clear error.
      for (let i = 0; i < bookingTuples.length; i++) {
        const t = bookingTuples[i];
        const { error } = await supabase.rpc("school_create_manual_booking", {
          p_instructor: t.instructorId,
          p_date: t.date,
          p_slot_times: t.slots,
          p_students: studentPayload,
          p_customer_name: customerName.trim(),
          p_customer_phone: customerPhone.trim() || null,
          p_notes: notes.trim() || null,
          p_price_kurus: perTupleKurus[i] ?? 0,
        });
        if (error) {
          setSaving(false);
          const msg = `${t.date}: ${error.message || "Bilinmeyen hata"}`;
          if (
            typeof window !== "undefined" &&
            typeof window.alert === "function"
          ) {
            window.alert(`Hata: ${msg}`);
          } else {
            Alert.alert("Hata", msg);
          }
          return;
        }
      }
      setSaving(false);
      onSaved();
    } catch (e) {
      console.error("[manual-booking] threw", e);
      setSaving(false);
      const msg = e instanceof Error ? e.message : String(e);
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert(`Hata: ${msg}`);
      } else {
        Alert.alert("Hata", msg);
      }
    }
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={modalStyles.backdrop}>
        <Pressable
          style={modalStyles.sheet}
          onPress={(e) => e.stopPropagation()}
        >
          <ScrollView contentContainerStyle={{ gap: 14 }}>
            <Text
              style={{
                color: adminTheme.text,
                fontFamily: adminTheme.fontHeadline,
                fontSize: 20,
                letterSpacing: -0.3,
              }}
            >
              Yeni Rezervasyon
            </Text>

            <View>
              <Text style={modalStyles.sectionLabel}>
                Tarih(ler) — birden fazla gün seçebilirsin
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6 }}
              >
                {dateOptions.map((d) => {
                  const iso = isoDate(d);
                  const sel = dates.includes(iso);
                  return (
                    <Pressable
                      key={iso}
                      onPress={() => toggleDate(iso)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: adminTheme.radiusSm,
                        backgroundColor: sel
                          ? adminTheme.accent
                          : adminTheme.surfaceMuted,
                        borderWidth: 1,
                        borderColor: sel
                          ? adminTheme.accent
                          : adminTheme.border,
                        alignItems: "center",
                        minWidth: 52,
                      }}
                    >
                      <Text
                        style={{
                          color: sel ? "#fff" : adminTheme.textMuted,
                          fontFamily: adminTheme.fontTitle,
                          fontSize: 9,
                          letterSpacing: 0.6,
                          textTransform: "uppercase",
                        }}
                      >
                        {dayShort(d)}
                      </Text>
                      <Text
                        style={{
                          color: sel ? "#fff" : adminTheme.text,
                          fontFamily: adminTheme.fontHeadline,
                          fontSize: 16,
                          marginTop: 1,
                        }}
                      >
                        {d.getDate()}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {dates.length > 1 ? (
                <Text style={[modalStyles.helperText, { marginTop: 6 }]}>
                  {dates.length} gün seçildi · toplam {totalSlotCount} seans
                </Text>
              ) : null}
            </View>

            <View>
              <Text style={modalStyles.sectionLabel}>
                Eğitmen ve müsait saatler *
              </Text>
              <Text style={[modalStyles.helperText, { marginBottom: 8 }]}>
                Aynı müşteri için farklı saatlerde farklı eğitmenlerden
                ders alabilirsin. Her (eğitmen + gün) için ayrı bir
                rezervasyon kaydı oluşur.
              </Text>
              {loadingAny ? (
                <Text style={modalStyles.helperText}>Yükleniyor…</Text>
              ) : null}

              {dates.map((dIso, dIdx) => {
                const dObj = new Date(`${dIso}T00:00:00`);
                const dayData = dayDataByDate[dIso];
                const insList = dayData?.instructors ?? [];
                return (
                  <View
                    key={dIso}
                    style={{
                      marginTop: dIdx === 0 ? 0 : 14,
                      gap: 8,
                    }}
                  >
                    {dates.length > 1 ? (
                      <Text
                        style={{
                          color: adminTheme.text,
                          fontFamily: adminTheme.fontTitle,
                          fontSize: 12,
                          textTransform: "uppercase",
                          letterSpacing: 0.6,
                        }}
                      >
                        {dayLong(dObj)}
                      </Text>
                    ) : null}

                    {insList.length === 0 && !loadingAny ? (
                      <Text
                        style={[
                          modalStyles.helperText,
                          { color: adminTheme.danger },
                        ]}
                      >
                        Bu güne ait eğitmen yok.
                      </Text>
                    ) : null}

                    {insList.map((ins) => {
                      const dateIso = dIso;
                      const insSelections =
                        selections[dateIso]?.[ins.instructor_id] ?? [];
                      const isPicked = insSelections.length > 0;
                      const freeSlots = ins.slots
                        .filter((s) => s.status === "available")
                        .map((s) => s.slot_time)
                        .sort();
                      const allBlocked = freeSlots.length === 0;
                    return (
                      <View
                        key={ins.instructor_id}
                        style={{
                          padding: 10,
                          borderRadius: adminTheme.radiusSm,
                          borderWidth: 1,
                          borderColor: isPicked
                            ? adminTheme.accent
                            : adminTheme.border,
                          backgroundColor: isPicked
                            ? adminTheme.accentSoft
                            : adminTheme.surfaceMuted,
                          opacity: allBlocked ? 0.45 : 1,
                          gap: 8,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <Feather
                            name={isPicked ? "check-circle" : "circle"}
                            size={16}
                            color={
                              isPicked
                                ? adminTheme.accent
                                : adminTheme.textMuted
                            }
                          />
                          <Text
                            style={{
                              flex: 1,
                              color: adminTheme.text,
                              fontFamily: adminTheme.fontTitle,
                              fontSize: 13,
                            }}
                          >
                            {ins.instructor_name}
                          </Text>
                          <Text
                            style={{
                              color: allBlocked
                                ? adminTheme.danger
                                : isPicked
                                  ? adminTheme.accent
                                  : adminTheme.textDim,
                              fontFamily: adminTheme.fontBody,
                              fontSize: 11,
                            }}
                          >
                            {allBlocked
                              ? "müsait değil"
                              : isPicked
                                ? `${insSelections.length} seçildi`
                                : `${freeSlots.length} boş saat`}
                          </Text>
                        </View>

                        {!allBlocked ? (
                          <View
                            style={{
                              flexDirection: "row",
                              flexWrap: "wrap",
                              gap: 6,
                            }}
                          >
                            {freeSlots.map((t) => {
                              const sel = insSelections.includes(t);
                              return (
                                <Pressable
                                  key={t}
                                  onPress={() =>
                                    pickSlot(ins.instructor_id, dateIso, t)
                                  }
                                  style={{
                                    paddingHorizontal: 10,
                                    paddingVertical: 6,
                                    borderRadius: adminTheme.radiusSm,
                                    borderWidth: 1,
                                    borderColor: sel
                                      ? adminTheme.accent
                                      : adminTheme.border,
                                    backgroundColor: sel
                                      ? adminTheme.accent
                                      : adminTheme.surface,
                                  }}
                                >
                                  <Text
                                    style={{
                                      color: sel ? "#fff" : adminTheme.text,
                                      fontFamily: adminTheme.fontTitle,
                                      fontSize: 11,
                                    }}
                                  >
                                    {t}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                  </View>
                );
              })}
            </View>

            <AdminInput
              label="Müşteri adı *"
              value={customerName}
              onChangeText={setCustomerName}
              placeholder="Ad Soyad"
            />
            <AdminInput
              label="Telefon"
              value={customerPhone}
              onChangeText={setCustomerPhone}
              keyboardType="phone-pad"
              placeholder="05.."
            />

            <View>
              <Text style={modalStyles.sectionLabel}>Öğrenciler *</Text>
              {students.map((s, i) => (
                <View
                  key={i}
                  style={{
                    gap: 6,
                    marginBottom: 10,
                    padding: 10,
                    borderRadius: adminTheme.radiusSm,
                    backgroundColor: adminTheme.surface,
                    borderWidth: 1,
                    borderColor: adminTheme.border,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 2,
                    }}
                  >
                    <Text
                      style={{
                        color: adminTheme.textDim,
                        fontFamily: adminTheme.fontBody,
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      Öğrenci {i + 1}
                    </Text>
                    {students.length > 1 ? (
                      <Pressable
                        onPress={() =>
                          setStudents((cur) =>
                            cur.filter((_, idx) => idx !== i),
                          )
                        }
                        hitSlop={8}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Feather
                          name="x"
                          size={14}
                          color={adminTheme.danger}
                        />
                        <Text
                          style={{
                            color: adminTheme.danger,
                            fontFamily: adminTheme.fontBody,
                            fontSize: 12,
                          }}
                        >
                          Kaldır
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>

                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <TextInput
                      value={s.firstName}
                      onChangeText={(t) =>
                        setStudents((cur) =>
                          cur.map((x, idx) =>
                            idx === i ? { ...x, firstName: t } : x,
                          ),
                        )
                      }
                      placeholder="Ad"
                      placeholderTextColor={adminTheme.textDim}
                      style={modalStyles.smallInput}
                    />
                    <TextInput
                      value={s.lastName}
                      onChangeText={(t) =>
                        setStudents((cur) =>
                          cur.map((x, idx) =>
                            idx === i ? { ...x, lastName: t } : x,
                          ),
                        )
                      }
                      placeholder="Soyad"
                      placeholderTextColor={adminTheme.textDim}
                      style={modalStyles.smallInput}
                    />
                  </View>

                  <TextInput
                    value={s.age}
                    onChangeText={(t) =>
                      setStudents((cur) =>
                        cur.map((x, idx) =>
                          idx === i
                            ? { ...x, age: t.replace(/[^0-9]/g, "") }
                            : x,
                        ),
                      )
                    }
                    placeholder="Yaş"
                    keyboardType="number-pad"
                    placeholderTextColor={adminTheme.textDim}
                    style={[modalStyles.smallInput, { width: 90, flex: 0 }]}
                  />
                </View>
              ))}
              <Pressable
                onPress={() =>
                  setStudents((cur) => [
                    ...cur,
                    { firstName: "", lastName: "", age: "" },
                  ])
                }
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 4,
                }}
              >
                <Feather name="plus" size={14} color={adminTheme.accent} />
                <Text
                  style={{
                    color: adminTheme.accent,
                    fontFamily: adminTheme.fontTitle,
                    fontSize: 12,
                  }}
                >
                  Öğrenci ekle
                </Text>
              </Pressable>
            </View>

            <AdminInput
              label="Tutar (TL)"
              value={price}
              onChangeText={(t) => {
                setPriceTouched(true);
                setPrice(t.replace(/[^0-9.]/g, ""));
              }}
              keyboardType="decimal-pad"
              placeholder="0"
            />
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginTop: -2,
              }}
            >
              <Text
                style={{
                  flex: 1,
                  color: adminTheme.textDim,
                  fontFamily: adminTheme.fontBody,
                  fontSize: 11,
                }}
              >
                {autoTotalKurus > 0
                  ? `Önerilen: ${formatTRY(autoTotalKurus)} (${effectiveStudentCount} kişi × ${totalSlotCount} seans · kişi başı ${formatTRY(perSlotPerStudentKurus)})`
                  : effectiveStudentCount > 0 && totalSlotCount > 0
                    ? "Bu kişi sayısı için Profil > Ders Fiyatlandırması'ndan fiyat girilmemiş."
                    : "Eğitmen, saat ve öğrenci seçince tutar otomatik hesaplanır."}
              </Text>
              {priceTouched && autoTotalKurus > 0 ? (
                <Pressable
                  onPress={() => {
                    setPriceTouched(false);
                    setPrice(kurusToTLString(autoTotalKurus));
                  }}
                  hitSlop={6}
                >
                  <Text
                    style={{
                      color: adminTheme.accent,
                      fontFamily: adminTheme.fontTitle,
                      fontSize: 11,
                    }}
                  >
                    Sıfırla
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <AdminInput
              label="Not"
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="Opsiyonel"
            />

            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              <View style={{ flex: 1 }}>
                <AdminButton label="Vazgeç" tone="ghost" onPress={onClose} />
              </View>
              <View style={{ flex: 1 }}>
                <AdminButton
                  label={saving ? "Kaydediliyor…" : "Kaydet"}
                  icon="check"
                  onPress={save}
                  disabled={saving}
                />
              </View>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const modalStyles = {
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: 16,
  },
  sheet: {
    width: "100%" as const,
    maxWidth: 460,
    maxHeight: "92%" as const,
    backgroundColor: adminTheme.surface,
    borderRadius: adminTheme.radius,
    borderWidth: 1,
    borderColor: adminTheme.border,
    padding: 18,
  },
  sectionLabel: {
    color: adminTheme.textMuted,
    fontFamily: adminTheme.fontTitle,
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  helperText: {
    color: adminTheme.textDim,
    fontFamily: adminTheme.fontBody,
    fontSize: 12,
  },
  smallInput: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: adminTheme.radiusSm,
    backgroundColor: adminTheme.surfaceMuted,
    borderWidth: 1,
    borderColor: adminTheme.border,
    color: adminTheme.text,
    fontFamily: adminTheme.fontBody,
    fontSize: 13,
  },
};
