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
  const [price1, setPrice1] = useState("");
  const [price2, setPrice2] = useState("");
  const [price3, setPrice3] = useState("");
  const [price4, setPrice4] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setDesc(data.description);
    setIban(data.iban);
    setHolder(data.iban_holder_name);
    setSharePct(String(Math.round((data.instructor_share_rate ?? 0.35) * 100)));
    // kuruş → TL display, preserving cent precision (empty if 0 so the
    // placeholder shows). Trims trailing ".00" for whole-TL prices.
    const k2tl = (k: number) => {
      if (!k || k <= 0) return "";
      const tl = (k / 100).toFixed(2);
      return tl.endsWith(".00") ? tl.slice(0, -3) : tl.replace(/0$/, "");
    };
    setPrice1(k2tl(data.price_1_kurus ?? 0));
    setPrice2(k2tl(data.price_2_kurus ?? 0));
    setPrice3(k2tl(data.price_3_kurus ?? 0));
    setPrice4(k2tl(data.price_4plus_kurus ?? 0));
  }, [data]);

  async function save() {
    const pctNum = parseInt(sharePct, 10);
    if (Number.isNaN(pctNum) || pctNum < 0 || pctNum > 100) {
      Alert.alert("Hatalı oran", "Eğitmen payı 0 ile 100 arasında olmalı.");
      return;
    }
    const tl2k = (s: string) => {
      const n = parseFloat(s);
      if (Number.isNaN(n) || n < 0) return 0;
      return Math.round(n * 100);
    };
    const p1k = tl2k(price1);
    const p2k = tl2k(price2);
    const p3k = tl2k(price3);
    const p4k = tl2k(price4);

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
    const pricingRes = await supabase.rpc("school_update_pricing", {
      p_price_1: p1k,
      p_price_2: p2k,
      p_price_3: p3k,
      p_price_4plus: p4k,
    });
    if (pricingRes.error) {
      setSaving(false);
      Alert.alert("Hata", pricingRes.error.message);
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
            marginBottom: 6,
          }}
        >
          Ders Fiyatlandırması
        </Text>
        <Text
          style={{
            color: adminTheme.textDim,
            fontFamily: adminTheme.fontBody,
            fontSize: 11,
            marginBottom: 12,
          }}
        >
          50 dakikalık tek seans için kişi başı fiyat (TL). Manuel
          rezervasyonlarda öğrenci sayısına göre tutar otomatik hesaplanır,
          istersen kayıt sırasında değiştirebilirsin.
        </Text>
        <View style={{ gap: 10 }}>
          <AdminInput
            label="1 kişi · 50 dk"
            value={price1}
            onChangeText={(t) => setPrice1(t.replace(/[^0-9.]/g, ""))}
            keyboardType="decimal-pad"
            placeholder="0"
          />
          <AdminInput
            label="2 kişi · 50 dk · kişi başı"
            value={price2}
            onChangeText={(t) => setPrice2(t.replace(/[^0-9.]/g, ""))}
            keyboardType="decimal-pad"
            placeholder="0"
          />
          <AdminInput
            label="3 kişi · 50 dk · kişi başı"
            value={price3}
            onChangeText={(t) => setPrice3(t.replace(/[^0-9.]/g, ""))}
            keyboardType="decimal-pad"
            placeholder="0"
          />
          <AdminInput
            label="4+ kişi · 50 dk · kişi başı"
            value={price4}
            onChangeText={(t) => setPrice4(t.replace(/[^0-9.]/g, ""))}
            keyboardType="decimal-pad"
            placeholder="0"
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
