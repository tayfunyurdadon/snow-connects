// Per-person tiered pricing helpers + new payment-model breakdown.
//
// Pricing model (kuruş, smallest TRY unit):
//   lesson    = base + VAT(20% of base)
//   bank      = round(lesson × bank_commission_rate)   (deducted from instructor)
//   fee       = transaction_fee_kurus                  (flat, on top of lesson)
//   customer pays = lesson + fee
//   instructor net = lesson - bank
//   platform revenue = bank + fee

import type { InstructorProfile } from "./types";

export const VAT_RATE = 0.2;
// Defaults that mirror the seeded app_config row. Used as fallbacks when
// the config row hasn't been read yet (e.g. first paint of the booking
// summary). Server is the source of truth at booking time.
export const DEFAULT_BANK_COMMISSION_RATE = 0.04;
export const DEFAULT_TRANSACTION_FEE_KURUS = 10000; // 100 TL

export type TieredProfile = Pick<
  InstructorProfile,
  | "base_price"
  | "price_1_person"
  | "price_2_person"
  | "price_3_person"
  | "price_4_plus_person"
>;

// Per-tier price columns coming off `ski_schools` (Phase 10). A
// school-affiliated instructor inherits these instead of using their
// own per-person prices, mirroring the server-side rule in
// `create_booking` (Phase 15).
export interface SchoolPricingTiers {
  price_1_kurus?: number | null;
  price_2_kurus?: number | null;
  price_3_kurus?: number | null;
  price_4plus_kurus?: number | null;
}

/**
 * Merge a school's tier prices onto an instructor's profile. A school
 * tier overrides the instructor's tier only when set (> 0), so a
 * school can leave a single tier blank and the instructor's own price
 * still applies. Returns the original profile unchanged when the
 * instructor is independent (no school) or the school hasn't set any
 * prices yet.
 */
export function effectiveTieredProfile<T extends TieredProfile>(
  profile: T | null | undefined,
  school: SchoolPricingTiers | null | undefined,
): T | null | undefined {
  if (!profile || !school) return profile;
  const s1 = school.price_1_kurus ?? 0;
  const s2 = school.price_2_kurus ?? 0;
  const s3 = school.price_3_kurus ?? 0;
  const s4 = school.price_4plus_kurus ?? 0;
  if (s1 <= 0 && s2 <= 0 && s3 <= 0 && s4 <= 0) return profile;
  return {
    ...profile,
    price_1_person: s1 > 0 ? s1 : profile.price_1_person,
    price_2_person: s2 > 0 ? s2 : profile.price_2_person,
    price_3_person: s3 > 0 ? s3 : profile.price_3_person,
    price_4_plus_person: s4 > 0 ? s4 : profile.price_4_plus_person,
  };
}

export function pickTierKurus(
  profile: TieredProfile | null | undefined,
  studentCount: number,
): number {
  if (!profile) return 0;
  const count = Math.max(1, Math.floor(studentCount || 1));
  const fallback = profile.base_price ?? 0;
  const pick = (v: number | null | undefined) =>
    v && v > 0 ? v : fallback;
  if (count >= 4) return pick(profile.price_4_plus_person);
  if (count === 3) return pick(profile.price_3_person);
  if (count === 2) return pick(profile.price_2_person);
  return pick(profile.price_1_person);
}

export function withVat(kurus: number): number {
  return Math.round(kurus * (1 + VAT_RATE));
}

export interface PricingBreakdown {
  perPerson: number;
  students: number;
  slots: number;
  base: number;
  vat: number;
  /** lesson amount = base + vat */
  lesson: number;
  /** flat transaction fee (Snow Connects) */
  transactionFee: number;
  /** total customer pays = lesson + transactionFee */
  total: number;
  /** bank commission deducted from instructor */
  bankCommission: number;
  /** instructor net = lesson - bankCommission */
  instructorNet: number;
}

export interface BreakdownOptions {
  bankCommissionRate?: number;
  transactionFeeKurus?: number;
}

export function calcBreakdown(
  profile: TieredProfile | null | undefined,
  studentCount: number,
  slotCount: number,
  opts: BreakdownOptions = {},
): PricingBreakdown {
  const bankRate = opts.bankCommissionRate ?? DEFAULT_BANK_COMMISSION_RATE;
  const fee = opts.transactionFeeKurus ?? DEFAULT_TRANSACTION_FEE_KURUS;
  const perPerson = pickTierKurus(profile, studentCount);
  const students = Math.max(1, Math.floor(studentCount || 1));
  const slots = Math.max(0, Math.floor(slotCount || 0));
  const base = perPerson * students * slots;
  const vat = Math.round(base * VAT_RATE);
  const lesson = base + vat;
  const bankCommission = Math.round(lesson * bankRate);
  return {
    perPerson,
    students,
    slots,
    base,
    vat,
    lesson,
    transactionFee: fee,
    total: lesson + fee,
    bankCommission,
    instructorNet: lesson - bankCommission,
  };
}
