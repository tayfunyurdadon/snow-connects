// Per-person tiered pricing helpers.
//
// Instructors set a per-person rate for 1, 2, 3, and 4+ student lessons.
// All values stored in kuruş (smallest TRY unit), per 50-minute slot.
//
// Legacy profiles created before tiered pricing only have `base_price`
// (a per-slot, group-flat rate). We fall back to it for any unfilled
// tier so old listings keep working until the instructor edits them.

import type { InstructorProfile } from "./types";

export const VAT_RATE = 0.2;

export type TieredProfile = Pick<
  InstructorProfile,
  | "base_price"
  | "price_1_person"
  | "price_2_person"
  | "price_3_person"
  | "price_4_plus_person"
>;

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
  total: number;
}

export function calcBreakdown(
  profile: TieredProfile | null | undefined,
  studentCount: number,
  slotCount: number,
): PricingBreakdown {
  const perPerson = pickTierKurus(profile, studentCount);
  const students = Math.max(1, Math.floor(studentCount || 1));
  const slots = Math.max(0, Math.floor(slotCount || 0));
  const base = perPerson * students * slots;
  const vat = Math.round(base * VAT_RATE);
  return { perPerson, students, slots, base, vat, total: base + vat };
}
