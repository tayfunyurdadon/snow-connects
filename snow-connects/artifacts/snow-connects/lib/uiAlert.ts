import { Alert, Platform } from "react-native";

type Btn = {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void | Promise<void>;
};

const isWeb =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  typeof window.alert === "function";

export function showAlert(title: string, msg?: string, buttons?: Btn[]) {
  if (isWeb) {
    window.alert(msg ? `${title}\n\n${msg}` : title);
    const action = buttons?.find((b) => b.style !== "cancel");
    void action?.onPress?.();
    return;
  }
  Alert.alert(title, msg, buttons);
}

export function confirmAlert(
  title: string,
  msg: string,
  confirmText: string,
  onConfirm: () => void | Promise<void>,
  opts?: { destructive?: boolean; cancelText?: string },
) {
  const cancelText = opts?.cancelText ?? "Vazgeç";
  if (isWeb && typeof window.confirm === "function") {
    if (window.confirm(`${title}\n\n${msg}`)) void onConfirm();
    return;
  }
  if (isWeb) {
    // No window.confirm available — fall back to a non-blocking alert + run.
    window.alert(`${title}\n\n${msg}`);
    void onConfirm();
    return;
  }
  Alert.alert(title, msg, [
    { text: cancelText, style: "cancel" },
    {
      text: confirmText,
      style: opts?.destructive ? "destructive" : "default",
      onPress: () => void onConfirm(),
    },
  ]);
}
