/**
 * Gender Options for User Profile
 *
 * Optional profile field. A member who does not identify as male or female, or who would rather
 * not answer, simply leaves it unset — there is deliberately no "Other" or "Prefer not to say"
 * option, because the field is never required and an unset value already covers both cases.
 *
 * Consequence to respect everywhere downstream: an unset gender means "we don't know", and it
 * conflates "declined to answer" with "was never asked". No chart, segment or copy may imply
 * anything about members with no value.
 */

export interface GenderOption {
  value: string;
  label: string;
}

/**
 * Available gender options, in display order.
 *
 * `value` is what is persisted on `User.gender` and validated by the Mongoose enum and the
 * route-level Zod schemas. Keep it lowercase — `state` stores an uppercase code and `profession`
 * stores a capitalised label, so there is no single house style to inherit; lowercase matches the
 * Meta `ge` mapping below and the Klaviyo property convention (lowercase property names).
 */
export const GENDERS: GenderOption[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

/** Persisted values, for Mongoose enum / Zod enum. */
export const GENDER_VALUES = ["male", "female"] as const;
export type GenderValue = (typeof GENDER_VALUES)[number];

/**
 * Admin-breakdown bucket labels, in display order. "Not set" is last because it is the absence of
 * an answer rather than an answer.
 */
export const GENDER_BUCKET_ORDER = ["Male", "Female", "Not set"] as const;
export type GenderBucket = (typeof GENDER_BUCKET_ORDER)[number];

/**
 * Map a stored value to its admin-breakdown bucket. Defensive about legacy/dirty rows: anything
 * that is not exactly `male` or `female` after trim+lowercase lands in "Not set".
 */
export function genderBucketFor(value: unknown): GenderBucket {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "male") return "Male";
  if (normalized === "female") return "Female";
  return "Not set";
}

/**
 * Map a stored value to Meta's Advanced Matching `ge` parameter.
 *
 * Meta's spec: "Single lowercase letter, `f` or `m`, if unknown, leave blank." Returning
 * `undefined` for anything else is Meta's own prescribed behaviour for unknown — NOT a fallback
 * we invented — and callers must omit the field entirely rather than hash an empty string.
 */
export function genderToMetaGe(value: unknown): "m" | "f" | undefined {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "male") return "m";
  if (normalized === "female") return "f";
  return undefined;
}
