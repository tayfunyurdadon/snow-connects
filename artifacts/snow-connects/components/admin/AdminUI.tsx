// Minimal, opinionated admin building blocks. Kept inline (not promoted to
// the shared ui/ folder) so admin styling never leaks into customer or
// instructor screens.
import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { adminTheme, adminToneStyle, type AdminTone } from "@/lib/adminTheme";

export function AdminScreen({
  children,
  contentStyle,
  scroll = true,
}: {
  children: React.ReactNode;
  contentStyle?: ViewStyle;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const content: ViewStyle = {
    paddingHorizontal: 16,
    paddingTop: insets.top + 12,
    paddingBottom: 120,
    gap: 14,
    ...(contentStyle ?? {}),
  };
  if (!scroll) {
    return (
      <View style={[styles.fill, { backgroundColor: adminTheme.bg }, content]}>
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: adminTheme.bg }]}
      contentContainerStyle={content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function AdminHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
        marginBottom: 4,
        gap: 10,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: adminTheme.text,
            fontFamily: adminTheme.fontHeadline,
            fontSize: 24,
            letterSpacing: -0.4,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{
              color: adminTheme.textMuted,
              fontFamily: adminTheme.fontBody,
              fontSize: 13,
              marginTop: 2,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function AdminCard({
  children,
  onPress,
  style,
  padding = 14,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle | ViewStyle[];
  padding?: number;
}) {
  const base: ViewStyle = {
    backgroundColor: adminTheme.surface,
    borderRadius: adminTheme.radius,
    borderWidth: 1,
    borderColor: adminTheme.border,
    padding,
  };
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          base,
          style as ViewStyle,
          pressed && { opacity: 0.85 },
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

export function AdminPill({
  label,
  tone = "default",
  size = "md",
  icon,
}: {
  label: string;
  tone?: AdminTone;
  size?: "sm" | "md";
  icon?: React.ReactNode;
}) {
  const t = adminToneStyle(tone);
  const padH = size === "sm" ? 7 : 10;
  const padV = size === "sm" ? 2 : 4;
  return (
    <View
      style={{
        backgroundColor: t.bg,
        borderRadius: 999,
        paddingHorizontal: padH,
        paddingVertical: padV,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        alignSelf: "flex-start",
      }}
    >
      {icon}
      <Text
        style={{
          color: t.fg,
          fontFamily: adminTheme.fontTitle,
          fontSize: size === "sm" ? 10.5 : 11.5,
          letterSpacing: 0.2,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

export function AdminTabRow<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; count?: number }[];
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: adminTheme.surfaceMuted,
        borderRadius: adminTheme.radius,
        padding: 3,
        borderWidth: 1,
        borderColor: adminTheme.border,
      }}
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            style={{
              flex: 1,
              paddingVertical: 8,
              alignItems: "center",
              borderRadius: adminTheme.radius - 3,
              backgroundColor: active ? adminTheme.surfaceHi : "transparent",
              flexDirection: "row",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Text
              style={{
                color: active ? adminTheme.text : adminTheme.textMuted,
                fontFamily: adminTheme.fontTitle,
                fontSize: 12,
              }}
            >
              {o.label}
            </Text>
            {typeof o.count === "number" ? (
              <View
                style={{
                  backgroundColor: active
                    ? adminTheme.accent
                    : adminTheme.surface,
                  paddingHorizontal: 6,
                  paddingVertical: 1,
                  borderRadius: 8,
                  minWidth: 18,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: active ? "#fff" : adminTheme.textMuted,
                    fontFamily: adminTheme.fontTitle,
                    fontSize: 10,
                  }}
                >
                  {o.count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function AdminEmpty({
  icon = "inbox",
  title,
  description,
}: {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  description?: string;
}) {
  return (
    <View
      style={{
        backgroundColor: adminTheme.surface,
        borderRadius: adminTheme.radius,
        borderWidth: 1,
        borderColor: adminTheme.border,
        paddingVertical: 32,
        alignItems: "center",
        gap: 8,
      }}
    >
      <Feather name={icon} size={26} color={adminTheme.textDim} />
      <Text
        style={{
          color: adminTheme.text,
          fontFamily: adminTheme.fontTitle,
          fontSize: 14,
        }}
      >
        {title}
      </Text>
      {description ? (
        <Text
          style={{
            color: adminTheme.textMuted,
            fontFamily: adminTheme.fontBody,
            fontSize: 12,
            paddingHorizontal: 24,
            textAlign: "center",
          }}
        >
          {description}
        </Text>
      ) : null}
    </View>
  );
}

export function AdminSpinner() {
  return (
    <View style={{ paddingVertical: 28, alignItems: "center" }}>
      <Text style={{ color: adminTheme.textMuted, fontSize: 12 }}>
        Yükleniyor…
      </Text>
    </View>
  );
}

export function AdminButton({
  label,
  onPress,
  tone = "accent",
  size = "md",
  icon,
  disabled,
}: {
  label: string;
  onPress: () => void;
  tone?: "accent" | "ghost" | "danger" | "success";
  size?: "sm" | "md";
  icon?: keyof typeof Feather.glyphMap;
  disabled?: boolean;
}) {
  const bg =
    tone === "accent"
      ? adminTheme.accent
      : tone === "danger"
        ? adminTheme.danger
        : tone === "success"
          ? adminTheme.success
          : "transparent";
  const fg = tone === "ghost" ? adminTheme.text : "#fff";
  const padV = size === "sm" ? 7 : 11;
  const padH = size === "sm" ? 12 : 16;
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: bg,
        borderRadius: adminTheme.radiusSm,
        paddingVertical: padV,
        paddingHorizontal: padH,
        flexDirection: "row",
        gap: 6,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: tone === "ghost" ? 1 : 0,
        borderColor: adminTheme.border,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      {icon ? <Feather name={icon} size={14} color={fg} /> : null}
      <Text
        style={{
          color: fg,
          fontFamily: adminTheme.fontTitle,
          fontSize: size === "sm" ? 12 : 13,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function AdminInput(
  props: TextInputProps & { label?: string; helper?: string },
) {
  const { label, helper, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text
          style={{
            color: adminTheme.textMuted,
            fontFamily: adminTheme.fontTitle,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 0.6,
          }}
        >
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={adminTheme.textDim}
        {...rest}
        style={[
          {
            backgroundColor: adminTheme.surfaceMuted,
            borderColor: adminTheme.border,
            borderWidth: 1,
            borderRadius: adminTheme.radiusSm,
            paddingHorizontal: 12,
            paddingVertical: Platform.OS === "ios" ? 12 : 9,
            color: adminTheme.text,
            fontFamily: adminTheme.fontBody,
            fontSize: 14,
          },
          style,
        ]}
      />
      {helper ? (
        <Text
          style={{
            color: adminTheme.textDim,
            fontFamily: adminTheme.fontBody,
            fontSize: 11,
          }}
        >
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

export function AdminRow({
  left,
  right,
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>{left}</View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
