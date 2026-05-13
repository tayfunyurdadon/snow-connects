import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import {
  AdminButton,
  AdminCard,
  AdminEmpty,
  AdminInput,
  AdminScreen,
  AdminSpinner,
  AdminTabRow,
} from "@/components/admin/AdminUI";
import { adminTheme } from "@/lib/adminTheme";
import { supabase } from "@/lib/supabase";
import type { AppConfig, Resort, SkiSchool } from "@/lib/types";

type SubTab = "resorts" | "schools" | "settings";

export default function AdminSystem() {
  const [sub, setSub] = useState<SubTab>("resorts");
  return (
    <AdminScreen>
      <AdminTabRow
        value={sub}
        onChange={setSub}
        options={[
          { id: "resorts", label: "Pistler" },
          { id: "schools", label: "Okullar" },
          { id: "settings", label: "Ayarlar" },
        ]}
      />
      {sub === "resorts" ? (
        <ResortsTab />
      ) : sub === "schools" ? (
        <SchoolsTab />
      ) : (
        <SettingsTab />
      )}
    </AdminScreen>
  );
}

type SchoolEdit = {
  id?: string;
  name: string;
  description: string;
  iban: string;
  iban_holder_name: string;
  admin_user_id: string | null;
  admin_label?: string;
};

function SchoolsTab() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<SchoolEdit | null>(null);
  const [adminQ, setAdminQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-schools"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ski_schools")
        .select("*, admin:users!admin_user_id(name, email)")
        .order("name");
      if (error) throw error;
      return (data ?? []) as (SkiSchool & {
        admin: { name: string | null; email: string | null } | null;
      })[];
    },
  });

  const adminSearch = useQuery({
    enabled: !!editing,
    queryKey: ["admin-search-users", adminQ],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_search_users", {
        p_query: adminQ,
      });
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        name: string | null;
        email: string | null;
        role: string;
      }[];
    },
  });

  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) {
      Alert.alert("Hata", "Okul adı zorunlu.");
      return;
    }
    const { error } = await supabase.rpc("admin_upsert_school", {
      p_id: editing.id ?? null,
      p_name: editing.name,
      p_description: editing.description,
      p_iban: editing.iban,
      p_iban_holder_name: editing.iban_holder_name,
      p_admin_user_id: editing.admin_user_id,
    });
    if (error) {
      Alert.alert("Hata", error.message);
      return;
    }
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["admin-schools"] });
  }

  async function remove(id: string) {
    Alert.alert("Okulu sil", "Bu okul silinecek. Devam edilsin mi?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.rpc("admin_delete_school", {
            p_id: id,
          });
          if (error) Alert.alert("Hata", error.message);
          else qc.invalidateQueries({ queryKey: ["admin-schools"] });
        },
      },
    ]);
  }

  return (
    <>
      <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
        <AdminButton
          label="Okul Ekle"
          icon="plus"
          size="sm"
          onPress={() =>
            setEditing({
              name: "",
              description: "",
              iban: "",
              iban_holder_name: "",
              admin_user_id: null,
            })
          }
        />
      </View>

      {editing ? (
        <AdminCard padding={14}>
          <Text
            style={{
              color: adminTheme.textMuted,
              fontFamily: adminTheme.fontTitle,
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              marginBottom: 10,
            }}
          >
            {editing.id ? "Okulu Düzenle" : "Yeni Okul"}
          </Text>
          <View style={{ gap: 10 }}>
            <AdminInput
              label="Ad"
              value={editing.name}
              onChangeText={(t) => setEditing({ ...editing, name: t })}
              placeholder="Snow Academy"
            />
            <AdminInput
              label="Açıklama"
              value={editing.description}
              onChangeText={(t) =>
                setEditing({ ...editing, description: t })
              }
              multiline
            />
            <AdminInput
              label="IBAN"
              value={editing.iban}
              onChangeText={(t) => setEditing({ ...editing, iban: t })}
              autoCapitalize="characters"
            />
            <AdminInput
              label="Hesap sahibi"
              value={editing.iban_holder_name}
              onChangeText={(t) =>
                setEditing({ ...editing, iban_holder_name: t })
              }
            />
            <AdminInput
              label="Okul yöneticisi (e-posta ile ara)"
              value={adminQ}
              onChangeText={setAdminQ}
              autoCapitalize="none"
              placeholder="ornek@mail.com"
            />
            {editing.admin_user_id ? (
              <Text
                style={{
                  color: adminTheme.success,
                  fontFamily: adminTheme.fontBody,
                  fontSize: 12,
                }}
              >
                Seçili: {editing.admin_label ?? editing.admin_user_id}
              </Text>
            ) : null}
            <View style={{ gap: 6, maxHeight: 220 }}>
              {(adminSearch.data ?? []).slice(0, 6).map((u) => (
                <Pressable
                  key={u.id}
                  onPress={() =>
                    setEditing({
                      ...editing,
                      admin_user_id: u.id,
                      admin_label: u.email ?? u.name ?? u.id,
                    })
                  }
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    borderRadius: adminTheme.radiusSm,
                    backgroundColor:
                      editing.admin_user_id === u.id
                        ? adminTheme.accentSoft
                        : adminTheme.surfaceMuted,
                    borderWidth: 1,
                    borderColor: adminTheme.border,
                  }}
                >
                  <Text
                    style={{
                      color: adminTheme.text,
                      fontFamily: adminTheme.fontBody,
                      fontSize: 12,
                    }}
                  >
                    {u.email ?? u.name ?? u.id}
                  </Text>
                  <Text
                    style={{
                      color: adminTheme.textDim,
                      fontFamily: adminTheme.fontBody,
                      fontSize: 10,
                    }}
                  >
                    {u.role}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              <View style={{ flex: 1 }}>
                <AdminButton
                  label="Vazgeç"
                  tone="ghost"
                  onPress={() => setEditing(null)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <AdminButton label="Kaydet" onPress={save} />
              </View>
            </View>
          </View>
        </AdminCard>
      ) : null}

      {isLoading ? (
        <AdminSpinner />
      ) : !data || data.length === 0 ? (
        <AdminEmpty icon="home" title="Henüz okul yok" />
      ) : (
        data.map((s) => (
          <AdminCard key={s.id}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 10,
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
                  {s.name}
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
                  Yönetici: {s.admin?.email ?? s.admin?.name ?? "—"}
                </Text>
                {s.iban ? (
                  <Text
                    numberOfLines={1}
                    style={{
                      color: adminTheme.textDim,
                      fontFamily: adminTheme.fontBody,
                      fontSize: 11,
                      marginTop: 2,
                    }}
                  >
                    {s.iban}
                  </Text>
                ) : null}
              </View>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <AdminButton
                  label="Düzenle"
                  size="sm"
                  tone="ghost"
                  icon="edit-2"
                  onPress={() =>
                    setEditing({
                      id: s.id,
                      name: s.name,
                      description: s.description,
                      iban: s.iban,
                      iban_holder_name: s.iban_holder_name,
                      admin_user_id: s.admin_user_id,
                      admin_label:
                        s.admin?.email ?? s.admin?.name ?? undefined,
                    })
                  }
                />
                <AdminButton
                  label="Sil"
                  size="sm"
                  tone="danger"
                  icon="trash-2"
                  onPress={() => remove(s.id)}
                />
              </View>
            </View>
          </AdminCard>
        ))
      )}
    </>
  );
}

function ResortsTab() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ id?: string; name: string; region: string } | null>(
    null,
  );

  const { data, isLoading } = useQuery({
    queryKey: ["admin-resorts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resorts")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Resort[];
    },
  });

  async function save() {
    if (!editing) return;
    const { error } = await supabase.rpc("admin_upsert_resort", {
      p_id: editing.id ?? null,
      p_name: editing.name,
      p_region: editing.region,
    });
    if (error) {
      Alert.alert("Hata", error.message);
      return;
    }
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["admin-resorts"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
  }

  async function remove(id: string) {
    Alert.alert("Pisti sil", "Bu pist silinecek. Devam edilsin mi?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.rpc("admin_delete_resort", {
            p_id: id,
          });
          if (error) Alert.alert("Hata", error.message);
          else {
            qc.invalidateQueries({ queryKey: ["admin-resorts"] });
            qc.invalidateQueries({ queryKey: ["admin-stats"] });
          }
        },
      },
    ]);
  }

  return (
    <>
      <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
        <AdminButton
          label="Pist Ekle"
          icon="plus"
          size="sm"
          onPress={() => setEditing({ name: "", region: "" })}
        />
      </View>

      {editing ? (
        <AdminCard padding={14}>
          <Text
            style={{
              color: adminTheme.textMuted,
              fontFamily: adminTheme.fontTitle,
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              marginBottom: 10,
            }}
          >
            {editing.id ? "Pisti Düzenle" : "Yeni Pist"}
          </Text>
          <View style={{ gap: 10 }}>
            <AdminInput
              label="Ad"
              value={editing.name}
              onChangeText={(t) => setEditing({ ...editing, name: t })}
              placeholder="Örn. Erciyes"
            />
            <AdminInput
              label="Bölge"
              value={editing.region}
              onChangeText={(t) => setEditing({ ...editing, region: t })}
              placeholder="Örn. Kayseri"
            />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              <View style={{ flex: 1 }}>
                <AdminButton
                  label="Vazgeç"
                  tone="ghost"
                  onPress={() => setEditing(null)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <AdminButton label="Kaydet" onPress={save} />
              </View>
            </View>
          </View>
        </AdminCard>
      ) : null}

      {isLoading ? (
        <AdminSpinner />
      ) : !data || data.length === 0 ? (
        <AdminEmpty icon="map-pin" title="Henüz pist yok" />
      ) : (
        data.map((r) => (
          <AdminCard key={r.id}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: adminTheme.text,
                    fontFamily: adminTheme.fontTitle,
                    fontSize: 14,
                  }}
                >
                  {r.name}
                </Text>
                <Text
                  style={{
                    color: adminTheme.textMuted,
                    fontFamily: adminTheme.fontBody,
                    fontSize: 12,
                    marginTop: 2,
                  }}
                >
                  {r.region}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <AdminButton
                  label="Düzenle"
                  size="sm"
                  tone="ghost"
                  icon="edit-2"
                  onPress={() =>
                    setEditing({ id: r.id, name: r.name, region: r.region })
                  }
                />
                <AdminButton
                  label="Sil"
                  size="sm"
                  tone="danger"
                  icon="trash-2"
                  onPress={() => remove(r.id)}
                />
              </View>
            </View>
          </AdminCard>
        ))
      )}
    </>
  );
}

function SettingsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_config")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as AppConfig | null;
    },
  });

  // Local form state, hydrated when data loads. Stored as the strings the
  // user is typing so we can preserve in-progress edits.
  const [vat, setVat] = useState("");
  const [comm, setComm] = useState("");
  const [bank, setBank] = useState("");
  const [fee, setFee] = useState("");
  const [ssm, setSsm] = useState("");
  const [ssd, setSsd] = useState("");
  const [sem, setSem] = useState("");
  const [sed, setSed] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setVat(String((data.vat_rate * 100).toFixed(2)));
    setComm(String((data.commission_rate * 100).toFixed(2)));
    setBank(String(((data.bank_commission_rate ?? 0.04) * 100).toFixed(2)));
    setFee(String(Math.round((data.transaction_fee_kurus ?? 10000) / 100)));
    setSsm(String(data.season_start_month));
    setSsd(String(data.season_start_day));
    setSem(String(data.season_end_month));
    setSed(String(data.season_end_day));
  }, [data]);

  async function save() {
    const vatN = Number(vat) / 100;
    const commN = Number(comm) / 100;
    const bankN = Number(bank) / 100;
    const feeLira = Number(fee);
    if (Number.isNaN(vatN) || vatN < 0 || vatN > 1) {
      Alert.alert("Hata", "KDV oranı 0–100 arasında olmalı.");
      return;
    }
    if (Number.isNaN(bankN) || bankN < 0 || bankN > 1) {
      Alert.alert("Hata", "Banka komisyonu 0–100 arasında olmalı.");
      return;
    }
    if (Number.isNaN(feeLira) || feeLira < 0) {
      Alert.alert("Hata", "İşlem ücreti negatif olamaz.");
      return;
    }
    const ssmN = Number(ssm),
      ssdN = Number(ssd),
      semN = Number(sem),
      sedN = Number(sed);
    if (
      ![ssmN, semN].every((m) => m >= 1 && m <= 12) ||
      ![ssdN, sedN].every((d) => d >= 1 && d <= 31)
    ) {
      Alert.alert("Hata", "Geçersiz tarih.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("admin_update_config", {
      p_vat_rate: vatN,
      p_commission_rate: commN,
      p_season_start_month: ssmN,
      p_season_start_day: ssdN,
      p_season_end_month: semN,
      p_season_end_day: sedN,
      p_bank_commission_rate: bankN,
      p_transaction_fee_kurus: Math.round(feeLira * 100),
    });
    setSaving(false);
    if (error) {
      Alert.alert("Hata", error.message);
      return;
    }
    Alert.alert("Kaydedildi", "Ayarlar güncellendi.");
    qc.invalidateQueries({ queryKey: ["admin-config"] });
  }

  async function toggleTestMode(next: boolean) {
    const { error } = await supabase.rpc("admin_set_test_mode", { p_on: next });
    if (error) {
      Alert.alert("Hata", error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["admin-config"] });
  }

  if (isLoading) return <AdminSpinner />;
  if (!data) return <AdminEmpty title="Ayarlar yüklenemedi" />;

  return (
    <>
      <AdminCard padding={16}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: adminTheme.textMuted,
                fontFamily: adminTheme.fontTitle,
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: 0.6,
                marginBottom: 4,
              }}
            >
              Test Modu
            </Text>
            <Text
              style={{
                color: adminTheme.text,
                fontFamily: adminTheme.fontBody,
                fontSize: 13,
                lineHeight: 18,
              }}
            >
              Açıkken yeni rezervasyonlarda ödeme adımı atlanır ve booking
              "TEST" rozetiyle işaretlenir. Sadece test ortamı için.
            </Text>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: data.test_mode }}
            onPress={() => toggleTestMode(!data.test_mode)}
            style={{
              width: 56,
              height: 32,
              borderRadius: 999,
              padding: 3,
              backgroundColor: data.test_mode
                ? adminTheme.accent
                : adminTheme.surfaceMuted,
              borderWidth: 1,
              borderColor: adminTheme.border,
              justifyContent: "center",
              alignItems: data.test_mode ? "flex-end" : "flex-start",
            }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 999,
                backgroundColor: "#fff",
              }}
            />
          </Pressable>
        </View>
        {data.test_mode ? (
          <View
            style={{
              marginTop: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: 8,
              backgroundColor: adminTheme.surfaceMuted,
            }}
          >
            <Feather
              name="alert-triangle"
              size={14}
              color={adminTheme.accent}
            />
            <Text
              style={{
                color: adminTheme.text,
                fontFamily: adminTheme.fontBody,
                fontSize: 12,
                flex: 1,
              }}
            >
              Test modu aktif. Yeni rezervasyonlar gerçek ödeme almadan
              "paid" olarak işaretlenir.
            </Text>
          </View>
        ) : null}
      </AdminCard>

      <AdminCard padding={16}>
        <Text
          style={{
            color: adminTheme.textMuted,
            fontFamily: adminTheme.fontTitle,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            marginBottom: 12,
          }}
        >
          Komisyon & Vergi
        </Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <AdminInput
              label="KDV (%)"
              value={vat}
              onChangeText={setVat}
              keyboardType="decimal-pad"
              placeholder="20"
            />
          </View>
          <View style={{ flex: 1 }}>
            <AdminInput
              label="Banka komisyonu (%)"
              value={bank}
              onChangeText={setBank}
              keyboardType="decimal-pad"
              placeholder="4"
            />
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <View style={{ flex: 1 }}>
            <AdminInput
              label="İşlem ücreti (TL)"
              value={fee}
              onChangeText={setFee}
              keyboardType="decimal-pad"
              placeholder="100"
            />
          </View>
          <View style={{ flex: 1 }} />
        </View>
        <Text
          style={{
            color: adminTheme.textDim,
            fontFamily: adminTheme.fontBody,
            fontSize: 11,
            marginTop: 8,
          }}
        >
          Müşteri ödemesi = ders ücreti + KDV + işlem ücreti. Eğitmen
          alacağı = ders ücreti + KDV − banka komisyonu.
        </Text>
      </AdminCard>

      <AdminCard padding={16}>
        <Text
          style={{
            color: adminTheme.textMuted,
            fontFamily: adminTheme.fontTitle,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            marginBottom: 12,
          }}
        >
          Sezon Tarihleri
        </Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <AdminInput
              label="Başlangıç ayı"
              value={ssm}
              onChangeText={setSsm}
              keyboardType="number-pad"
              placeholder="12"
            />
          </View>
          <View style={{ flex: 1 }}>
            <AdminInput
              label="Başlangıç günü"
              value={ssd}
              onChangeText={setSsd}
              keyboardType="number-pad"
              placeholder="1"
            />
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <View style={{ flex: 1 }}>
            <AdminInput
              label="Bitiş ayı"
              value={sem}
              onChangeText={setSem}
              keyboardType="number-pad"
              placeholder="4"
            />
          </View>
          <View style={{ flex: 1 }}>
            <AdminInput
              label="Bitiş günü"
              value={sed}
              onChangeText={setSed}
              keyboardType="number-pad"
              placeholder="15"
            />
          </View>
        </View>
        <Text
          style={{
            color: adminTheme.textDim,
            fontFamily: adminTheme.fontBody,
            fontSize: 11,
            marginTop: 8,
          }}
        >
          Sezon dışı tarihler için sunucu rezervasyonları reddeder.
        </Text>
      </AdminCard>

      <AdminButton
        label={saving ? "Kaydediliyor…" : "Ayarları Kaydet"}
        icon="save"
        onPress={save}
        disabled={saving}
      />
    </>
  );
}
