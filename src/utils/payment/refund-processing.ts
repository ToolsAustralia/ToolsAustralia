/**
 * Refund Processing Utility
 *
 * Handles reversal of benefits when payments are refunded or reversed.
 * This utility is called from Stripe webhook handlers when refund events occur.
 *
 * IMPORTANT: Refunds are processed in Stripe Dashboard by admins.
 * We listen to webhook events and sync our database accordingly.
 */

import mongoose from "mongoose";
import PaymentEvent, { IPaymentEvent } from "@/models/PaymentEvent";
import User, { IUser } from "@/models/User";
import connectDB from "@/lib/mongodb";
import { stripe } from "@/lib/stripe";
import { reverseAffiliateCommissions } from "../affiliate/reverse-commission";
import { trackRefundedOrder } from "@/utils/integrations/klaviyo/klaviyo-revenue-service";
import { extractOrderIdFromPaymentIntent, type PackageType } from "@/utils/integrations/klaviyo/klaviyo-order-helpers";
import {
  cancelQueueItem,
  handleSubscriptionQueueUpdate,
} from "@/utils/partner-discounts/partner-discount-queue";
import { reverseLedgerBenefits } from "@/utils/payment/refund-ledger-reversal";
import { isFullRefundByAmounts, sumSucceededRefundAmountCents } from "@/utils/payment/stripe-refund-amount";
import { paymentIntentIdsOnStripeInvoice } from "@/utils/payment/stripe-invoice-payment-intents";

export { paymentIntentIdsOnStripeInvoice };

/**
 * Result of refund processing
 */
export interface RefundProcessingResult {
  success: boolean;
  alreadyProcessed: boolean;
  error?: string;
  reversedBenefits?: {
    entries: number;
    points: number;
    packageType: string;
  };
}

export interface ProcessRefundReversalOptions {
  invoiceId?: string;
}

/**
 * Manual replay (admin): find a `BenefitsGranted` row by `_id`, resolve the Stripe charge,
 * and run `processRefundReversal` when Stripe shows at least one succeeded refund.
 * Idempotent via `RefundProcessed` (safe to retry).
 */
export async function replayRefundReversalForBenefitsGrantedEvent(params: {
  targetUserId: string;
  benefitsGrantedEventId: string;
}): Promise<RefundProcessingResult> {
  const { targetUserId, benefitsGrantedEventId } = params;
  await connectDB();

  if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
    return { success: false, alreadyProcessed: false, error: "Invalid user id" };
  }

  const original = await PaymentEvent.findOne({
    _id: benefitsGrantedEventId,
    userId: new mongoose.Types.ObjectId(targetUserId),
    eventType: "BenefitsGranted",
  });

  if (!original) {
    return { success: false, alreadyProcessed: false, error: "BenefitsGranted event not found for this user" };
  }

  const storedPid = original.paymentIntentId;
  let invoiceId: string | undefined;
  let stripePaymentIntentId: string;

  if (storedPid.startsWith("invoice_")) {
    invoiceId = storedPid.slice("invoice_".length);
    const inv = await stripe.invoices.retrieve(invoiceId, {
      expand: ["payments.data.payment", "payment_intent"],
    });
    const ids = paymentIntentIdsOnStripeInvoice(inv);
    if (!ids.length) {
      return { success: false, alreadyProcessed: false, error: "Could not resolve payment intent from invoice" };
    }
    stripePaymentIntentId = ids[0];
  } else {
    stripePaymentIntentId = storedPid;
  }

  const pi = await stripe.paymentIntents.retrieve(stripePaymentIntentId, { expand: ["latest_charge"] });
  const lc = pi.latest_charge;
  if (!lc) {
    return { success: false, alreadyProcessed: false, error: "Payment intent has no latest_charge" };
  }
  const chargeId = typeof lc === "string" ? lc : lc.id;
  const charge = await stripe.charges.retrieve(chargeId, { expand: ["refunds"] });
  const refundList = charge.refunds?.data ?? [];
  const succeededCents = sumSucceededRefundAmountCents(refundList);
  if (succeededCents <= 0) {
    return {
      success: false,
      alreadyProcessed: false,
      error:
        "Stripe charge has no succeeded refunds yet — refund in Stripe Dashboard first, then retry (idempotent).",
    };
  }
  const chargeAmount = charge.amount ?? 0;
  const isFullRefund = isFullRefundByAmounts(succeededCents, chargeAmount);

  return processRefundReversal(stripePaymentIntentId, targetUserId, succeededCents, isFullRefund, {
    invoiceId,
  });
}

/**
 * Process refund reversal for all purchase types
 *
 * This function handles reversal of benefits for:
 * 1. One-time packages
 * 2. Subscription packages
 * 3. Upsell purchases
 * 4. Mini-draw packages
 *
 * @param paymentIntentId - Stripe payment intent ID that was refunded
 * @param userId - User ID who received the original payment
 * @param refundAmount - Amount refunded (in cents)
 * @param isFullRefund - Whether this is a full refund
 * @param options - Optional invoiceId for subscription refunds (invoice-keyed BenefitsGranted rows)
 * @returns Processing result with success status
 */
export async function processRefundReversal(
  paymentIntentId: string,
  userId: string,
  refundAmount: number,
  isFullRefund: boolean = true,
  options?: ProcessRefundReversalOptions
): Promise<RefundProcessingResult> {
  const invoiceId = options?.invoiceId;
  // console.log(`🔄 processRefundReversal called with:`, {
  //   paymentIntentId,
  //   userId,
  //   refundAmount,
  //   isFullRefund,
  //   invoiceId: invoiceId || "(not provided)",
  // });

  // Validate input parameters
  if (!paymentIntentId || !userId || !refundAmount) {
    console.error(`❌ processRefundReversal: Missing required parameters`);
    return {
      success: false,
      alreadyProcessed: false,
      error: "Missing required parameters",
    };
  }

  try {
    await connectDB();

    // Partial refund: record only (no benefit reversal) — unique eventType RefundPartial per payment id
    if (!isFullRefund && refundAmount > 0) {
      const partialPid = invoiceId ? `invoice_${invoiceId}` : paymentIntentId;
      const partialId = `RefundPartial-${partialPid}`;
      const existingPartial = await PaymentEvent.findById(partialId);
      if (existingPartial) {
        return { success: true, alreadyProcessed: true };
      }
      const bg = await PaymentEvent.findOne({
        eventType: "BenefitsGranted",
        $or: [{ paymentIntentId: partialPid }, { paymentIntentId }],
      })
        .select("packageType packageId packageName userId")
        .lean();
      try {
        await PaymentEvent.create({
          _id: partialId,
          paymentIntentId: partialPid,
          eventType: "RefundPartial",
          userId: bg?.userId ?? new mongoose.Types.ObjectId(userId),
          packageType: bg?.packageType ?? "one-time",
          packageId: bg?.packageId,
          packageName: bg?.packageName,
          data: {
            status: "partial-skipped",
            refundAmount,
            isFullRefund: false,
          },
          processedBy: "webhook",
          timestamp: new Date(),
        });
      } catch (pe: unknown) {
        const mongoError = pe as { code?: number; message?: string };
        if (mongoError?.code === 11000 || mongoError?.message?.includes("duplicate")) {
          return { success: true, alreadyProcessed: true };
        }
        throw pe;
      }
      return { success: true, alreadyProcessed: false };
    }
    // console.log(`🔗 Database connected for refund processing: ${paymentIntentId}`);

    // ✅ EARLY IDEMPOTENCY CHECK: Check if refund already processed before doing any lookups
    // This provides an additional layer of protection against duplicate processing
    // For subscriptions, use invoice ID if available; otherwise use paymentIntentId
    const idempotencyKey = invoiceId ? `invoice_${invoiceId}` : paymentIntentId;
    const earlyRefundCheck = await PaymentEvent.findOne({
      $or: [
        // Check by the idempotency key format
        { paymentIntentId: idempotencyKey, eventType: "RefundProcessed" },
        // Also check by invoice format if invoiceId was provided
        ...(invoiceId ? [{ paymentIntentId: `invoice_${invoiceId}`, eventType: "RefundProcessed" }] : []),
        // Check by payment intent format
        { paymentIntentId: paymentIntentId, eventType: "RefundProcessed" },
      ],
    });

    if (earlyRefundCheck) {
      console.log(`✅ Refund already processed (early idempotency check): ${idempotencyKey}`);
      return {
        success: true,
        alreadyProcessed: true,
      };
    }

    // Find the original payment event to get benefit details
    // For subscriptions, PaymentEvent is stored with invoice ID format: invoice_${invoice.id}
    // For one-time payments, it's stored with payment intent ID: pi_xxx
    // Prioritize invoice format lookup for subscriptions (correct order)
    const attemptedLookups: string[] = [];
    let originalPaymentEvent: IPaymentEvent | null = null;

    // Step 1: If invoiceId provided, try invoice format FIRST (subscription refunds)
    if (invoiceId) {
      const invoicePaymentId = `invoice_${invoiceId}`;
      attemptedLookups.push(`invoice format: ${invoicePaymentId}`);
      originalPaymentEvent = await PaymentEvent.findOne({
        paymentIntentId: invoicePaymentId,
        eventType: "BenefitsGranted",
      });

      if (originalPaymentEvent) {
        // console.log(`✅ Found payment event by invoice ID format: ${invoicePaymentId}`);
      }
    }

    // Step 2: Try payment intent ID (for one-time payments and PI-keyed records)
    if (!originalPaymentEvent) {
      attemptedLookups.push(`payment intent: ${paymentIntentId}`);
      originalPaymentEvent = await PaymentEvent.findOne({
        paymentIntentId,
        eventType: "BenefitsGranted",
      });

      if (originalPaymentEvent) {
        // console.log(`✅ Found payment event by payment intent ID: ${paymentIntentId}`);
      }
    }

    // Step 3: Subscription rows use paymentIntentId invoice_in_…; if Stripe did not give us invoiceId,
    // match this user's recent invoice-keyed BenefitsGranted to this pi_ via Stripe (bounded).
    if (!originalPaymentEvent && paymentIntentId.startsWith("pi_") && mongoose.Types.ObjectId.isValid(userId)) {
      attemptedLookups.push("invoice-keyed events for user vs Stripe payment_intent (fallback)");
      const candidates = await PaymentEvent.find({
        userId: new mongoose.Types.ObjectId(userId),
        eventType: "BenefitsGranted",
        paymentIntentId: { $regex: "^invoice_" },
      })
        .sort({ timestamp: -1 })
        .limit(25)
        .select("_id paymentIntentId")
        .lean();

      for (const doc of candidates) {
        const stored = doc.paymentIntentId;
        if (!stored?.startsWith("invoice_")) continue;
        const invStripeId = stored.slice("invoice_".length);
        try {
          // Expand payments + payment_intent so the new Billing Invoice model surfaces the PI
          // under invoice.payments.data[].payment.payment_intent (string id, no extra expand needed).
          // Note: `latest_payment_intent` is NOT expandable on Invoice (it lives on Subscription).
          const inv = await stripe.invoices.retrieve(invStripeId, {
            expand: ["payments.data.payment", "payment_intent"],
          });
          if (paymentIntentIdsOnStripeInvoice(inv).includes(paymentIntentId)) {
            originalPaymentEvent = await PaymentEvent.findOne({
              _id: doc._id,
              eventType: "BenefitsGranted",
            });
            if (originalPaymentEvent) {
              console.log(
                `✅ Refund lookup matched BenefitsGranted ${stored} to ${paymentIntentId} via Stripe invoice`
              );
            }
            break;
          }
        } catch (invErr) {
          console.warn(
            `⚠️ Refund DB fallback: failed to retrieve Stripe invoice ${invStripeId}: ${invErr}`
          );
          continue;
        }
      }
    }

    // Fail closed: do not guess "most recent membership" — wrong invoice could reverse the wrong month.
    // Webhooks pass invoiceId from Stripe when available; fix data or reconcile manually if lookup fails.

    if (!originalPaymentEvent) {
      const lookupAttempts = attemptedLookups.join(", ");
      console.error(`❌ No original payment event found. Attempted lookups: ${lookupAttempts}`);
      return {
        success: false,
        alreadyProcessed: false,
        error: `Original payment event not found - cannot reverse benefits. Attempted: ${lookupAttempts}`,
      };
    }

    // console.log(`📋 Found original payment event:`, {
    //   packageType: originalPaymentEvent.packageType,
    //   entries: originalPaymentEvent.data.entries,
    //   points: originalPaymentEvent.data.points,
    // });

    // Get user document (needed for refund event creation)
    const user = await User.findById(userId);
    if (!user) {
      console.error(`❌ User ${userId} not found`);
      return {
        success: false,
        alreadyProcessed: false,
        error: "User not found",
      };
    }

    // Get original benefits from payment event
    const originalEntries = originalPaymentEvent.data.entries || 0;
    const originalPoints = originalPaymentEvent.data.points || 0;
    const packageType = originalPaymentEvent.packageType;

    // ✅ CRITICAL: Create refund event FIRST using atomic insert to prevent race conditions
    // This ensures only one webhook handler can process the refund, even if multiple arrive simultaneously
    // The unique compound index on (paymentIntentId, eventType) will prevent duplicate creation
    // Use the same paymentIntentId format as the original PaymentEvent for consistency
    const refundEventPaymentId = originalPaymentEvent.paymentIntentId;
    const refundEventId = `RefundProcessed-${refundEventPaymentId}`;

    // Check if refund already processed (quick check before attempting insert)
    const existingRefundEvent = await PaymentEvent.findById(refundEventId);
    if (existingRefundEvent) {
      // console.log(`✅ Refund ${paymentIntentId} already processed (idempotency check)`);
      return {
        success: true,
        alreadyProcessed: true,
      };
    }

    // Try to create refund event - this will fail if another webhook already created it
    // The unique constraint on _id will prevent duplicate events
    let refundEventCreated = false;
    try {
      const refundEvent = new PaymentEvent({
        _id: refundEventId,
        paymentIntentId: refundEventPaymentId, // Use invoice ID format for subscriptions to match original event
        eventType: "RefundProcessed",
        userId: user._id,
        packageType,
        packageId: originalPaymentEvent.packageId,
        packageName: originalPaymentEvent.packageName,
        data: {
          entries: originalEntries,
          points: originalPoints,
          refundAmount,
          isFullRefund,
        },
        processedBy: "webhook",
        timestamp: new Date(),
      });

      await refundEvent.save();
      refundEventCreated = true;
      // console.log(`✅ Created refund event for idempotency: ${refundEventId}`);
    } catch (error: unknown) {
      // If duplicate key error, another webhook already created it
      const mongoError = error as { code?: number; codeName?: string; message?: string };
      if (
        mongoError?.code === 11000 ||
        mongoError?.codeName === "DuplicateKey" ||
        mongoError?.message?.includes("duplicate key")
      ) {
        // console.log(`✅ Refund ${paymentIntentId} already being processed by another webhook (duplicate key)`);
        return {
          success: true,
          alreadyProcessed: true,
        };
      }
      // Re-throw other errors
      throw error;
    }

    // Only process reversals if we successfully created the refund event
    if (!refundEventCreated) {
      // console.log(`⚠️ Failed to create refund event, skipping processing`);
      return {
        success: false,
        alreadyProcessed: false,
        error: "Failed to create refund event",
      };
    }

    const reversalIssues: Array<{ step: string; error: string }> = [];

    try {
      await reverseLedgerBenefits({
        userId,
        originalEvent: originalPaymentEvent,
        paymentIntentId,
        refundEventId,
        reversalIssues,
      });
    } catch (ledgerErr) {
      console.error("❌ Ledger reversal failed:", ledgerErr);
      await PaymentEvent.deleteOne({ _id: refundEventId });
      throw ledgerErr;
    }

    // Partner discount catalog access (queue): revoke periods tied to this payment
    try {
      await reversePartnerDiscountQueueOnRefund(user._id, packageType, paymentIntentId);
    } catch (pdErr) {
      console.error("❌ Partner discount queue reversal failed (refund):", pdErr);
      throw pdErr;
    }

    // Reverse affiliate commissions (non-blocking). Pass invoiceId so subscription
    // refunds can reach membership-first (PI stored as invoice_in_…) and
    // membership-recurring (stored by stripeInvoiceId) rows, not just raw-PI rows.
    try {
      await reverseAffiliateCommissions(paymentIntentId, userId, invoiceId);
    } catch (commissionError) {
      // Non-blocking - log but don't fail refund processing
      console.error("❌ Affiliate commission reversal error (non-blocking):", commissionError);
    }

    // ✅ Track "Refunded Order" event in Klaviyo (non-blocking)
    // This ensures revenue metrics correctly subtract refunds from total revenue.
    // Order IDs are now deterministic (no timestamp), so the refund flow reproduces
    // the exact same ID as the original Placed Order — Klaviyo links them and
    // refunds properly subtract from customer LTV.
    try {
      // For subscriptions, paymentIntentId might be in invoice format (invoice_xxx).
      // Extract actual payment intent ID — must match what was used at purchase time.
      const actualPaymentIntentId = originalPaymentEvent.paymentIntentId.startsWith("invoice_")
        ? paymentIntentId
        : originalPaymentEvent.paymentIntentId;

      const originalOrderId = extractOrderIdFromPaymentIntent(
        actualPaymentIntentId,
        packageType as PackageType,
        originalPaymentEvent.packageId || "unknown"
      );

      await trackRefundedOrder(user, {
        originalOrderId,
        refundAmount: refundAmount / 100, // Convert cents to dollars
        currency: "AUD",
        refundReason: "customer_request",
        packageType: packageType as PackageType,
      });

      await new Promise((r) => setTimeout(r, 500));
      const freshUser = await User.findById(userId);
      if (freshUser) {
        const { ensureUserProfileSynced } = await import("@/utils/integrations/klaviyo/klaviyo-profile-sync");
        await ensureUserProfileSynced(freshUser as never);
      }
    } catch (refundTrackingError) {
      // Non-blocking - log but don't fail refund processing
      console.error("❌ Klaviyo refund event tracking error (non-blocking):", refundTrackingError);
      reversalIssues.push({
        step: "klaviyo-sync",
        error: refundTrackingError instanceof Error ? refundTrackingError.message : String(refundTrackingError),
      });
      await PaymentEvent.updateOne(
        { _id: refundEventId },
        { $set: { "data.reversalIssues": reversalIssues } }
      );
    }

    return {
      success: true,
      alreadyProcessed: false,
      reversedBenefits: {
        entries: originalEntries,
        points: originalPoints,
        packageType,
      },
    };
  } catch (error) {
    console.error(`❌ ERROR in processRefundReversal:`, error);
    // Note: We don't attempt cleanup here because the refund event ID format depends on
    // whether it's a subscription (invoice_xxx) or one-time payment (pi_xxx). The idempotency
    // check will prevent duplicate processing on retry, which is sufficient.

    return {
      success: false,
      alreadyProcessed: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Revoke partner discount catalog access granted with this payment.
 * - Membership: same as subscription ended (expire membership queue rows, activate next eligible).
 * - One-time / mini-draw / upsell: cancel the queue row keyed by Stripe payment intent (if present).
 */
async function reversePartnerDiscountQueueOnRefund(
  userId: string | mongoose.Types.ObjectId,
  packageType: string,
  paymentIntentId: string
): Promise<void> {
  const user = await User.findById(userId);
  if (!user) return;

  if (packageType === "membership") {
    await handleSubscriptionQueueUpdate(user as unknown as IUser, "end");
    user.markModified("partnerDiscountQueue");
    await user.save();
    return;
  }

  if (packageType === "one-time" || packageType === "mini-draw" || packageType === "upsell") {
    await cancelQueueItem(user as unknown as IUser, paymentIntentId);
  }
}
