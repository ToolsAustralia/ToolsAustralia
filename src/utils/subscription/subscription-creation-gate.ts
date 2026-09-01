/**
 * Can this user start a NEW subscription?
 *
 * ONE answer, shared by the modal-open chokepoint (`useMembershipModal`), the step-2
 * pre-warm backstop, and both card-click handlers. It wraps `hasBlockingSubscription` —
 * the SAME helper the server's `checkCanCreateSubscription` uses — so the client can
 * never disagree with the server and walk a member into a guaranteed 409.
 *
 * Before this existed the client asked `subscription.isActive` plus a price comparison
 * while the server asked about five statuses; every disagreement produced an
 * EXISTING_SUBSCRIPTION rejection at the payment step (309 in production).
 *
 * Bias: when in doubt, ALLOW. A false block stops a guest subscribing, which is worse
 * than the bug this closes. The server guard remains the real backstop.
 *
 * @module utils/subscription/subscription-creation-gate
 */

import { hasBlockingSubscription } from "@/utils/subscription/subscription-helpers";
import { isSubscriptionRecoveryStatus } from "@/utils/integrations/klaviyo/klaviyo-renewal-entries-preview";

/** Plan-management sheet — an active member changing tier. */
export const MANAGE_SUBSCRIPTION_PATH = "/my-account/membership?open=subscription";
/** Payment sheet — a member in payment recovery (`past_due` / `unpaid`) who needs to settle. */
export const MANAGE_PAYMENT_PATH = "/my-account/membership?open=payment";

export type SubscriptionCreationGateResult =
  | { allowed: true }
  /**
   * `recovery` = in payment recovery (`past_due` OR `unpaid`) — the repo-wide name for that
   * pair, owned by `isSubscriptionRecoveryStatus`. It was `past_due` until 2026-09-01, when
   * the branch below started (correctly) covering `unpaid` too and the old name stopped
   * describing what it matched.
   */
  | { allowed: false; reason: "recovery" | "blocking"; redirectTo: string };

/**
 * True when a plan is a recurring membership tier rather than a one-time / Additional pack.
 * Replaces the two identical inline copies in `MembershipSection` and `useMembershipCardCta`.
 */
export function isSubscriptionPlan(
  plan: { period?: string; name?: string } | null | undefined
): boolean {
  if (!plan) return false;
  if (plan.period === "one-time") return false;
  return !(plan.name ?? "").toLowerCase().includes("one-time");
}

export function resolveSubscriptionCreationGate(
  user: { subscription?: { status?: string } } | null | undefined,
  opts: { isSubscriptionPlan: boolean; userLoading: boolean }
): SubscriptionCreationGateResult {
  // A pack is a standalone purchase, not a second subscription — always allowed (spec D5).
  if (!opts.isSubscriptionPlan) return { allowed: true };
  // Unknown status must not bounce guests, who are the majority (spec D7).
  if (opts.userLoading) return { allowed: true };
  if (!hasBlockingSubscription(user)) return { allowed: true };
  // Payment recovery is `past_due` OR `unpaid` — one shared predicate, never a restated
  // status list. `unpaid` used to fall through to the change-tier sheet, which cannot take
  // the member's money; the on-hold nudge on the pack step already routes `unpaid` to the
  // payment sheet through this same helper, so the two now agree.
  if (isSubscriptionRecoveryStatus(user?.subscription?.status)) {
    return { allowed: false, reason: "recovery", redirectTo: MANAGE_PAYMENT_PATH };
  }
  return { allowed: false, reason: "blocking", redirectTo: MANAGE_SUBSCRIPTION_PATH };
}
