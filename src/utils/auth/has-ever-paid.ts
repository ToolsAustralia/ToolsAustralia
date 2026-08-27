/**
 * "Has this account ever completed a purchase?"
 *
 * ONE predicate, because the codebase already answers this ~24 different ways
 * across 93 files and does not need a 25th. Anything new that gates on being a
 * real customer imports this.
 *
 * @module utils/auth/has-ever-paid
 */

/** The minimum projection this predicate needs. Keep `.select()` calls in sync. */
export const HAS_EVER_PAID_FIELDS = "processedPayments stripeSubscriptionId oneTimePackages.purchaseDate subscription.startDate";

/**
 * Structurally typed so a Mongoose document, a `.lean()` result or a plain
 * fixture all satisfy it. `subscription` carries an index signature because real
 * subscription subdocuments have ~20 other fields; without it TypeScript's
 * weak-type check rejects any literal that does not happen to set `startDate`.
 */
interface EverPaidShape {
  processedPayments?: unknown[] | null;
  stripeSubscriptionId?: string | null;
  oneTimePackages?: unknown[] | null;
  subscription?: ({ startDate?: Date | string | null } & Record<string, unknown>) | null;
}

/**
 * True if the account has ever paid — **not** whether it is currently active.
 *
 * WHY NOT `subscription.isActive`: that flag is false for cancelled, paused
 * (retention freeze) and past-due members. Gating on it would shut 4,613 paying
 * customers (38.5% of all payers) out of surfaces they are entitled to —
 * including past-due members who still hold live draw entries and can win.
 *
 * WHY NOT `stripeCustomerId`: registration creates the Stripe customer BEFORE
 * any payment (`register/route.ts`), so it is true for all ~44k never-paid
 * registrants. It measures "registered", not "paid".
 *
 * `processedPayments` is the honest signal — written by the Stripe webhook on a
 * successful payment and never cleared on refund or cancellation.
 *
 * The other three legs cover the WEBHOOK RACE: `processedPayments` is populated
 * asynchronously, so for a few seconds after checkout a genuine buyer would look
 * unpaid. Each of those legs is also an "ever" signal that survives cancellation,
 * so widening here cannot wrongly exclude anyone — only avoid a false negative
 * in the seconds after payment.
 */
export function hasEverPaid(user: EverPaidShape | null | undefined): boolean {
  if (!user) return false;
  if ((user.processedPayments?.length ?? 0) > 0) return true;
  if (user.stripeSubscriptionId) return true;
  if ((user.oneTimePackages?.length ?? 0) > 0) return true;
  if (user.subscription?.startDate) return true;
  return false;
}
