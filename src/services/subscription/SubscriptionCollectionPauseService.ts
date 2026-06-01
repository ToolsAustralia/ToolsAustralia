/**
 * Pauses / resumes Stripe subscription invoice collection around failed renewals.
 *
 * When a renewal invoice fails, Stripe can otherwise keep creating invoices each billing
 * period while the subscription stays past_due, stacking charges and duplicate renewal benefits.
 *
 * After a failed renewal we set `pause_collection` with `keep_as_draft` so new invoices
 * during the pause do not finalize/charge until collection resumes. The existing open
 * invoice remains collectible per Stripe's retry rules.
 *
 * After a successful `subscription_cycle` payment we clear `pause_collection` so the next
 * renewal behaves normally.
 *
 * @see https://stripe.com/docs/billing/subscriptions/pause-payment
 */

import { stripe } from "@/lib/stripe";
import type { Types } from "mongoose";
import User from "@/models/User";
import {
  clampReanchorDay,
  getCalendarDayInAEST,
  getReanchorTrialEndTimestamp,
} from "@/utils/billing/anchor-billing";
import { ensureUserProfileSynced } from "@/utils/integrations/klaviyo/klaviyo-profile-sync";
import { appendMembershipStatusHistory } from "@/services/admin/membershipAnalyticsPersistence";

/** Pure policy helpers (no Stripe client); safe to import in tests. */
export {
  shouldClearPauseCollectionAfterPaidInvoice,
  describePauseCollection,
} from "./pauseCollectionPolicy";

export async function pauseAfterRenewalFailure(subscriptionId: string): Promise<void> {
  await stripe.subscriptions.update(subscriptionId, {
    pause_collection: {
      behavior: "keep_as_draft",
    },
  });
}

/**
 * Clears `pause_collection` (manual unpausing). Safe if the subscription was not paused.
 */
export async function resumeAfterSuccessfulRenewalPayment(subscriptionId: string): Promise<void> {
  await stripe.subscriptions.update(subscriptionId, {
    // Stripe clears the field when set to empty string (see API "manually unpausing")
    pause_collection: "",
  });
}

/**
 * Reanchor a recovered past-due/unpaid subscription's future renewals to the recovery-payment date.
 *
 * Idempotent via an atomic claim on `subscription.lastReanchoredInvoiceId`. Moves the Stripe billing
 * anchor with `trial_end` + `proration_behavior:'none'` (NO new charge), writes `endDate` from the
 * SAME computed `trial_end` (do not read it back — it can lag), re-pushes the Klaviyo profile, and
 * records an invoice-keyed audit row. Fully non-fatal: recovery already succeeded.
 */
export async function reanchorAfterPastDueRecovery(params: {
  subscriptionId: string;
  userId: Types.ObjectId;
  recoveryDate: Date;
  invoiceId: string;
  packageId?: string | null;
}): Promise<{ reanchored: boolean }> {
  const { subscriptionId, userId, recoveryDate, invoiceId, packageId } = params;
  try {
    // 1. Atomic idempotency claim — only the first delivery for this invoice proceeds.
    const claimed = await User.findOneAndUpdate(
      { _id: userId, "subscription.lastReanchoredInvoiceId": { $ne: invoiceId } },
      { $set: { "subscription.lastReanchoredInvoiceId": invoiceId } },
      { new: true }
    );
    if (!claimed) return { reanchored: false };
    const oldEndDate = claimed.subscription?.endDate ?? null;

    // 2. Compute the clamped trial_end; abort non-fatally on bad math or a non-future result.
    let trialEndSeconds: number;
    try {
      trialEndSeconds = getReanchorTrialEndTimestamp(recoveryDate);
    } catch (mathErr) {
      console.error(`[reanchor] date math failed sub=${subscriptionId} invoice=${invoiceId}:`, mathErr);
      return { reanchored: false };
    }
    if (trialEndSeconds <= Math.floor(Date.now() / 1000)) {
      console.error(`[reanchor] computed trial_end not in the future sub=${subscriptionId}; aborting`);
      return { reanchored: false };
    }

    // 3. Move the Stripe billing anchor. proration_behavior:'none' => no immediate re-charge.
    await stripe.subscriptions.update(subscriptionId, {
      trial_end: trialEndSeconds,
      proration_behavior: "none",
      metadata: { billing_anchor_rule: "past_due_reanchor" },
    });

    // 4. Mirror endDate from the SAME trial_end we just set (never read it back — Stripe can lag).
    const newEndDate = new Date(trialEndSeconds * 1000);
    const updated = await User.findByIdAndUpdate(
      userId,
      { $set: { "subscription.endDate": newEndDate } },
      { new: true }
    );
    if (!updated) {
      console.error(
        `[reanchor] endDate write returned null sub=${subscriptionId} invoice=${invoiceId} (user missing?) — relying on subscription.updated backstop`
      );
    }

    // 5. Re-push Klaviyo so next_renewal_date / subscription_end_date / past_due_renewal_entries refresh.
    if (updated) ensureUserProfileSynced(updated);

    // 6. Audit (invoice-keyed dedupeKey => exactly once even on a dashboard resend).
    await appendMembershipStatusHistory({
      userId,
      effectiveAt: recoveryDate,
      membershipStatus: "trialing",
      actor: "system",
      source: "webhook_past_due_reanchor",
      dedupeKey: `past_due_reanchor_${userId.toString()}_${invoiceId}`,
      subscriptionPackageId: packageId ?? undefined,
      endDate: newEndDate,
      metadata: {
        invoiceId,
        oldEndDate,
        newEndDate,
        oldAnchorDay: oldEndDate ? getCalendarDayInAEST(oldEndDate) : null,
        newAnchorDay: getCalendarDayInAEST(newEndDate),
        recoveryDay: getCalendarDayInAEST(recoveryDate),
        clampedDay: clampReanchorDay(recoveryDate),
      },
    });

    return { reanchored: true };
  } catch (err) {
    console.error(`[reanchor] non-fatal failure sub=${subscriptionId} invoice=${invoiceId}:`, err);
    return { reanchored: false };
  }
}
