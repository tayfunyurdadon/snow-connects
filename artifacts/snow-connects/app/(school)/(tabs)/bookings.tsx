import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
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

  const [modalSlot, setModalSlot] = useState<{
    instructor: SchoolCalendarInstructor;
    startSlotTime: string;
  } | null>(null);
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

  return (
    <AdminScreen>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            color: adminTheme.text,
            fontFamily: adminTheme.fontHeadline,
            fontSize: 18,
            letterSpacing: -0.3,
          }}
        >
          {dayLong(new Date(selectedDate))}
        </Text>
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
            onAdd={(slotTime) =>
              setModalSlot({ instructor: ins, startSlotTime: slotTime })
            }
            onOpen={(slot) => setDetailSlot({ instructor: ins, slot })}
          />
        ))
      )}

      {modalSlot ? (
        <ManualBookingModal
          date={selectedDate}
          instructor={modalSlot.instructor}
          startSlotTime={modalSlot.startSlotTime}
          onClose={() => setModalSlot(null)}
          onSaved={() => {
            setModalSlot(null);
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
  onAdd,
  onOpen,
}: {
  instructor: SchoolCalendarInstructor;
  onAdd: (slotTime: string) => void;
  onOpen: (slot: SchoolCalendarSlot) => void;
}) {
  return (
    <AdminCard padding={12}>
      <Text
        style={{
          color: adminTheme.text,
          fontFamily: adminTheme.fontTitle,
          fontSize: 14,
          marginBottom: 10,
        }}
      >
        {instructor.instructor_name || "Eğitmen"}
      </Text>
      <View style={{ gap: 6 }}>
        {instructor.slots.map((s) => (
          <SlotRow
            key={s.slot_time}
            slot={s}
            onAdd={() => onAdd(s.slot_time)}
            onOpen={() => onOpen(s)}
          />
        ))}
      </View>
    </AdminCard>
  );
}

function SlotRow({
  slot,
  onAdd,
  onOpen,
}: {
  slot: SchoolCalendarSlot;
  onAdd: () => void;
  onOpen: () => void;
}) {
  const isAvailable = slot.status === "available";
  const isBlocked = slot.status === "manual";
  const isBooked = slot.status === "booked";
  const isManualBooking = isBooked && slot.source === "manual";
  const isOnlineBooking = isBooked && slot.source === "online";

  const studentLabel =
    slot.students && slot.students.length > 0
      ? slot.students
          .map((s) => `${s.first_name} ${s.last_name}`.trim())
          .join(", ")
      : null;

  return (
    <Pressable
      onPress={isAvailable ? onAdd : isBooked ? onOpen : undefined}
      disabled={isBlocked}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: adminTheme.radiusSm,
        backgroundColor: isAvailable
          ? adminTheme.surfaceMuted
          : isBlocked
            ? adminTheme.surfaceMuted
            : isManualBooking
              ? adminTheme.warningSoft
              : adminTheme.accentSoft,
        borderWidth: 1,
        borderColor: adminTheme.border,
        opacity: isBlocked ? 0.55 : 1,
      }}
    >
      <View style={{ width: 80 }}>
        <Text
          style={{
            color: adminTheme.text,
            fontFamily: adminTheme.fontTitle,
            fontSize: 12,
          }}
        >
          {slotLabel(slot.slot_time)}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {isBooked ? (
          slot.is_first_slot ? (
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
                  numberOfLines={1}
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
          ) : (
            <Text
              style={{
                color: adminTheme.textDim,
                fontFamily: adminTheme.fontBody,
                fontSize: 11,
                fontStyle: "italic",
              }}
            >
              ↑ aynı ders devam
            </Text>
          )
        ) : (
          <Text
            style={{
              color: adminTheme.textDim,
              fontFamily: adminTheme.fontBody,
              fontSize: 12,
            }}
          >
            {isBlocked ? "Eğitmen kapattı" : "Boş"}
          </Text>
        )}
      </View>
      {isManualBooking && slot.is_first_slot ? (
        <AdminPill label="Manuel" tone="warning" size="sm" />
      ) : isOnlineBooking && slot.is_first_slot ? (
        <AdminPill label="Online" tone="info" size="sm" />
      ) : isAvailable ? (
        <Feather name="plus-circle" size={18} color={adminTheme.accent} />
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
  date,
  instructor,
  startSlotTime,
  onClose,
  onSaved,
}: {
  date: string;
  instructor: SchoolCalendarInstructor;
  startSlotTime: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const availableTimes = useMemo(
    () =>
      instructor.slots
        .filter((s) => s.status === "available")
        .map((s) => s.slot_time),
    [instructor],
  );
  const [selectedTimes, setSelectedTimes] = useState<string[]>([startSlotTime]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [price, setPrice] = useState("");
  const [students, setStudents] = useState<StudentDraft[]>([
    { firstName: "", lastName: "", age: "" },
  ]);
  const [saving, setSaving] = useState(false);

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
    const { error } = await supabase.rpc("school_create_manual_booking", {
      p_instructor: instructor.instructor_id,
      p_date: date,
      p_slot_times: selectedTimes,
      p_students: studentPayload,
      p_customer_name: customerName.trim(),
      p_customer_phone: customerPhone.trim() || null,
      p_notes: notes.trim() || null,
      p_price_kurus: price ? Math.round(parseFloat(price) * 100) : 0,
    });
    setSaving(false);
    if (error) {
      Alert.alert("Hata", error.message);
      return;
    }
    onSaved();
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={modalStyles.backdrop}>
        <Pressable
          style={modalStyles.sheet}
          onPress={(e) => e.stopPropagation()}
        >
          <ScrollView contentContainerStyle={{ gap: 12 }}>
            <Text
              style={{
                color: adminTheme.text,
                fontFamily: adminTheme.fontHeadline,
                fontSize: 18,
                letterSpacing: -0.3,
              }}
            >
              Manuel Rezervasyon
            </Text>
            <Text
              style={{
                color: adminTheme.textMuted,
                fontFamily: adminTheme.fontBody,
                fontSize: 12,
              }}
            >
              {instructor.instructor_name} ·{" "}
              {new Date(date).toLocaleDateString("tr-TR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </Text>

            <View>
              <Text style={modalStyles.sectionLabel}>Seanslar</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {TIME_SLOTS.map((t) => {
                  const ok = availableTimes.includes(t.id);
                  const sel = selectedTimes.includes(t.id);
                  return (
                    <Pressable
                      key={t.id}
                      disabled={!ok}
                      onPress={() => toggleSlot(t.id)}
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
                          : ok
                            ? adminTheme.surfaceMuted
                            : "transparent",
                        opacity: ok ? 1 : 0.4,
                      }}
                    >
                      <Text
                        style={{
                          color: sel ? "#fff" : adminTheme.text,
                          fontFamily: adminTheme.fontTitle,
                          fontSize: 11,
                        }}
                      >
                        {t.start}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
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
                  style={{ flexDirection: "row", gap: 6, marginBottom: 6 }}
                >
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
                    style={[modalStyles.smallInput, { maxWidth: 60 }]}
                  />
                  {students.length > 1 ? (
                    <Pressable
                      onPress={() =>
                        setStudents((cur) => cur.filter((_, idx) => idx !== i))
                      }
                      style={{
                        width: 36,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Feather name="x" size={16} color={adminTheme.danger} />
                    </Pressable>
                  ) : null}
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
