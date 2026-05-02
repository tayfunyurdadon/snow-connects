// All money amounts are stored in kuruş (smallest TRY unit).

export function fromKurus(amount: number): number {
  return amount / 100;
}

export function toKurus(amountTry: number): number {
  return Math.round(amountTry * 100);
}

export function formatTRY(kurus: number): string {
  const value = fromKurus(kurus);
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(value);
}

const TR_MONTHS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

const TR_WEEKDAYS_SHORT = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

export function formatDateTR(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getDate()} ${TR_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatDateShortTR(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const wd = TR_WEEKDAYS_SHORT[date.getDay()];
  return `${wd} ${date.getDate()} ${TR_MONTHS[date.getMonth()].slice(0, 3)}`;
}

export function monthLabel(year: number, month0: number): string {
  return `${TR_MONTHS[month0]} ${year}`;
}

export const TR_WEEKDAY_HEADERS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
