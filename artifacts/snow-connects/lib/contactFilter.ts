// Client-side mirror of the server detect_contact_info function.
// Used to warn the user before they hit Send. Server is the source of truth.

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const URL_RE = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|tr|co|io|me|app))/i;
const TR_PHONE_RE =
  /(\+?9?0?[ \-]?\(?5\d{2}\)?[ \-]?\d{3}[ \-]?\d{2}[ \-]?\d{2})/;

export type ContactViolation = "email" | "url" | "phone" | null;

export function detectContactInfo(content: string): ContactViolation {
  const text = content.toLowerCase();
  if (EMAIL_RE.test(text)) return "email";
  if (URL_RE.test(text)) return "url";
  if (TR_PHONE_RE.test(text)) return "phone";
  const digits = text.replace(/[^0-9]/g, "");
  if (/\d{10,}/.test(digits)) return "phone";
  return null;
}

export function violationMessage(v: ContactViolation): string | null {
  switch (v) {
    case "email":
      return "Mesajınız e-posta adresi içeriyor.";
    case "url":
      return "Mesajınız bir bağlantı veya web adresi içeriyor.";
    case "phone":
      return "Mesajınız bir telefon numarası içeriyor.";
    default:
      return null;
  }
}
