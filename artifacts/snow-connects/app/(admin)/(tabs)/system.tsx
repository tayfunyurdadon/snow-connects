import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";

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
import type { AppConfig, Resort } from "@/lib/types";

type SubTab = "resorts" | "settings";

export default function AdminSystem() {
  const [sub, setSub] = useState<SubTab>("resorts");
  return (
    <AdminScreen>
      <AdminTabRow
        value={sub}
        onChange={setSub}
        options={[
          { id: "resorts", label: "Pistler" },
          { id: "settings", label: "Ayarlar" },
        ]}
      />
      {sub === "resorts" ? <ResortsTab /> : <SettingsTab />}
    </AdminScreen>
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
  const [ssm, setSsm] = useState("");
  const [ssd, setSsd] = useState("");
  const [sem, setSem] = useState("");
  const [sed, setSed] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setVat(String((data.vat_rate * 100).toFixed(2)));
    setComm(String((data.commission_rate * 100).toFixed(2)));
    setSsm(String(data.season_start_month));
    setSsd(String(data.season_start_day));
    setSem(String(data.season_end_month));
    setSed(String(data.season_end_day));
  }, [data]);

  async function save() {
    const vatN = Number(vat) / 100;
    const commN = Number(comm) / 100;
    if (Number.isNaN(vatN) || vatN < 0 || vatN > 1) {
      Alert.alert("Hata", "KDV oranı 0–100 arasında olmalı.");
      return;
    }
    if (Number.isNaN(commN) || commN < 0 || commN > 1) {
      Alert.alert("Hata", "Komisyon oranı 0–100 arasında olmalı.");
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
    });
    setSaving(false);
    if (error) {
      Alert.alert("Hata", error.message);
      return;
    }
    Alert.alert("Kaydedildi", "Ayarlar güncellendi.");
    qc.invalidateQueries({ queryKey: ["admin-config"] });
  }

  if (isLoading) return <AdminSpinner />;
  if (!data) return <AdminEmpty title="Ayarlar yüklenemedi" />;

  return (
    <>
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
              label="Komisyon (%)"
              value={comm}
              onChangeText={setComm}
              keyboardType="decimal-pad"
              placeholder="3"
            />
          </View>
        </View>
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
