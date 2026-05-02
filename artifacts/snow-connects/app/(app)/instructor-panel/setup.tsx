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
import { supabase } from "@/lib/supabase";
import type { InstructorProfile, Resort } from "@/lib/types";

export default function InstructorSetup() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [bio, setBio] = useState("");
  const [years, setYears] = useState("");
  const [priceTry, setPriceTry] = useState("");
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
      setPriceTry(String(fromKurus(profile.base_price ?? 0)));
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

  async function save() {
    if (!user) return;
    const yearsNum = parseInt(years) || 0;
    const priceNum = parseFloat(priceTry.replace(",", ".")) || 0;
    if (!priceNum) {
      Alert.alert("Eksik", "Saatlik ücret giriniz.");
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
      base_price: toKurus(priceNum),
      certifications: certs
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      resort_ids: selectedResorts,
    };

    console.log("[instructor-setup] starting save", {
      userId: user.id,
      role: user.role,
      payload,
    });

    try {
      const sessionResp = await supabase.auth.getSession();
      console.log("[instructor-setup] session check", {
        hasSession: !!sessionResp.data.session,
        sessionUserId: sessionResp.data.session?.user.id,
        contextUserId: user.id,
        match: sessionResp.data.session?.user.id === user.id,
      });
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
      console.log("[instructor-setup] ensure_my_user", {
        error: ensureResp.error,
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
            `details: ${e.details ?? "(none)"}`,
            `hint: ${e.hint ?? "(none)"}`,
            "",
            "Şemanın güncel olduğundan emin olun (supabase/schema.sql).",
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

      console.log("[instructor-setup] upsert response", {
        data: result.data,
        error: result.error,
      });

      if (result.error) {
        const e = result.error;
        console.warn("[instructor-setup] upsert failed", {
          message: e.message,
          code: e.code,
          details: e.details,
          hint: e.hint,
        });
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
      console.warn("[instructor-setup] save threw", {
        name: e.name,
        message: e.message,
        stack: e.stack,
      });
      Alert.alert(
        "Beklenmeyen hata",
        `${e.name ?? "Error"}: ${e.message ?? String(err)}`,
      );
    } finally {
      setSaving(false);
    }
  }

  const previewPrice = toKurus(parseFloat(priceTry.replace(",", ".")) || 0);

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

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Input
              label="Deneyim (yıl)"
              keyboardType="number-pad"
              value={years}
              onChangeText={setYears}
              placeholder="0"
            />
          </View>
          <View style={{ flex: 1.4 }}>
            <Input
              label="Saatlik (TL)"
              keyboardType="decimal-pad"
              value={priceTry}
              onChangeText={setPriceTry}
              placeholder="800"
            />
          </View>
        </View>

        {previewPrice ? (
          <Card tone="soft" padding={12}>
            <Text
              style={{
                color: c.mutedForeground,
                fontFamily: "Inter_500Medium",
                fontSize: 12,
              }}
            >
              Müşteriye gösterilen:{" "}
              <Text style={{ color: c.foreground, fontFamily: "Inter_700Bold" }}>
                {formatTRY(Math.round(previewPrice * 1.2))}
              </Text>{" "}
              (KDV dahil)
            </Text>
          </Card>
        ) : null}

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
          Her dersten %3 platform komisyonu kesilir. Ödemeler ders tarihinden 21
          iş günü sonra hesabınıza aktarılır.
        </Text>
      </Card>

      <Button variant="accent" label="Kaydet" loading={saving} onPress={save} />
    </Screen>
  );
}

const styles = StyleSheet.create({});
