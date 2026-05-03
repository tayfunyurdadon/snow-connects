import { Alert, Platform } from "react-native";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/**
 * Cross-platform confirmation dialog.
 *
 * On native uses Alert.alert with two buttons; on web falls back to
 * window.confirm so the dialog actually appears in the browser preview.
 * Resolves true if the user confirmed, false otherwise.
 */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  const {
    title,
    message,
    confirmLabel = "Onayla",
    cancelLabel = "İptal",
    destructive,
  } = opts;

  if (Platform.OS === "web") {
    const text = message ? `${title}\n\n${message}` : title;
    const ok =
      typeof globalThis !== "undefined" && typeof globalThis.confirm === "function"
        ? globalThis.confirm(text)
        : false;
    return Promise.resolve(ok);
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      {
        text: cancelLabel,
        style: "cancel",
        onPress: () => resolve(false),
      },
      {
        text: confirmLabel,
        style: destructive ? "destructive" : "default",
        onPress: () => resolve(true),
      },
    ]);
  });
}
