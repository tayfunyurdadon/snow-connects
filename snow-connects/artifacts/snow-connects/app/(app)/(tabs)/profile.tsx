import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CardCaptureModal } from "@/components/ui/CardCaptureModal";
import { Header } from "@/components/ui/Header";
import { Pill } from "@/components/ui/Pill";
import { Screen } from "@/components/ui/Screen";
import { SignInGate } from "@/components/ui/SignInGate";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { confirmAlert, showAlert } from "@/lib/uiAlert";
import { supabase } from "@/lib/supabase";

export default function ProfileTab() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut, refreshUser } = useAuth();
  const toast = useToast();
  // Guard against double-taps on the destructive confirm. Without this
  // a user who taps "Çıkış Yap" twice in the dialog would fire two
  // signOut calls and two AsyncStorage wipes in quick succession.
  const [signingOut, setSigningOut] = useState(false);
  // Saved-card modal + remove-in-flight state.
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [savingCard, setSavingCard] = useState(false);
  const [removingCard, setRemovingCard] = useState(false);

  async function handleSaveCard({
    token,
    last4,
    holder,
  }: {
    token: string;
    last4: string;
    holder: string;
  }): Promise<boolean> {
    if (savingCard) return false;
    setSavingCard(true);
    try {
      const { error } = await supabase.rpc("customer_save_card", {
        p_token: token,
        p_last4: last4,
        p_holder: holder,
        p_brand: null,
      });
      if (error) {
        showAlert("Kart kaydedilemedi", error.message);
        return false;
      }
      await refreshUser();
      toast.show("Kartın kaydedildi", "success");
      return true;
    } finally {
      setSavingCard(false);
    }
  }

  function handleRemoveCard() {
    if (removingCard) return;
    confirmAlert(
      "Kayıtlı kartı sil",
      "Bir sonraki rezervasyonda kart bilgilerini tekrar girmen gerekecek. Devam edeyim mi?",
      "Sil",
      async () => {
        setRemovingCard(true);
        try {
          const { error } = await supabase.rpc("customer_remove_card");
          if (error) {
            showAlert("Silinemedi", error.message);
            return;
          }
          await refreshUser();
          toast.show("Kart silindi", "success");
        } finally {
          setRemovingCard(false);
        }
      },
      { destructive: true },
    );
  }

  // Performs the actual sign-out work after the user confirmed. Kept as a
  // local helper so both the web (window.confirm) and native (Alert.alert)
  // confirmation paths funnel through identical logic, including
  // AsyncStorage cleanup and navigation reset.
  async function performSignOut() {
    if (signingOut) {
      console.log("[signOut] already in flight, ignoring duplicate tap");
      return;
    }
    setSigningOut(true);
    console.log("[signOut] confirmed, calling supabase.auth.signOut");
    try {
      // Step 1: tell context + Supabase. The context's signOut already
      // calls supabase.auth.signOut and clears in-memory state; calling
      // it directly keeps the screen + provider in sync.
      await signOut();

      // Step 2: defensively wipe any Supabase auth keys still in
      // AsyncStorage. supabase-js usually does this on signOut, but if
      // the previous session was corrupted (e.g. the bug we just hit
      // with profile fetch) leftover keys could rehydrate a stale
      // session on next launch.
      const keys = await AsyncStorage.getAllKeys();
      const supabaseKeys = keys.filter(
        (k) => k.startsWith("sb-") || k.startsWith("supabase."),
      );
      if (supabaseKeys.length > 0) {
        console.log("[signOut] clearing AsyncStorage keys:", supabaseKeys);
        await AsyncStorage.multiRemove(supabaseKeys);
      }

      console.log("[signOut] success, redirecting to discover (guest mode)");
      toast.show("Çıkış yapıldı", "success");
      // Reset the navigation stack so the user can't swipe back into a
      // protected screen, then land on the public discover tab.
      router.replace("/(app)/(tabs)");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[signOut] failed:", msg, e);
      Alert.alert("Çıkış yapılamadı", msg);
      toast.show(msg || "Çıkış yapılamadı", "danger");
    } finally {
      setSigningOut(false);
    }
  }

  function handleSignOut() {
    console.log("[signOut] tapped, platform=", Platform.OS);
    // Use platform-native confirmation directly here (not the shared
    // `confirm` helper) so we get true two-button styling on iOS
    // (red destructive "Çıkış Yap", gray cancel "İptal") and a real
    // browser confirm on web. The previous helper-based path was
    // silently no-op'ing for some users.
    if (Platform.OS === "web") {
      const ok =
        typeof globalThis !== "undefined" &&
        typeof globalThis.confirm === "function"
          ? globalThis.confirm("Çıkış yapmak istediğinizden emin misiniz?")
          : true;
      if (!ok) {
        console.log("[signOut] cancelled (web)");
        return;
      }
      void performSignOut();
      return;
    }
    Alert.alert(
      "Çıkış yapmak istediğinizden emin misiniz?",
      undefined,
      [
        {
          text: "İptal",
          style: "cancel",
          onPress: () => console.log("[signOut] cancelled"),
        },
        {
          text: "Çıkış Yap",
          style: "destructive",
          onPress: () => {
            void performSignOut();
          },
        },
      ],
      { cancelable: true },
    );
  }

  const roleLabel: Record<string, string> = {
    customer: "Öğrenci",
    instructor: "Eğitmen",
    admin: "Yönetici",
  };

  if (!user) {
    return (
      <SignInGate
        title="Profiline eriş"
        description="Hesabını yönetmek ve bilgilerini güncellemek için giriş yap."
      />
    );
  }

  const initial = (user.name || user.email || "?").slice(0, 1).toUpperCase();

  return (
    <Screen contentStyle={{ paddingTop: insets.top + 16, gap: 18 }}>
      <Header eyebrow="Hesabım" title="Profil" />

      {/* Identity card — large editorial */}
      <Card padding={20}>
        <View style={{ alignItems: "center", gap: 12 }}>
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: c.primary,
                ...(Platform.OS !== "android"
                  ? ({ boxShadow: c.shadow } as object)
                  : { elevation: 2 }),
              },
            ]}
          >
            <Text
              style={{
                color: c.primaryForeground,
                fontFamily: "Fraunces_600SemiBold",
                fontSize: 36,
                letterSpacing: -1.2,
              }}
            >
              {initial}
            </Text>
          </View>
          <View style={{ alignItems: "center", gap: 4 }}>
            <Text
              style={{
                color: c.foreground,
                fontFamily: "Fraunces_600SemiBold",
                fontSize: 22,
                letterSpacing: -0.4,
              }}
            >
              {user?.name || "İsimsiz"}
            </Text>
            <Text
              style={{
                color: c.mutedForeground,
                fontFamily: "Inter_500Medium",
                fontSize: 13,
              }}
            >
              {user?.email}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
            <Pill label={roleLabel[user?.role ?? "customer"]} tone="accent" />
            {user?.status === "blocked" ? (
              <Pill label="Bloke" tone="danger" />
            ) : null}
            {user && user.strike_count > 0 ? (
              <Pill label={`${user.strike_count} uyarı`} tone="warning" />
            ) : null}
          </View>
        </View>
      </Card>

      {user?.role === "customer" ? (
        <SavedCardCard
          last4={user.saved_card_last4}
          holder={user.saved_card_holder}
          onAdd={() => setCardModalOpen(true)}
          onRemove={handleRemoveCard}
          removing={removingCard}
        />
      ) : null}

      <View style={{ gap: 8 }}>
        {user?.role === "instructor" ? (
          <>
            <ActionRow
              icon="calendar"
              label="Takvimimi Yönet"
              hint="Açık ve kapalı saatlerini düzenle"
              onPress={() => router.push("/(app)/instructor-panel/calendar")}
            />
            <ActionRow
              icon="user-check"
              label="Profilimi Düzenle"
              hint="Bio, fiyat, çalıştığın pistler"
              onPress={() => router.push("/(app)/instructor-panel/setup")}
            />
          </>
        ) : null}

        {user?.role === "admin" ? (
          <ActionRow
            icon="shield"
            label="Yönetici Paneli"
            hint="Eğitmenler, rezervasyonlar, bildirimler"
            onPress={() => router.push("/(admin)/(tabs)")}
          />
        ) : null}

        <ActionRow
          icon="life-buoy"
          label="Yardım & Destek"
          hint="WhatsApp, canlı sohbet, e-posta ve SSS"
          onPress={() => router.push("/(app)/support")}
        />
      </View>

      <View style={{ marginTop: 8 }}>
        <Button
          label="Çıkış Yap"
          variant="ghost"
          loading={signingOut}
          onPress={handleSignOut}
        />
      </View>

      <CardCaptureModal
        open={cardModalOpen}
        totalKurus={0}
        mode="save"
        loading={savingCard}
        onClose={() => {
          if (!savingCard) setCardModalOpen(false);
        }}
        onConfirm={async (r) => {
          const ok = await handleSaveCard(r);
          if (ok) setCardModalOpen(false);
          return ok;
        }}
      />
    </Screen>
  );
}

function SavedCardCard({
  last4,
  holder,
  onAdd,
  onRemove,
  removing,
}: {
  last4: string | null;
  holder: string | null;
  onAdd: () => void;
  onRemove: () => void;
  removing: boolean;
}) {
  const c = useColors();
  if (!last4) {
    return (
      <Card padding={16}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              backgroundColor: c.accentSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="credit-card" size={18} color={c.accentDeep} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={{
                color: c.foreground,
                fontFamily: "Inter_600SemiBold",
                fontSize: 15,
              }}
            >
              Ödeme Yöntemi
            </Text>
            <Text
              style={{
                color: c.mutedForeground,
                fontFamily: "Inter_400Regular",
                fontSize: 12,
                lineHeight: 17,
              }}
            >
              Bir kart kaydet, her rezervasyonda tekrar yazma.
            </Text>
          </View>
          <Pressable onPress={onAdd} hitSlop={6}>
            <Text
              style={{
                color: c.accentDeep,
                fontFamily: "Inter_600SemiBold",
                fontSize: 13,
                textDecorationLine: "underline",
              }}
            >
              Kart Ekle
            </Text>
          </Pressable>
        </View>
      </Card>
    );
  }

  return (
    <Card padding={16}>
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              backgroundColor: c.accentSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="credit-card" size={18} color={c.accentDeep} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={{
                color: c.foreground,
                fontFamily: "Inter_600SemiBold",
                fontSize: 15,
              }}
            >
              •••• {last4}
            </Text>
            {holder ? (
              <Text
                style={{
                  color: c.mutedForeground,
                  fontFamily: "Inter_400Regular",
                  fontSize: 12,
                }}
              >
                {holder}
              </Text>
            ) : null}
          </View>
          <Pill label="Kayıtlı" tone="success" size="sm" />
        </View>
        <Text
          style={{
            color: c.mutedForeground,
            fontFamily: "Inter_400Regular",
            fontSize: 11,
            lineHeight: 16,
          }}
        >
          Yeni rezervasyonlarda kart bilgisi sorulmaz; eğitmen onayladıktan
          sonra otomatik tahsil edilir.
        </Text>
        <View style={{ alignSelf: "flex-start" }}>
          <Button
            label="Kartı Sil"
            variant="ghost"
            onPress={onRemove}
            loading={removing}
          />
        </View>
      </View>
    </Card>
  );
}

function ActionRow({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Card onPress={onPress} padding={16}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            backgroundColor: c.accentSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name={icon} size={18} color={c.accentDeep} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              color: c.foreground,
              fontFamily: "Inter_600SemiBold",
              fontSize: 15,
            }}
          >
            {label}
          </Text>
          {hint ? (
            <Text
              style={{
                color: c.mutedForeground,
                fontFamily: "Inter_400Regular",
                fontSize: 12,
              }}
            >
              {hint}
            </Text>
          ) : null}
        </View>
        <Feather name="chevron-right" size={18} color={c.taupeSoft ?? c.mutedForeground} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
  },
});
