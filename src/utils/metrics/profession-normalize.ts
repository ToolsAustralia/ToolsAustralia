/**
 * Profession normalization for user metrics.
 *
 * Users can free-text a profession via the "Other" path of the signup modal
 * (`src/data/professions.ts`). This util folds typos, casing, plurals, and Aussie
 * trade nicknames into the canonical 11 buckets, while preserving "Other" (the
 * dropdown choice) as a distinct value from "Other (custom)" (the rolled-up
 * long-tail bucket produced by `bucketUnmatched`).
 */

import { PROFESSIONS } from "@/data/professions";

const CANONICAL_VALUES: readonly string[] = PROFESSIONS.map((p) => p.value);
const CANONICAL_LOWER = new Map<string, string>(
  CANONICAL_VALUES.map((v) => [v.toLowerCase(), v])
);
const CANONICAL_SET = new Set<string>(CANONICAL_VALUES);

export const PROFESSION_SYNONYMS: Readonly<Record<string, string>> = {
  // Electrician
  sparky: "Electrician",
  sparkie: "Electrician",
  electric: "Electrician",
  electrcian: "Electrician", // common typo
  elec: "Electrician",
  // Builder (covers carpentry — no separate Carpenter canonical)
  chippy: "Builder",
  chippie: "Builder",
  carpenter: "Builder",
  carpentry: "Builder",
  builder: "Builder",
  "construction worker": "Builder",
  tradie: "Builder",
  tradesman: "Builder",
  // Plumber
  plumber: "Plumber",
  plumbing: "Plumber",
  plumb: "Plumber",
  // Mechanic
  mechanic: "Mechanic",
  mech: "Mechanic",
  "motor mechanic": "Mechanic",
  "auto mechanic": "Mechanic",
  // Landscaper
  landscaper: "Landscaper",
  landscaping: "Landscaper",
  gardener: "Landscaper",
  gardening: "Landscaper",
  // Welder
  welder: "Welder",
  welding: "Welder",
  welda: "Welder",
  // Bricklayer
  bricklayer: "Bricklayer",
  bricky: "Bricklayer",
  brickie: "Bricklayer",
  "brick layer": "Bricklayer",
  // Concreter
  concreter: "Concreter",
  concretor: "Concreter",
  concrete: "Concreter",
  concreting: "Concreter",
  // Fitter & Turner
  fitter: "Fitter & Turner",
  turner: "Fitter & Turner",
  "fitter and turner": "Fitter & Turner",
  "fitter & turner": "Fitter & Turner",
  // Painter
  painter: "Painter",
  painting: "Painter",
  "painter & decorator": "Painter",
  // Construction
  construction: "Construction",
  constructor: "Construction",
};

function titleCase(s: string): string {
  return s
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function sanitize(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/[\s.,;:!?]+$/g, "")
    .trim();
}

export function normalizeProfession(raw: string | null | undefined): string {
  if (!raw) return "Unknown";
  const cleaned = sanitize(raw);
  if (!cleaned) return "Unknown";
  const lower = cleaned.toLowerCase();

  if (PROFESSION_SYNONYMS[lower]) return PROFESSION_SYNONYMS[lower];

  const canonical = CANONICAL_LOWER.get(lower);
  if (canonical) return canonical;

  if (lower.endsWith("s") && lower.length > 1) {
    const singular = lower.slice(0, -1);
    if (PROFESSION_SYNONYMS[singular]) return PROFESSION_SYNONYMS[singular];
    const canonicalSingular = CANONICAL_LOWER.get(singular);
    if (canonicalSingular) return canonicalSingular;
  }

  return titleCase(cleaned);
}

/**
 * Split aggregated profession counts into canonical (kept) vs unmatched
 * (top-N kept individually, rest summed into "Other (custom)").
 *
 * Note: the canonical "Other" (from the dropdown) stays distinct from
 * "Other (custom)" (the rolled-up bucket) — they are two different bars.
 */
export function bucketUnmatched(
  counts: Record<string, number>,
  topN = 5
): Record<string, number> {
  const result: Record<string, number> = {};
  const unmatched: Array<[string, number]> = [];

  for (const [key, val] of Object.entries(counts)) {
    if (CANONICAL_SET.has(key) || key === "Unknown") {
      result[key] = val;
    } else {
      unmatched.push([key, val]);
    }
  }

  unmatched.sort((a, b) => b[1] - a[1]);
  const top = unmatched.slice(0, topN);
  const rest = unmatched.slice(topN);

  for (const [key, val] of top) {
    result[key] = val;
  }

  if (rest.length > 0) {
    result["Other (custom)"] = rest.reduce((sum, [, v]) => sum + v, 0);
  }

  return result;
}
