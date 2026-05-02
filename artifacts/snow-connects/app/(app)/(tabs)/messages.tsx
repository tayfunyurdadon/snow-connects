import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loading } from "@/components/ui/Loading";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";
import type { AppUser, Message } from "@/lib/types";

interface ConversationRow {
  partnerId: string;
  partnerName: string;
  lastMessage: string;
  lastAt: string;
  flagged: boolean;
}

export default function MessagesTab() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["conversations", user?.id],
    queryFn: async (): Promise<ConversationRow[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const messages = (data ?? []) as Message[];
      const grouped = new Map<string, ConversationRow>();
      const partnerIds = new Set<string>();
      for (const m of messages) {
        const partnerId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
        partnerIds.add(partnerId);
        if (!grouped.has(partnerId)) {
          grouped.set(partnerId, {
            partnerId,
            partnerName: "",
            lastMessage: m.content,
            lastAt: m.created_at,
            flagged: m.flagged,
          });
        }
      }
      if (partnerIds.size === 0) return [];
      const { data: users } = await supabase
        .from("users")
        .select("id, name")
        .in("id", Array.from(partnerIds));
      const nameMap = new Map(
        (users as Pick<AppUser, "id" | "name">[] | null)?.map((u) => [
          u.id,
          u.name,
        ]) ?? [],
      );
      return Array.from(grouped.values()).map((row) => ({
        ...row,
        partnerName: nameMap.get(row.partnerId) || "Kullanıcı",
      }));
    },
    enabled: !!user,
  });

  if (!user) return <Loading />;

  return (
    <Screen
      contentStyle={{ paddingTop: insets.top + 12, gap: 14 }}
      refreshing={isRefetching}
      onRefresh={refetch}
    >
      <Text style={[styles.title, { color: c.foreground }]}>Mesajlar</Text>

      {isLoading ? (
        <Loading inline />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon="message-circle"
          title="Henüz mesaj yok"
          description="Bir eğitmenle ders ayarladığında mesajlaşma burada başlar."
        />
      ) : (
        data.map((row) => (
          <Card
            key={row.partnerId}
            onPress={() => router.push(`/(app)/messages/${row.partnerId}`)}
          >
            <View style={styles.row}>
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: c.secondary, borderRadius: 100 },
                ]}
              >
                <Feather name="user" size={20} color={c.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{
                    color: c.foreground,
                    fontFamily: "Inter_600SemiBold",
                  }}
                >
                  {row.partnerName}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    color: c.mutedForeground,
                    fontFamily: "Inter_400Regular",
                    fontSize: 13,
                  }}
                >
                  {row.flagged ? "[Bildirildi] " : ""}
                  {row.lastMessage}
                </Text>
              </View>
              <Feather
                name="chevron-right"
                size={18}
                color={c.mutedForeground}
              />
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: "Inter_700Bold", fontSize: 24 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
