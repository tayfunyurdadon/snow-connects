import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
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
  AdminTabRow,
} from "@/components/admin/AdminUI";
import { adminTheme } from "@/lib/adminTheme";
import { formatTRY } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type {
  SchoolApprovalStatus,
  SchoolInstructorPaymentRow,
  SchoolInstructorPaymentSummaryRow,
} from "@/lib/types";

type Row = {
  user_id: string;
  name: string | null;
  email: string | null;
  bio: string | null;
  experience_years: number | null;
  certifications: string[] | null;
  rating: number | null;
  resort_ids: string[] | null;
  verification_status: string;
  school_approval_status: SchoolApprovalStatus;
  cert_type: string | null;
  cert_number: string | null;
  iban: string | null;
};

type TopTab = "approvals" | "payments";

export default function SchoolInstructors() {
  const [top, setTop] = useState<TopTab>("approvals");

  return (
    <AdminScreen>
      <AdminTabRow
        value={top}
        onChange={setTop}
        options={[
          { id: "approvals", label: "Onaylar" },
          { id: "payments", label: "Ödemeler" },
        ]}
      />
      <View style={{ height: 14 }} />
      {top === "approvals" ? <ApprovalsSection /> : <PaymentsSection />}
    </AdminScreen>
  );
}

// ---------------------------------------------------------------
// Onaylar (existing approval flow)
// ---------------------------------------------------------------

type Sub = SchoolApprovalStatus;

function ApprovalsSection() {
  const qc = useQueryClient();
  const [sub, setSub] = useState<Sub>("pending");

  const pending = useQuery({
    queryKey: ["school-instructors", "pending"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("school_list_instructors", {
        p_status: "pending",
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["school-instructors", sub],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("school_list_instructors", {
        p_status: sub,
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const setStatus = useMutation({
    mutationFn: async (v: { id: string; status: SchoolApprovalStatus }) => {
      const { error } = await supabase.rpc("school_set_instructor_status", {
        p_instructor: v.id,
        p_status: v.status,
        p_reason: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["school-instructors"] });
      qc.invalidateQueries({ queryKey: ["school-summary"] });
    },
    onError: (e: Error) => Alert.alert("Hata", e.message),
  });

  return (
    <>
      <AdminTabRow
        value={sub}
        onChange={setSub}
        options={[
          {
            id: "pending",
            label: "Bekleyen",
            count: pending.data?.length ?? 0,
          },
          { id: "approved", label: "Onaylı" },
          { id: "rejected", label: "Reddedilen" },
        ]}
      />

      <View style={{ height: 12 }} />

      {isLoading ? (
        <AdminSpinner />
      ) : !data || data.length === 0 ? (
        <AdminEmpty
          icon="users"
          title="Liste boş"
          description={
            sub === "pending"
              ? "Yeni başvurular geldiğinde burada görünecek."
              : undefined
          }
        />
      ) : (
        data.map((r) => (
          <AdminCard key={r.user_id}>
            <View style={{ gap: 8 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: adminTheme.text,
                      fontFamily: adminTheme.fontTitle,
                      fontSize: 14,
                    }}
                  >
                    {r.name || "İsimsiz"}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: adminTheme.textMuted,
                      fontFamily: adminTheme.fontBody,
                      fontSize: 12,
                      marginTop: 2,
                    }}
                  >
                    {r.email ?? "—"}
                  </Text>
                </View>
                <AdminPill
                  label={
                    r.school_approval_status === "approved"
                      ? "Onaylı"
                      : r.school_approval_status === "rejected"
                        ? "Reddedildi"
                        : "Bekliyor"
                  }
                  tone={
                    r.school_approval_status === "approved"
                      ? "success"
                      : r.school_approval_status === "rejected"
                        ? "danger"
                        : "warning"
                  }
                  size="sm"
                />
              </View>
              {r.bio ? (
                <Text
                  style={{
                    color: adminTheme.textMuted,
                    fontFamily: adminTheme.fontBody,
                    fontSize: 12,
                    lineHeight: 17,
                  }}
                  numberOfLines={3}
                >
                  {r.bio}
                </Text>
              ) : null}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {r.cert_type ? (
                  <AdminPill label={r.cert_type} tone="default" size="sm" />
                ) : null}
                {r.experience_years ? (
                  <AdminPill
                    label={`${r.experience_years} yıl`}
                    tone="default"
                    size="sm"
                  />
                ) : null}
                {r.iban ? (
                  <AdminPill label="IBAN var" tone="info" size="sm" />
                ) : null}
              </View>
              {sub !== "approved" ? (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                  <View style={{ flex: 1 }}>
                    <AdminButton
                      label="Onayla"
                      icon="check"
                      size="sm"
                      onPress={() =>
                        setStatus.mutate({
                          id: r.user_id,
                          status: "approved",
                        })
                      }
                    />
                  </View>
                  {sub === "pending" ? (
                    <View style={{ flex: 1 }}>
                      <AdminButton
                        label="Reddet"
                        tone="danger"
                        icon="x"
                        size="sm"
                        onPress={() =>
                          setStatus.mutate({
                            id: r.user_id,
                            status: "rejected",
                          })
                        }
                      />
                    </View>
                  ) : null}
                </View>
              ) : (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                  <View style={{ flex: 1 }}>
                    <AdminButton
                      label="Pasifleştir"
                      tone="ghost"
                      icon="pause"
                      size="sm"
                      onPress={() =>
                        setStatus.mutate({
                          id: r.user_id,
                          status: "pending",
                        })
                      }
                    />
                  </View>
                </View>
              )}
            </View>
          </AdminCard>
        ))
      )}
    </>
  );
}

// ---------------------------------------------------------------
// Eğitmen Ödemeleri (Phase 14: school → instructor settlements)
// ---------------------------------------------------------------

function PaymentsSection() {
  const qc = useQueryClient();
  const [payTarget, setPayTarget] =
    useState<SchoolInstructorPaymentSummaryRow | null>(null);
  const [historyTarget, setHistoryTarget] =
    useState<SchoolInstructorPaymentSummaryRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["school-instructor-payment-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "school_instructor_payment_summary",
      );
      if (error) throw error;
      return (data ?? []) as SchoolInstructorPaymentSummaryRow[];
    },
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["school-instructor-payment-summary"] });
    qc.invalidateQueries({ queryKey: ["school-instructor-payment-history"] });
  }

  if (isLoading) return <AdminSpinner />;
  if (!data || data.length === 0)
    return (
      <AdminEmpty
        icon="dollar-sign"
        title="Henüz eğitmen yok"
        description="Onaylı eğitmenlerin ders kazançları burada görünecek."
      />
    );

  const totalEarned = data.reduce((s, r) => s + r.earned_kurus, 0);
  const totalPaid = data.reduce((s, r) => s + r.paid_kurus, 0);
  const totalBalance = totalEarned - totalPaid;

  return (
    <>
      {/* Top summary */}
      <AdminCard>
        <Text
          style={{
            color: adminTheme.textMuted,
            fontFamily: adminTheme.fontTitle,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            marginBottom: 8,
          }}
        >
          Toplam (Tahsil Edildi)
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <SummaryTile label="Hak Edilen" value={formatTRY(totalEarned)} />
          <SummaryTile label="Ödenen" value={formatTRY(totalPaid)} />
          <SummaryTile
            label="Kalan"
            value={formatTRY(totalBalance)}
            tone={totalBalance > 0 ? "warning" : "muted"}
          />
        </View>
      </AdminCard>

      <View style={{ height: 12 }} />

      {data.map((r) => (
        <AdminCard key={r.instructor_id}>
          <View style={{ gap: 8 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    color: adminTheme.text,
                    fontFamily: adminTheme.fontTitle,
                    fontSize: 14,
                  }}
                >
                  {r.instructor_name}
                </Text>
                <Text
                  style={{
                    color: adminTheme.textMuted,
                    fontFamily: adminTheme.fontBody,
                    fontSize: 12,
                    marginTop: 2,
                  }}
                >
                  {r.released_lesson_count} ders · {r.payment_count} ödeme
                  {r.last_paid_at
                    ? ` · son: ${formatDate(r.last_paid_at)}`
                    : ""}
                </Text>
              </View>
              <AdminPill
                label={
                  r.balance_kurus > 0
                    ? "Borç"
                    : r.earned_kurus > 0
                      ? "Tamam"
                      : "—"
                }
                tone={
                  r.balance_kurus > 0
                    ? "warning"
                    : r.earned_kurus > 0
                      ? "success"
                      : "default"
                }
                size="sm"
              />
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              <SummaryTile label="Hak Edilen" value={formatTRY(r.earned_kurus)} />
              <SummaryTile label="Ödenen" value={formatTRY(r.paid_kurus)} />
              <SummaryTile
                label="Kalan"
                value={formatTRY(r.balance_kurus)}
                tone={r.balance_kurus > 0 ? "warning" : "muted"}
              />
            </View>

            {r.instructor_iban ? (
              <Text
                numberOfLines={1}
                style={{
                  color: adminTheme.textDim,
                  fontFamily: adminTheme.fontBody,
                  fontSize: 11,
                  marginTop: 4,
                }}
              >
                IBAN: {r.instructor_iban}
              </Text>
            ) : (
              <Text
                style={{
                  color: adminTheme.warning,
                  fontFamily: adminTheme.fontBody,
                  fontSize: 11,
                  marginTop: 4,
                }}
              >
                IBAN yok — eğitmenden talep edin.
              </Text>
            )}

            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              <View style={{ flex: 1 }}>
                <AdminButton
                  label="Ödeme Yap"
                  icon="send"
                  size="sm"
                  onPress={() => setPayTarget(r)}
                  disabled={r.balance_kurus <= 0}
                />
              </View>
              <View style={{ flex: 1 }}>
                <AdminButton
                  label="Geçmiş"
                  tone="ghost"
                  icon="clock"
                  size="sm"
                  onPress={() => setHistoryTarget(r)}
                />
              </View>
            </View>
          </View>
        </AdminCard>
      ))}

      {payTarget ? (
        <RecordPaymentModal
          target={payTarget}
          onClose={() => setPayTarget(null)}
          onSuccess={() => {
            setPayTarget(null);
            refresh();
          }}
        />
      ) : null}

      {historyTarget ? (
        <PaymentHistoryModal
          target={historyTarget}
          onClose={() => setHistoryTarget(null)}
          onChanged={refresh}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------
// Modals
// ---------------------------------------------------------------

function RecordPaymentModal({
  target,
  onClose,
  onSuccess,
}: {
  target: SchoolInstructorPaymentSummaryRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState<string>(
    (target.balance_kurus / 100).toFixed(2).replace(".", ","),
  );
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const normalized = amount.replace(",", ".").trim();
    const amountTL = Number(normalized);
    if (!Number.isFinite(amountTL) || amountTL <= 0) {
      Alert.alert("Hata", "Geçerli bir tutar girin.");
      return;
    }
    const kurus = Math.round(amountTL * 100);
    if (kurus > target.balance_kurus) {
      Alert.alert(
        "Hata",
        `Kalan bakiyeden fazla giremezsiniz (en fazla ${formatTRY(target.balance_kurus)}).`,
      );
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("school_record_instructor_payment", {
      p_instructor: target.instructor_id,
      p_amount_kurus: kurus,
      p_note: note || null,
    });
    setSaving(false);
    if (error) {
      Alert.alert("Hata", error.message);
      return;
    }
    onSuccess();
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={modalStyles.backdrop}>
        <Pressable
          style={modalStyles.sheet}
          onPress={(e) => e.stopPropagation()}
        >
          <Text
            style={{
              color: adminTheme.text,
              fontFamily: adminTheme.fontHeadline,
              fontSize: 18,
              letterSpacing: -0.3,
            }}
          >
            Ödeme Yap
          </Text>
          <Text
            style={{
              color: adminTheme.textMuted,
              fontFamily: adminTheme.fontBody,
              fontSize: 12,
              marginTop: 2,
              marginBottom: 14,
            }}
          >
            {target.instructor_name} · Kalan {formatTRY(target.balance_kurus)}
          </Text>

          <View style={{ gap: 12 }}>
            <AdminInput
              label="Tutar (TL)"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              helper={`En fazla ${formatTRY(target.balance_kurus)}`}
            />
            <AdminInput
              label="Not (opsiyonel)"
              value={note}
              onChangeText={setNote}
              placeholder="ör. Mart ayı transferi"
              multiline
            />
          </View>

          <View style={{ flexDirection: "row", gap: 8, marginTop: 18 }}>
            <View style={{ flex: 1 }}>
              <AdminButton label="İptal" tone="ghost" onPress={onClose} />
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PaymentHistoryModal({
  target,
  onClose,
  onChanged,
}: {
  target: SchoolInstructorPaymentSummaryRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["school-instructor-payment-history", target.instructor_id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "school_instructor_payment_history",
        { p_instructor: target.instructor_id },
      );
      if (error) throw error;
      return (data ?? []) as SchoolInstructorPaymentRow[];
    },
  });

  async function del(id: string) {
    const { error } = await supabase.rpc(
      "school_delete_instructor_payment",
      { p_id: id },
    );
    if (error) {
      Alert.alert("Hata", error.message);
      return;
    }
    await refetch();
    onChanged();
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={modalStyles.backdrop}>
        <Pressable
          style={modalStyles.sheet}
          onPress={(e) => e.stopPropagation()}
        >
          <Text
            style={{
              color: adminTheme.text,
              fontFamily: adminTheme.fontHeadline,
              fontSize: 18,
              letterSpacing: -0.3,
            }}
          >
            Ödeme Geçmişi
          </Text>
          <Text
            style={{
              color: adminTheme.textMuted,
              fontFamily: adminTheme.fontBody,
              fontSize: 12,
              marginTop: 2,
              marginBottom: 14,
            }}
          >
            {target.instructor_name}
          </Text>

          <ScrollView style={{ maxHeight: 360 }}>
            {isLoading ? (
              <AdminSpinner />
            ) : !data || data.length === 0 ? (
              <AdminEmpty
                icon="inbox"
                title="Henüz ödeme yok"
                description="Bu eğitmene yapılan ödemeler burada listelenecek."
              />
            ) : (
              data.map((p) => (
                <View
                  key={p.id}
                  style={{
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: adminTheme.border,
                    flexDirection: "row",
                    gap: 8,
                    alignItems: "flex-start",
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        color: adminTheme.text,
                        fontFamily: adminTheme.fontTitle,
                        fontSize: 14,
                      }}
                    >
                      {formatTRY(p.amount_kurus)}
                    </Text>
                    <Text
                      style={{
                        color: adminTheme.textMuted,
                        fontFamily: adminTheme.fontBody,
                        fontSize: 11,
                        marginTop: 2,
                      }}
                    >
                      {formatDateTime(p.paid_at)}
                    </Text>
                    {p.note ? (
                      <Text
                        style={{
                          color: adminTheme.textMuted,
                          fontFamily: adminTheme.fontBody,
                          fontSize: 12,
                          marginTop: 4,
                        }}
                      >
                        {p.note}
                      </Text>
                    ) : null}
                  </View>
                  {canDelete(p.paid_at) ? (
                    <Pressable
                      onPress={() => confirmDelete(() => del(p.id))}
                      style={{ padding: 6 }}
                    >
                      <Feather
                        name="trash-2"
                        size={16}
                        color={adminTheme.textMuted}
                      />
                    </Pressable>
                  ) : null}
                </View>
              ))
            )}
          </ScrollView>

          <View style={{ marginTop: 16 }}>
            <AdminButton label="Kapat" tone="ghost" onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning" | "muted";
}) {
  const color =
    tone === "warning"
      ? adminTheme.warning
      : tone === "muted"
        ? adminTheme.textMuted
        : adminTheme.text;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: adminTheme.surfaceMuted,
        borderRadius: adminTheme.radiusSm,
        padding: 10,
      }}
    >
      <Text
        style={{
          color: adminTheme.textMuted,
          fontFamily: adminTheme.fontTitle,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color,
          fontFamily: adminTheme.fontHeadline,
          fontSize: 14,
          marginTop: 4,
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function canDelete(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < 24 * 60 * 60 * 1000;
}

// React Native's Alert.alert with multiple buttons doesn't render
// properly on web (Expo web only shows the message). Fall back to
// window.confirm so the destructive action is actually reachable
// from the Replit preview.
function confirmDelete(onConfirm: () => void) {
  const message = "Bu ödeme kaydını silmek istediğinize emin misiniz?";
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.confirm(message)) {
      onConfirm();
    }
    return;
  }
  Alert.alert("Sil", message, [
    { text: "Vazgeç", style: "cancel" },
    { text: "Sil", style: "destructive", onPress: onConfirm },
  ]);
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
};
