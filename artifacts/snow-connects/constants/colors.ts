const palette = {
  white: "#ffffff",
  ice50: "#f4f9ff",
  ice100: "#e6f0fa",
  ice200: "#cfe2f3",
  ice300: "#a8c8e0",
  iceBlue: "#7fb3d5",
  navy: "#0e2a47",
  navyDeep: "#081a2e",
  navySoft: "#1d4673",
  slate: "#475569",
  slateMuted: "#94a3b8",
  border: "#dbe6f0",
  danger: "#dc2626",
  warning: "#d97706",
  success: "#059669",
};

const colors = {
  light: {
    text: palette.navy,
    tint: palette.navy,

    background: palette.ice50,
    foreground: palette.navy,

    card: palette.white,
    cardForeground: palette.navy,

    primary: palette.navy,
    primaryForeground: palette.white,

    secondary: palette.ice100,
    secondaryForeground: palette.navy,

    muted: palette.ice100,
    mutedForeground: palette.slate,

    accent: palette.iceBlue,
    accentForeground: palette.white,

    destructive: palette.danger,
    destructiveForeground: palette.white,

    border: palette.border,
    input: palette.border,

    iceBlue: palette.iceBlue,
    navySoft: palette.navySoft,
    slateMuted: palette.slateMuted,
    success: palette.success,
    warning: palette.warning,
  },
  radius: 14,
};

export default colors;
