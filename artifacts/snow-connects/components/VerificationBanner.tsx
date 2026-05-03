import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";
import type { VerificationStatus } from "@/lib/types";
import { VERIFICATION_LABELS } from "@/lib/verification";

interface ProfileRow {
  verification_status: VerificationStatus;
}

interface VerificationRow {
  rejection_reason: string | null;
}

// Banner shown at the top of every instructor-panel screen until the
// instructor's verification_status is 'approved'. Tapping the banner
// routes them to the verification flow (re-upload if rejected, or status
// view if pending_review). Renders nothing for non-instructor users or
// once the account is approved.
export function VerificationBanner() {
  const c = useColors();
  const router = useRouter();
  const { user } = useAuth();

  const enabled = !!user && user.role === "instructor";

  const { data: profile } = useQuery({
    queryKey: ["my-verification-status", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instructor_profiles")
        .select("verification_status")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) return null;
      return (data ?? null) as ProfileRow | null;
    },
    enabled,
    staleTime: 30_000,
  });

  const status = profile?.verification_status;

  const { data: verification } = useQuery({
    queryKey: ["my-verification-reason", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("instructor_verification")
        .select("rejection_reason")
        .eq("user_id", user!.id)
        .maybeSingle();
      return (data ?? null) as VerificationRow | null;
    },
    enabled: enabled && status === "rejected",
  });

  if (!enabled || !status || status === "approved") return null;

  const meta = VERIFICATION_LABELS[status];
  const accent =
    meta.tone === "danger"
      ? c.danger
      : meta.tone === "success"
        ? c.success
        : c.warning;

  const cta =
    status === "pending_documents"
      ? "Belgeleri yükle"
      : status === "rejected"
        ? "Tekrar yükle"
        : status === "suspended"
          ? "Destek ile iletişim"
          : "Durumu gör";

  function onPress() {
    if (status === "suspended") {
      router.push("/(app)/support");
    } else {
      router.push("/(app)/instructor-panel/verification");
    }
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: c.radius,
        backgroundColor: c.card,
        borderLeftWidth: 4,
        borderLeftColor: accent,
        paddingVertical: 14,
        paddingHorizontal: 14,
        opacity: pressed ? 0.9 : 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginBottom: 12,
        ...({ boxShadow: c.shadow } as object),
      })}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: accent + "22",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather
          name={
            status === "pending_documents"
              ? "upload"
              : status === "rejected"
                ? "alert-octagon"
                : status === "suspended"
                  ? "slash"
                  : "clock"
          }
          size={16}
          color={accent}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: c.foreground,
            fontFamily: "Inter_700Bold",
            fontSize: 13,
          }}
        >
          {status === "pending_review"
            ? "Hesabınız onay bekliyor"
            : meta.label}
        </Text>
        <Text
          style={{
            color: c.mutedForeground,
            fontFamily: "Inter_400Regular",
            fontSize: 12,
            marginTop: 2,
            lineHeight: 17,
          }}
          numberOfLines={3}
        >
          {status === "rejected" && verification?.rejection_reason
            ? verification.rejection_reason
            : meta.description}
        </Text>
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingLeft: 4,
        }}
      >
        <Text
          style={{
            color: accent,
            fontFamily: "Inter_600SemiBold",
            fontSize: 12,
          }}
          numberOfLines={1}
        >
          {cta}
        </Text>
        <Feather name="chevron-right" size={14} color={accent} />
      </View>
    </Pressable>
  );
}
