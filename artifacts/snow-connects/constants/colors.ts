// Alpine Aurora — a warm, editorial palette for Snow Connects.
//
// The mood: that golden-hour "alpenglow" light that washes a snowy peak
// just after sunset. Warm cream surfaces, deep slate-ink text, and a
// signature terracotta-coral accent that signals warmth and trust
// without resorting to corporate navy.

const palette = {
  // Surfaces — warm whites and creams
  white: "#FFFFFF",
  cream: "#F6F0E4", // background ("fresh snow at sunrise")
  creamSoft: "#FBF6EC",
  sand: "#EFE7D5", // secondary surface
  sandSoft: "#F2EBDC",
  border: "#E5DCC8", // warm sand border
  borderSoft: "#EEE5D2",

  // Ink — primary text & buttons (deep slate, just warm of pure navy)
  ink: "#1B2230",
  inkSoft: "#3A4456",
  taupe: "#6B6457", // muted body text
  taupeSoft: "#9A9384",

  // Signature accent — alpenglow
  alpenglow: "#E5704C",
  alpenglowDeep: "#C45638",
  alpenglowSoft: "#FBE3D6",

  // Status
  success: "#3D7A40",
  successSoft: "#DDECDE",
  warning: "#C77B2B",
  warningSoft: "#F8E5CC",
  danger: "#B33838",
  dangerSoft: "#F4DBDB",
};

const colors = {
  light: {
    // Core
    text: palette.ink,
    tint: palette.alpenglow,
    background: palette.cream,
    foreground: palette.ink,

    // Surfaces
    card: palette.white,
    cardForeground: palette.ink,
    surface: palette.creamSoft,

    // Primary (used for buttons, key strokes, headings)
    primary: palette.ink,
    primaryForeground: palette.white,

    // Secondary (subtle sand fills behind chips, info cards)
    secondary: palette.sand,
    secondaryForeground: palette.ink,

    // Muted (very soft sand, backgrounds for empty rails)
    muted: palette.sandSoft,
    mutedForeground: palette.taupe,

    // Accent (THE brand colour — use sparingly but boldly)
    accent: palette.alpenglow,
    accentForeground: palette.white,
    accentSoft: palette.alpenglowSoft,
    accentDeep: palette.alpenglowDeep,

    // Status
    destructive: palette.danger,
    destructiveForeground: palette.white,
    success: palette.success,
    successSoft: palette.successSoft,
    warning: palette.warning,
    warningSoft: palette.warningSoft,
    danger: palette.danger,
    dangerSoft: palette.dangerSoft,

    // Lines
    border: palette.border,
    borderSoft: palette.borderSoft,
    input: palette.border,

    // Legacy aliases — keep existing screens compiling without edits
    iceBlue: palette.alpenglow,
    navySoft: palette.inkSoft,
    slateMuted: palette.taupeSoft,

    // Shadow tokens (used as boxShadow strings)
    shadow: "0px 6px 20px rgba(27, 34, 48, 0.06)",
    shadowSoft: "0px 2px 8px rgba(27, 34, 48, 0.04)",
    shadowLift: "0px 12px 32px rgba(27, 34, 48, 0.10)",
  },
  // Spacing & shape
  radius: 16,
  radiusLg: 24,
  radiusXl: 28,
  radiusSm: 10,
};

export default colors;
