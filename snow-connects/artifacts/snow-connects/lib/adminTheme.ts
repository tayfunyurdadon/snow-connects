// Admin theme — deliberately darker, denser and more "operations console"
// than the warm Alpine Aurora customer palette. Admin screens render with
// these tokens so operators can scan dense data without sun-toned cream.
//
// We intentionally do NOT plug into useColors() — admin screens use this
// directly so the customer-side components keep their warm palette and
// admins get the cooler, higher-contrast surface.

export const adminTheme = {
  bg: "#0E1420",
  surface: "#161D2D",
  surfaceMuted: "#1F273A",
  surfaceHi: "#222B40",
  border: "#2A334A",
  borderSoft: "#222B40",

  text: "#E8EAF0",
  textMuted: "#9098AE",
  textDim: "#6B7388",

  accent: "#E5704C",
  accentDeep: "#C45638",
  accentSoft: "#3A2620",

  success: "#4ADE80",
  successSoft: "#1B3A26",
  warning: "#F59E0B",
  warningSoft: "#3A2A12",
  danger: "#EF4444",
  dangerSoft: "#3A1F22",
  info: "#60A5FA",
  infoSoft: "#1A2A40",

  radius: 14,
  radiusLg: 20,
  radiusSm: 10,

  fontHeadline: "Fraunces_600SemiBold",
  fontTitle: "Inter_700Bold",
  fontBody: "Inter_500Medium",
  fontMono: "Inter_500Medium",
} as const;

export type AdminTone =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "accent"
  | "info";

export function adminToneStyle(tone: AdminTone) {
  switch (tone) {
    case "success":
      return { bg: adminTheme.successSoft, fg: adminTheme.success };
    case "warning":
      return { bg: adminTheme.warningSoft, fg: adminTheme.warning };
    case "danger":
      return { bg: adminTheme.dangerSoft, fg: adminTheme.danger };
    case "accent":
      return { bg: adminTheme.accentSoft, fg: adminTheme.accent };
    case "info":
      return { bg: adminTheme.infoSoft, fg: adminTheme.info };
    default:
      return { bg: adminTheme.surfaceMuted, fg: adminTheme.textMuted };
  }
}
