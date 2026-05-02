// Editorial hero photography for each resort.
//
// We currently fall back to a single high-quality alpine photograph for
// every resort because we have not yet sourced bespoke imagery for each
// of the seven Turkish ski centres. To upgrade:
//   1. Add a `hero_image text` column to the `resorts` table, or
//   2. Replace the URLs in `HERO_BY_NAME` below with per-resort photos
//      (the keys are normalised — accent- and case-insensitive).
const FALLBACK =
  "https://images.unsplash.com/photo-1551524559-8af4e6624178?auto=format&fit=crop&w=1600&q=80";

const HERO_BY_NAME: Record<string, string> = {
  // Add per-resort overrides here, e.g.
  // uludag: "https://example.com/uludag.jpg",
};

function normalise(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/\s+/g, "");
}

export function getResortHero(name: string): string {
  return HERO_BY_NAME[normalise(name)] ?? FALLBACK;
}
