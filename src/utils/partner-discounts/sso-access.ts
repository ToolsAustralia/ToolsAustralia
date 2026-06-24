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
