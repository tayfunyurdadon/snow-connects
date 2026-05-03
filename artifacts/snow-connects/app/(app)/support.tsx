import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Linking, Pressable, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { Header } from "@/components/ui/Header";
import { Screen } from "@/components/ui/Screen";
import { useColors } from "@/hooks/useColors";

const WHATSAPP_NUMBER = "905555555555";
const WHATSAPP_MESSAGE =
  "Merhaba, Snow Connects ile ilgili yardıma ihtiyacım var.";
const SUPPORT_EMAIL = "destek@snowconnects.com";

const FAQS: { q: string; a: string }[] = [
  {
    q: "Rezervasyonumu nasıl iptal edebilirim?",
    a: "Derslerim sayfasından ilgili rezervasyona girip 'İptal Et' seçeneğini kullanabilirsin. Dersten 48 saat öncesine kadar yapılan iptallerde tutarın tamamı iade edilir. Daha kısa sürede yapılan iptallerde iade koşulları ders politikasına göre belirlenir.",
  },
  {
    q: "Ödememi ne zaman geri alırım?",
    a: "Onaylanan iadeler, banka ya da kart sağlayıcına bağlı olarak 5–10 iş günü içinde hesabına geçer. Süreç boyunca seni e-posta ve uygulama içi bildirimlerle bilgilendiririz.",
  },
  {
    q: "Eğitmenle iletişime nasıl geçebilirim?",
    a: "Rezervasyon onaylandıktan sonra Mesajlar sekmesinden eğitmenine doğrudan yazabilirsin. Tüm sohbetler Snow Connects içinde güvenli şekilde tutulur.",
  },
  {
    q: "Hava şartları nedeniyle ders iptal olursa ne olur?",
    a: "Pist yönetimi ya da eğitmen güvenlik nedeniyle dersi iptal ederse ücretin tamamı otomatik olarak iade edilir. Ayrıca dilersen aynı eğitmenle başka bir tarihe ücretsiz ertelenebilir.",
  },
  {
    q: "Grup dersi mi özel ders mi seçmeliyim?",
    a: "İlk kez kayağa başlıyorsan ya da belirli bir teknik üzerinde çalışmak istiyorsan özel ders daha hızlı ilerlemeni sağlar. Arkadaşlarınla birlikte öğrenmek istiyorsan ya da bütçeyi paylaşmak istiyorsan grup dersi iyi bir seçenek olur.",
  },
  {
    q: "Ödeme güvenli mi?",
    a: "Tüm ödemeler PCI-DSS uyumlu altyapı üzerinden işlenir. Kart bilgilerin Snow Connects sunucularında saklanmaz; ödeme onayı geldikten sonra rezervasyonun otomatik kesinleşir.",
  },
];

export default function SupportScreen() {
  const c = useColors();
  const router = useRouter();

  async function openWhatsApp() {
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
      WHATSAPP_MESSAGE,
    )}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("WhatsApp açılamadı", "Lütfen daha sonra tekrar dene.");
    }
  }

  async function openEmail() {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      "Snow Connects Destek",
    )}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("E-posta açılamadı", `Lütfen ${SUPPORT_EMAIL} adresine yaz.`);
    }
  }

  function openLiveChat() {
    // Routes to the in-app chat with our support assistant.
    router.push("/(app)/messages/support");
  }

  return (
    <Screen contentStyle={{ gap: 22 }}>
      <Header
        eyebrow="Yardım & Destek"
        title={`Sana yardım etmek\niçin buradayız.`}
        subtitle="Snow Connects ekibi olarak rezervasyon sürecinden ders sonrasına kadar her aşamada yanındayız. Aklına takılan her şey için bize ulaş — en hızlı şekilde dönüş yapalım."
      />

      {/* Decorative warm ribbon */}
      <View
        style={{
          borderRadius: c.radiusXl,
          paddingHorizontal: 22,
          paddingVertical: 24,
          backgroundColor: "#FBE9E2",
          flexDirection: "row",
          alignItems: "center",
          gap: 16,
        }}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: c.card,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name="heart" size={22} color={c.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: c.foreground,
              fontFamily: "Fraunces_600SemiBold",
              fontSize: 17,
              letterSpacing: -0.3,
              lineHeight: 22,
            }}
          >
            Yalnız değilsin.
          </Text>
          <Text
            style={{
              color: c.foreground,
              opacity: 0.75,
              fontFamily: "Inter_400Regular",
              fontSize: 12.5,
              lineHeight: 18,
              marginTop: 2,
            }}
          >
            Ekibimiz pist üstündeki bir arkadaş gibi yanında.
          </Text>
        </View>
      </View>

      {/* CONTACT OPTIONS */}
      <View style={{ gap: 12 }}>
        <ContactCard
          icon="message-circle"
          tint="#DCEFE0"
          iconColor="#1F7A3D"
          title="WhatsApp Destek"
          body="Hızlı yanıt için WhatsApp üzerinden yaz."
          onPress={openWhatsApp}
        />
        <ContactCard
          icon="message-square"
          tint="#E4EEF6"
          iconColor="#2F5C7A"
          title="Canlı Sohbet"
          body="Uygulama içinden anında destek al."
          onPress={openLiveChat}
        />
        <ContactCard
          icon="mail"
          tint="#FBF3E2"
          iconColor="#A66A1A"
          title="E-posta"
          body={SUPPORT_EMAIL}
          onPress={openEmail}
        />
      </View>

      {/* WORKING HOURS */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderRadius: c.radiusLg,
          backgroundColor: c.muted,
        }}
      >
        <Feather name="clock" size={16} color={c.accentDeep} />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: c.mutedForeground,
              fontFamily: "Inter_700Bold",
              fontSize: 11,
              letterSpacing: 1.2,
              textTransform: "uppercase",
            }}
          >
            Destek saatleri
          </Text>
          <Text
            style={{
              color: c.foreground,
              fontFamily: "Inter_500Medium",
              fontSize: 13,
              marginTop: 2,
            }}
          >
            Hafta içi 09:00 - 21:00 · Hafta sonu 10:00 - 20:00
          </Text>
        </View>
      </View>

      {/* FAQ */}
      <View style={{ gap: 12, marginTop: 4 }}>
        <View style={{ gap: 6 }}>
          <Text
            style={{
              color: c.accentDeep,
              fontFamily: "Inter_700Bold",
              fontSize: 11,
              letterSpacing: 1.4,
            }}
          >
            SIKÇA SORULAN SORULAR
          </Text>
          <Text
            style={{
              color: c.foreground,
              fontFamily: "Fraunces_600SemiBold",
              fontSize: 22,
              letterSpacing: -0.5,
            }}
          >
            Aklına takılanlar
          </Text>
        </View>
        <View style={{ gap: 10 }}>
          {FAQS.map((f, i) => (
            <FaqItem key={i} q={f.q} a={f.a} />
          ))}
        </View>
      </View>
    </Screen>
  );
}

function ContactCard({
  icon,
  tint,
  iconColor,
  title,
  body,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  tint: string;
  iconColor: string;
  title: string;
  body: string;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Card onPress={onPress} padding={18}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
        }}
      >
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 16,
            backgroundColor: tint,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name={icon} size={20} color={iconColor} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              color: c.foreground,
              fontFamily: "Inter_700Bold",
              fontSize: 15,
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              color: c.mutedForeground,
              fontFamily: "Inter_400Regular",
              fontSize: 12.5,
            }}
          >
            {body}
          </Text>
        </View>
        <Feather name="arrow-up-right" size={18} color={c.mutedForeground} />
      </View>
    </Card>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      onPress={() => setOpen((v) => !v)}
      style={({ pressed }) => ({
        backgroundColor: c.card,
        borderRadius: c.radiusLg,
        paddingHorizontal: 18,
        paddingVertical: 16,
        opacity: pressed ? 0.92 : 1,
        ...({ boxShadow: c.shadow } as object),
      })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Text
          style={{
            color: c.foreground,
            fontFamily: "Inter_600SemiBold",
            fontSize: 14,
            flex: 1,
            lineHeight: 20,
          }}
        >
          {q}
        </Text>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: open ? c.accentSoft : c.muted,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather
            name={open ? "minus" : "plus"}
            size={14}
            color={open ? c.accentDeep : c.foreground}
          />
        </View>
      </View>
      {open ? (
        <Text
          style={{
            color: c.foreground,
            opacity: 0.78,
            fontFamily: "Inter_400Regular",
            fontSize: 13.5,
            lineHeight: 21,
            marginTop: 12,
          }}
        >
          {a}
        </Text>
      ) : null}
    </Pressable>
  );
}
