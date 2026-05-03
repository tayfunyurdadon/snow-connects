import type { VerificationStatus } from "./types";

export interface StatusMeta {
  label: string;
  description: string;
  tone: "default" | "success" | "warning" | "danger";
}

export const VERIFICATION_LABELS: Record<VerificationStatus, StatusMeta> = {
  pending_documents: {
    label: "Belge bekleniyor",
    description:
      "Hesabınızın aktif olması için belgelerinizi yüklemeniz gerekmektedir.",
    tone: "warning",
  },
  pending_review: {
    label: "Onay bekliyor",
    description:
      "Belgeleriniz incelenmek üzere alındı. Genellikle 1-2 iş günü içinde sonuçlandırılır.",
    tone: "warning",
  },
  approved: {
    label: "Onaylı",
    description: "Hesabınız aktif. Müşteriler sizi listede görebilir.",
    tone: "success",
  },
  rejected: {
    label: "Reddedildi",
    description:
      "Başvurunuz reddedildi. Belgelerinizi güncelleyip tekrar gönderebilirsiniz.",
    tone: "danger",
  },
  suspended: {
    label: "Askıya alındı",
    description:
      "Hesabınız geçici olarak devre dışı. Lütfen destek ekibimizle iletişime geçin.",
    tone: "danger",
  },
};

// Basic Turkish IBAN sanity check: starts with TR, 26 chars total
// after stripping spaces, remaining 24 are digits.
export function isValidTrIban(raw: string): boolean {
  const s = (raw || "").replace(/\s+/g, "").toUpperCase();
  return /^TR\d{24}$/.test(s);
}

export function formatIban(raw: string): string {
  const s = (raw || "").replace(/\s+/g, "").toUpperCase();
  return s.replace(/(.{4})/g, "$1 ").trim();
}

// 11 digits; we don't run the full national checksum (avoid false rejects on
// edge cases / older IDs) — the admin reviews the document anyway.
export function isValidTcKimlik(raw: string): boolean {
  const digits = (raw || "").replace(/\D/g, "");
  return /^\d{11}$/.test(digits) && digits[0] !== "0";
}
