import { Feather } from "@expo/vector-icons";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Animated, Easing, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

type Tone = "default" | "success" | "danger";

interface ToastItem {
  message: string;
  tone: Tone;
}

interface ToastCtx {
  show: (message: string, tone?: Tone) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [item, setItem] = useState<ToastItem | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(-16)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const c = useColors();

  const show = useCallback(
    (message: string, tone: Tone = "default") => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setItem({ message, tone });
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }),
        Animated.timing(translate, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }),
      ]).start();
      hideTimer.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.timing(translate, {
            toValue: -16,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start(() => setItem(null));
      }, 2200);
    },
    [opacity, translate],
  );

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  const bg =
    item?.tone === "success"
      ? "#1F7A3D"
      : item?.tone === "danger"
        ? c.danger
        : c.foreground;

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {item ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: insets.top + 12,
            left: 0,
            right: 0,
            alignItems: "center",
            opacity,
            transform: [{ translateY: translate }],
            zIndex: 9999,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderRadius: 999,
              backgroundColor: bg,
              maxWidth: "92%",
              ...({ boxShadow: c.shadow } as object),
            }}
          >
            <Feather
              name={
                item.tone === "success"
                  ? "check-circle"
                  : item.tone === "danger"
                    ? "alert-circle"
                    : "info"
              }
              size={16}
              color={c.background}
            />
            <Text
              style={{
                color: c.background,
                fontFamily: "Inter_600SemiBold",
                fontSize: 13,
              }}
              numberOfLines={2}
            >
              {item.message}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      show: () => {
        // no-op fallback when used outside provider
      },
    };
  }
  return ctx;
}
