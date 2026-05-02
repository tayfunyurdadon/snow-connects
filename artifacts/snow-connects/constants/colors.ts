const palette = {
  white: "#ffffff",
  paper: "#fafafa",
  bone: "#f4f4f0",
  ice50: "#f6f8fb",
  ice100: "#eaf0f6",
  ice200: "#cfdbe6",
  // Deep editorial navy — base brand color (Val d'Isère palette).
  navy: "#0D1B2A",
  navyDeep: "#06101c",
  navySoft: "#1a2a44",
  navyMuted: "#2c3e5b",
  // Crimson red — used for active states, dashes and CTA buttons.
  red: "#C41230",
  redDark: "#9c0d24",
  slate: "#4A5568",
  slateMuted: "#8a96a7",
  border: "#e3e7ec",
  borderStrong: "#cdd5df",
  // Soft ice blue-gray for grouped cards and inset surfaces.
  iceCard: "#F0F4F8",
  danger: "#dc2626",
  warning: "#d97706",
  success: "#059669",
  // Translucent overlays for hero imagery.
  overlay: "rgba(10, 22, 40, 0.55)",
  overlayDark: "rgba(5, 13, 26, 0.78)",
};

const colors = {
  light: {
    text: palette.navy,
    tint: palette.navy,

    background: palette.white,
    foreground: palette.navy,

    card: palette.white,
    cardForeground: palette.navy,

    primary: palette.navy,
    primaryForeground: palette.white,

    secondary: palette.iceCard,
    secondaryForeground: palette.navy,

    muted: palette.ice50,
    mutedForeground: palette.slate,

    // Accent is the editorial red — chevrons, active tabs, key callouts.
    accent: palette.red,
    accentForeground: palette.white,
    accentDark: palette.redDark,

    destructive: palette.danger,
    destructiveForeground: palette.white,

    border: palette.border,
    borderStrong: palette.borderStrong,
    input: palette.border,

    navySoft: palette.navySoft,
    navyDeep: palette.navyDeep,
    navyMuted: palette.navyMuted,
    slateMuted: palette.slateMuted,
    success: palette.success,
    warning: palette.warning,
    overlay: palette.overlay,
    overlayDark: palette.overlayDark,
    paper: palette.paper,
    bone: palette.bone,
    iceCard: palette.iceCard,
  },
  radius: 18,
};

export default colors;
