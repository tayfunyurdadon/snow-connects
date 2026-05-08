import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";

import {
  AdminButton,
  AdminCard,
  AdminInput,
  AdminScreen,
  AdminSpinner,
} from "@/components/admin/AdminUI";
import { useAuth } from "@/contexts/AuthContext";
import { adminTheme } from "@/lib/adminTheme";
import { supabase } from "@/lib/supabase";
import type { SkiSchool } from "@/lib/types";

export default function SchoolProfile() {
  const qc = useQueryClient();
  const { signOut } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["school-profile"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ski_schools")
        .select("*")
        .eq("admin_user_id", (await supabase.auth.getUser()).data.user?.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as SkiSchool | null;
    },
  });

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [iban, setIban] = useState("");
  const [holder, setHolder] = useState("");
  const [sharePct, setSharePct] = useState("35");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setDesc(data.description);
    setIban(data.iban);
    setHolder(data.iban_holder_name);
    setSharePct(String(Math.round((data.instructor_share_rate ?? 0.35) * 100)));
  }, [data]);

  async function save() {
    const pctNum = parseInt(sharePct, 10);
    if (Number.isNaN(pctNum) || pctNum < 0 || pctNum > 100) {
      Alert.alert("Hatalı oran", "Eğitmen payı 0 ile 100 arasında olmalı.");
      return;
    }
    setSaving(true);
    // Save share rate first; if it fails, the profile fields remain
    // unchanged so the two stay in sync.
    const rateRes = await supabase.rpc("school_update_share_rate", {
      p_rate: pctNum / 100,
    });
    if (rateRes.error) {
      setSaving(false);
      Alert.alert("Hata", rateRes.error.message);
      return;
    }
    const profileRes = await supabase.rpc("school_update_profile", {
      p_name: name,
      p_description: desc,
      p_logo: null,
      p_iban: iban,
      p_iban_holder_name: holder,
    });
    setSaving(false);
    if (profileRes.error) {
      Alert.alert("Hata", profileRes.error.message);
      return;
    }
    Alert.alert("Kaydedildi", "Okul profili güncellendi.");
    qc.invalidateQueries({ queryKey: ["school-profile"] });
    qc.invalidateQueries({ queryKey: ["school-summary"] });
    qc.invalidateQueries({ queryKey: ["school-instructor-breakdown"] });
  }

  const pctNum = parseInt(sharePct, 10);
  const schoolPct =
    Number.isNaN(pctNum) || pctNum < 0 || pctNum > 100 ? null : 100 - pctNum;

  if (isLoading) return <AdminScreen><AdminSpinner /></AdminScreen>;
  if (!data)
    return (
      <AdminScreen>
        <Text
          style={{
            color: adminTheme.textMuted,
            fontFamily: adminTheme.fontBody,
            fontSize: 13,
          }}
        >
          Okul bulunamadı. Lütfen platform yöneticisi ile iletişime geç.
        </Text>
      </AdminScreen>
    );

  return (
    <AdminScreen>
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
          Okul Bilgileri
        </Text>
        <View style={{ gap: 10 }}>
          <AdminInput label="Okul adı" value={name} onChangeText={setName} />
          <AdminInput
            label="Açıklama"
            value={desc}
            onChangeText={setDesc}
            multiline
          />
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
          Gelir Paylaşımı
        </Text>
        <AdminInput
          label="Eğitmen payı (%)"
          value={sharePct}
          onChangeText={(t) => setSharePct(t.replace(/[^0-9]/g, ""))}
          keyboardType="number-pad"
          placeholder="35"
        />
        <Text
          style={{
            color:
              schoolPct === null ? adminTheme.danger : adminTheme.textDim,
            fontFamily: adminTheme.fontBody,
            fontSize: 11,
            marginTop: 8,
          }}
        >
          {schoolPct === null
            ? "Oran 0 ile 100 arasında olmalı."
            : `Eğitmen %${pctNum} · Okul %${schoolPct}. Tüm rezervasyonlara (online + manuel) uygulanır.`}
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
          Ödeme — IBAN
        </Text>
        <View style={{ gap: 10 }}>
          <AdminInput
            label="IBAN"
            value={iban}
            onChangeText={setIban}
            autoCapitalize="characters"
            placeholder="TR.. .. .. .. .. .. ..  ..  .."
          />
          <AdminInput
            label="Hesap sahibi"
            value={holder}
            onChangeText={setHolder}
          />
        </View>
        <Text
          style={{
            color: adminTheme.textDim,
            fontFamily: adminTheme.fontBody,
            fontSize: 11,
            marginTop: 8,
          }}
        >
          Okuluna bağlı eğitmenlerin tüm ödemeleri bu IBAN'a yatar.
        </Text>
      </AdminCard>

      <AdminButton
        label={saving ? "Kaydediliyor…" : "Kaydet"}
        icon="save"
        onPress={save}
        disabled={saving}
      />

      <AdminButton
        label="Çıkış Yap"
        tone="ghost"
        icon="log-out"
        onPress={signOut}
      />
    </AdminScreen>
  );
}
