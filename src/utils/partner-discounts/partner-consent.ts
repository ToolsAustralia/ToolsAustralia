/**
 * Partner-portal (MyRewards) consent — what we disclose, and whether the member agreed.
 *
 * ONE module on purpose. The disclosure list and the consent gate are the same concept:
 * "these are the fields that cross the boundary, and this is the member's agreement to
 * that exact set". Splitting them is how a consent screen drifts out of sync with the
 * payload it is supposed to describe.
 *
 * THE ANTI-DRIFT RULE: `buildPartnerSsoSharedFields` is derived from the SAME inputs
 * `generatePortalSso` signs (see `utils/partner-discounts/sso-flow.ts` →
 * `lib/partner-discount-sso.ts`). The consent sheet renders ONLY what this returns, and
 * the SSO route reads `PARTNER_SSO_SENDS_MEMBER_LEVEL` from here rather than deciding
 * for itself. A guard test (`__tests__/partner-consent.test.ts`) asserts the disclosed
 * key set matches the signer's payload keys — a mismatch is a privacy defect, not a
 * cosmetic one, and `tsc` cannot catch it.
 *
 * @module utils/partner-discounts/partner-consent
 */

import type { IUser } from "@/models/User";

/**
 * Whether the SSO payload currently carries `member_level` (our access-% tier).
 *
 * FALSE today: the route deliberately omits it pending iGoDirect's encoding answer
 * (docs/auth/igodirect-sso-implementation-plan.md §5a). Both the SSO route AND the
 * consent sheet read this constant, so the tier row appears the moment — and only the
 * moment — the field actually starts crossing the boundary. Flipping this to `true`
 * MUST come with a `PARTNER_SSO_SCOPE_VERSION` bump so every member re-consents.
 */
export const PARTNER_SSO_SENDS_MEMBER_LEVEL = false;

/**
 * Version of the disclosed-field SET. Bump whenever the fields we send change — a
 * member's stored consent is only valid for the version they actually saw, so a bump
 * re-prompts everyone. This is the mechanism behind "we'll ask again if what we share
 * ever changes".
 */
export const PARTNER_SSO_SCOPE_VERSION = 1;

export type PartnerSsoSharedFieldKey = "name" | "email" | "accountReference" | "tier";

export interface PartnerSsoSharedField {
  key: PartnerSsoSharedFieldKey;
  /** Row label. Kept to one or two words — this screen is a disclosure, not a brochure. */
  label: string;
  /** The member's real value. Never a placeholder. */
  value: string;
  /** Renders in the brand accent (the tier row, when it is live). */
  accent?: boolean;
}

/**
 * The exact member fields the SSO hand-off sends, in display order.
 *
 * `member_id` IS sent (the opaque `User._id`) and so it IS disclosed — as
 * "Account reference", showing the trailing 6 characters. We do not invent a
 * human-facing member number; there is no such field on the record.
 */
export function buildPartnerSsoSharedFields(
  user: Pick<IUser, "_id" | "firstName" | "lastName" | "email">,
  options: { tierLabel?: string | null } = {}
): PartnerSsoSharedField[] {
  const fields: PartnerSsoSharedField[] = [
    {
      key: "name",
      label: "Name",
      value: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || "—",
    },
    { key: "email", label: "Email", value: user.email },
    {
      key: "accountReference",
      label: "Account reference",
      value: `…${String(user._id).slice(-6)}`,
    },
  ];

  // Only disclosed when it is actually sent — over-disclosure is as wrong as under-disclosure.
  if (PARTNER_SSO_SENDS_MEMBER_LEVEL && options.tierLabel) {
    fields.push({ key: "tier", label: "Membership", value: options.tierLabel, accent: true });
  }

  return fields;
}

/** Stored consent shape on the user record. */
export interface PartnerDiscountConsentRecord {
  scopeVersion: number;
  acceptedAt: Date;
  /** The field keys the member actually saw when they agreed — the legal artefact. */
  fields: PartnerSsoSharedFieldKey[];
}

/**
 * Has this member given consent that is still valid for the CURRENT disclosed field set?
 *
 * Fail-closed: no record, or a record from an older scope version, means re-consent.
 */
export function hasValidPartnerConsent(user: Pick<IUser, "partnerDiscountConsent">): boolean {
  const consent = user.partnerDiscountConsent;
  if (!consent?.acceptedAt) return false;
  return consent.scopeVersion === PARTNER_SSO_SCOPE_VERSION;
}

/**
 * Write the member's consent onto their record.
 *
 * Deliberately NOT best-effort: unlike the issuance log, a consent write that silently
 * fails would let the hand-off proceed with no record that permission was ever given.
 * The caller must let this throw.
 */
export async function recordPartnerConsent(
  user: IUser,
  fields: PartnerSsoSharedFieldKey[]
): Promise<PartnerDiscountConsentRecord> {
  const record: PartnerDiscountConsentRecord = {
    scopeVersion: PARTNER_SSO_SCOPE_VERSION,
    acceptedAt: new Date(),
    fields,
  };
  user.partnerDiscountConsent = record;
  await user.save();
  return record;
}
