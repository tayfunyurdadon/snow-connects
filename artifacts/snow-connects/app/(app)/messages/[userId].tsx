import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { detectContactInfo, violationMessage } from "@/lib/contactFilter";
import { supabase } from "@/lib/supabase";
import type { AppUser, Message } from "@/lib/types";

export default function ChatScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const { data: partner } = useQuery({
    queryKey: ["partner", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, role")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return data as Pick<AppUser, "id" | "name" | "role"> | null;
    },
    enabled: !!userId,
  });

  const { data: messages } = useQuery({
    queryKey: ["messages", me?.id, userId],
    queryFn: async (): Promise<Message[]> => {
      if (!me) return [];
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${me.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${me.id})`,
        )
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Message[];
    },
    enabled: !!me && !!userId,
  });

  useEffect(() => {
    if (!me || !userId) return;
    const channel = supabase
      .channel(`chat:${me.id}:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${me.id}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          if (msg.sender_id === userId) {
            qc.setQueryData<Message[]>(
              ["messages", me.id, userId],
              (cur) => [...(cur ?? []), msg],
            );
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [me, userId, qc]);

  async function send() {
    const text = draft.trim();
    if (!text || !me) return;

    const v = detectContactInfo(text);
    if (v) {
      const warn = violationMessage(v);
      const ok = await new Promise<boolean>((resolve) => {
        Alert.alert(
          "Uyarı",
          `${warn} İletişim bilgisi paylaşımı yasaktır. Yine de gönderirseniz mesaj inceleme için işaretlenecek${
            me.role === "instructor" ? " ve uyarı sayacınız artacak" : ""
          }.`,
          [
            { text: "İptal", style: "cancel", onPress: () => resolve(false) },
            { text: "Yine Gönder", onPress: () => resolve(true) },
          ],
        );
      });
      if (!ok) return;
    }

    setSending(true);
    const { data, error } = await supabase.rpc("send_message", {
      p_receiver: userId,
      p_content: text,
    });
    setSending(false);
    if (error) {
      Alert.alert("Mesaj gönderilemedi", error.message);
      return;
    }
    setDraft("");
    const result = data as {
      message: Message;
      warning: string | null;
      blocked: boolean;
    };
    qc.setQueryData<Message[]>(["messages", me.id, userId], (cur) => [
      ...(cur ?? []),
      result.message,
    ]);
    if (result.warning) {
      Alert.alert("Bildirim", result.warning);
    }
    if (result.blocked) {
      qc.invalidateQueries({ queryKey: ["auth"] });
    }
  }

  if (!me) return <Loading />;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "padding"}
      style={{ flex: 1, backgroundColor: c.background }}
      keyboardVerticalOffset={Platform.OS === "ios" ? 96 : 0}
    >
      <View
        style={[
          styles.banner,
          { backgroundColor: c.muted, borderBottomColor: c.border },
        ]}
      >
        <Feather name="info" size={13} color={c.mutedForeground} />
        <Text
          style={{
            color: c.mutedForeground,
            fontSize: 11,
            fontFamily: "Inter_400Regular",
            flex: 1,
          }}
        >
          Telefon, e-posta veya bağlantı paylaşımı yasaktır.
        </Text>
      </View>

      <FlatList
        data={messages ?? []}
        keyExtractor={(m) => m.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ padding: 14, gap: 8 }}
        renderItem={({ item }) => {
          const mine = item.sender_id === me.id;
          return (
            <View
              style={{
                alignSelf: mine ? "flex-end" : "flex-start",
                maxWidth: "82%",
                backgroundColor: mine ? c.primary : c.card,
                borderRadius: c.radius,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderWidth: mine ? 0 : 1,
                borderColor: c.border,
              }}
            >
              <Text
                style={{
                  color: mine ? c.primaryForeground : c.foreground,
                  fontFamily: "Inter_400Regular",
                  fontSize: 15,
                }}
              >
                {item.content}
              </Text>
              {item.flagged ? (
                <Text
                  style={{
                    color: mine ? c.primaryForeground : c.destructive,
                    fontSize: 10,
                    marginTop: 4,
                    opacity: 0.85,
                    fontFamily: "Inter_500Medium",
                  }}
                >
                  ⚠ İnceleme için işaretlendi
                </Text>
              ) : null}
            </View>
          );
        }}
      />

      <View
        style={[
          styles.inputBar,
          {
            backgroundColor: c.card,
            borderTopColor: c.border,
            paddingBottom: 12 + (Platform.OS === "ios" ? 0 : insets.bottom),
          },
        ]}
      >
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          placeholder={`${partner?.name || "Kullanıcı"}'ya mesaj...`}
          placeholderTextColor={c.mutedForeground}
          multiline
          style={{
            flex: 1,
            color: c.foreground,
            fontFamily: "Inter_400Regular",
            fontSize: 15,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 22,
            backgroundColor: c.muted,
            maxHeight: 120,
          }}
        />
        <Pressable
          disabled={!draft.trim() || sending}
          onPress={send}
          style={({ pressed }) => [
            styles.sendBtn,
            {
              backgroundColor: c.primary,
              opacity: !draft.trim() || sending ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}
        >
          <Feather name="arrow-up" size={20} color={c.primaryForeground} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
