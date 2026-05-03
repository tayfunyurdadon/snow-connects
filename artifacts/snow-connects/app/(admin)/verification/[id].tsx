import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Header } from "@/components/ui/Header";
import { Loading } from "@/components/ui/Loading";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { getSignedDocUrl } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import type {
  AppUser,
  InstructorProfile,
  InstructorVerification,
  VerificationStatus,
} from "@/lib/types";
import { formatIban, VERIFICATION_LABELS } from "@/lib/verification";

interface DetailRow {
  user: Pick<AppUser, "id" | "name" | "email" | "phone">;
  profile: Pick<InstructorProfile, "verification_status" | "photo">;
  verification: InstructorVerification | null;
}

export default function AdminVerificationDetail() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const isAdmin = user?.role === "admin";

  const { data, isLoading } = useQuery({
    enabled: !!id && isAdmin,
    queryKey: ["admin-verification-detail", id],
    queryFn: async (): Promise<DetailRow | null> => {
      const [{ data: u }, { data: p }, { data: v }] = await Promise.all([
        supabase
          .from("users")
          .select("id, name, email, phone")
          .eq("id", id!)
          .maybeSingle(),
        supabase
          .from("instructor_profiles")
          .select("verification_status, photo")
          .eq("user_id", id!)
          .maybeSingle(),
        supabase
          .from("instructor_verification")
          .select("*")
          .eq("user_id", id!)
          .maybeSingle(),
      ]);
      if (!u || !p) return null;
      return {
        user: u as DetailRow["user"],
        profile: p as DetailRow["profile"],
        verification: (v ?? null) as InstructorVerification | null,
      };
    },
  });

  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (!isAdmin) {
    return (
      <Screen>
        <Text style={{ color: c.foreground }}>Bu sayfa yöneticilere özeldir.</Text>
      </Screen>
    );
  }
  if (isLoading) return <Loading />;
  if (!data) {
    return (
      <Screen>
        <Text style={{ color: c.foreground }}>Başvuru bulunamadı.</Text>
      </Screen>
    );
  }

  const { user: u, profile, verification: v } = data;
  const status = profile.verification_status;
  const meta = VERIFICATION_LABELS[status];

  async function approve() {
    setBusy(true);
    const { error } = await supabase.rpc("admin_approve_instructor", {
      p_user: id!,
    });
    setBusy(false);
    if (error) {
      Alert.alert("Hata", error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["admin-verifications"] });
    qc.invalidateQueries({ queryKey: ["admin-verification-detail", id] });
    Alert.alert("Onaylandı", "Eğitmen aktif edildi.", [
      { text: "Tamam", onPress: () => router.back() },
    ]);
  }

  async function reject() {
    if (!reason.trim()) {
      Alert.alert("Sebep gerekli", "Lütfen ret sebebini yazın.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("admin_reject_instructor", {
      p_user: id!,
      p_reason: reason.trim(),
    });
    setBusy(false);
    if (error) {
      Alert.alert("Hata", error.message);
      return;
    }
    setRejectOpen(false);
    qc.invalidateQueries({ queryKey: ["admin-verifications"] });
    qc.invalidateQueries({ queryKey: ["admin-verification-detail", id] });
    Alert.alert("Reddedildi", "Eğitmene bildirildi.", [
      { text: "Tamam", onPress: () => router.back() },
    ]);
  }

  return (
    <Screen contentStyle={{ gap: 16, paddingBottom: 100 }}>
      <Header
        eyebrow="Başvuru incelemesi"
        title={u.name || "İsimsiz"}
        subtitle={u.email ?? ""}
      />

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pill
          label={meta.label}
          tone={meta.tone === "default" ? "warning" : meta.tone}
        />
        {v?.submitted_at ? (
          <Pill
            label={`Gönderim: ${new Date(v.submitted_at).toLocaleDateString("tr-TR")}`}
            tone="default"
          />
        ) : null}
      </View>

      <SectionCard title="Kişi">
        <KV k="Ad Soyad" v={u.name} />
        <KV k="E-posta" v={u.email} />
        <KV k="Telefon" v={u.phone} />
      </SectionCard>

      <SectionCard title="Sertifika">
        <KV k="Tür" v={v?.cert_type} />
        <KV k="Numara" v={v?.cert_number} />
        <KV k="Veriliş" v={v?.cert_issued_at} />
        <KV k="Geçerlilik" v={v?.cert_expires_at ?? "—"} />
        <SignedDoc label="Sertifika belgesi" path={v?.cert_doc_path} />
      </SectionCard>

      <SectionCard title="Kimlik">
        <KV k="TC Kimlik No" v={v?.tc_kimlik_no} mono />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <SignedDoc label="Ön yüz" path={v?.id_front_path} compact />
          </View>
          <View style={{ flex: 1 }}>
            <SignedDoc label="Arka yüz" path={v?.id_back_path} compact />
          </View>
        </View>
      </SectionCard>

      <SectionCard title="Profil fotoğrafı">
        <SignedDoc label="Profil" path={profile.photo} />
      </SectionCard>

      <SectionCard title="Banka">
        <KV k="IBAN" v={v?.iban ? formatIban(v.iban) : null} mono />
        <KV k="Hesap sahibi" v={v?.iban_holder_name} />
      </SectionCard>

      {status === "rejected" && v?.rejection_reason ? (
        <Card padding={14}>
          <Text
            style={{
              color: c.danger,
              fontFamily: "Inter_700Bold",
              fontSize: 12,
              marginBottom: 4,
            }}
          >
            Önceki ret sebebi
          </Text>
          <Text style={{ color: c.foreground, fontFamily: "Inter_400Regular" }}>
            {v.rejection_reason}
          </Text>
        </Card>
      ) : null}

      {status === "pending_review" || status === "rejected" ? (
        <View style={{ gap: 10, marginTop: 8 }}>
          <Button
            variant="accent"
            size="lg"
            label={busy ? "İşleniyor…" : "Onayla"}
            loading={busy}
            onPress={approve}
          />
          <Button
            variant="ghost"
            size="lg"
            label="Reddet"
            onPress={() => setRejectOpen(true)}
          />
        </View>
      ) : status === "approved" ? (
        <Pill label="Onaylı – aktif" tone="success" />
      ) : null}

      <Modal
        visible={rejectOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setRejectOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}
          onPress={() => setRejectOpen(false)}
        />
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: c.background,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 20,
            paddingBottom: 36,
            gap: 12,
          }}
        >
          <Text
            style={{
              color: c.foreground,
              fontFamily: "Fraunces_600SemiBold",
              fontSize: 18,
            }}
          >
            Ret sebebi
          </Text>
          <Text
            style={{
              color: c.mutedForeground,
              fontFamily: "Inter_400Regular",
              fontSize: 13,
            }}
          >
            Eğitmene neyin yanlış olduğunu açıklayan kısa bir mesaj yazın. Bu
            mesaj kendisine gösterilecek.
          </Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={4}
            placeholder="Örn. Sertifika fotoğrafı bulanık, lütfen netleştirip tekrar yükleyin."
            placeholderTextColor={c.mutedForeground}
            style={{
              backgroundColor: c.card,
              borderRadius: c.radius,
              borderWidth: 1,
              borderColor: c.borderSoft,
              padding: 14,
              minHeight: 110,
              color: c.foreground,
              fontFamily: "Inter_400Regular",
              fontSize: 14,
              textAlignVertical: "top",
            }}
          />
          <Button
            variant="accent"
            size="lg"
            label="Reddet ve bildir"
            loading={busy}
            onPress={reject}
          />
        </View>
      </Modal>
    </Screen>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const c = useColors();
  return (
    <Card padding={16}>
      <Text
        style={{
          color: c.mutedForeground,
          fontFamily: "Inter_700Bold",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          marginBottom: 10,
        }}
      >
        {title}
      </Text>
      <View style={{ gap: 8 }}>{children}</View>
    </Card>
  );
}

function KV({
  k,
  v,
  mono,
}: {
  k: string;
  v: string | null | undefined;
  mono?: boolean;
}) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 12,
        justifyContent: "space-between",
      }}
    >
      <Text
        style={{
          color: c.mutedForeground,
          fontFamily: "Inter_500Medium",
          fontSize: 13,
        }}
      >
        {k}
      </Text>
      <Text
        style={{
          color: c.foreground,
          fontFamily: mono ? "Inter_500Medium" : "Inter_600SemiBold",
          fontSize: 13,
          flex: 1,
          textAlign: "right",
        }}
      >
        {v ?? "—"}
      </Text>
    </View>
  );
}

function SignedDoc({
  label,
  path,
  compact,
}: {
  label: string;
  path: string | null | undefined;
  compact?: boolean;
}) {
  const c = useColors();
  const { data: url, isLoading } = useQuery({
    queryKey: ["signed-doc", path],
    queryFn: () => getSignedDocUrl(path),
    enabled: !!path,
    staleTime: 30 * 60 * 1000,
  });

  if (!path) {
    return (
      <View
        style={{
          padding: 12,
          borderRadius: c.radius,
          borderWidth: 1,
          borderStyle: "dashed",
          borderColor: c.borderSoft,
          alignItems: "center",
        }}
      >
        <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
          {label}: yok
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{
          color: c.mutedForeground,
          fontFamily: "Inter_500Medium",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        {label}
      </Text>
      {isLoading || !url ? (
        <View
          style={{
            height: compact ? 120 : 220,
            borderRadius: c.radius,
            backgroundColor: c.secondary,
          }}
        />
      ) : (
        <Image
          source={{ uri: url }}
          style={{
            width: "100%",
            height: compact ? 120 : 220,
            borderRadius: c.radius,
            resizeMode: "cover",
            backgroundColor: c.secondary,
          }}
        />
      )}
    </View>
  );
}
