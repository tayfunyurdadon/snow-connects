import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  return d.toISOString().slice(0, 10);
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
  const [date, setDate] = useState<string>(initialDate);
  const [selectedTimes, setSelectedTimes] = useState<string[]>([]);
  const [instructorId, setInstructorId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [price, setPrice] = useState("");
  const [students, setStudents] = useState<StudentDraft[]>([
    { firstName: "", lastName: "", age: "" },
  ]);
  const [saving, setSaving] = useState(false);

  // Pull the day's calendar so we can show which instructors are free
  // for the chosen slot set.
  const { data: dayData, isLoading: loadingDay } = useQuery({
    queryKey: ["school-calendar", date],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("school_day_calendar", {
        p_date: date,
      });
      if (error) throw error;
      return data as SchoolCalendarDay;
    },
  });

  // 7-day strip starting from today for date picking inside the modal.
  const dateOptions = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }).map((_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  }, []);

  // When date changes, clear the previous instructor + slot selection so
  // the user re-picks against the new day's availability. This also
  // enforces the "one booking = one instructor" rule cleanly.
  useEffect(() => {
    setInstructorId(null);
    setSelectedTimes([]);
  }, [date]);

  function toggleSlot(t: string) {
    setSelectedTimes((cur) =>
      cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t].sort(),
    );
  }

  async function save() {
    if (!customerName.trim()) {
      Alert.alert("Eksik", "Müşteri adını gir.");
      return;
    }
    if (selectedTimes.length === 0) {
      Alert.alert("Eksik", "En az bir seans seç.");
      return;
    }
    if (!instructorId) {
      Alert.alert("Eksik", "Eğitmen seç.");
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
    setSaving(true);
    console.log("[manual-booking] save start", {
      instructorId,
      date,
      selectedTimes,
      studentPayload,
      price,
    });
    try {
      const { data, error } = await supabase.rpc(
        "school_create_manual_booking",
        {
          p_instructor: instructorId,
          p_date: date,
          p_slot_times: selectedTimes,
          p_students: studentPayload,
          p_customer_name: customerName.trim(),
          p_customer_phone: customerPhone.trim() || null,
          p_notes: notes.trim() || null,
          p_price_kurus: price ? Math.round(parseFloat(price) * 100) : 0,
        },
      );
      console.log("[manual-booking] rpc returned", { data, error });
      setSaving(false);
      if (error) {
        const msg = error.message || "Bilinmeyen hata";
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
              <Text style={modalStyles.sectionLabel}>Tarih</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6 }}
              >
                {dateOptions.map((d) => {
                  const iso = isoDate(d);
                  const sel = iso === date;
                  return (
                    <Pressable
                      key={iso}
                      onPress={() => setDate(iso)}
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
            </View>

            <View>
              <Text style={modalStyles.sectionLabel}>
                Eğitmen ve müsait saatler *
              </Text>
              <Text
                style={[modalStyles.helperText, { marginBottom: 8 }]}
              >
                Bir eğitmen seç, ardından o eğitmenin müsait saatlerinden
                seçim yap. Tek rezervasyon = tek eğitmen.
              </Text>
              {loadingDay ? (
                <Text style={modalStyles.helperText}>Yükleniyor…</Text>
              ) : (dayData?.instructors ?? []).length === 0 ? (
                <Text
                  style={[modalStyles.helperText, { color: adminTheme.danger }]}
                >
                  Bu okula bağlı onaylı eğitmen yok.
                </Text>
              ) : (
                <View style={{ gap: 8 }}>
                  {(dayData?.instructors ?? []).map((ins) => {
                    const isPicked = ins.instructor_id === instructorId;
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
                        <Pressable
                          disabled={allBlocked}
                          onPress={() => {
                            // Switching instructors clears slot selection
                            // — enforces "1 booking = 1 instructor".
                            if (ins.instructor_id !== instructorId) {
                              setInstructorId(ins.instructor_id);
                              setSelectedTimes([]);
                            }
                          }}
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
                                : adminTheme.textDim,
                              fontFamily: adminTheme.fontBody,
                              fontSize: 11,
                            }}
                          >
                            {allBlocked
                              ? "müsait değil"
                              : `${freeSlots.length} boş saat`}
                          </Text>
                        </Pressable>

                        {isPicked && !allBlocked ? (
                          <View
                            style={{
                              flexDirection: "row",
                              flexWrap: "wrap",
                              gap: 6,
                            }}
                          >
                            {freeSlots.map((t) => {
                              const sel = selectedTimes.includes(t);
                              return (
                                <Pressable
                                  key={t}
                                  onPress={() => toggleSlot(t)}
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
              )}
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
              label="Tutar (TL, opsiyonel)"
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              placeholder="0"
            />
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
