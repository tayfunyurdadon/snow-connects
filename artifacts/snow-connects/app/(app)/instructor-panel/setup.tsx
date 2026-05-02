import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
      // Verify the session is still valid before writing — RLS upserts
      // silently fail with cryptic messages when auth.uid() is null.
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

      // Self-heal a missing public.users row before the upsert. The most
      // common cause of a stuck save is a FK violation against users.id
      // because the handle_new_user trigger never ran (older accounts).
      // ensure_my_user is a SECURITY DEFINER RPC that is idempotent.
      // Role is derived server-side from auth.users.raw_user_meta_data — we
      // do not pass it in (the RPC ignores client-supplied roles to prevent
      // privilege escalation).
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

      // Race the upsert against a 15s timeout so the spinner can't hang
      // forever on a stuck network request.
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
        // PostgREST returns code/details/hint that explain RLS / schema
        // / FK violations far better than the bare `message` alone.
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
      // Always release the spinner so the button can never get stuck again.
      setSaving(false);
    }
  }

  const previewPrice = toKurus(
    parseFloat(priceTry.replace(",", ".")) || 0,
  );

  return (
    <Screen contentStyle={{ gap: 14 }}>
      <Text style={[styles.h, { color: c.foreground }]}>Hakkında</Text>
      <Input
        placeholder="Birkaç cümle ile kendinizi tanıtın..."
        multiline
        numberOfLines={4}
        value={bio}
        onChangeText={setBio}
        style={{ minHeight: 100, textAlignVertical: "top" }}
      />

      <Input
        label="Deneyim (yıl)"
        keyboardType="number-pad"
        value={years}
        onChangeText={setYears}
        placeholder="0"
      />

      <Input
        label="Saatlik ücret (TL)"
        keyboardType="decimal-pad"
        value={priceTry}
        onChangeText={setPriceTry}
        placeholder="800"
        helperText={
          previewPrice
            ? `Müşteriye gösterilen: ${formatTRY(Math.round(previewPrice * 1.2))} (KDV dahil)`
            : "KDV otomatik eklenir"
        }
      />

      <Input
        label="Sertifikalar (virgülle ayır)"
        value={certs}
        onChangeText={setCerts}
        placeholder="ISIA Level 2, TKF Antrenör"
      />

      <Text style={[styles.h, { color: c.foreground, marginTop: 8 }]}>
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
                borderRadius: c.radius,
                borderWidth: 1,
                borderColor: active ? c.primary : c.border,
                backgroundColor: active ? c.secondary : c.card,
              }}
            >
              <Text
                style={{
                  color: active ? c.primary : c.foreground,
                  fontFamily: "Inter_500Medium",
                }}
              >
                {r.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Card style={{ backgroundColor: c.muted }}>
        <Text style={{ color: c.foreground, fontFamily: "Inter_500Medium" }}>
          Komisyon: %3
        </Text>
        <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 4 }}>
          Her dersten %3 platform komisyonu kesilir. Ödemeler ders tarihinden 21
          iş günü sonra hesabınıza aktarılır.
        </Text>
      </Card>

      <Button label="Kaydet" loading={saving} onPress={save} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  h: { fontFamily: "Inter_700Bold", fontSize: 18 },
});
