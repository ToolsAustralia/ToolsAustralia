import { useMutation } from "@tanstack/react-query";
import { PARTNER_SSO_ERRORS } from "@/utils/partner-discounts/sso-access";
import type { PartnerSsoSharedField } from "@/utils/partner-discounts/partner-consent";

/**
 * usePartnerDiscountSso — open the MyRewards portal via the gated SSO hand-off.
 *
 * Calls `POST /api/partner-discount/sso`. Two success-ish outcomes:
 *  - `{ kind: "redirect" }` — a token was minted; the caller navigates to `redirectUrl`.
 *  - `{ kind: "consent" }`  — the server refused (409) because this member has not
 *    consented to the CURRENT disclosed-field set, and handed back the exact fields to
 *    show. The caller opens the consent sheet, then retries.
 *
 * WHY CONSENT IS A RESOLVED VALUE, NOT AN ERROR: `consentRequired` is a normal branch of
 * the flow, not a failure. Throwing it would light up every `sso.error` renderer on the
 * call sites with a message the member should never read.
 *
 * WHY THIS HOOK NO LONGER NAVIGATES: it used to `window.location.assign` in `onSuccess`,
 * which made the hand-off instantaneous-and-invisible. The transit takeover now owns that
 * moment (it has to render its success state before the browser leaves), so navigation is
 * the caller's job — see `PortalHandoff`.
 *
 * WHY A RAW fetch (not `apiPost` from `@/lib/queries`): `apiPost` force-signs-the-user-out
 * on ANY 401/403. But THIS route's 403 means "no active partner-discount access" — a
 * feature gate, NOT an invalid session. A logged-in member who lacks access must see a
 * "no access" error, never be logged out of the whole site. So we read the response here.
 */
interface SsoSuccessResponse {
  success: true;
  data: { redirectUrl: string };
}
interface SsoConsentResponse {
  success: false;
  error: string;
  consentRequired: true;
  data: { fields: PartnerSsoSharedField[]; scopeVersion: number };
}
interface SsoFailureResponse {
  success: false;
  error: string;
  consentRequired?: false;
}

export type PartnerSsoOutcome =
  | { kind: "redirect"; redirectUrl: string }
  | { kind: "consent"; fields: PartnerSsoSharedField[]; scopeVersion: number };

async function requestPortalSso(): Promise<PartnerSsoOutcome> {
  const res = await fetch("/api/partner-discount/sso", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const body = (await res.json().catch(() => null)) as
    | SsoSuccessResponse
    | SsoConsentResponse
    | SsoFailureResponse
    | null;

  if (body && body.success === false && body.consentRequired) {
    return { kind: "consent", fields: body.data.fields, scopeVersion: body.data.scopeVersion };
  }
  if (!res.ok || !body?.success) {
    throw new Error(
      body && body.success === false ? body.error : PARTNER_SSO_ERRORS.clientFallback
    );
  }
  return { kind: "redirect", redirectUrl: body.data.redirectUrl };
}

export function usePartnerDiscountSso() {
  return useMutation({ mutationFn: requestPortalSso });
}

/**
 * usePartnerDiscountConsent — record the member's agreement, then let the caller retry
 * the hand-off. No body: the server re-derives the field list so a tampered client can
 * never record consent for a narrower set than we actually send.
 */
async function recordConsent(): Promise<void> {
  const res = await fetch("/api/partner-discount/consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const body = (await res.json().catch(() => null)) as
    | { success: true }
    | { success: false; error: string }
    | null;
  if (!res.ok || !body?.success) {
    throw new Error(
      body && body.success === false ? body.error : PARTNER_SSO_ERRORS.clientFallback
    );
  }
}

export function usePartnerDiscountConsent() {
  return useMutation({ mutationFn: recordConsent });
}
