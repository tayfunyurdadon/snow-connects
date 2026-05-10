import { Feather } from "@expo/vector-icons";
import React, { useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { useColors } from "@/hooks/useColors";
import { formatTRY } from "@/lib/format";

type Props = {
  open: boolean;
  totalKurus: number;
  onClose: () => void;
  // Returns true on success (modal will reset + close); false keeps the
  // modal open with card fields preserved so the customer can retry.
  onConfirm: (result: { token: string; last4: string }) => Promise<boolean>;
  loading?: boolean;
};

function formatCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 19);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiry(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function isExpiryValid(value: string): boolean {
  const m = value.match(/^(\d{2})\/(\d{2})$/);
  if (!m) return false;
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return false;
  const now = new Date();
  const exp = new Date(year, month, 0, 23, 59, 59);
  return exp.getTime() >= now.getTime();
}

export function CardCaptureModal({
  open,
  totalKurus,
  onClose,
  onConfirm,
  loading,
}: Props) {
  const c = useColors();
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [touched, setTouched] = useState(false);
  // Synchronous re-entrancy lock — React state alone is stale on the
  // same render tick, allowing rapid double-taps to fire two RPCs.
  const inFlightRef = useRef(false);

  const digits = useMemo(() => number.replace(/\D/g, ""), [number]);
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Kart üzerindeki ismi gir.";
    if (digits.length < 13 || digits.length > 19)
      e.number = "Geçerli bir kart numarası gir.";
    if (!isExpiryValid(expiry)) e.expiry = "AA/YY formatı.";
    if (cvc.length < 3 || cvc.length > 4) e.cvc = "3-4 haneli güvenlik kodu.";
    return e;
  }, [name, digits, expiry, cvc]);

  const valid = Object.keys(errors).length === 0;

  function reset() {
    setName("");
    setNumber("");
    setExpiry("");
    setCvc("");
    setTouched(false);
  }

  function handleClose() {
    if (loading || inFlightRef.current) return;
    reset();
    onClose();
  }

  async function handleConfirm() {
    if (inFlightRef.current || loading) return;
    setTouched(true);
    if (!valid) return;
    inFlightRef.current = true;
    try {
      const last4 = digits.slice(-4);
      const token = `stub_${last4}_${Date.now()}`;
      const ok = await onConfirm({ token, last4 });
      if (ok) reset();
      // On failure: keep card fields populated for a one-tap retry.
    } finally {
      inFlightRef.current = false;
    }
  }

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: c.background, borderColor: c.border },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <ScrollView
            contentContainerStyle={{ padding: 20, gap: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  backgroundColor: c.accentSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="credit-card" size={18} color={c.accentDeep} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: c.foreground,
                    fontFamily: "Fraunces_600SemiBold",
                    fontSize: 18,
                    letterSpacing: -0.3,
                  }}
                >
                  Kart bilgilerin
                </Text>
                <Text
                  style={{
                    color: c.mutedForeground,
                    fontFamily: "Inter_400Regular",
                    fontSize: 12,
                    marginTop: 2,
                  }}
                >
                  Eğitmen onaylayana kadar kartından bir şey çekilmez.
                </Text>
              </View>
              <Pill label="Test" tone="warning" size="sm" />
            </View>

            <View
              style={{
                backgroundColor: c.accentSoft,
                borderRadius: 14,
                padding: 14,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: c.accentDeep,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 13,
                }}
              >
                Onaylanırsa tahsil edilecek
              </Text>
              <Text
                style={{
                  color: c.accentDeep,
                  fontFamily: "Fraunces_700Bold",
                  fontSize: 22,
                  letterSpacing: -0.4,
                }}
              >
                {formatTRY(totalKurus)}
              </Text>
            </View>

            <Input
              label="Kart üzerindeki isim"
              placeholder="Ad Soyad"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              error={touched ? errors.name : undefined}
            />

            <Input
              label="Kart numarası"
              placeholder="1234 5678 9012 3456"
              value={number}
              onChangeText={(v) => setNumber(formatCardNumber(v))}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={23}
              error={touched ? errors.number : undefined}
            />

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Son kullanma"
                  placeholder="AA/YY"
                  value={expiry}
                  onChangeText={(v) => setExpiry(formatExpiry(v))}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={5}
                  error={touched ? errors.expiry : undefined}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  label="CVC"
                  placeholder="123"
                  value={cvc}
                  onChangeText={(v) => setCvc(v.replace(/\D/g, "").slice(0, 4))}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={4}
                  secureTextEntry
                  error={touched ? errors.cvc : undefined}
                />
              </View>
            </View>

            <View
              style={{
                flexDirection: "row",
                gap: 8,
                alignItems: "flex-start",
                paddingHorizontal: 4,
              }}
            >
              <Feather
                name="lock"
                size={13}
                color={c.mutedForeground}
                style={{ marginTop: 2 }}
              />
              <Text
                style={{
                  flex: 1,
                  color: c.mutedForeground,
                  fontFamily: "Inter_400Regular",
                  fontSize: 11,
                  lineHeight: 16,
                }}
              >
                Demo ortamı: gerçek kart bilgisi saklanmıyor. Yalnızca son 4
                hane referans için tutuluyor. Eğitmen 12 saat içinde
                onaylayınca tutar otomatik tahsil edilir; reddedilirse hiçbir
                ücret alınmaz.
              </Text>
            </View>

            <Button
              variant="accent"
              size="lg"
              label={`Talebi Gönder · ${formatTRY(totalKurus)}`}
              onPress={handleConfirm}
              loading={loading}
              disabled={loading}
            />

            <Pressable
              onPress={handleClose}
              style={{ alignItems: "center", paddingVertical: 8 }}
            >
              <Text
                style={{
                  color: c.mutedForeground,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 13,
                }}
              >
                Vazgeç
              </Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(14, 42, 71, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  sheet: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "92%",
    borderRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
  },
});
