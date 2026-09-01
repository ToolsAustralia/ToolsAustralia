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

/**
 * The only shape the gate reads. Deliberately NOT `UserData` — the gate asks one question
 * of one field, and the narrow type is what lets `selectGateUser` hand it a value it has
 * actually checked instead of an unverified cast.
 */
export type SubscriptionCreationGateUser = { subscription?: { status?: string } } | null | undefined;

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

/**
 * True only when `value` really is the shape `SubscriptionCreationGateUser` claims.
 *
 * A user with no `subscription` at all passes — that is a legitimate gate user (a guest, or
 * a member whose subscription the server just cleared), and rejecting it would send the
 * caller back to a staler value. Anything whose `subscription`/`status` is the wrong runtime
 * type is rejected rather than asserted, so a malformed cache entry degrades to the fallback
 * instead of being read as a status the gate then acts on.
 */
function isSubscriptionCreationGateUser(value: unknown): value is { subscription?: { status?: string } } {
  if (typeof value !== "object" || value === null) return false;
  const subscription = (value as { subscription?: unknown }).subscription;
  if (subscription === undefined || subscription === null) return true;
  if (typeof subscription !== "object") return false;
  const status = (subscription as { status?: unknown }).status;
  return status === undefined || typeof status === "string";
}

/**
 * Which user the gate should judge: the one in the query cache if there is one, else the
 * last one a render saw.
 *
 * WHY THIS EXISTS. `my-account/membership/page-client.tsx` awaits
 * `invalidateQueries(users.detail)` and THEN calls `openModal(plan)`. Reading the user from
 * a ref refreshed every render is not enough there, because no render has happened yet:
 * React Query notifies subscribers through `notifyManager`, whose scheduler is
 * `systemSetTimeoutZero` — a MACROTASK — and React then schedules the render itself on
 * another. The continuation after `await` is a MICROTASK, so it runs first and the ref still
 * holds the pre-refetch value. The CACHE, by contrast, is written synchronously before
 * `invalidateQueries` resolves, so it is already current at the call. Verified against the
 * installed `@tanstack/query-core@5.90.2`.
 *
 * BIAS, unchanged from the gate itself: when in doubt, prefer the value that can only ALLOW.
 * A cache miss falls back to the rendered user; it never invents a blocking status. Nothing
 * here decides anything — `resolveSubscriptionCreationGate` still owns the decision, this
 * only chooses which of two inputs it gets.
 *
 * `cachedUser` is `unknown` because that is what `QueryClient.getQueryData` returns, and
 * casting it would defeat the point of checking it.
 */
export function selectGateUser(
  cachedUser: unknown,
  renderedUser: SubscriptionCreationGateUser
): SubscriptionCreationGateUser {
  return isSubscriptionCreationGateUser(cachedUser) ? cachedUser : renderedUser;
}

export function resolveSubscriptionCreationGate(
  user: SubscriptionCreationGateUser,
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
