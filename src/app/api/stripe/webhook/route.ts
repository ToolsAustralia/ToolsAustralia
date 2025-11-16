import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
// import { Types } from "mongoose"; // No longer needed with Option 1
import Order from "@/models/Order";
import { stripe } from "@/lib/stripe";
import { headers } from "next/headers";
import Stripe from "stripe";
import { getPackageById } from "@/data/membershipPackages";
import { ensureIndexesOnce } from "@/utils/database/ensure-indexes";
import { getUpsellPackageById } from "@/data/upsellPackages";
import { processPaymentBenefits, isPaymentProcessed } from "@/utils/payment/payment-processing";
import Promo from "@/models/Promo";
// ✅ WEBHOOK-FIRST: Remove database dependency for event tracking
import { klaviyo } from "@/lib/klaviyo";
import { ensureUserProfileSynced } from "@/utils/integrations/klaviyo/klaviyo-profile-sync";
import {
  createSubscriptionStartedEvent,
  createSubscriptionCancelledEvent,
  createSubscriptionRenewalFailedEvent,
  createSubscriptionPaymentFailedEvent,
  createPaymentFailedEvent,
  createInvoiceGeneratedEvent,
} from "@/utils/integrations/klaviyo/klaviyo-events";
import { handleSubscriptionQueueUpdate } from "@/utils/partner-discounts/partner-discount-queue";

/**
 * Optimized logging system with environment-aware verbosity
 */
const isDevelopment = process.env.NODE_ENV === "development";
const isVerboseLogging = process.env.WEBHOOK_VERBOSE_LOGGING === "true";

// Performance-optimized logging
function webhookLog(level: "info" | "warn" | "error", message: string, data?: unknown) {
  // Only log in development or when verbose logging is enabled
  if (!isDevelopment && !isVerboseLogging) {
    // Only log errors in production
    if (level !== "error") return;
  }

  const prefix = level === "error" ? "❌" : level === "warn" ? "⚠️" : "ℹ️";
  console[level](`${prefix} WEBHOOK: ${message}`, data || "");
}

// ✅ WEBHOOK-FIRST: Use PaymentEvent-only idempotency (no additional infrastructure needed)
/**
 * Check if a payment has already been processed using PaymentEvent table
 * This leverages the existing isPaymentProcessed function from paymentProcessing.ts
 */
async function isEventProcessed(paymentIntentId: string): Promise<boolean> {
  return await isPaymentProcessed(paymentIntentId);
}

/**
 * Mark a payment as processed (handled by processPaymentBenefits function)
 * No additional storage needed - PaymentEvent table handles this automatically
 */
async function markEventProcessed(paymentIntentId: string): Promise<void> {
  webhookLog("info", `Payment ${paymentIntentId} will be marked as processed by processPaymentBenefits`);
}

/**
 * Get active promo multiplier for a package type
 */
async function getActivePromoMultiplier(packageType: "one-time" | "mini-draw"): Promise<number> {
  try {
    const promoType =
      packageType === "one-time"
        ? "one-time-packages"
        : packageType === "mini-draw"
        ? "mini-packages"
        : "one-time-packages";
    const now = new Date();

    const activePromo = await Promo.findOne({
      type: promoType,
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gt: now },
    }).sort({ createdAt: -1 });

    return activePromo?.multiplier || 1;
  } catch (error) {
    webhookLog("error", `Error fetching active promo for ${packageType}: ${error}`);
    return 1; // Default to no multiplier on error
  }
}

/**
 * Handle payment success with event-based idempotency
 * @returns false if payment was not processed, undefined otherwise
 */
async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent): Promise<boolean | undefined> {
  try {
    webhookLog("info", `Processing payment success: ${paymentIntent.id}`);

    // Remove database connection tests - they're unnecessary overhead

    // Find user by customer ID
    let user;
    if (paymentIntent.customer) {
      const customerId =
        typeof paymentIntent.customer === "string" ? paymentIntent.customer : paymentIntent.customer.id;
      user = await User.findOne({ stripeCustomerId: customerId });
    }

    if (!user) {
      webhookLog("error", `User not found for payment intent: ${paymentIntent.id}`);
      return;
    }

    // ✅ NEW: Use event-based idempotency check
    const alreadyProcessed = await isPaymentProcessed(paymentIntent.id);

    if (alreadyProcessed) {
      webhookLog("info", `Payment ${paymentIntent.id} already processed, skipping`);
      return;
    }

    // ✅ WEBHOOK-FIRST: Process only explicit non-subscription payments here
    const paymentType = paymentIntent.metadata.type || paymentIntent.metadata.packageType;

    // ✅ CRITICAL: Skip subscription payments - they're handled by invoice.payment_succeeded
    // This prevents duplicate processing when both payment_intent.succeeded and invoice.payment_succeeded fire
    const isSubscriptionPayment =
      paymentIntent.metadata.type === "subscription" ||
      paymentIntent.metadata.packageType === "subscription" ||
      paymentIntent.metadata.subscription_id ||
      !!(paymentIntent as { invoice?: string | Stripe.Invoice }).invoice; // ✅ NEW: Also check if payment has an invoice (subscription payments always have invoices)

    if (isSubscriptionPayment) {
      webhookLog("info", `Skipping subscription payment ${paymentIntent.id} - handled by invoice.payment_succeeded`);
      return false; // Return false to indicate no processing happened
    }

    // Process ONLY non-subscription payments (explicit types)
    if (paymentType === "upsell") {
      await handleUpsellWebhook(user, paymentIntent);
    } else if (paymentType === "mini-draw") {
      await handleMiniDrawWebhook(user, paymentIntent);
    } else if (paymentType === "one-time") {
      await handleOneTimeWebhook(user, paymentIntent);
    } else {
      // ✅ CRITICAL: Never process membership/subscription via PI here
      // Only explicit non-subscription types are allowed above
      webhookLog("info", `Skipping payment_intent.succeeded for non-explicit type. Handled elsewhere if needed.`);
      return false;
    }

    webhookLog("info", `Payment ${paymentIntent.id} processing completed`);

    // ✅ Update Klaviyo profile with latest user data after purchase
    try {
      const fullUser = await User.findById(user._id.toString());
      if (fullUser && paymentIntent.metadata) {
        const packageType = paymentIntent.metadata.type || paymentIntent.metadata.packageType;
        const packageId = paymentIntent.metadata.packageId;
        const packageName = paymentIntent.metadata.packageName;

        // Only sync profile if we have package information and payment was processed
        if (packageId && packageName && packageType) {
          ensureUserProfileSynced(fullUser);
        }
      }
    } catch (klaviyoError) {
      webhookLog("error", `Klaviyo profile sync error: ${klaviyoError}`);
    }
  } catch (error) {
    webhookLog("error", `Error handling payment success: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Handle upsell payments in webhook (backup processing)
 */
async function handleUpsellWebhook(user: { _id: { toString: () => string } }, paymentIntent: Stripe.PaymentIntent) {
  const offerId = paymentIntent.metadata.offerId;
  const entriesCount = parseInt(paymentIntent.metadata.entriesCount || "0");

  // Get upsell package details
  const upsellPackage = getUpsellPackageById(offerId);
  if (!upsellPackage) {
    webhookLog("error", `Upsell package not found: ${offerId}`);
    return;
  }

  // Use final entries count (from metadata or fallback to package data)
  const finalEntriesCount = entriesCount > 0 ? entriesCount : upsellPackage.entriesCount;

  // Extract miniDrawId from payment intent metadata (for mini-draw upsells)
  const miniDrawId = paymentIntent.metadata.miniDrawId;

  if (miniDrawId) {
    webhookLog("info", `Upsell ${offerId} is for mini-draw: ${miniDrawId}`);
  }

  // Process benefits using event-based system with payment metadata
  const result = await processPaymentBenefits(
    paymentIntent.id,
    user._id.toString(),
    {
      packageType: "upsell",
      packageId: offerId,
      packageName: upsellPackage.name,
      entries: finalEntriesCount,
      points: Math.floor(upsellPackage.discountedPrice),
      price: upsellPackage.discountedPrice,
    },
    "webhook",
    {
      created: paymentIntent.created * 1000, // Convert Stripe timestamp (seconds) to milliseconds
      type: "upsell",
      packageType: "upsell",
      ...(miniDrawId && { miniDrawId: miniDrawId }), // Include miniDrawId if present
    }
  );

  if (!result.success) {
    webhookLog("error", `Failed to process upsell ${offerId}: ${result.error}`);
  }
}

// handleSubscriptionPaymentWebhook removed - subscription processing now handled only by handleInvoicePaid

/**
 * Handle one-time package payments in webhook (backup processing)
 */
async function handleOneTimeWebhook(user: { _id: { toString: () => string } }, paymentIntent: Stripe.PaymentIntent) {
  const packageId = paymentIntent.metadata.packageId;
  const packageName = paymentIntent.metadata.packageName || `One-Time Package ${packageId}`;
  const entriesCount = parseInt(paymentIntent.metadata.entriesCount || "0");
  const price = parseInt(paymentIntent.metadata.price || "0");

  if (entriesCount <= 0) {
    webhookLog("error", `No entries found for one-time package ${packageId}`);
    return;
  }

  // Get active promo multiplier for one-time packages
  const promoMultiplier = await getActivePromoMultiplier("one-time");
  const finalEntriesCount = entriesCount * promoMultiplier;

  webhookLog(
    "info",
    `One-time package ${packageId}: ${entriesCount} base entries × ${promoMultiplier} = ${finalEntriesCount} final entries`
  );

  // Process benefits using event-based system with payment metadata
  const result = await processPaymentBenefits(
    paymentIntent.id,
    user._id.toString(),
    {
      packageType: "one-time",
      packageId: packageId,
      packageName: packageName,
      entries: finalEntriesCount, // Apply promo multiplier to entries
      points: Math.floor(price / 100), // Convert from cents - points remain unchanged
      price: price / 100, // Convert from cents
    },
    "webhook",
    {
      created: paymentIntent.created * 1000, // Convert Stripe timestamp (seconds) to milliseconds
      type: "one-time",
      packageType: "one-time",
    }
  );

  if (!result.success) {
    webhookLog("error", `Failed to process one-time package ${packageId}: ${result.error}`);
  }
}

/**
 * Handle mini draw payments in webhook (backup processing)
 */
async function handleMiniDrawWebhook(user: { _id: { toString: () => string } }, paymentIntent: Stripe.PaymentIntent) {
  const packageId = paymentIntent.metadata.packageId;
  const miniDrawId = paymentIntent.metadata.miniDrawId; // Extract MiniDraw ID from metadata
  const packageName = paymentIntent.metadata.packageName || `Mini Draw Package ${packageId}`;
  const entriesCount = parseInt(paymentIntent.metadata.entriesCount || "0");
  const price = parseInt(paymentIntent.metadata.price || "0");

  if (entriesCount <= 0) {
    webhookLog("error", `No entries found for mini draw ${packageId}`);
    return;
  }

  if (!miniDrawId) {
    webhookLog("error", `No miniDrawId found in payment intent metadata for package ${packageId}`);
    return;
  }

  // Get active promo multiplier for mini-draw packages
  const promoMultiplier = await getActivePromoMultiplier("mini-draw");
  const finalEntriesCount = entriesCount * promoMultiplier;

  webhookLog(
    "info",
    `Mini-draw package ${packageId}: ${entriesCount} base entries × ${promoMultiplier} = ${finalEntriesCount} final entries`
  );
  webhookLog("info", `Mini-draw ID: ${miniDrawId}`);

  // Process benefits using event-based system with payment metadata
  const result = await processPaymentBenefits(
    paymentIntent.id,
    user._id.toString(),
    {
      packageType: "mini-draw",
      packageId: packageId,
      packageName: packageName,
      entries: finalEntriesCount, // Apply promo multiplier to entries
      points: Math.floor(price / 100), // Convert from cents - points remain unchanged
      price: price / 100, // Convert from cents
    },
    "webhook",
    {
      created: paymentIntent.created * 1000, // Convert Stripe timestamp (seconds) to milliseconds
      type: "mini-draw",
      packageType: "mini-draw",
      miniDrawId: miniDrawId, // Pass MiniDraw ID to payment processing
    }
  );

  if (!result.success) {
    webhookLog("error", `Failed to process mini draw ${packageId}: ${result.error}`);
  }
}

/**
 * Handle payment failure - Track all payment failures to Klaviyo
 */
async function handlePaymentFailure(paymentIntent: Stripe.PaymentIntent) {
  try {
    webhookLog("error", `Payment failed: ${paymentIntent.id}`);

    // Update order status if it exists
    const order = await Order.findOne({ paymentIntentId: paymentIntent.id });
    if (order) {
      order.status = "failed";
      await order.save();
    }

    // Find user by customer ID
    let user;
    if (paymentIntent.customer) {
      const customerId =
        typeof paymentIntent.customer === "string" ? paymentIntent.customer : paymentIntent.customer.id;
      user = await User.findOne({ stripeCustomerId: customerId });
    }

    if (!user) {
      webhookLog("error", `User not found for failed payment: ${paymentIntent.id}`);
      return;
    }

    // Extract payment type and details from metadata
    const paymentType = paymentIntent.metadata.type || paymentIntent.metadata.packageType || "unknown";
    const packageId = paymentIntent.metadata.packageId || "unknown";
    const packageName = paymentIntent.metadata.packageName || "Unknown Package";
    const amount = (paymentIntent.amount || 0) / 100; // Convert from cents to dollars

    // Get failure details from last payment error
    const lastPaymentError = paymentIntent.last_payment_error;
    const failureReason = lastPaymentError?.message || "Payment declined";
    const failureCode = lastPaymentError?.code || "";
    const failureMessage = lastPaymentError?.decline_code || "";

    // Track to Klaviyo based on payment type
    if (paymentType === "subscription") {
      // For subscriptions, use specific subscription failure event
      // Determine if this is initial payment or renewal
      // Initial payments don't have invoice yet, renewals do
      const isInitialPayment = !(paymentIntent as { invoice?: string | Stripe.Invoice }).invoice;

      // Get package tier for subscription
      const tier = packageId.toLowerCase().includes("boss")
        ? "Boss"
        : packageId.toLowerCase().includes("legend")
        ? "Legend"
        : packageId.toLowerCase().includes("foreman")
        ? "Foreman"
        : packageId.toLowerCase().includes("tradie")
        ? "Tradie"
        : "Mate";

      klaviyo.trackEventBackground(
        createSubscriptionPaymentFailedEvent(user as never, {
          paymentIntentId: paymentIntent.id,
          packageId,
          packageName,
          tier,
          amount,
          failureReason,
          failureCode,
          isInitialPayment,
        })
      );
    } else {
      // For other payment types (one-time, mini-draw, upsell), use generic payment failed event
      const validPackageType =
        paymentType === "one-time" || paymentType === "mini-draw" || paymentType === "upsell"
          ? (paymentType as "one-time" | "upsell" | "mini-draw")
          : "one-time"; // Default fallback

      klaviyo.trackEventBackground(
        createPaymentFailedEvent(user as never, {
          paymentIntentId: paymentIntent.id,
          packageType: validPackageType,
          packageId,
          packageName,
          amount,
          failureReason,
          failureCode,
          failureMessage,
        })
      );
    }

    // Update Klaviyo profile to reflect failed payment status
    ensureUserProfileSynced(user);

    webhookLog("info", `✅ Payment failure tracked to Klaviyo for: ${user.email}`);
  } catch (error) {
    webhookLog("error", `Error handling payment failure: ${error}`);
  }
}

/**
 * Handle subscription events (simplified)
 */
async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  try {
    webhookLog("info", `Processing subscription created: ${subscription.id}`);
    // Find user by customer ID
    let user;
    if (subscription.customer) {
      const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      user = await User.findOne({ stripeCustomerId: customerId });
    }

    if (!user) {
      webhookLog("error", `User not found for subscription: ${subscription.id}`);
      return;
    }

    // 🚨 CRITICAL FIX: Check if this is a scheduled downgrade - skip processing
    const isScheduledDowngrade =
      subscription.metadata?.downgradeScheduled === "true" && subscription.metadata?.downgradeType === "scheduled";

    if (isScheduledDowngrade) {
      webhookLog("info", `Skipping subscription created webhook - scheduled downgrade detected for ${subscription.id}`);
      return;
    }

    // Get package details from subscription metadata
    const packageId = subscription.metadata.packageId;
    if (!packageId) {
      webhookLog("error", `No package ID found in subscription metadata: ${subscription.id}`);
      return;
    }

    // Get membership package details
    const membershipPackage = getPackageById(packageId);
    if (!membershipPackage) {
      webhookLog("error", `Membership package not found: ${packageId}`);
      return;
    }

    // Check if this is an upgrade (has pendingChange)
    if (
      user.subscription?.pendingChange &&
      user.subscription.pendingChange.stripeSubscriptionId === subscription.id &&
      user.subscription.pendingChange.changeType === "upgrade"
    ) {
      webhookLog("info", `Activating upgrade subscription: ${subscription.id}`);

      // Activate the upgrade
      user.subscription.packageId = user.subscription.pendingChange.newPackageId;
      user.subscription.startDate = new Date();
      user.subscription.isActive = true;
      user.subscription.status = "active";
      user.subscription.autoRenew = true;
      user.subscription.pendingChange = undefined;
      user.stripeSubscriptionId = subscription.id;

      // ✅ CRITICAL FIX: Don't add entries/points here!
      // Benefits are granted by invoice.payment_succeeded through processPaymentBenefits
      // Adding them here causes duplicates because both webhooks fire for subscriptions
      webhookLog(
        "info",
        `Upgrade activated successfully: ${membershipPackage.name} - benefits will be granted by invoice.payment_succeeded`
      );

      // Verify the save was successful
      const savedUser = await user.save();
      webhookLog(
        "info",
        `User subscription updated - isActive: ${savedUser.subscription?.isActive}, status: ${savedUser.subscription?.status}, stripeSubscriptionId: ${savedUser.stripeSubscriptionId}`
      );

      if (!savedUser.stripeSubscriptionId || savedUser.subscription?.status !== "active") {
        webhookLog("error", `Failed to save subscription activation properly`);
      } else {
        webhookLog("info", `✅ Subscription activation verified successfully`);
      }

      return;
    } else {
      // Regular subscription creation - only update autoRenew
      if (user.subscription) {
        user.subscription.autoRenew = !subscription.cancel_at_period_end;
      }
    }

    await user.save();

    // Update Klaviyo profile after subscription activation
    try {
      const freshUser = await User.findById(user._id);
      if (freshUser) {
        ensureUserProfileSynced(freshUser);
      }
    } catch (klaviyoError) {
      webhookLog("error", `Klaviyo profile sync error: ${klaviyoError}`);
    }
  } catch (error) {
    webhookLog("error", `Error handling subscription created: ${error}`);
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  try {
    webhookLog("info", `Processing subscription updated: ${subscription.id}`);
    // Find user by customer ID
    let user;
    if (subscription.customer) {
      const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      user = await User.findOne({ stripeCustomerId: customerId });
    }

    if (!user) {
      webhookLog("error", `User not found for subscription: ${subscription.id}`);
      return;
    }

    // ✅ PRORATION UPGRADE: Check if this is from subscription.update() (new best practice pattern)
    // When using subscription.update() for upgrades, the subscription ID doesn't change
    const isProrationUpgrade =
      user.stripeSubscriptionId === subscription.id &&
      user.subscription?.pendingChange?.changeType === "upgrade" &&
      subscription.metadata?.upgradeType === "proration";

    webhookLog(
      "info",
      `Checking subscription update - isProrationUpgrade: ${isProrationUpgrade}, hasPendingChange: ${!!user.subscription
        ?.pendingChange}, subscriptionStatus: ${subscription.status}`
    );

    // Check if this is a pending change activation (upgrade or downgrade)
    webhookLog(
      "info",
      `Checking pending change - hasPendingChange: ${!!user.subscription?.pendingChange}, pendingSubscriptionId: ${
        user.subscription?.pendingChange?.stripeSubscriptionId
      }, currentSubscriptionId: ${subscription.id}, subscriptionStatus: ${subscription.status}`
    );

    // 🎯 NEW APPROACH: No special downgrade handling needed
    // previousSubscription in user model handles benefit preservation automatically
    // Webhook just processes subscription updates normally

    if (
      user.subscription?.pendingChange &&
      (user.subscription.pendingChange.stripeSubscriptionId === subscription.id || isProrationUpgrade) &&
      subscription.status === "active"
    ) {
      const changeType = user.subscription.pendingChange.changeType;

      // 🔧 CRITICAL FIX: Only process upgrades immediately, not downgrades
      if (changeType === "upgrade") {
        webhookLog(
          "info",
          `Activating pending upgrade: ${user.subscription.pendingChange.newPackageId} (proration: ${isProrationUpgrade})`
        );

        // Get package details for entries
        const packageId = user.subscription.pendingChange.newPackageId;
        const membershipPackage = getPackageById(packageId);

        if (!membershipPackage) {
          webhookLog("error", `Package not found for upgrade: ${packageId}`);
          return;
        }

        // Activate the upgrade immediately
        user.subscription.packageId = packageId;
        user.subscription.startDate = new Date();
        user.subscription.isActive = true;
        user.subscription.status = "active";
        user.subscription.autoRenew = true;
        user.subscription.pendingChange = undefined; // Clear pending change
        user.stripeSubscriptionId = subscription.id;

        // ✅ CRITICAL FIX: Don't add entries/points here!
        // Benefits are granted by invoice.payment_succeeded through processPaymentBenefits
        // Adding them here causes duplicates because both webhooks fire for subscriptions

        // Ensure the save was successful by verifying the data
        const savedUser = await user.save();

        webhookLog(
          "info",
          `Upgrade activated successfully for user: ${user._id} - benefits will be granted by invoice.payment_succeeded`
        );
        webhookLog(
          "info",
          `User subscription updated - isActive: ${savedUser.subscription?.isActive}, status: ${savedUser.subscription?.status}, stripeSubscriptionId: ${savedUser.stripeSubscriptionId}`
        );

        // Send Klaviyo event for upgrade
        try {
          const { createSubscriptionUpgradedEvent } = await import("@/utils/integrations/klaviyo/klaviyo-events");
          const { klaviyo } = await import("@/lib/klaviyo");

          // ✅ OPTION 1: Previous package info no longer needed since we're using single source of truth
          // The majordraws.entries will handle the upgrade logic automatically

          // ✅ OPTION 1: Simplified upgrade event since we're using single source of truth
          const upgradeEvent = createSubscriptionUpgradedEvent(user, {
            fromPackageId: user.subscription?.packageId || "unknown",
            fromPackageName: "Previous Package",
            fromTier: "Previous Tier",
            fromPrice: 0, // We don't store previous price, but Klaviyo will track this
            toPackageId: membershipPackage._id.toString(),
            toPackageName: membershipPackage.name,
            toTier: membershipPackage.name,
            toPrice: membershipPackage.price,
            upgradeAmount: membershipPackage.price * 100, // Convert to cents
            entriesAdded: membershipPackage.entriesPerMonth || 0,
            paymentIntentId:
              (user.subscription?.pendingChange as unknown as { paymentIntentId?: string })?.paymentIntentId || "",
          });

          klaviyo.trackEventBackground(upgradeEvent);
          webhookLog("info", `✅ Klaviyo upgrade event sent for user: ${user._id}`);
        } catch (klaviyoError) {
          webhookLog("error", `Klaviyo upgrade event failed: ${klaviyoError}`);
        }
      } else if (changeType === "downgrade") {
        // 🔧 CRITICAL FIX: For downgrades, don't activate immediately - let scheduled logic handle it
        webhookLog(
          "info",
          `Downgrade pending change detected but not activating immediately - will be handled by scheduled logic when billing cycle ends`
        );
        return; // Don't process downgrades in this path
      }

      return; // Exit early for upgrades - don't continue to scheduled logic
    }

    // 🎯 OLD DOWNGRADE LOGIC - NO LONGER NEEDED with previousSubscription approach
    // This code is kept for backwards compatibility but won't execute with new downgrades
    const isOldDowngrade =
      subscription.metadata?.downgradeScheduled === "true" && subscription.metadata?.downgradeType === "scheduled";
    if (isOldDowngrade && subscription.status === "active") {
      const downgradeToPackageId = subscription.metadata?.downgradeTo;
      const downgradeFromPackageId = subscription.metadata?.downgradeFrom;

      if (downgradeToPackageId) {
        // 🔧 CRITICAL FIX: Check if this is a scheduling update vs actual billing cycle change
        // When we call stripe.subscriptions.update() with billing_cycle_anchor: "unchanged",
        // Stripe sends an immediate webhook but the items don't actually change until the next billing cycle

        // Get the current subscription item's price ID
        const currentSubscriptionItems = subscription.items.data;
        const currentPriceId = currentSubscriptionItems[0]?.price?.id;

        // Get the price ID for the downgrade target package
        const { getPackageById } = await import("@/data/membershipPackages");
        const targetPackage = getPackageById(downgradeToPackageId);

        if (!targetPackage) {
          webhookLog("error", `Target package not found for downgrade: ${downgradeToPackageId}`);
          return;
        }

        // Get the Stripe price ID for the target package
        const targetStripePriceId = targetPackage.stripePriceId;

        // 🔧 CRITICAL FIX: For scheduled downgrades with billing_cycle_anchor: "unchanged",
        // Stripe immediately updates the price but the billing cycle doesn't change until next period
        // We need to check if we're past the effective date to determine if this is an actual billing change
        const effectiveDateStr = subscription.metadata?.effectiveDate;
        let isActualBillingChange = false;

        if (effectiveDateStr) {
          const effectiveDate = new Date(effectiveDateStr);
          const now = new Date();
          isActualBillingChange = now >= effectiveDate;
        } else {
          // Fallback: If no effective date, check if price changed (old logic)
          isActualBillingChange = currentPriceId === targetStripePriceId;
        }

        webhookLog("info", `Downgrade webhook analysis:`, {
          currentPriceId,
          targetStripePriceId,
          effectiveDateStr,
          isActualBillingChange,
          isSchedulingUpdate: !isActualBillingChange,
          userCurrentPackage: user.subscription?.packageId,
          downgradeToPackage: downgradeToPackageId,
          currentTime: new Date().toISOString(),
        });

        if (!isActualBillingChange) {
          // This is just a scheduling update - don't process the downgrade yet
          webhookLog(
            "info",
            `Scheduling update received - downgrade will be processed when billing cycle changes (current: ${currentPriceId}, target: ${targetStripePriceId})`
          );
          return;
        }

        if (isActualBillingChange) {
          webhookLog(
            "info",
            `Processing actual billing cycle downgrade from ${downgradeFromPackageId} to ${downgradeToPackageId}`
          );

          // Update user's subscription to the new package
          if (user.subscription) {
            user.subscription.packageId = downgradeToPackageId;
            user.subscription.startDate = new Date();
            user.subscription.isActive = true;
            user.subscription.status = "active";
            user.subscription.autoRenew = true;
            user.subscription.pendingChange = undefined; // Clear any pending changes
          }

          await user.save();

          webhookLog("info", `Scheduled downgrade activated successfully for user: ${user._id}`);

          // Send Klaviyo event for downgrade activation
          try {
            const { createSubscriptionDowngradedEvent } = await import("@/utils/integrations/klaviyo/klaviyo-events");
            const { klaviyo } = await import("@/lib/klaviyo");

            const newPackage = getPackageById(downgradeToPackageId);
            if (newPackage) {
              const downgradeEvent = createSubscriptionDowngradedEvent(user, {
                fromPackageId: downgradeFromPackageId || "previous-package",
                fromPackageName: "Previous Package",
                fromTier: "Previous Tier",
                fromPrice: 0,
                toPackageId: newPackage._id.toString(),
                toPackageName: newPackage.name,
                toTier: newPackage.name,
                toPrice: newPackage.price,
                effectiveDate: new Date(),
                daysUntilEffective: 0,
              });

              klaviyo.trackEventBackground(downgradeEvent);
              webhookLog("info", `✅ Klaviyo scheduled downgrade event sent for user: ${user._id}`);
            }
          } catch (klaviyoError) {
            webhookLog("error", `Klaviyo scheduled downgrade event failed: ${klaviyoError}`);
          }
        } else {
          webhookLog(
            "info",
            `Subscription update detected but downgrade not yet effective - user still has ${user.subscription?.packageId}, target is ${downgradeToPackageId}`
          );
        }

        return;
      }
    }

    // RESEARCH-BACKED PROTECTION: Check if user has pending changes or recent upgrades
    const hasPendingChange = user.subscription?.pendingChange;
    const hasRecentUpgrade =
      user.subscription?.lastUpgradeDate && Date.now() - user.subscription.lastUpgradeDate.getTime() < 60000; // 1 minute window

    // If user has pending changes or recent upgrades, be extra cautious
    if (hasPendingChange || hasRecentUpgrade) {
      webhookLog("info", `Skipping update of ${subscription.id} - user has pending changes or recent upgrade activity`);
      return;
    }

    // CRITICAL: If user has Boss package but inactive status, don't let any updates override it
    const hasBossPackageButInactive =
      user.subscription?.packageId === "boss-subscription" &&
      (!user.subscription?.isActive || user.subscription?.status !== "active");

    if (hasBossPackageButInactive && subscription.id !== user.stripeSubscriptionId) {
      webhookLog(
        "info",
        `Skipping update of old subscription ${subscription.id} - user has Boss package but inactive status (webhook override protection)`
      );
      return;
    }

    // Update user subscription status based on Stripe subscription
    if (user.subscription) {
      const wasActive = user.subscription.isActive;
      const wasStatus = user.subscription.status;

      // Additional protection: If user has an active Boss subscription, don't let old subscription updates override it
      const hasActiveBossSubscription =
        user.subscription?.isActive &&
        user.subscription?.status === "active" &&
        user.subscription?.packageId === "boss-subscription";

      if (hasActiveBossSubscription && subscription.id !== user.stripeSubscriptionId) {
        webhookLog(
          "info",
          `Skipping update of old subscription ${subscription.id} - user has active Boss subscription`
        );
        return;
      }

      // CRITICAL: If user has Boss package but inactive status, don't let any updates override it
      const hasBossPackageButInactive =
        user.subscription?.packageId === "boss-subscription" &&
        (!user.subscription?.isActive || user.subscription?.status !== "active");

      if (hasBossPackageButInactive && subscription.id !== user.stripeSubscriptionId) {
        webhookLog(
          "info",
          `Skipping update of old subscription ${subscription.id} - user has Boss package but inactive status (webhook override protection)`
        );
        return;
      }

      // Only process updates if this is the user's current subscription
      if (user.stripeSubscriptionId && user.stripeSubscriptionId !== subscription.id) {
        webhookLog(
          "info",
          `Ignoring update of old subscription ${subscription.id} - user has newer subscription ${user.stripeSubscriptionId}`
        );
        return;
      }

      // Only update status for specific cases to avoid conflicts
      if (wasActive && wasStatus === "active") {
        // Subscription already processed as active, only update autoRenew
        user.subscription.autoRenew = !subscription.cancel_at_period_end;
      } else if (subscription.status === "canceled" || subscription.status === "past_due") {
        // Only update for explicit cancellations or past due
        user.subscription.isActive = false;
        user.subscription.status = subscription.status;
        user.subscription.autoRenew = !subscription.cancel_at_period_end;
      } else {
        // For other statuses, let invoice.paid handle it
        user.subscription.autoRenew = !subscription.cancel_at_period_end;
      }
    }

    await user.save();
  } catch (error) {
    webhookLog("error", `Error handling subscription updated: ${error}`);
  }
}

/**
 * Handle subscription schedule updated - this happens when a phase transitions
 */
async function handleSubscriptionScheduleUpdated(schedule: Stripe.SubscriptionSchedule) {
  try {
    webhookLog("info", `Processing subscription schedule updated: ${schedule.id}`);

    // Find user by schedule metadata
    const userId = schedule.metadata?.userId;
    if (!userId) {
      webhookLog("error", `No userId in subscription schedule metadata: ${schedule.id}`);
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      webhookLog("error", `User not found for subscription schedule: ${schedule.id}`);
      return;
    }

    // Check if this is a downgrade schedule
    if (schedule.metadata?.downgradeScheduled === "true" && schedule.metadata?.downgradeType === "scheduled") {
      const downgradeToPackageId = schedule.metadata?.downgradeTo;

      if (downgradeToPackageId) {
        webhookLog("info", `Processing scheduled downgrade activation: ${downgradeToPackageId}`);

        // Check if the schedule has moved to the next phase (downgrade activated)
        const currentPhase = schedule.current_phase;
        if (
          currentPhase &&
          (currentPhase as Stripe.SubscriptionSchedule.CurrentPhase & { metadata?: { phase?: string } }).metadata
            ?.phase === "downgraded"
        ) {
          // The downgrade phase is now active - activate it in our system
          const targetPackage = getPackageById(downgradeToPackageId);
          if (!targetPackage) {
            webhookLog("error", `Target package not found for downgrade: ${downgradeToPackageId}`);
            return;
          }

          // Update user's subscription to the new package
          if (user.subscription) {
            user.subscription.packageId = downgradeToPackageId;
            user.subscription.startDate = new Date();
            user.subscription.isActive = true;
            user.subscription.status = "active";
            user.subscription.autoRenew = true;
            user.subscription.pendingChange = undefined; // Clear pending change
          }

          await user.save();
          webhookLog("info", `Scheduled downgrade activated successfully for user: ${user._id}`);

          // Send Klaviyo event for downgrade activation
          try {
            const { createSubscriptionDowngradedEvent } = await import("@/utils/integrations/klaviyo/klaviyo-events");
            const { klaviyo } = await import("@/lib/klaviyo");

            const downgradeEvent = createSubscriptionDowngradedEvent(user, {
              fromPackageId: schedule.metadata?.downgradeFrom || "previous-package",
              fromPackageName: "Previous Package",
              fromTier: "Previous Tier",
              fromPrice: 0,
              toPackageId: downgradeToPackageId,
              toPackageName: targetPackage.name,
              toTier: targetPackage.name,
              toPrice: targetPackage.price,
              effectiveDate: new Date(),
              daysUntilEffective: 0,
            });

            klaviyo.trackEventBackground(downgradeEvent);
            webhookLog("info", `✅ Klaviyo downgrade activation event sent for user: ${user._id}`);
          } catch (klaviyoError) {
            webhookLog("error", `Klaviyo downgrade event failed: ${klaviyoError}`);
          }
        }
      }
    }
  } catch (error) {
    webhookLog("error", `Error in handleSubscriptionScheduleUpdated: ${error}`);
  }
}

/**
 * Handle subscription schedule completed - schedule has finished all phases
 */
async function handleSubscriptionScheduleCompleted(schedule: Stripe.SubscriptionSchedule) {
  try {
    webhookLog("info", `Subscription schedule completed: ${schedule.id}`);
    // Schedule completed - subscription is now back to normal billing
  } catch (error) {
    webhookLog("error", `Error in handleSubscriptionScheduleCompleted: ${error}`);
  }
}

/**
 * Handle subscription schedule released - schedule was cancelled and subscription released
 */
async function handleSubscriptionScheduleReleased(schedule: Stripe.SubscriptionSchedule) {
  try {
    webhookLog("info", `Subscription schedule released: ${schedule.id}`);
    // Schedule was cancelled - subscription is back to normal billing
  } catch (error) {
    webhookLog("error", `Error in handleSubscriptionScheduleReleased: ${error}`);
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  try {
    webhookLog("info", `Processing subscription deleted: ${subscription.id}`);
    // Find user by customer ID
    let user;
    if (subscription.customer) {
      const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      user = await User.findOne({ stripeCustomerId: customerId });
    }

    if (!user) {
      webhookLog("error", `User not found for subscription: ${subscription.id}`);
      return;
    }

    // RESEARCH-BACKED APPROACH: Check if user has pending changes or recent upgrades
    const hasPendingChange = user.subscription?.pendingChange;
    const hasRecentUpgrade =
      user.subscription?.lastUpgradeDate && Date.now() - user.subscription.lastUpgradeDate.getTime() < 60000; // 1 minute window

    // If user has pending changes or recent upgrades, be extra cautious
    if (hasPendingChange || hasRecentUpgrade) {
      webhookLog(
        "info",
        `Skipping deletion of ${subscription.id} - user has pending changes or recent upgrade activity`
      );
      return;
    }

    // Only process deletion if this is the user's current subscription AND no recent activity
    const isCurrentSubscription = user.stripeSubscriptionId === subscription.id;

    if (!isCurrentSubscription) {
      webhookLog(
        "info",
        `Ignoring deletion of old subscription ${subscription.id} - not user's current subscription ${user.stripeSubscriptionId}`
      );
      return;
    }

    // Only deactivate if this is genuinely the user's current subscription
    if (user.subscription) {
      user.subscription.isActive = false;
      user.subscription.status = "canceled";
      user.subscription.autoRenew = false;
    }

    // Clear subscription ID only if this was the user's current subscription
    user.stripeSubscriptionId = undefined;

    // Update partner discount queue - subscription has ended
    webhookLog("info", `Ending subscription in partner discount queue for user ${user.email}`);
    await handleSubscriptionQueueUpdate(user as unknown as import("@/models/User").IUser, "end");

    await user.save();

    // Track subscription cancellation in Klaviyo (non-blocking)
    if (user.subscription) {
      klaviyo.trackEventBackground(
        createSubscriptionCancelledEvent(user as never, {
          packageId: user.subscription.packageId || "unknown",
          packageName: "Subscription",
          tier: user.subscription.packageId || "unknown",
        })
      );
    }
  } catch (error) {
    webhookLog("error", `Error handling subscription deleted: ${error}`);
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  try {
    webhookLog("error", `Invoice payment failed: ${invoice.id}`);

    // Find user by customer ID
    let user;
    if (invoice.customer) {
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer.id;
      user = await User.findOne({ stripeCustomerId: customerId });
    }

    if (!user) {
      webhookLog("error", `User not found for failed invoice: ${invoice.id}`);
      return;
    }

    // Get subscription details
    const subscriptionId = (invoice as Stripe.Invoice & { subscription?: string }).subscription;
    const billingReason = invoice.billing_reason;
    const isInitialPayment = billingReason === "subscription_create";
    const isRenewal = billingReason === "subscription_cycle";

    if (subscriptionId) {
      // Update subscription status to reflect payment failure
      if (user.subscription) {
        user.subscription.status = "past_due";
        user.subscription.isActive = false;
      }
    }

    await user.save();

    // Track failure in Klaviyo (for both initial and renewal failures)
    if (user.subscription && subscriptionId) {
      // Extract payment intent ID from invoice
      const invoiceWithPaymentIntent = invoice as Stripe.Invoice & { payment_intent?: string | Stripe.PaymentIntent };
      const paymentIntentId: string =
        typeof invoiceWithPaymentIntent.payment_intent === "string"
          ? invoiceWithPaymentIntent.payment_intent
          : invoiceWithPaymentIntent.payment_intent?.id || invoice.id || "unknown";

      // Get failure reason from invoice
      const failureReason = invoice.last_finalization_error?.message || "Payment declined";
      const failureCode = invoice.last_finalization_error?.code || "";
      const amount = (invoice.amount_due || 0) / 100; // Convert cents to dollars

      // Get package tier for subscription
      const packageId = user.subscription.packageId || "unknown";
      const tier = packageId.toLowerCase().includes("boss")
        ? "Boss"
        : packageId.toLowerCase().includes("legend")
        ? "Legend"
        : packageId.toLowerCase().includes("foreman")
        ? "Foreman"
        : packageId.toLowerCase().includes("tradie")
        ? "Tradie"
        : "Mate";

      if (isRenewal) {
        // Use existing renewal failed event for subscription renewals
        klaviyo.trackEventBackground(
          createSubscriptionRenewalFailedEvent(user as never, {
            packageId: packageId,
            packageName: "Subscription",
            tier,
            failureReason,
            paymentIntentId: paymentIntentId,
          })
        );
      } else if (isInitialPayment) {
        // Use new subscription payment failed event for initial payments
        klaviyo.trackEventBackground(
          createSubscriptionPaymentFailedEvent(user as never, {
            paymentIntentId: paymentIntentId,
            packageId: packageId,
            packageName: "Subscription",
            tier,
            amount,
            failureReason,
            failureCode,
            isInitialPayment: true,
          })
        );
      } else {
        // Fallback for other billing reasons (subscription_update, etc.)
        // Use subscription payment failed event
        klaviyo.trackEventBackground(
          createSubscriptionPaymentFailedEvent(user as never, {
            paymentIntentId: paymentIntentId,
            packageId: packageId,
            packageName: "Subscription",
            tier,
            amount,
            failureReason,
            failureCode,
            isInitialPayment: false,
          })
        );
      }
    }

    // Update Klaviyo profile to reflect failed payment status
    ensureUserProfileSynced(user);

    webhookLog("info", `✅ Invoice payment failure tracked to Klaviyo`);
  } catch (error) {
    webhookLog("error", `Error handling invoice payment failed: ${error}`);
  }
}

/**
 * Handle invoice.payment_succeeded events for subscription activations
 * This is Stripe's canonical event for subscription payment processing
 */
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  try {
    webhookLog("info", `🎯 INVOICE PAYMENT SUCCEEDED HANDLER CALLED for ${invoice.id}`);
    webhookLog("info", `Processing invoice.payment_succeeded for ${invoice.id}`);

    // ✅ CRITICAL FIX: ATOMIC PaymentEvent creation to prevent race conditions
    // Create PaymentEvent FIRST using MongoDB unique constraint
    // If creation fails (duplicate key), another webhook is already processing
    const invoicePaymentId = `invoice_${invoice.id}`;
    const eventId = `BenefitsGranted-${invoicePaymentId}`;

    // ✅ DEBUG: Log invoice details for debugging
    webhookLog("info", `Invoice details:`, {
      invoiceId: invoice.id,
      customerId: invoice.customer,
      subscriptionId: (() => {
        const subscriptionField = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription })
          .subscription;
        return typeof subscriptionField === "string"
          ? subscriptionField
          : (subscriptionField as Stripe.Subscription)?.id;
      })(),
      metadata: invoice.metadata,
    });

    // Ensure database connection
    await connectDB();

    // Find user by customer ID first
    let user;
    if (invoice.customer) {
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer.id;
      user = await User.findOne({ stripeCustomerId: customerId });
    } else {
      webhookLog("error", `No customer ID in invoice`);
      return;
    }

    if (!user) {
      webhookLog("warn", `User not found for customer: ${invoice.customer}`);
      return;
    }

    // ✅ PRORATION DETECTION: Check if this invoice contains proration items
    const hasProrationItems =
      invoice.lines?.data?.some((line) => {
        const lineItem = line as Stripe.InvoiceLineItem & { proration?: boolean };
        return lineItem.proration === true;
      }) || false;
    const isProrationInvoice =
      hasProrationItems ||
      invoice.billing_reason === "subscription_update" ||
      invoice.billing_reason === "subscription_cycle";

    webhookLog("info", `Invoice analysis:`, {
      billingReason: invoice.billing_reason,
      hasProrationItems,
      isProrationInvoice,
      lineItems: invoice.lines?.data?.length || 0,
    });

    // Get subscription ID - check if this is an upgrade scenario
    let subscriptionId = user.stripeSubscriptionId;

    // For upgrades, check if the invoice is for a new subscription with pending change
    // This handles BOTH old pattern (create new subscription) and new pattern (update subscription)
    if (user.subscription?.pendingChange?.stripeSubscriptionId) {
      const invoiceSubscriptionId = (() => {
        const subscriptionField = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription })
          .subscription;
        return typeof subscriptionField === "string"
          ? subscriptionField
          : (subscriptionField as Stripe.Subscription)?.id;
      })();

      // If this invoice is for the pending change subscription OR current subscription with proration, use that
      if (invoiceSubscriptionId === user.subscription.pendingChange.stripeSubscriptionId) {
        subscriptionId = invoiceSubscriptionId;
        webhookLog(
          "info",
          `Processing upgrade payment for subscription: ${subscriptionId} (proration: ${hasProrationItems})`
        );
      } else if (invoiceSubscriptionId === user.stripeSubscriptionId && isProrationInvoice) {
        subscriptionId = invoiceSubscriptionId;
        webhookLog("info", `Processing proration charge on existing subscription: ${subscriptionId}`);
      }
    }

    if (!subscriptionId) {
      webhookLog("warn", `No subscription ID found for user: ${user.email}`);
      return;
    }

    let subscription;
    try {
      subscription = await stripe.subscriptions.retrieve(subscriptionId);

      // Update payment intent description for recurring payments
      const invoiceWithPaymentIntent = invoice as Stripe.Invoice & { payment_intent?: string | Stripe.PaymentIntent };
      if (invoice.billing_reason === "subscription_cycle" && invoiceWithPaymentIntent.payment_intent) {
        try {
          const paymentIntentId =
            typeof invoiceWithPaymentIntent.payment_intent === "string"
              ? invoiceWithPaymentIntent.payment_intent
              : invoiceWithPaymentIntent.payment_intent.id;
          const packageName = subscription.metadata.packageName || "Subscription";

          await stripe.paymentIntents.update(paymentIntentId, {
            description: `${packageName} - Subscription update`,
          });
        } catch (updateError) {
          webhookLog("error", `Failed to update payment intent description: ${updateError}`);
        }
      }
    } catch (stripeError) {
      webhookLog("error", `Stripe subscription retrieval failed: ${stripeError}`);
      throw stripeError;
    }

    // 🎯 NEW APPROACH: Simply use packageId from Stripe subscription metadata
    // previousSubscription handles benefit preservation automatically
    const packageId = subscription.metadata.packageId;

    if (!packageId) {
      webhookLog("error", `No packageId found in subscription metadata`);
      return;
    }

    webhookLog("info", `Processing subscription payment for package: ${packageId}`);

    // Get membership package data
    const membershipPackage = getPackageById(packageId);
    if (!membershipPackage) {
      webhookLog("error", `Membership package not found: ${packageId}`);
      return;
    }

    // ✅ CRITICAL: Check if this is an upgrade scenario to prevent double benefits
    let entriesToGrant = membershipPackage.entriesPerMonth || 0;
    const pointsToGrant = Math.floor(membershipPackage.price);

    // ✅ NEW: Apply promo multiplier for initial subscription purchases only
    if (invoice.billing_reason === "subscription_create") {
      try {
        const promoMultiplier = await getActivePromoMultiplier("one-time");
        if (promoMultiplier > 1) {
          const originalEntries = entriesToGrant;
          entriesToGrant = entriesToGrant * promoMultiplier;
          webhookLog(
            "info",
            `🎯 PROMO APPLIED: ${originalEntries} entries × ${promoMultiplier} = ${entriesToGrant} entries (initial subscription only)`
          );
        }
      } catch (promoError) {
        webhookLog("error", `Failed to apply promo for subscription: ${promoError}`);
        // Continue with base entries if promo fails
      }
    }

    // Check if this is an upgrade scenario by looking at subscription metadata
    const isUpgrade = subscription.metadata?.upgradeFrom && subscription.metadata?.upgradeType === "no_proration";

    if (isUpgrade) {
      webhookLog("info", `🎯 UPGRADE DETECTED: ${subscription.metadata.upgradeFromName} → ${membershipPackage.name}`);
      webhookLog("info", `Processing upgrade invoice - granting FULL benefits for new package (no proration)`);

      // ✅ CRITICAL: For upgrades with no proration, grant FULL benefits for the new package
      // The user gets full benefits for both packages since we're using proration_behavior: "none"
      webhookLog(
        "info",
        `🎯 UPGRADE: Granting full ${membershipPackage.name} benefits (${entriesToGrant} entries, ${pointsToGrant} points)`
      );
    } else if (invoice.billing_reason === "subscription_cycle") {
      webhookLog("info", `Processing renewal for package ${packageId} - granting full benefits`);
      // Grant full benefits for renewal
    } else if (invoice.billing_reason === "subscription_create") {
      webhookLog("info", `Processing new subscription for package ${packageId} - granting full benefits`);
      // Grant full benefits for new subscription
    } else {
      webhookLog(
        "warn",
        `Unknown billing reason ${invoice.billing_reason} for package ${packageId} - skipping benefits`
      );
      return; // Skip processing for unknown billing reasons
    }

    // ✅ Let processPaymentBenefits handle atomic PaymentEvent creation
    // It already has proper findOneAndUpdate logic
    webhookLog("info", `🔒 Processing payment with atomic PaymentEvent check: ${eventId}`);
    // ✅ CRITICAL: Use invoice.status_transitions.paid_at for actual payment time
    // This ensures entries route correctly during freeze period
    const paymentTimestamp = invoice.status_transitions?.paid_at || invoice.created;

    const result = await processPaymentBenefits(
      invoicePaymentId,
      user._id.toString(),
      {
        packageType: "subscription",
        packageId: packageId,
        packageName: membershipPackage.name,
        entries: entriesToGrant,
        points: pointsToGrant,
        price: membershipPackage.price,
      },
      "webhook",
      {
        created: Math.floor(paymentTimestamp * 1000), // Use paid_at timestamp, not invoice creation time
        type: "subscription",
        packageType: "subscription",
      }
    );

    if (result.success) {
      // Track in Klaviyo
      klaviyo.trackEventBackground(
        createSubscriptionStartedEvent(user as never, {
          packageId,
          packageName: membershipPackage.name,
          tier: membershipPackage.name,
          price: membershipPackage.price,
          entriesGranted: entriesToGrant,
          paymentIntentId: invoicePaymentId,
        })
      );

      // Update Klaviyo profile
      ensureUserProfileSynced(user);

      // ✅ NEW: Add invoice event for upgrades
      if (isUpgrade) {
        try {
          const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

          klaviyo.trackEventBackground(
            createInvoiceGeneratedEvent(user, {
              invoiceId: `inv_${invoice.id}`,
              invoiceNumber,
              packageType: "subscription",
              packageId: membershipPackage._id.toString(),
              packageName: membershipPackage.name,
              packageTier: membershipPackage.name,
              totalAmount: invoice.amount_paid,
              paymentIntentId:
                (
                  invoice as Stripe.Invoice & { payment_intent?: string | Stripe.PaymentIntent }
                ).payment_intent?.toString() || "",
              billingReason: "subscription_update",
              entries_gained: entriesToGrant,
              items: [
                {
                  description: `Upgrade to ${membershipPackage.name}`,
                  quantity: 1,
                  unit_price: membershipPackage.price * 100,
                  total_price: invoice.amount_paid,
                },
              ],
            })
          );

          webhookLog("info", `✅ Invoice event sent to Klaviyo for upgrade: ${invoice.id}`);
        } catch (invoiceError) {
          webhookLog("error", `Invoice event failed: ${invoiceError}`);
        }
      }
    } else {
      webhookLog("error", `Failed to process subscription benefits: ${result.error}`);
    }
  } catch (error) {
    webhookLog("error", `Error processing invoice.payment_succeeded: ${error}`);
  }
}

/**
 * POST /api/stripe/webhook-new
 * Simplified webhook handler with event-based idempotency
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    // ✅ CRITICAL: Ensure PaymentEvent indexes are created BEFORE processing any webhooks
    // This is blocking and must complete before any payment processing happens
    console.log("🔒 WEBHOOK (Old Handler): Ensuring indexes before processing...");
    await ensureIndexesOnce();
    console.log("✅ WEBHOOK (Old Handler): Indexes ensured, proceeding with webhook processing");

    const body = await request.text();
    const signature = (await headers()).get("stripe-signature");

    if (!signature) {
      console.error("❌ Missing stripe-signature header");
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
    } catch (err) {
      console.error("❌ Webhook signature verification failed:", err);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // ✅ CRITICAL: First check if this exact Stripe event has already been processed
    // Stripe can send the same webhook event multiple times, so we use event.id for idempotency
    const stripeEventId = event.id;
    const stripeEventAlreadyProcessed = await isEventProcessed(`stripe_event_${stripeEventId}`);
    if (stripeEventAlreadyProcessed) {
      webhookLog("info", `Stripe event ${stripeEventId} already processed, skipping duplicate webhook`);
      return NextResponse.json({ received: true, skipped: true, reason: "duplicate_stripe_event" });
    }

    // ✅ WEBHOOK-FIRST: Check if this payment has already been processed
    // For payment events, check using payment intent ID
    let paymentIntentId: string | undefined;
    if (event.type.includes("payment_intent")) {
      paymentIntentId = (event.data.object as Stripe.PaymentIntent).id;
    } else if (event.type.includes("invoice")) {
      paymentIntentId = `invoice_${(event.data.object as Stripe.Invoice).id}`;
    }

    if (paymentIntentId) {
      // ✅ CRITICAL FIX: Only check duplicates for actual payment events
      // Don't check for invoice.created, invoice.finalized, etc.
      const isPaymentEvent =
        event.type === "payment_intent.succeeded" ||
        event.type === "invoice.payment_succeeded" ||
        event.type === "invoice.paid";

      if (isPaymentEvent) {
        // ✅ CRITICAL: Enhanced duplicate detection for invoice payments
        if (paymentIntentId.startsWith("invoice_")) {
          const invoiceId = paymentIntentId.replace("invoice_", "");

          // Check if this exact invoice has already been processed (in any format)
          const paymentAlreadyProcessed = await isEventProcessed(paymentIntentId);
          if (paymentAlreadyProcessed) {
            webhookLog("info", `Payment ${paymentIntentId} already processed, skipping`);
            return NextResponse.json({ received: true, skipped: true });
          }

          // ✅ CRITICAL: Check if any variation of this invoice has been processed
          // This catches timestamp variations like invoice_in_123_1759802851877
          // Note: We only process invoice.payment_succeeded, not invoice.paid
          try {
            const invoice = event.data.object as Stripe.Invoice;
            if (invoice.customer) {
              const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer.id;
              const user = await User.findOne({ stripeCustomerId: customerId });

              if (user && user.processedPayments) {
                const hasDuplicateInvoice = user.processedPayments.some((processedPayment) => {
                  // Check for invoice ID in any format (with or without timestamp)
                  if (processedPayment.includes(invoiceId)) return true;

                  // Check for invoice payments with different prefixes
                  if (processedPayment.startsWith("invoice_")) {
                    const existingBaseId = processedPayment.replace("invoice_", "").split("_")[0];
                    return invoiceId === existingBaseId;
                  }

                  return false;
                });

                if (hasDuplicateInvoice) {
                  webhookLog(
                    "info",
                    `Invoice ${invoiceId} already processed in user's processedPayments, skipping webhook`
                  );
                  return NextResponse.json({ received: true, skipped: true });
                }
              }
            }
          } catch (error) {
            webhookLog("error", `Error in webhook duplicate detection: ${error}`);
            // Continue with processing if duplicate detection fails
          }
        } else {
          // For non-invoice payments, use standard duplicate detection
          const paymentAlreadyProcessed = await isEventProcessed(paymentIntentId);
          if (paymentAlreadyProcessed) {
            webhookLog("info", `Payment ${paymentIntentId} already processed, skipping`);
            return NextResponse.json({ received: true, skipped: true });
          }
        }
      } else {
        // Not a payment event - skip duplicate check
        webhookLog("info", `Event ${event.type} is not a payment event, skipping duplicate check`);
      }
    }

    // Environment-aware logging
    webhookLog("info", `Received webhook event: ${event.type} [${event.id}]`, {
      environment: process.env.NODE_ENV,
      klaviyoMode: process.env.KLAVIYO_MODE,
    });

    // Debug: Log subscription-related events
    if (
      event.type.includes("subscription") ||
      event.type.includes("invoice") ||
      event.type.includes("payment_intent")
    ) {
      const eventObject = event.data.object as { id?: string; status?: string };
      webhookLog("info", `Subscription-related event: ${event.type}`, {
        eventId: event.id,
        objectId: eventObject?.id,
        status: eventObject?.status,
      });
    }

    // Handle the event
    // Track which events should mark payment as processed
    let shouldMarkAsProcessed = false;

    switch (event.type) {
      case "payment_intent.succeeded":
        const paymentProcessed = await handlePaymentSuccess(event.data.object);
        shouldMarkAsProcessed = paymentProcessed !== false; // Only if actually processed
        break;
      case "payment_intent.payment_failed":
        await handlePaymentFailure(event.data.object);
        break;
      case "charge.succeeded":
        // Skip charge.succeeded to prevent duplicate processing
        break;
      case "charge.updated":
        // Skip charge.updated to prevent duplicate processing
        break;
      case "customer.subscription.created":
        await handleSubscriptionCreated(event.data.object);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;
      case "subscription_schedule.created":
        webhookLog("info", `Subscription schedule created: ${event.data.object.id}`);
        break;
      case "subscription_schedule.updated":
        await handleSubscriptionScheduleUpdated(event.data.object);
        break;
      case "subscription_schedule.completed":
        await handleSubscriptionScheduleCompleted(event.data.object);
        break;
      case "subscription_schedule.released":
        await handleSubscriptionScheduleReleased(event.data.object);
        break;
      case "invoice.payment_succeeded":
        // ✅ CORRECT: Use invoice.payment_succeeded as the canonical event for subscription payments
        // This is Stripe's recommended approach for production systems
        try {
          await handleInvoicePaymentSucceeded(event.data.object);
          shouldMarkAsProcessed = true; // Only mark if successfully processed
        } catch (error) {
          webhookLog("error", `Error in handleInvoicePaymentSucceeded: ${error}`);
        }
        break;

      case "invoice.finalized":
        // Handle invoice finalized - this happens when invoice is ready for payment
        webhookLog("info", `Invoice finalized: ${event.data.object.id} - waiting for payment confirmation`);
        // ✅ CRITICAL: Don't mark as processed - this is not a payment event!
        break;
      case "invoice.paid":
        // Skip invoice.paid - it's a secondary event that can cause duplicates
        // invoice.payment_succeeded is the canonical event for subscription processing
        webhookLog("info", `Skipping invoice.paid - using invoice.payment_succeeded as canonical event`);
        // ✅ CRITICAL: Don't mark as processed - we're skipping this event!
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object);
        break;
      default:
        webhookLog("warn", `Unhandled event type: ${event.type}`);
      // ✅ CRITICAL: Don't mark unhandled events as processed!
    }

    // ✅ CRITICAL: Mark the Stripe event as processed to prevent duplicate webhook processing
    await markEventProcessed(`stripe_event_${stripeEventId}`);

    // ✅ WEBHOOK-FIRST: Mark this payment as processed ONLY if we actually processed it
    if (paymentIntentId && shouldMarkAsProcessed) {
      await markEventProcessed(paymentIntentId);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    webhookLog("error", `Error processing webhook: ${error}`);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
