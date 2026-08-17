// src/lib/tracking/advanced-matching.ts
import { hashPII } from "./canonical-event";
import { normalizePhoneE164 } from "@/utils/tracking/tiktok-helpers";
import { genderToMetaGe } from "@/data/genders";

/**
 * Meta `ph` normalization: E.164 digits WITH country code, no `+`, no leading zero —
 * per Meta's spec, `"0412 345 678"` must hash as `"61412345678"`, not `"0412345678"`.
 * Reuses the same AU-aware normalizer the TikTok path uses (client-bundle-safe).
 * MUST be used by every Meta phone-hash site (browser AM, CAPI provider, legacy
 * prepareUserData) so all surfaces produce identical hashes.
 */
export function metaPhoneDigits(phone: string): string {
  return normalizePhoneE164(phone).replace(/\D/g, "");
}

/**
 * Subset of Meta's Advanced Matching parameters that we collect.
 * All values are SHA-256 hex hashes of normalized input.
 *
 * Reference: https://developers.facebook.com/docs/meta-pixel/advanced/advanced-matching
 *
 * Fields we deliberately don't collect today (and so don't send):
 * - ct (city) — not on user record
 * - zp (zip / postcode) — not always present
 */
export interface AdvancedMatchingFields {
  em?: string;
  fn?: string;
  ln?: string;
  ph?: string;
  db?: string;
  /**
   * Gender. Meta's spec: "Single lowercase letter, `f` or `m`, if unknown, leave blank."
   * Our `User.gender` is optional and only ever holds `male`/`female`, so most users produce
   * NO `ge` at all — omitting is Meta's own prescribed behaviour for unknown, not a fallback.
   */
  ge?: string;
  st?: string;
  country?: string;
  external_id?: string;
}

/** Input shape — accepts any object with these optional fields, including UserData. */
export interface AdvancedMatchingInput {
  _id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  mobile?: string;
  state?: string;
  birthdate?: string;
  /** `"male"` | `"female"` | anything else/absent → no `ge` is sent. */
  gender?: string;
}

function nonEmpty(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Normalize ISO date string or any Date-parseable input to YYYYMMDD. */
function toYYYYMMDD(value: string | undefined): string | undefined {
  const trimmed = nonEmpty(value);
  if (!trimmed) return undefined;
  // Already YYYYMMDD (8 digits)
  if (/^\d{8}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return undefined;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * Build a Meta Advanced Matching parameters object from a user-like input.
 *
 * The same `hashPII` helper is used here that the server-side `facebookProvider.capiSend`
 * uses for `user_data` — this guarantees identical hashes on both sides so Meta can
 * dedup user identity across browser pixel and CAPI events.
 *
 * Fields with no value (undefined / empty / whitespace-only) are omitted entirely
 * from the result so we don't pollute Meta with hashes of empty strings.
 *
 * `country` defaults to "au" (Tools Australia) when no explicit country is supplied.
 */
export function buildAdvancedMatching(input: AdvancedMatchingInput): AdvancedMatchingFields {
  const result: AdvancedMatchingFields = {};

  const email = nonEmpty(input.email);
  if (email) result.em = hashPII(email);

  const firstName = nonEmpty(input.firstName);
  if (firstName) result.fn = hashPII(firstName);

  const lastName = nonEmpty(input.lastName);
  if (lastName) result.ln = hashPII(lastName);

  const mobile = nonEmpty(input.mobile);
  if (mobile) {
    const digits = metaPhoneDigits(mobile); // E.164 digits (61…), per Meta's ph spec
    if (digits.length > 0) result.ph = hashPII(digits);
  }

  const state = nonEmpty(input.state);
  if (state) result.st = hashPII(state);

  const dob = toYYYYMMDD(input.birthdate);
  if (dob) result.db = hashPII(dob);

  // Gender → Meta's single-letter `ge`. Omitted entirely when unknown: hashing "" would send
  // a real hash of an empty string, which Meta would treat as a value and which would differ
  // from the server-side path if that one omitted it — silently WORSENING match quality.
  const ge = genderToMetaGe(input.gender);
  if (ge) result.ge = hashPII(ge);

  // Tools Australia ships only to AU. If we ever support multi-country, accept
  // an optional `country` field on input.
  result.country = hashPII("au");

  const externalId = nonEmpty(input._id);
  if (externalId) result.external_id = hashPII(externalId);

  return result;
}
