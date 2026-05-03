import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Header } from "@/components/ui/Header";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { fromKurus, toKurus, formatTRY } from "@/lib/format";
import { withVat } from "@/lib/pricing";
import { supabase } from "@/lib/supabase";
import type { InstructorProfile, Resort } from "@/lib/types";

type TierKey = "p1" | "p2" | "p3" | "p4";

const TIERS: {
  key: TierKey;
  label: string;
  hint: string;
  placeholder: string;
}[] = [
  { key: "p1", label: "1 kişilik ders", hint: "kişi başı fiyat (TL)", placeholder: "2500" },
  { key: "p2", label: "2 kişilik ders", hint: "kişi başı fiyat (TL)", placeholder: "1800" },
  { key: "p3", label: "3 kişilik ders", hint: "kişi başı fiyat (TL)", placeholder: "1400" },
  { key: "p4", label: "4 ve üzeri kişilik ders", hint: "kişi başı fiyat (TL)", placeholder: "1100" },
];

export default function InstructorSetup() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [bio, setBio] = useState("");
  const [years, setYears] = useState("");
  const [tierPrices, setTierPrices] = useState<Record<TierKey, string>>({
    p1: "",
    p2: "",
    p3: "",
    p4: "",
  });
  const [certs, setCerts] = useState("");
  const [selectedResorts, setSelectedResorts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const { data: resorts } = useQuery({
    queryKey: ["resorts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resorts")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Resort[];
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instructor_profiles")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as InstructorProfile | null;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!hydrated && profile) {
      setBio(profile.bio ?? "");
      setYears(String(profile.experience_years ?? 0));
      // Hydrate from per-tier columns; fall back to the legacy flat
      // base_price so an instructor who hasn't migrated yet sees their
      // old rate prefilled in the 1-person field instead of empty inputs.
      const legacy = profile.base_price ?? 0;
      const fmt = (k: number, fb: number) =>
        k > 0 ? String(fromKurus(k)) : fb > 0 ? String(fromKurus(fb)) : "";
      setTierPrices({
        p1: fmt(profile.price_1_person ?? 0, legacy),
        p2: fmt(profile.price_2_person ?? 0, 0),
        p3: fmt(profile.price_3_person ?? 0, 0),
        p4: fmt(profile.price_4_plus_person ?? 0, 0),
      });
      setCerts((profile.certifications ?? []).join(", "));
      setSelectedResorts(profile.resort_ids ?? []);
      setHydrated(true);
    }
  }, [profile, hydrated]);

  if (!user) return <Loading />;

  function toggleResort(id: string) {
    setSelectedResorts((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  }

  function parsePrice(s: string): number {
    return parseFloat(s.replace(",", ".")) || 0;
  }

  async function save() {
    if (!user) return;
    const yearsNum = parseInt(years) || 0;
    const p1 = parsePrice(tierPrices.p1);
    const p2 = parsePrice(tierPrices.p2);
    const p3 = parsePrice(tierPrices.p3);
    const p4 = parsePrice(tierPrices.p4);
    if (!p1 || !p2 || !p3 || !p4) {
      Alert.alert("Eksik", "Lütfen 4 grup boyutu için de fiyat giriniz.");
      return;
    }
    if (selectedResorts.length === 0) {
      Alert.alert("Eksik", "En az bir pist seçiniz.");
      return;
    }
    setSaving(true);
    const payload = {
      user_id: user.id,
      bio,
      experience_years: yearsNum,
      // Keep base_price in sync with the 1-person rate so older clients
      // / fallbacks still see a sensible value.
      base_price: toKurus(p1),
      price_1_person: toKurus(p1),
      price_2_person: toKurus(p2),
      price_3_person: toKurus(p3),
      price_4_plus_person: toKurus(p4),
      certifications: certs
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      resort_ids: selectedResorts,
    };

    try {
      const sessionResp = await supabase.auth.getSession();
      if (!sessionResp.data.session) {
        Alert.alert(
          "Oturum yok",
          "Lütfen tekrar giriş yapın. (no active session)",
        );
        return;
      }

      const ensureResp = await supabase.rpc("ensure_my_user", {
        p_name: user.name ?? "",
      });
      if (ensureResp.error) {
        const e = ensureResp.error;
        Alert.alert(
          "Kullanıcı satırı oluşturulamadı",
          [
            "Önce kullanıcı kaydınız hazırlanırken hata oluştu.",
            "",
            `message: ${e.message ?? "(none)"}`,
            `code: ${e.code ?? "(none)"}`,
          ].join("\n"),
        );
        return;
      }

      const upsertPromise = supabase
        .from("instructor_profiles")
        .upsert(payload, { onConflict: "user_id" })
        .select()
        .single();

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Supabase upsert timed out after 15s")),
          15_000,
        ),
      );

      const result = (await Promise.race([upsertPromise, timeoutPromise])) as
        | Awaited<typeof upsertPromise>
        | never;

      if (result.error) {
        const e = result.error;
        Alert.alert(
          "Kaydedilemedi",
          [
            `message: ${e.message ?? "(none)"}`,
            `code: ${e.code ?? "(none)"}`,
            `details: ${e.details ?? "(none)"}`,
            `hint: ${e.hint ?? "(none)"}`,
          ].join("\n"),
        );
        return;
      }

      qc.invalidateQueries({ queryKey: ["my-profile", user.id] });
      qc.invalidateQueries({ queryKey: ["instructors"] });
      Alert.alert("Kaydedildi", "Profiliniz güncellendi.", [
        { text: "Tamam", onPress: () => router.back() },
      ]);
    } catch (err) {
      const e = err as Error;
      Alert.alert(
        "Beklenmeyen hata",
        `${e.name ?? "Error"}: ${e.message ?? String(err)}`,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen contentStyle={{ gap: 18 }}>
      <Header
        eyebrow="Profil Kurulumu"
        title="Vitrinin"
        subtitle="Öğrenciler bu bilgileri görerek seni seçecek."
      />

      <View style={{ gap: 12 }}>
        <View>
          <Text
            style={{
              color: c.mutedForeground,
              fontFamily: "Inter_500Medium",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              marginBottom: 6,
            }}
          >
            Hakkında
          </Text>
          <Input
            placeholder="Birkaç cümle ile kendini tanıt..."
            multiline
            numberOfLines={4}
            value={bio}
            onChangeText={setBio}
            style={{ minHeight: 110, textAlignVertical: "top" }}
          />
        </View>

        <Input
          label="Deneyim (yıl)"
          keyboardType="number-pad"
          value={years}
          onChangeText={setYears}
          placeholder="0"
        />

        {/* TIERED PRICING */}
        <View style={{ gap: 10, marginTop: 4 }}>
          <Text
            style={{
              color: c.foreground,
              fontFamily: "Fraunces_600SemiBold",
              fontSize: 17,
              letterSpacing: -0.2,
            }}
          >
            Ders ücretleri (kişi başı, 50 dakika)
          </Text>
          <View style={{ gap: 10 }}>
            {TIERS.map((t) => {
              const value = tierPrices[t.key];
              const num = parsePrice(value);
              const withTax = num > 0 ? withVat(toKurus(num)) : 0;
              return (
                <View key={t.key} style={{ gap: 4 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <View style={{ flex: 1.4 }}>
                      <Text
                        style={{
                          color: c.foreground,
                          fontFamily: "Inter_600SemiBold",
                          fontSize: 14,
                        }}
                      >
                        {t.label}
                      </Text>
                      <Text
                        style={{
                          color: c.mutedForeground,
                          fontFamily: "Inter_400Regular",
                          fontSize: 11,
                          marginTop: 2,
                        }}
                      >
                        {t.hint}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Input
                        keyboardType="decimal-pad"
                        value={value}
                        onChangeText={(v) =>
                          setTierPrices((cur) => ({ ...cur, [t.key]: v }))
                        }
                        placeholder={t.placeholder}
                      />
                    </View>
                  </View>
                  {withTax > 0 ? (
                    <Text
                      style={{
                        color: c.mutedForeground,
                        fontFamily: "Inter_500Medium",
                        fontSize: 11,
                        marginLeft: 2,
                      }}
                    >
                      Müşteriye gösterilen: {formatTRY(withTax)} / kişi (KDV
                      dahil)
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
          <Card tone="soft" padding={12}>
            <Text
              style={{
                color: c.mutedForeground,
                fontFamily: "Inter_400Regular",
                fontSize: 12,
                lineHeight: 18,
              }}
            >
              Tüm fiyatlar kişi başı olarak girilir. KDV otomatik eklenir ve
              müşteriye toplam tutar gösterilir.
            </Text>
          </Card>
        </View>

        <Input
          label="Sertifikalar (virgülle ayır)"
          value={certs}
          onChangeText={setCerts}
          placeholder="ISIA Level 2, TKF Antrenör"
        />
      </View>

      <View style={{ gap: 10, marginTop: 8 }}>
        <Text
          style={{
            color: c.mutedForeground,
            fontFamily: "Inter_500Medium",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 0.6,
          }}
        >
          Çalıştığım pistler
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(resorts ?? []).map((r) => {
            const active = selectedResorts.includes(r.id);
            return (
              <Pressable
                key={r.id}
                onPress={() => toggleResort(r.id)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 999,
                  borderWidth: 1.5,
                  borderColor: active ? c.accent : c.borderSoft,
                  backgroundColor: active ? c.accentSoft : c.card,
                }}
              >
                <Text
                  style={{
                    color: active ? c.accentDeep : c.foreground,
                    fontFamily: "Inter_600SemiBold",
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

      <Card tone="soft" padding={14}>
        <Text
          style={{
            color: c.foreground,
            fontFamily: "Inter_600SemiBold",
            fontSize: 13,
          }}
        >
          Komisyon: %3
        </Text>
        <Text
          style={{
            color: c.mutedForeground,
            fontFamily: "Inter_400Regular",
            fontSize: 12,
            marginTop: 4,
            lineHeight: 18,
          }}
        >
          Her dersten %3 platform komisyonu kesilir. Ödemeler ders tarihinden
          21 iş günü sonra hesabınıza aktarılır.
        </Text>
      </Card>

      <Button variant="accent" label="Kaydet" loading={saving} onPress={save} />
    </Screen>
  );
}

const styles = StyleSheet.create({});
