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
import type Stripe from "stripe";
import PaymentEvent, { IPaymentEvent } from "@/models/PaymentEvent";
import User, { IUser } from "@/models/User";
import connectDB from "@/lib/mongodb";
import { stripe } from "@/lib/stripe";
import { removeMajorDrawEntries } from "../draws/remove-draw-entries";
import { removeMiniDrawEntries } from "../draws/remove-draw-entries";
import { reverseAffiliateCommissions } from "../affiliate/reverse-commission";
import { getPackageById } from "@/data/membershipPackages";
import { trackRefundedOrder } from "@/utils/integrations/klaviyo/klaviyo-revenue-service";
import { extractOrderIdFromPaymentIntent, type PackageType } from "@/utils/integrations/klaviyo/klaviyo-order-helpers";
import {
  cancelQueueItem,
  handleSubscriptionQueueUpdate,
} from "@/utils/partner-discounts/partner-discount-queue";

function paymentIntentIdsOnStripeInvoice(inv: Stripe.Invoice): string[] {
  const typed = inv as Stripe.Invoice & {
    payment_intent?: string | Stripe.PaymentIntent | null;
    latest_payment_intent?: string | Stripe.PaymentIntent | null;
    payments?: {
      data?: Array<{
        payment?: {
          payment_intent?: string | Stripe.PaymentIntent | null;
        } | null;
      }>;
    };
  };
  const ids: string[] = [];
  if (typed.payment_intent) {
    ids.push(typeof typed.payment_intent === "string" ? typed.payment_intent : typed.payment_intent.id);
  }
  if (typed.latest_payment_intent) {
    ids.push(
      typeof typed.latest_payment_intent === "string"
        ? typed.latest_payment_intent
        : typed.latest_payment_intent.id
    );
  }
  for (const row of typed.payments?.data ?? []) {
    const pi = row?.payment?.payment_intent;
    if (pi) ids.push(typeof pi === "string" ? pi : pi.id);
  }
  return [...new Set(ids.filter(Boolean))];
}

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

  // Only process full refunds (as per requirements)
  if (!isFullRefund) {
    // console.log(`⚠️ Partial refund detected - skipping reversal (only full refunds are processed)`);
    return {
      success: false,
      alreadyProcessed: false,
      error: "Partial refunds are not supported - only full refunds are processed",
    };
  }

  try {
    await connectDB();
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

    // console.log(`🔄 Processing refund reversal:`, {
    //   entries: originalEntries,
    //   points: originalPoints,
    //   packageType,
    // });

    // Process reversal based on package type
    const isMembership = packageType === "membership";

    switch (packageType) {
      case "one-time":
        await reverseOneTimePackage(user, originalPaymentEvent);
        break;
      case "membership":
        await reverseSubscriptionPackage(user, originalPaymentEvent);
        break;
      case "upsell":
        await reverseUpsellPurchase(user, originalPaymentEvent, paymentIntentId);
        break;
      case "mini-draw":
        await reverseMiniDrawPackage(user, originalPaymentEvent, paymentIntentId);
        break;
      default:
        console.error(`❌ Unknown package type: ${packageType}`);
        // Remove the refund event since we failed
        await PaymentEvent.deleteOne({ _id: refundEventId });
        return {
          success: false,
          alreadyProcessed: false,
          error: `Unknown package type: ${packageType}`,
        };
    }

    // Partner discount catalog access (queue): revoke periods tied to this payment
    try {
      await reversePartnerDiscountQueueOnRefund(user._id, packageType, paymentIntentId);
    } catch (pdErr) {
      console.error("❌ Partner discount queue reversal failed (refund):", pdErr);
      throw pdErr;
    }

    // Reverse user benefits (entries and points) - common for all types EXCEPT memberships
    // Memberships handle their own reversal in reverseSubscriptionPackage() with correct entriesToRemove calculation
    if (!isMembership) {
      await User.findByIdAndUpdate(
        user._id,
        {
          $inc: {
            accumulatedEntries: -originalEntries,
            rewardsPoints: -originalPoints,
          },
        },
        { new: false }
      );

      // console.log(`✅ Reversed ${originalEntries} entries and ${originalPoints} points from user`);
    }

    // Reverse affiliate commissions (non-blocking)
    try {
      await reverseAffiliateCommissions(paymentIntentId, userId);
    } catch (commissionError) {
      // Non-blocking - log but don't fail refund processing
      console.error("❌ Affiliate commission reversal error (non-blocking):", commissionError);
    }

    // ✅ Track "Refunded Order" event in Klaviyo (non-blocking)
    // This ensures revenue metrics correctly subtract refunds from total revenue
    try {
      // Reconstruct original order ID from payment event data
      // For subscriptions, paymentIntentId might be in invoice format (invoice_xxx)
      // Extract actual payment intent ID if needed
      const actualPaymentIntentId = originalPaymentEvent.paymentIntentId.startsWith("invoice_")
        ? paymentIntentId // Use the paymentIntentId parameter (actual pi_xxx)
        : originalPaymentEvent.paymentIntentId;

      // Get purchase timestamp from original payment event
      const purchaseTimestamp = originalPaymentEvent.timestamp
        ? new Date(originalPaymentEvent.timestamp).getTime()
        : undefined;

      // Generate original order ID using same logic as purchase
      const originalOrderId = extractOrderIdFromPaymentIntent(
        actualPaymentIntentId,
        packageType as PackageType,
        originalPaymentEvent.packageId || "unknown",
        purchaseTimestamp
      );

      // Track refund event
      await trackRefundedOrder(user, {
        originalOrderId,
        refundAmount: refundAmount / 100, // Convert cents to dollars
        currency: "AUD",
        refundReason: "customer_request",
        packageType: packageType as PackageType,
      });
    } catch (refundTrackingError) {
      // Non-blocking - log but don't fail refund processing
      console.error("❌ Klaviyo refund event tracking error (non-blocking):", refundTrackingError);
    }

    // console.log(`✅ Refund reversal completed successfully for payment: ${paymentIntentId}`);

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

/**
 * Reverse one-time package benefits
 */
async function reverseOneTimePackage(user: IUser, originalEvent: IPaymentEvent): Promise<void> {
  // console.log(`🔄 Reversing one-time package benefits`);

  const packageId = originalEvent.packageId;
  if (!packageId) {
    // console.log(`⚠️ No packageId in original event, skipping package removal`);
    return;
  }

  // Get user document with packages to find the specific package
  const userDoc = await User.findById(user._id);
  if (!userDoc || !userDoc.oneTimePackages) {
    // console.log(`⚠️ User or one-time packages not found`);
    return;
  }

  // Find the package to remove - match by packageId and purchase date closest to payment event timestamp
  // Since one-time packages don't store paymentIntentId, we match by packageId and timestamp
  const purchaseTimestamp = originalEvent.timestamp;
  const packagesToMatch = userDoc.oneTimePackages.filter((pkg) => pkg.packageId === packageId && pkg.isActive);

  if (packagesToMatch.length === 0) {
    // console.log(`⚠️ No active one-time package found for packageId: ${packageId}`);
    return;
  }

  // If multiple packages with same ID, find the one with purchase date closest to the payment event timestamp
  const packageToRemove = packagesToMatch.reduce((closest, current) => {
    const closestDiff = Math.abs(closest.purchaseDate.getTime() - purchaseTimestamp.getTime());
    const currentDiff = Math.abs(current.purchaseDate.getTime() - purchaseTimestamp.getTime());
    return currentDiff < closestDiff ? current : closest;
  });

  // Remove the specific package by matching packageId and purchaseDate (within 2 hour window)
  // This ensures we remove the correct package even if user has multiple of the same type
  const purchaseDate = new Date(packageToRemove.purchaseDate);
  const dateRangeStart = new Date(purchaseDate.getTime() - 2 * 60 * 60 * 1000); // 2 hours before
  const dateRangeEnd = new Date(purchaseDate.getTime() + 2 * 60 * 60 * 1000); // 2 hours after

  await User.updateOne(
    {
      _id: user._id,
      oneTimePackages: {
        $elemMatch: {
          packageId,
          purchaseDate: {
            $gte: dateRangeStart,
            $lte: dateRangeEnd,
          },
        },
      },
    },
    {
      $pull: {
        oneTimePackages: {
          packageId,
          purchaseDate: {
            $gte: dateRangeStart,
            $lte: dateRangeEnd,
          },
        },
      },
    }
  );

  // console.log(`✅ Removed one-time package from user`);

  // Remove entries from Major Draw
  const entriesToRemove = originalEvent.data.entries || 0;
  if (entriesToRemove > 0) {
    await removeMajorDrawEntries(user._id.toString(), entriesToRemove, "one-time-package");
  }
}

/**
 * Reverse subscription package benefits
 */
async function reverseSubscriptionPackage(user: IUser, originalEvent: IPaymentEvent): Promise<void> {
  console.log(`🔄 [REFUND] Reversing subscription package benefits for user ${user.email}`);

  // ✅ Identify which month is being refunded
  const originalBillingReason = originalEvent.data.billingReason as string | undefined; // "subscription_create" or "subscription_cycle"
  const originalInvoiceId = originalEvent.data.invoiceId as string | undefined;

  console.log(`📊 [REFUND] Billing reason: ${originalBillingReason}, Invoice: ${originalInvoiceId}`);

  // ✅ Calculate entries to remove based on the specific month being refunded
  let entriesToRemove = 0;

  if (originalBillingReason === "subscription_create") {
    // Initial subscription - remove base * promo multiplier (full initial amount)
    entriesToRemove = originalEvent.data.entries || 0;
    console.log(`📊 [REFUND] Initial subscription refund - removing ${entriesToRemove} entries`);
  } else if (originalBillingReason === "subscription_cycle") {
    // Renewal - remove the exact entries granted for this invoice (from PaymentEvent)
    // Prefer originalEvent.data.entries so we reverse exactly what was granted (handles promos correctly).
    // Fallback to package entriesPerMonth only when data.entries is missing (e.g. legacy events).
    const entriesFromEvent = originalEvent.data.entries ?? 0;
    if (entriesFromEvent > 0) {
      entriesToRemove = entriesFromEvent;
      console.log(`📊 [REFUND] Renewal refund - removing ${entriesToRemove} entries from draw (from PaymentEvent)`);
    } else {
      const packageId = originalEvent.packageId || user.subscription?.packageId;
      const membershipPackage = packageId ? getPackageById(packageId) : undefined;
      entriesToRemove = membershipPackage?.entriesPerMonth || 0;
      console.log(
        `📊 [REFUND] Renewal refund - no data.entries in event, using package entriesPerMonth: ${entriesToRemove}`
      );
    }
  } else {
    // Fallback: use original event entries
    entriesToRemove = originalEvent.data.entries || 0;
    console.warn(`⚠️ [REFUND] Unknown billing reason, using original event entries: ${entriesToRemove}`);
  }

  // Cancel subscription in Stripe if active
  if (user.stripeSubscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      if (subscription.status === "active" || subscription.status === "trialing") {
        await stripe.subscriptions.cancel(user.stripeSubscriptionId);
        console.log(`✅ [REFUND] Canceled active subscription in Stripe`);
      }
    } catch (stripeError) {
      console.error(`❌ [REFUND] Error canceling subscription in Stripe:`, stripeError);
      // Continue processing - we'll update database regardless
    }
  }

  // Update subscription status in database
  if (user.subscription) {
    user.subscription.isActive = false;
    user.subscription.autoRenew = false;
    user.subscription.endDate = new Date();
    user.subscription.status = "canceled";

    // ✅ CRITICAL FIX: Mark subscription as modified so Mongoose detects the changes
    user.markModified("subscription");
  }

  // ✅ Only decrement accumulated entries by the specific month's entries
  // Use atomic $inc operation to prevent race conditions if multiple webhooks process simultaneously
  if (entriesToRemove > 0) {
    // Atomic operation: Use $inc to prevent race conditions
    // This ensures that even if two webhooks process simultaneously, entries are only deducted once
    await User.findByIdAndUpdate(
      user._id,
      {
        $inc: {
          accumulatedEntries: -entriesToRemove,
        },
      },
      { new: false }
    );

    // Update lastMonthAccumulatedEntries if this was the most recent payment
    // Reload user to get updated accumulatedEntries value after atomic operation
    const updatedUser = await User.findById(user._id);
    if (updatedUser?.subscription?.lastMonthAccumulatedEntries) {
      const currentLastMonth = updatedUser.subscription.lastMonthAccumulatedEntries;
      const newLastMonth = Math.max(0, currentLastMonth - entriesToRemove);
      updatedUser.subscription.lastMonthAccumulatedEntries = newLastMonth;
      await updatedUser.save();
      console.log(`📊 [REFUND] Updated lastMonthAccumulatedEntries: ${currentLastMonth} → ${newLastMonth}`);
    }

    console.log(`📊 [REFUND] Updated accumulated entries using atomic operation: -${entriesToRemove} entries`);
  }

  // Save subscription status changes (accumulatedEntries already updated atomically above)
  await user.save();

  // ✅ Verify save worked
  const savedUser = await User.findById(user._id);
  console.log(
    `✅ [REFUND] Verified - isActive: ${savedUser?.subscription?.isActive}, accumulatedEntries: ${savedUser?.accumulatedEntries}`
  );

  // Remove entries from Major Draw (only the specific month's entries)
  if (entriesToRemove > 0) {
    await removeMajorDrawEntries(user._id.toString(), entriesToRemove, "membership");
    console.log(`✅ [REFUND] Removed ${entriesToRemove} entries from Major Draw`);
  }

  console.log(`✅ [REFUND] Reversed subscription package benefits - removed ${entriesToRemove} entries`);
}

/**
 * Reverse upsell purchase benefits
 */
async function reverseUpsellPurchase(
  user: IUser,
  originalEvent: IPaymentEvent,
  paymentIntentId: string
): Promise<void> {
  // console.log(`🔄 Reversing upsell purchase benefits`);

  const offerId = originalEvent.packageId;
  if (!offerId) {
    // console.log(`⚠️ No offerId in original event, skipping upsell removal`);
    return;
  }

  // Remove from user's upsellPurchases array
  await User.updateOne(
    { _id: user._id },
    {
      $pull: {
        upsellPurchases: {
          offerId,
        },
      },
    }
  );

  // console.log(`✅ Removed upsell purchase from user`);

  // Determine which draw to remove entries from based on metadata
  // Check if there's a miniDrawId in the original payment metadata
  // For now, we'll check the payment intent metadata if available
  const entriesToRemove = originalEvent.data.entries || 0;

  if (entriesToRemove > 0) {
    // Try to retrieve payment intent to check metadata
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      const miniDrawId = paymentIntent.metadata?.miniDrawId;

      if (miniDrawId) {
        // Remove from Mini Draw
        await removeMiniDrawEntries(user._id.toString(), miniDrawId, entriesToRemove, "upsell");
      } else {
        // Remove from Major Draw (default)
        await removeMajorDrawEntries(user._id.toString(), entriesToRemove, "upsell");
      }
    } catch (error) {
      console.error(`❌ Error retrieving payment intent metadata:`, error);
      // Default to Major Draw if we can't determine
      await removeMajorDrawEntries(user._id.toString(), entriesToRemove, "upsell");
    }
  }
}

/**
 * Reverse mini-draw package benefits
 */
async function reverseMiniDrawPackage(
  user: IUser,
  originalEvent: IPaymentEvent,
  paymentIntentId: string
): Promise<void> {
  // console.log(`🔄 Reversing mini-draw package benefits`);

  const packageId = originalEvent.packageId;
  if (!packageId) {
    // console.log(`⚠️ No packageId in original event, skipping mini-draw package removal`);
    return;
  }

  // Find the mini-draw package in user's array
  const userDoc = await User.findById(user._id);
  if (!userDoc || !userDoc.miniDrawPackages) {
    // console.log(`⚠️ User or mini-draw packages not found`);
    return;
  }

  const miniDrawPackage = userDoc.miniDrawPackages.find((pkg) => pkg.stripePaymentIntentId === paymentIntentId);

  if (!miniDrawPackage) {
    // console.log(`⚠️ Mini-draw package not found for payment intent: ${paymentIntentId}`);
    return;
  }

  // Get miniDrawId from the package
  const miniDrawId = miniDrawPackage.miniDrawId;
  if (!miniDrawId) {
    // console.log(`⚠️ No miniDrawId in package, skipping mini-draw entry removal`);
  } else {
    // Remove entries from Mini Draw
    const entriesToRemove = originalEvent.data.entries || 0;
    if (entriesToRemove > 0) {
      await removeMiniDrawEntries(user._id.toString(), miniDrawId.toString(), entriesToRemove, "mini-draw-package");
    }
  }

  // Remove package from user's miniDrawPackages array
  await User.updateOne(
    { _id: user._id },
    {
      $pull: {
        miniDrawPackages: {
          stripePaymentIntentId: paymentIntentId,
        },
      },
    }
  );

  // Update mini draw participation tracking
  if (miniDrawId) {
    await User.updateOne(
      {
        _id: user._id,
        "miniDrawParticipation.miniDrawId": miniDrawId,
      },
      {
        $inc: {
          "miniDrawParticipation.$.totalEntries": -(originalEvent.data.entries || 0),
          "miniDrawParticipation.$.entriesBySource.mini-draw-package": -(originalEvent.data.entries || 0),
        },
      }
    );
  }

  // console.log(`✅ Removed mini-draw package and reversed entries`);
}
