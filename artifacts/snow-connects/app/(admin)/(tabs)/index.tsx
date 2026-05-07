import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

import {
  AdminCard,
  AdminEmpty,
  AdminHeader,
  AdminPill,
  AdminScreen,
  AdminSpinner,
} from "@/components/admin/AdminUI";
import { useAuth } from "@/contexts/AuthContext";
import { formatTRY } from "@/lib/format";
import { adminTheme } from "@/lib/adminTheme";
import { supabase } from "@/lib/supabase";
import type { AdminStats } from "@/lib/types";

export default function AdminDashboard() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async (): Promise<AdminStats> => {
      const { data, error } = await supabase.rpc("admin_stats");
      if (error) throw error;
      return data as AdminStats;
    },
  });

  return (
    <AdminScreen>
      <AdminHeader
        title="Bugünün özeti"
        subtitle={user?.name ? `Hoş geldin, ${user.name}.` : undefined}
        right={
          <Pressable
            onPress={signOut}
            style={{
              backgroundColor: adminTheme.surfaceMuted,
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderWidth: 1,
              borderColor: adminTheme.border,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Feather name="log-out" size={12} color={adminTheme.textMuted} />
            <Text
              style={{
                color: adminTheme.textMuted,
                fontFamily: adminTheme.fontTitle,
                fontSize: 11,
              }}
            >
              Çıkış
            </Text>
          </Pressable>
        }
      />

      {isLoading ? (
        <AdminSpinner />
      ) : !data ? (
        <AdminEmpty title="İstatistik yüklenemedi" />
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Stat
              icon="credit-card"
              label="Müşteri Ödemesi"
              value={formatTRY(data.customerPaidKurus ?? data.revenueKurus)}
              caption={`${data.paidBookings} ödenmiş ders`}
              tone="info"
            />
            <Stat
              icon="dollar-sign"
              label="Platform Geliri"
              value={formatTRY(data.revenueKurus)}
              caption="Banka komisyonu + işlem"
              tone="accent"
            />
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Stat
              icon="percent"
              label="Banka Komisyonu"
              value={formatTRY(data.bankCommissionKurus ?? 0)}
              caption="Ders üzerinden"
              compact
            />
            <Stat
              icon="layers"
              label="İşlem Ücreti"
              value={formatTRY(data.transactionFeesKurus ?? 0)}
              caption="Sabit ücret"
              compact
            />
            <Stat
              icon="clock"
              label="Bekleyen Ödeme"
              value={formatTRY(data.pendingPayoutsKurus)}
              caption="Eğitmenlere"
              tone="warning"
              compact
            />
          </View>

          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            <Stat
              icon="check-square"
              label="Onay Kuyruğu"
              value={String(data.pendingVerifications)}
              caption="Eğitmen başvurusu"
              tone={data.pendingVerifications > 0 ? "warning" : "default"}
              onPress={() => router.push("/(admin)/(tabs)/approvals")}
              compact
            />
            <Stat
              icon="alert-triangle"
              label="Bayraklar"
              value={String(data.flaggedMessages)}
              caption="Açık bildirim"
              tone={data.flaggedMessages > 0 ? "danger" : "default"}
              onPress={() => router.push("/(admin)/(tabs)/operations")}
              compact
            />
            <Stat
              icon="calendar"
              label="Rezervasyon"
              value={String(data.totalBookings)}
              caption="Tüm zamanlar"
              compact
            />
            <Stat
              icon="map-pin"
              label="Pist"
              value={String(data.totalResorts)}
              caption="Aktif"
              compact
            />
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Stat
              icon="users"
              label="Müşteri"
              value={String(data.totalCustomers)}
              tone="info"
            />
            <Stat
              icon="award"
              label="Eğitmen"
              value={String(data.totalInstructors)}
              tone="info"
            />
          </View>

          <Text
            style={{
              color: adminTheme.textMuted,
              fontFamily: adminTheme.fontTitle,
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 0.8,
              marginTop: 8,
            }}
          >
            Hızlı erişim
          </Text>
          <QuickLink
            icon="check-square"
            label="Eğitmen Onayları"
            badge={data.pendingVerifications}
            onPress={() => router.push("/(admin)/(tabs)/approvals")}
          />
          <QuickLink
            icon="users"
            label="Tüm Kullanıcılar"
            onPress={() => router.push("/(admin)/(tabs)/users")}
          />
          <QuickLink
            icon="activity"
            label="Rezervasyon & Ödemeler"
            onPress={() => router.push("/(admin)/(tabs)/operations")}
          />
          <QuickLink
            icon="sliders"
            label="Sistem Ayarları"
            onPress={() => router.push("/(admin)/(tabs)/system")}
          />
        </>
      )}
    </AdminScreen>
  );
}

function Stat(props: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  caption?: string;
  tone?: "default" | "accent" | "warning" | "danger" | "info" | "success";
  compact?: boolean;
  onPress?: () => void;
}) {
  const tone = props.tone ?? "default";
  const accent =
    tone === "accent"
      ? adminTheme.accent
      : tone === "warning"
        ? adminTheme.warning
        : tone === "danger"
          ? adminTheme.danger
          : tone === "info"
            ? adminTheme.info
            : tone === "success"
              ? adminTheme.success
              : adminTheme.textMuted;

  const body = (
    <View style={{ gap: 6 }}>
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <Feather name={props.icon} size={13} color={accent} />
        <Text
          style={{
            color: adminTheme.textMuted,
            fontFamily: adminTheme.fontTitle,
            fontSize: 10.5,
            textTransform: "uppercase",
            letterSpacing: 0.6,
          }}
        >
          {props.label}
        </Text>
      </View>
      <Text
        style={{
          color: adminTheme.text,
          fontFamily: adminTheme.fontHeadline,
          fontSize: props.compact ? 18 : 24,
          letterSpacing: -0.4,
        }}
      >
        {props.value}
      </Text>
      {props.caption ? (
        <Text
          style={{
            color: adminTheme.textDim,
            fontFamily: adminTheme.fontBody,
            fontSize: 10.5,
          }}
        >
          {props.caption}
        </Text>
      ) : null}
    </View>
  );

  return (
    <AdminCard
      onPress={props.onPress}
      padding={12}
      style={{ flex: props.compact ? undefined : 1, minWidth: props.compact ? "47%" : undefined }}
    >
      {body}
    </AdminCard>
  );
}

function QuickLink({
  icon,
  label,
  badge,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <AdminCard onPress={onPress} padding={14}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              backgroundColor: adminTheme.surfaceMuted,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name={icon} size={15} color={adminTheme.text} />
          </View>
          <Text
            style={{
              color: adminTheme.text,
              fontFamily: adminTheme.fontTitle,
              fontSize: 14,
            }}
          >
            {label}
          </Text>
        </View>
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          {badge && badge > 0 ? (
            <AdminPill label={String(badge)} tone="warning" size="sm" />
          ) : null}
          <Feather
            name="chevron-right"
            size={16}
            color={adminTheme.textMuted}
          />
        </View>
      </View>
    </AdminCard>
  );
}
