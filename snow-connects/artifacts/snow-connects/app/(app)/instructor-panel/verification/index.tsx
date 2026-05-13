import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Header } from "@/components/ui/Header";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { SignInGate } from "@/components/ui/SignInGate";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { uploadInstructorDoc } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import {
  CERTIFICATE_TYPES,
  type CertificateType,
  type InstructorVerification,
  type VerificationStatus,
} from "@/lib/types";
import {
  formatIban,
  isValidTcKimlik,
  isValidTrIban,
  VERIFICATION_LABELS,
} from "@/lib/verification";

type DocKind = "cert" | "id-front" | "id-back" | "photo";

interface PickedDoc {
  uri: string;
  mimeType?: string | null;
}

export default function VerificationScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();

  // Profile + verification snapshot, used to drive what we render.
  const { data: snapshot, isLoading } = useQuery({
    queryKey: ["my-verification", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const [{ data: prof }, { data: ver }] = await Promise.all([
        supabase
          .from("instructor_profiles")
          .select("verification_status, photo")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("instructor_verification")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      return {
        status: ((prof?.verification_status as VerificationStatus) ??
          "pending_documents") as VerificationStatus,
        photo: (prof?.photo as string) ?? "",
        verification: (ver ?? null) as InstructorVerification | null,
      };
    },
    enabled: !!user,
  });

  const status = snapshot?.status;

  // Approved → punt them to the pricing setup; they don't need this screen.
  // Hook must run on every render (no early-returns above it) to satisfy
  // the rules of hooks.
  useEffect(() => {
    if (status === "approved") {
      router.replace("/(app)/instructor-panel/setup");
    }
  }, [status, router]);

  if (!user) return <SignInGate />;
  if (isLoading || !snapshot || !status) return <Loading />;
  if (status === "approved") return <Loading />;

  if (status === "pending_review") {
    return (
      <StatusView
        title="Belgeleriniz incelemede"
        description="Başvurunuz alındı. Genellikle 1-2 iş günü içinde sonuçlandırırız. Onaylandığında e-posta ile bilgilendirileceksiniz."
        tone="warning"
        icon="clock"
        submittedAt={snapshot.verification?.submitted_at}
      />
    );
  }

  if (status === "suspended") {
    return (
      <StatusView
        title="Hesabınız askıya alındı"
        description="Hesabınız geçici olarak devre dışı bırakıldı. Detaylı bilgi için destek ekibimiz ile iletişime geçin."
        tone="danger"
        icon="slash"
        action={{
          label: "Destek ile iletişim",
          onPress: () => router.push("/(app)/support"),
        }}
      />
    );
  }

  // pending_documents OR rejected → show the upload form. For 'rejected' we
  // surface the rejection reason at the top so the instructor knows what to fix.
  return (
    <UploadForm
      userId={user.id}
      status={status}
      previous={snapshot.verification}
      onSubmitted={async () => {
        await qc.invalidateQueries({ queryKey: ["my-verification", user.id] });
        await qc.invalidateQueries({
          queryKey: ["my-verification-status", user.id],
        });
      }}
    />
  );
}

// ─────────────────────────── Status view ───────────────────────────

function StatusView(props: {
  title: string;
  description: string;
  tone: "warning" | "danger" | "success";
  icon: keyof typeof Feather.glyphMap;
  submittedAt?: string | null;
  action?: { label: string; onPress: () => void };
}) {
  const c = useColors();
  const accent =
    props.tone === "danger"
      ? c.danger
      : props.tone === "success"
        ? c.success
        : c.warning;
  return (
    <Screen contentStyle={{ gap: 18, paddingTop: 24 }}>
      <Header
        eyebrow="Eğitmenlik başvurusu"
        title={props.title}
        subtitle={props.description}
      />
      <Card padding={20}>
        <View style={{ gap: 14, alignItems: "center", paddingVertical: 12 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: accent + "1A",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name={props.icon} size={28} color={accent} />
          </View>
          <Pill label="Durum: incelemede" tone="warning" />
          {props.submittedAt ? (
            <Text
              style={{
                color: c.mutedForeground,
                fontFamily: "Inter_400Regular",
                fontSize: 12,
              }}
            >
              Gönderim: {new Date(props.submittedAt).toLocaleString("tr-TR")}
            </Text>
          ) : null}
        </View>
      </Card>
      {props.action ? (
        <Button
          variant="accent"
          size="lg"
          label={props.action.label}
          onPress={props.action.onPress}
        />
      ) : null}
    </Screen>
  );
}

// ─────────────────────────── Upload form ───────────────────────────

function UploadForm(props: {
  userId: string;
  status: VerificationStatus;
  previous: InstructorVerification | null;
  onSubmitted: () => Promise<void> | void;
}) {
  const c = useColors();
  const { previous } = props;

  const [certType, setCertType] = useState<CertificateType>(
    (previous?.cert_type as CertificateType) ?? "ISIA Level 1",
  );
  const [certTypeOpen, setCertTypeOpen] = useState(false);
  const [certNumber, setCertNumber] = useState(previous?.cert_number ?? "");
  const [certIssued, setCertIssued] = useState(previous?.cert_issued_at ?? "");
  const [certExpires, setCertExpires] = useState(
    previous?.cert_expires_at ?? "",
  );

  const [tcKimlik, setTcKimlik] = useState(previous?.tc_kimlik_no ?? "");
  const [iban, setIban] = useState(previous?.iban ? formatIban(previous.iban) : "");
  const [ibanHolder, setIbanHolder] = useState(previous?.iban_holder_name ?? "");

  // Selected files (URIs from the picker, not yet uploaded).
  const [certDoc, setCertDoc] = useState<PickedDoc | null>(null);
  const [idFront, setIdFront] = useState<PickedDoc | null>(null);
  const [idBack, setIdBack] = useState<PickedDoc | null>(null);
  const [photo, setPhoto] = useState<PickedDoc | null>(null);

  const [submitting, setSubmitting] = useState(false);

  // For re-submissions we already have storage paths — we only need a fresh
  // upload if the user picks a new file.
  const hasExistingCert = !!previous?.cert_doc_path;
  const hasExistingIdFront = !!previous?.id_front_path;
  const hasExistingIdBack = !!previous?.id_back_path;
  const hasExistingPhoto = false; // photo lives on instructor_profiles; we don't preview the old one here

  async function pickImage(setter: (d: PickedDoc) => void) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert(
        "İzin gerekli",
        "Belgeleri seçebilmek için galeri erişimine izin verin.",
      );
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: false,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setter({ uri: a.uri, mimeType: a.mimeType });
  }

  function validate(): string | null {
    if (!certType) return "Sertifika türünü seçin.";
    if (!certNumber.trim()) return "Sertifika numarasını girin.";
    if (!isYmd(certIssued))
      return "Sertifika veriliş tarihini YYYY-AA-GG biçiminde girin.";
    if (certExpires && !isYmd(certExpires))
      return "Geçerlilik tarihi YYYY-AA-GG biçiminde olmalı.";
    if (!certDoc && !hasExistingCert)
      return "Sertifika belgesinin fotoğrafını yükleyin.";
    if (!idFront && !hasExistingIdFront) return "Kimlik ön yüzünü yükleyin.";
    if (!idBack && !hasExistingIdBack) return "Kimlik arka yüzünü yükleyin.";
    if (!photo && !hasExistingPhoto) return "Profil fotoğrafınızı yükleyin.";
    if (!isValidTcKimlik(tcKimlik))
      return "TC Kimlik numarası 11 haneli olmalı.";
    if (!isValidTrIban(iban))
      return "IBAN geçersiz. TR ile başlayan 26 karakter olmalı.";
    if (!ibanHolder.trim()) return "IBAN sahibinin adını girin.";
    return null;
  }

  async function onSubmit() {
    const err = validate();
    if (err) {
      Alert.alert("Eksik bilgi", err);
      return;
    }
    setSubmitting(true);
    try {
      // Upload only what changed; reuse existing storage paths otherwise.
      const certPath = certDoc
        ? await uploadInstructorDoc({
            userId: props.userId,
            kind: "cert",
            uri: certDoc.uri,
            mimeType: certDoc.mimeType,
          })
        : previous!.cert_doc_path!;
      const idFrontPath = idFront
        ? await uploadInstructorDoc({
            userId: props.userId,
            kind: "id-front",
            uri: idFront.uri,
            mimeType: idFront.mimeType,
          })
        : previous!.id_front_path!;
      const idBackPath = idBack
        ? await uploadInstructorDoc({
            userId: props.userId,
            kind: "id-back",
            uri: idBack.uri,
            mimeType: idBack.mimeType,
          })
        : previous!.id_back_path!;
      const photoPath = photo
        ? await uploadInstructorDoc({
            userId: props.userId,
            kind: "photo",
            uri: photo.uri,
            mimeType: photo.mimeType,
          })
        : ""; // validate() ensures we always have a new photo on first submit

      const { error } = await supabase.rpc("submit_instructor_verification", {
        p_cert_type: certType,
        p_cert_number: certNumber.trim(),
        p_cert_issued: certIssued,
        p_cert_expires: certExpires || null,
        p_cert_doc_path: certPath,
        p_id_front_path: idFrontPath,
        p_id_back_path: idBackPath,
        p_tc_kimlik: tcKimlik.replace(/\D/g, ""),
        p_photo_path: photoPath,
        p_iban: iban.replace(/\s+/g, "").toUpperCase(),
        p_iban_holder: ibanHolder.trim(),
      });
      if (error) throw error;
      await props.onSubmitted();
      Alert.alert(
        "Başvuru alındı",
        "Belgeleriniz incelemeye gönderildi. Onaylandığında bildirim alacaksınız.",
      );
    } catch (e: any) {
      Alert.alert("Gönderilemedi", humanizeError(e?.message ?? String(e)));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen contentStyle={{ gap: 18, paddingBottom: 80 }}>
      <Header
        eyebrow="Eğitmenlik başvurusu"
        title={`Belgelerini\nyükle.`}
        subtitle="Kimliğinizi ve eğitmenlik sertifikanızı doğrulayalım, ardından ders almaya başlayabilirsiniz."
      />

      {props.status === "rejected" && previous?.rejection_reason ? (
        <Card padding={16}>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
            <Feather name="alert-octagon" size={18} color={c.danger} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text
                style={{
                  color: c.foreground,
                  fontFamily: "Inter_700Bold",
                  fontSize: 13,
                }}
              >
                Önceki başvurunuz reddedildi
              </Text>
              <Text
                style={{
                  color: c.mutedForeground,
                  fontFamily: "Inter_400Regular",
                  fontSize: 13,
                  lineHeight: 19,
                }}
              >
                {previous.rejection_reason}
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      <SectionTitle>Sertifika</SectionTitle>
      <Pressable
        onPress={() => setCertTypeOpen(true)}
        style={{
          backgroundColor: c.card,
          borderRadius: c.radius,
          borderWidth: 1,
          borderColor: c.borderSoft,
          paddingHorizontal: 16,
          paddingVertical: 14,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ gap: 4 }}>
          <Text
            style={{
              color: c.mutedForeground,
              fontFamily: "Inter_500Medium",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            Sertifika türü
          </Text>
          <Text
            style={{
              color: c.foreground,
              fontFamily: "Inter_500Medium",
              fontSize: 16,
            }}
          >
            {certType}
          </Text>
        </View>
        <Feather name="chevron-down" size={18} color={c.mutedForeground} />
      </Pressable>

      <Input
        label="Sertifika numarası"
        value={certNumber}
        onChangeText={setCertNumber}
        placeholder="Örn. 12345-A"
      />

      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Input
            label="Veriliş tarihi"
            value={certIssued}
            onChangeText={setCertIssued}
            placeholder="YYYY-AA-GG"
            autoCapitalize="none"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label="Geçerlilik (ops.)"
            value={certExpires}
            onChangeText={setCertExpires}
            placeholder="YYYY-AA-GG"
            autoCapitalize="none"
          />
        </View>
      </View>

      <DocPicker
        label="Sertifika belgesi"
        helper="Sertifikanızın net bir fotoğrafı"
        picked={certDoc}
        hasExisting={hasExistingCert}
        onPick={() => pickImage(setCertDoc)}
      />

      <SectionTitle>Kimlik doğrulama</SectionTitle>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <DocPicker
            label="Kimlik (ön)"
            picked={idFront}
            hasExisting={hasExistingIdFront}
            onPick={() => pickImage(setIdFront)}
            compact
          />
        </View>
        <View style={{ flex: 1 }}>
          <DocPicker
            label="Kimlik (arka)"
            picked={idBack}
            hasExisting={hasExistingIdBack}
            onPick={() => pickImage(setIdBack)}
            compact
          />
        </View>
      </View>
      <Input
        label="TC Kimlik No"
        value={tcKimlik}
        onChangeText={(t) => setTcKimlik(t.replace(/\D/g, "").slice(0, 11))}
        keyboardType="number-pad"
        placeholder="11 haneli"
        maxLength={11}
      />

      <SectionTitle>Profil fotoğrafı</SectionTitle>
      <DocPicker
        label="Profil fotoğrafı"
        helper="Müşteriler bu fotoğrafı listede görecek"
        picked={photo}
        hasExisting={hasExistingPhoto}
        onPick={() => pickImage(setPhoto)}
      />

      <SectionTitle>Banka bilgileri (ödemeler için)</SectionTitle>
      <Input
        label="IBAN"
        value={iban}
        onChangeText={(t) => setIban(formatIban(t))}
        placeholder="TR00 0000 0000 0000 0000 0000 00"
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <Input
        label="IBAN sahibinin adı"
        value={ibanHolder}
        onChangeText={setIbanHolder}
        placeholder="Ad Soyad"
      />

      <View style={{ marginTop: 8 }}>
        <Button
          variant="accent"
          size="lg"
          label={
            props.status === "rejected" ? "Tekrar gönder" : "İncelemeye gönder"
          }
          loading={submitting}
          onPress={onSubmit}
        />
        <Text
          style={{
            color: c.mutedForeground,
            fontFamily: "Inter_400Regular",
            fontSize: 12,
            textAlign: "center",
            marginTop: 10,
            lineHeight: 17,
          }}
        >
          Belgeleriniz yalnızca yönetici ekibimiz tarafından doğrulama amaçlı görüntülenir.
        </Text>
      </View>

      {/* Cert type picker modal */}
      <Modal
        visible={certTypeOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCertTypeOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}
          onPress={() => setCertTypeOpen(false)}
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
            gap: 8,
          }}
        >
          <Text
            style={{
              color: c.foreground,
              fontFamily: "Fraunces_600SemiBold",
              fontSize: 18,
              marginBottom: 8,
            }}
          >
            Sertifika türü
          </Text>
          {CERTIFICATE_TYPES.map((ct) => {
            const active = ct === certType;
            return (
              <Pressable
                key={ct}
                onPress={() => {
                  setCertType(ct);
                  setCertTypeOpen(false);
                }}
                style={{
                  paddingVertical: 14,
                  paddingHorizontal: 14,
                  borderRadius: c.radius,
                  backgroundColor: active ? c.accentSoft : "transparent",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    color: active ? c.accentDeep : c.foreground,
                    fontFamily: active ? "Inter_700Bold" : "Inter_500Medium",
                    fontSize: 15,
                  }}
                >
                  {ct}
                </Text>
                {active ? (
                  <Feather name="check" size={18} color={c.accentDeep} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </Screen>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return (
    <Text
      style={{
        color: c.mutedForeground,
        fontFamily: "Inter_700Bold",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 0.8,
        marginTop: 8,
      }}
    >
      {children}
    </Text>
  );
}

function DocPicker(props: {
  label: string;
  helper?: string;
  picked: PickedDoc | null;
  hasExisting: boolean;
  onPick: () => void;
  compact?: boolean;
}) {
  const c = useColors();
  const showThumb = !!props.picked;
  const checked = !!props.picked || props.hasExisting;
  return (
    <Pressable
      onPress={props.onPick}
      style={{
        backgroundColor: c.card,
        borderRadius: c.radius,
        borderWidth: 1.5,
        borderStyle: checked ? "solid" : "dashed",
        borderColor: checked ? c.accent : c.borderSoft,
        padding: 14,
        gap: 10,
        minHeight: props.compact ? 120 : 140,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {showThumb ? (
        <Image
          source={{ uri: props.picked!.uri }}
          style={{
            width: "100%",
            height: props.compact ? 80 : 100,
            borderRadius: c.radius - 4,
            resizeMode: "cover",
          }}
        />
      ) : (
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: c.accentSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather
            name={checked ? "check" : "upload"}
            size={18}
            color={c.accentDeep}
          />
        </View>
      )}
      <View style={{ alignItems: "center", gap: 2 }}>
        <Text
          style={{
            color: c.foreground,
            fontFamily: "Inter_600SemiBold",
            fontSize: 13,
            textAlign: "center",
          }}
        >
          {props.label}
        </Text>
        {checked ? (
          <Text
            style={{
              color: c.accentDeep,
              fontFamily: "Inter_500Medium",
              fontSize: 11,
            }}
          >
            {props.picked ? "Seçildi · değiştir" : "Yüklü · değiştir"}
          </Text>
        ) : props.helper ? (
          <Text
            style={{
              color: c.mutedForeground,
              fontFamily: "Inter_400Regular",
              fontSize: 11,
              textAlign: "center",
            }}
          >
            {props.helper}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function humanizeError(msg: string): string {
  if (msg.includes("invalid iban")) return "IBAN geçersiz.";
  if (msg.includes("invalid tc_kimlik")) return "TC Kimlik geçersiz.";
  if (msg.includes("instructors only"))
    return "Bu işlemi yalnızca eğitmen hesapları yapabilir.";
  if (msg.includes("required")) return "Lütfen tüm alanları doldurun.";
  return msg;
}

const styles = StyleSheet.create({});
