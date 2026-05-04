/**
 * Age grouping for user demographics.
 *
 * Buckets are computed from `birthdate` as of "now" (or an injected `asOf` for tests).
 * `Unknown` covers: missing birthdate, future birthdate, and ages < 18 (signup floor —
 * anything below is treated as dirty data rather than skewing the chart).
 */

export type AgeGroupLabel =
  | "18-24"
  | "25-34"
  | "35-44"
  | "45-54"
  | "55-64"
  | "65+"
  | "Unknown";

export const AGE_GROUP_ORDER: readonly AgeGroupLabel[] = [
  "18-24",
  "25-34",
  "35-44",
  "45-54",
  "55-64",
  "65+",
  "Unknown",
];

/** Calendar-method age (handles leap years correctly — never use ms division). */
function calendarAgeYears(birth: Date, asOf: Date): number {
  let age = asOf.getUTCFullYear() - birth.getUTCFullYear();
  const m = asOf.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && asOf.getUTCDate() < birth.getUTCDate())) {
    age--;
  }
  return age;
}

export function getAgeGroup(
  birthdate: Date | null | undefined,
  asOf: Date = new Date()
): AgeGroupLabel {
  if (!birthdate) return "Unknown";
  if (Number.isNaN(birthdate.getTime())) return "Unknown";
  if (birthdate.getTime() > asOf.getTime()) return "Unknown";

  const age = calendarAgeYears(birthdate, asOf);
  if (age < 18) return "Unknown";
  if (age <= 24) return "18-24";
  if (age <= 34) return "25-34";
  if (age <= 44) return "35-44";
  if (age <= 54) return "45-54";
  if (age <= 64) return "55-64";
  return "65+";
}
