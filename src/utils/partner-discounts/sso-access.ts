/**
 * Partner-discount access decision for the MyRewards SSO / offers server paths.
 *
 * Two pieces:
 *  - `buildSsoAccessDecision` — PURE read: does the user have active access, and
 *    (if so) what's their effective tier. Unit-testable offline.
 *  - `reconcilePartnerDiscountAccess` — the canonical **reconcile-then-read**: it
 *    promotes any paid-but-unswept queue items (the ~190 "stuck" users), best-effort
 *    persists, then returns the decision. Reuse this from BOTH the SSO route and the
 *    offers route — never bare-read.
 *
 * See docs/auth/igodirect-sso-implementation-plan.md §3-§4.
 *
 * @module utils/partner-discounts/sso-access
 */

import type { IUser } from "@/models/User";
import { processPartnerDiscountQueue } from "@/utils/partner-discounts/partner-discount-queue";
import { getPartnerDiscountAccessInfo } from "@/utils/membership/benefit-resolution";
import { resolveMemberLevel, type ResolvedMemberLevel } from "@/utils/partner-discounts/member-level";

export interface SsoAccessDecision {
  /** Whether the member currently has active partner-discount access (the gate). */
  hasAccess: boolean;
  /** Full access detail (source, expiry, days/hours remaining) for callers/logging. */
  accessInfo: ReturnType<typeof getPartnerDiscountAccessInfo>;
  /** Effective tier, or null when no plan resolves (fail-closed). Resolved only when `hasAccess`. */
  memberLevel: ResolvedMemberLevel | null;
}

/**
 * Pure access + tier read for an ALREADY-reconciled user. No side effects.
 * The tier is resolved only when access is active (a member with no access has no tier).
 */
export function buildSsoAccessDecision(user: IUser): SsoAccessDecision {
  const accessInfo = getPartnerDiscountAccessInfo(user);
  return {
    hasAccess: accessInfo.hasAccess,
    accessInfo,
    memberLevel: accessInfo.hasAccess ? resolveMemberLevel(user) : null,
  };
}

/**
 * Reconcile-then-read: promote due-but-unswept access, persist (best-effort), then
 * read the decision. MUST be used for any SSO/offers access decision — a bare read
 * wrongly denies members whose paid access hasn't been swept active yet.
 *
 * N9: the save is best-effort. `processPartnerDiscountQueue` mutates `user` IN MEMORY,
 * and the decision is read from that in-memory state — so a transient save failure
 * (e.g. a version conflict) must NOT block the hand-off. We log and proceed.
 */
export async function reconcilePartnerDiscountAccess(user: IUser): Promise<SsoAccessDecision> {
  const changed = await processPartnerDiscountQueue(user);
  if (changed) {
    try {
      await user.save();
    } catch (err) {
      console.error("[partner-sso] reconcile save failed; proceeding with in-memory state:", err);
    }
  }
  return buildSsoAccessDecision(user);
}

/**
 * Customer-facing copy for every way the SSO hand-off can fail (panel F-044).
 *
 * These strings are rendered VERBATIM and INLINE to members — `usePartnerDiscountSso`
 * surfaces the route's `error` body under the "Open partner portal" buttons on
 * /membership, /purchase-success and the Rewards card. They had no coverage in any
 * layer: the route is a Next handler (this repo has no route-handler tests), the hook
 * fallback is inline in a fetch wrapper, and both render sites sit behind conditionals.
 * A refactor reverting one to "Forbidden" would have been invisible to every gate.
 *
 * `noAccess` is load-bearing: the hook deliberately bypasses `apiPost` (which force
 * signs-out on 401/403) so that a partner-access miss never logs a member out of the
 * whole site. Keep it a customer-facing sentence, never API-speak.
 *
 * Pinned by `npm run test:sso-access`.
 */
export const PARTNER_SSO_ERRORS = {
  /** 404 — the go-live flag is dark, so the route is deliberately hidden. */
  flagDark: "The partner portal isn't available right now.",
  /** 429 — courtesy rate limiter. */
  rateLimited: "Too many attempts. Please wait a moment and try again.",
  /** 403 — reconcile-then-read found no live access. Surface-neutral by design: it also
   *  renders on the Rewards page itself, so it must not send anyone to the page they
   *  are already on, nor contradict a banner that just said "You're set". */
  noAccess:
    "Your partner access isn't active right now — it may have just expired. Refresh and try again, or contact us if it looks wrong.",
  /** 409 — no valid consent for the current disclosed-field set. NOT an error the member
   *  should ever read: the client intercepts `consentRequired` and opens the consent
   *  sheet instead. This string is the fallback for a client that somehow renders it. */
  consentRequired: "Please review what gets shared before opening the partner portal.",
  /** 502 — the vendor's /generatetoken refused or failed. */
  providerDown: "The partner portal is temporarily unavailable. Please try again shortly.",
  /** 500 — anything unhandled. */
  unknown: "Something went wrong opening the partner portal. Please try again.",
  /** Client-side fallback when the response body carries no usable error. */
  clientFallback: "Could not open the partner portal. Please try again.",
} as const;
