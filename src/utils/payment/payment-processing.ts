import PaymentEvent, { IPaymentEvent } from "@/models/PaymentEvent";
import User, { IUser } from "@/models/User";
import MajorDraw, { IMajorDraw } from "@/models/MajorDraw";
import MiniDraw, { IMiniDraw } from "@/models/MiniDraw";
import connectDB from "@/lib/mongodb";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { klaviyo } from "@/lib/klaviyo";
import { trackAffiliateSignup } from "@/lib/affiliate";
import {
  createSubscriptionStartedEvent,
  createOneTimePackagePurchasedEvent,
  createMiniDrawPurchasedEvent,
  createUpsellAcceptedEvent,
  createMajorDrawEntryAddedEvent,
} from "@/utils/integrations/klaviyo/klaviyo-events";
import { trackPlacedOrder } from "@/utils/integrations/klaviyo/klaviyo-revenue-service";
import { trackInvoice, shouldDelayInvoice } from "@/utils/integrations/klaviyo/klaviyo-invoice-service";
import {
  addToPartnerDiscountQueue,
  handleSubscriptionQueueUpdate,
} from "@/utils/partner-discounts/partner-discount-queue";
import { getPackageById } from "@/data/membershipPackages";
import { getMiniDrawPackageById } from "@/data/miniDrawPackages";
import { dispatchPackagePurchase } from "@/utils/tracking/purchase-events";
import { trackPixelPurchase } from "@/utils/tracking/pixel-purchase-tracking";

// Global processing lock to prevent concurrent processing of same payment
const processingLocks = new Map<string, Promise<{ success: boolean; alreadyProcessed: boolean; error?: string }>>();

// Type definitions for better type safety
type PaymentMetadata = {
  created?: number;
  type?: string;
  packageType?: string;
  miniDrawId?: string;
  affiliateCode?: string;
  promoLinkCode?: string;
};
interface UserDocument {
  _id: { toString: () => string };
  email: string;
  stripeSubscriptionId?: string;
  accumulatedEntries?: number;
  rewardsPoints?: number;
  oneTimePackages?: Array<{
    packageId: string;
    purchaseDate: Date;
    startDate: Date;
    endDate: Date;
    isActive: boolean;
    entriesGranted: number;
  }>;
  miniDrawPackages?: Array<{
    packageId: string;
    packageName: string;
    purchaseDate: Date;
    startDate: Date;
    endDate: Date;
    isActive: boolean;
    entriesGranted: number;
    price: number;
    partnerDiscountHours: number;
    partnerDiscountDays: number;
    stripePaymentIntentId: string;
  }>;
  partnerDiscountQueue?: Array<{
    _id?: mongoose.Types.ObjectId;
    packageId: string;
    packageName: string;
    packageType: "membership" | "one-time" | "mini-draw" | "upsell";
    discountDays: number;
    discountHours: number;
    purchaseDate: Date;
    startDate?: Date;
    endDate?: Date;
    status: "active" | "queued" | "expired" | "cancelled";
    queuePosition: number;
    expiryDate: Date;
    stripePaymentIntentId?: string;
  }>;
  subscription?: {
    packageId: string;
    startDate: Date;
    endDate?: Date;
    isActive: boolean;
    autoRenew?: boolean;
    status?: string;
    lastMonthAccumulatedEntries?: number;
  };
  upsellPurchases?: Array<{
    offerId: string;
    offerTitle: string;
    entriesAdded: number;
    amountPaid: number;
    purchaseDate: Date;
  }>;

  markModified: (path: string) => void;
  save: () => Promise<unknown>;
}

/**
 * Process payment benefits with event-based idempotency
 * This replaces the complex atomic lock system with simple event tracking
 */
export async function processPaymentBenefits(
  paymentIntentId: string,
  userId: string,
  packageData: {
    packageType: "one-time" | "membership" | "upsell" | "mini-draw";
    packageId?: string;
    packageName?: string;
    entries: number;
    points: number;
    price: number;
  },
  processedBy: "api" | "webhook",
  paymentMetadata?: PaymentMetadata,
  requestContext?: {
    // Optional request context for improved Facebook CAPI match quality (backward compatible)
    client_ip_address?: string;
    client_user_agent?: string;
    fbc?: string;
    fbp?: string;
  },
  billingReason?: string // ✅ Stripe billing_reason (e.g., "subscription_create", "subscription_cycle") for accurate renewal tracking
): Promise<{ success: boolean; alreadyProcessed: boolean; error?: string }> {
  // ✅ CRITICAL: Validate input parameters
  // console.log(`🔍 processPaymentBenefits called with:`, {
  //   paymentIntentId,
  //   userId,
  //   packageData,
  //   processedBy,
  //   hasRequestContext: !!requestContext,
  // });

  if (!paymentIntentId || !userId || !packageData || !processedBy) {
    // console.error(`❌ processPaymentBenefits: Missing required parameters:`, {
    //   paymentIntentId: !!paymentIntentId,
    //   userId: !!userId,
    //   packageData: !!packageData,
    //   processedBy: !!processedBy,
    // });
    return {
      success: false,
      alreadyProcessed: false,
      error: "Missing required parameters",
    };
  }

  // ✅ REMOVED: Early duplicate detection to avoid race conditions with parallel webhooks
  // The atomic PaymentEvent creation below handles duplicates properly

  // ✅ CRITICAL: Global lock to prevent concurrent processing of same payment
  const lockKey = `${paymentIntentId}-${userId}`;

  if (processingLocks.has(lockKey)) {
    // console.log(`🔒 Payment ${paymentIntentId} already being processed, waiting...`);
    const existingPromise = processingLocks.get(lockKey);
    if (existingPromise) {
      return await existingPromise;
    }
  }

  const processingPromise = processPaymentBenefitsInternal(
    paymentIntentId,
    userId,
    packageData,
    processedBy,
    paymentMetadata,
    requestContext,
    billingReason
  );
  processingLocks.set(lockKey, processingPromise);

  try {
    const result = await processingPromise;
    return result;
  } finally {
    processingLocks.delete(lockKey);
  }
}

async function processPaymentBenefitsInternal(
  paymentIntentId: string,
  userId: string,
  packageData: {
    packageType: "one-time" | "membership" | "upsell" | "mini-draw";
    packageId?: string;
    packageName?: string;
    entries: number;
    points: number;
    price: number;
  },
  processedBy: "api" | "webhook",
  paymentMetadata?: PaymentMetadata,
  requestContext?: {
    client_ip_address?: string;
    client_user_agent?: string;
    fbc?: string;
    fbp?: string;
  },
  billingReason?: string // ✅ Stripe billing_reason for accurate renewal tracking
): Promise<{ success: boolean; alreadyProcessed: boolean; error?: string }> {
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      // Ensure database connection
      await connectDB();
      // console.log(`🔗 Database connected for payment processing: ${paymentIntentId} (attempt ${retryCount + 1})`);

      const eventId = `BenefitsGranted-${paymentIntentId}`;

      // Get user first (required for atomic operation)
      let user = await User.findById(userId);
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      const metadataAffiliateCode = paymentMetadata?.affiliateCode?.trim().toUpperCase();
      if (
        metadataAffiliateCode &&
        (!user.affiliateReferral || !user.affiliateReferral.affiliateId || !user.affiliateReferral.affiliateCode)
      ) {
        try {
          await trackAffiliateSignup({
            affiliateCode: metadataAffiliateCode,
            userId: user._id.toString(),
            userEmail: user.email,
          });
          const refreshedUser = await User.findById(userId);
          if (refreshedUser) {
            user = refreshedUser;
          }
        } catch (_affiliateError) {
          console.error("Affiliate tracking fallback failed:", _affiliateError);
        }
      }

      // console.log(`🎯 Processing benefits for payment ${paymentIntentId} via ${processedBy}`);

      // ✅ CRITICAL: Atomic check-and-create for PaymentEvent to prevent race conditions
      // This ensures that only one process can create the PaymentEvent, preventing duplicate processing
      // const webhookTimestamp = Date.now();
      // console.log(`🔒 [WEBHOOK ${webhookTimestamp}] Attempting atomic PaymentEvent creation for: ${eventId}`);

      // ✅ CRITICAL FIX: Use .create() with try/catch to leverage database constraints
      // The unique compound index on (paymentIntentId + eventType) prevents duplicate processing
      // This is more reliable than pre-checking, as it's atomic at the database level
      let paymentEventCreated = false;
      try {
        // console.log(`🔒 [WEBHOOK ${webhookTimestamp}] Attempting to create PaymentEvent with:`, {
        //   eventId,
        //   paymentIntentId,
        //   eventType: "BenefitsGranted",
        //   userId: user._id.toString(),
        // });

        const paymentEventData = {
          entries: packageData.entries,
          points: packageData.points,
          price: packageData.price,
          ...(billingReason && { billingReason }), // ✅ Store billing_reason for accurate renewal detection in activity log
        };

        await PaymentEvent.create({
          _id: eventId,
          paymentIntentId,
          eventType: "BenefitsGranted",
          userId: user._id,
          packageType: packageData.packageType,
          packageId: packageData.packageId ? String(packageData.packageId) : undefined,
          packageName: packageData.packageName,
          data: paymentEventData,
          processedBy,
          timestamp: new Date(),
        });
        paymentEventCreated = true;

        // ✅ DEBUG: Log PaymentEvent creation with billingReason for membership payments
        if (packageData.packageType === "membership") {
          console.log("💾 PaymentEvent created with billingReason:", {
            eventId,
            paymentIntentId,
            billingReason: billingReason || "NOT STORED",
            hasBillingReason: !!billingReason,
            dataKeys: Object.keys(paymentEventData),
            fullData: paymentEventData,
          });
        }
        // console.log(
        //   `✅ [WEBHOOK ${webhookTimestamp}] [${
        //     Date.now() - webhookTimestamp
        //   }ms] PaymentEvent created successfully: ${eventId}`
        // );
        // console.log(`✅ PaymentEvent details:`, {
        //   _id: eventId,
        //   paymentIntentId,
        //   eventType: "BenefitsGranted",
        //   packageType: packageData.packageType,
        //   packageId: packageData.packageId,
        // });
      } catch (error: unknown) {
        const mongoError = error as { code?: number; message?: string; name?: string };
        // MongoDB duplicate key error codes: 11000 or E11000
        // This can happen for either:
        // 1. Same event ID (stripe sends exact same webhook twice)
        // 2. Same paymentIntentId+eventType (stripe sends different events for same payment)
        if (
          mongoError.code === 11000 ||
          mongoError.message?.includes("E11000") ||
          mongoError.message?.includes("duplicate key")
        ) {
          // Check which constraint was violated
          // const isDuplicatePayment = mongoError.message?.includes("paymentIntentId");
          // const reason = isDuplicatePayment
          //   ? `PaymentIntent ${paymentIntentId} already processed`
          //   : `Event ${eventId} already exists`;

          // console.log(
          //   `🛑 [WEBHOOK ${webhookTimestamp}] [${
          //     Date.now() - webhookTimestamp
          //   }ms] ${reason} - DUPLICATE WEBHOOK DETECTED - SKIPPING`
          // );
          return { success: true, alreadyProcessed: true };
        }
        // If it's a different error, log and rethrow
        // console.error(`❌ [WEBHOOK ${webhookTimestamp}] Error creating PaymentEvent:`, mongoError);
        throw error;
      }

      if (!paymentEventCreated) {
        // console.log(`⚠️ [WEBHOOK ${webhookTimestamp}] PaymentEvent not created but no error - this should not happen`);
        return { success: false, alreadyProcessed: false, error: "PaymentEvent creation failed silently" };
      }

      // console.log(`✅ PaymentEvent created successfully: ${eventId}`);
      // console.log(`🎯 Continuing to grant benefits for payment: ${paymentIntentId}`);

      // ✅ CRITICAL: Check user's processedPayments but only if PaymentEvent exists
      // If payment is in processedPayments but no PaymentEvent exists, it means previous processing failed
      if (user.processedPayments && user.processedPayments.includes(paymentIntentId)) {
        // console.log(
        //   `⚠️ Payment ${paymentIntentId} in user's processedPayments but no PaymentEvent found - previous processing failed, retrying`
        // );
        // Remove from processedPayments array to allow retry
        user.processedPayments = user.processedPayments.filter((id) => id !== paymentIntentId);
        await user.save();
      }

      // ✅ CRITICAL: Additional check for invoice payments with different ID formats
      // Check if any processed payment contains the same invoice ID (handles timestamp variations)
      if (paymentIntentId.startsWith("invoice_")) {
        const invoiceId = paymentIntentId.replace("invoice_", "");
        const duplicateInvoicePayment = user.processedPayments?.find((processedPayment) => {
          if (!processedPayment) return false;
          // Direct match
          if (processedPayment === paymentIntentId) return true;
          // Match with invoice_ prefix
          if (processedPayment === `invoice_${invoiceId}`) return true;
          // Match if processedPayment is invoice_ prefixed and contains the invoice ID
          if (processedPayment.startsWith("invoice_") && processedPayment.includes(invoiceId)) return true;
          return false;
        });

        if (duplicateInvoicePayment) {
          // console.log(
          //   `⚠️ Found duplicate invoice payment: ${duplicateInvoicePayment} for invoice ${invoiceId}, skipping processing`
          // );
          return { success: true, alreadyProcessed: true };
        }
      }

      // ✅ CRITICAL: Grant benefits after PaymentEvent is created atomically
      // Use passed paymentMetadata or create default with current time
      const finalPaymentMetadata = paymentMetadata || {
        created: Math.floor(Date.now() / 1000), // Current time in Unix seconds
        type: packageData.packageType,
        packageType: packageData.packageType,
      };
      await grantBenefits(user as UserDocument, packageData, finalPaymentMetadata, paymentIntentId, requestContext);

      // ✅ CRITICAL: Persist processed payment idempotently using canonical invoice id and $addToSet
      // Store the payment ID as-is to match webhook expectations
      // For invoice payments, keep the invoice_ prefix for consistency
      await User.updateOne({ _id: userId }, { $addToSet: { processedPayments: paymentIntentId } });
      // console.log(`✅ Added to processedPayments: ${paymentIntentId}`);

      // console.log(`✅ Benefits granted and recorded for payment ${paymentIntentId} via ${processedBy}`);

      // ✅ Check if invoice should be delayed (for upsells)
      // If upsells exist, invoice will be finalized after upsell decision
      const shouldSkipInvoice = packageData.packageId
        ? shouldDelayInvoice(packageData.packageType, packageData.packageId)
        : false;

      // Track purchase event in Klaviyo (non-blocking)
      trackKlaviyoEvent(user as UserDocument, packageData, paymentIntentId, shouldSkipInvoice);

      // ✅ CRITICAL: Update Klaviyo profile with latest user data after benefits are granted
      try {
        const { ensureUserProfileSynced } = await import("@/utils/integrations/klaviyo/klaviyo-profile-sync");
        // console.log(`📊 Updating Klaviyo profile after ${packageData.packageType} benefits granted`);

        // ✅ CRITICAL: Wait a bit to ensure MongoDB has committed all changes (especially for atomic operations)
        await new Promise((resolve) => setTimeout(resolve, 500)); // 500ms buffer for database consistency

        // ✅ CRITICAL: Refetch user to ensure we have the latest data after grantBenefits()
        // Use lean(false) to get Mongoose document with all methods, or just findById for full document
        const freshUser = await User.findById(userId);
        if (freshUser) {
          // Verify we have the latest data by checking if arrays are populated
          const upsellCount = freshUser.upsellPurchases?.length || 0;
          // const oneTimeCount = freshUser.oneTimePackages?.length || 0;
          // const miniDrawCount = freshUser.miniDrawPackages?.length || 0;

          // console.log(
          //   `📊 Fresh user data - accumulatedEntries: ${freshUser.accumulatedEntries}, rewardsPoints: ${freshUser.rewardsPoints}, upsellPurchases: ${upsellCount}, oneTimePackages: ${oneTimeCount}, miniDrawPackages: ${miniDrawCount}`
          // );

          // If we just processed an upsell but don't see it, wait a bit more and retry
          if (packageData.packageType === "upsell" && upsellCount === 0) {
            // console.warn(`⚠️ Upsell purchase not yet visible in user data, waiting and retrying...`);
            // Retry up to 3 times with increasing delays
            let retryAttempts = 0;
            let finalUser = freshUser;
            while (retryAttempts < 3 && (finalUser.upsellPurchases?.length || 0) === 0) {
              await new Promise((resolve) => setTimeout(resolve, 1000 * (retryAttempts + 1))); // 1s, 2s, 3s
              const retryUser = await User.findById(userId);
              if (retryUser) {
                finalUser = retryUser;
                // console.log(
                //   `📊 Retry attempt ${retryAttempts + 1} - upsellPurchases: ${retryUser.upsellPurchases?.length || 0}`
                // );
              }
              retryAttempts++;
            }
            ensureUserProfileSynced(finalUser as never);
          } else {
            ensureUserProfileSynced(freshUser as never);
          }
        } else {
          // console.error(`❌ Could not refetch user ${userId} for profile sync`);
        }
      } catch (_klaviyoError) {
        console.error("Klaviyo profile sync error (non-critical):", _klaviyoError);
      }

      return { success: true, alreadyProcessed: false };
    } catch (error) {
      // console.error(`❌ Error processing payment ${paymentIntentId} (attempt ${retryCount + 1}):`, error);
      // console.error(`❌ Error details:`, {
      //   error: error instanceof Error ? error.message : "Unknown error",
      //   stack: error instanceof Error ? error.stack : undefined,
      //   paymentIntentId,
      //   userId,
      //   packageData,
      //   processedBy,
      //   attempt: retryCount + 1,
      // });

      // Log to file for debugging
      try {
        const logPath = path.join(process.cwd(), "webhook-debug.log");
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ❌ processPaymentBenefits failed for ${paymentIntentId} (attempt ${
          retryCount + 1
        }): ${error instanceof Error ? error.message : "Unknown error"}\n`;
        fs.appendFileSync(logPath, logMessage);
      } catch (_logError) {
        console.error("Failed to write to log file:", _logError);
      }

      // No transaction to abort since we're using atomic operations

      // Check if this is a write conflict that we can retry
      const isWriteConflict =
        error instanceof Error &&
        (error.message.includes("Write conflict") ||
          error.message.includes("yielding is disabled") ||
          error.message.includes("Please retry your operation"));

      if (isWriteConflict && retryCount < maxRetries - 1) {
        retryCount++;
        // console.log(
        //   `🔄 Write conflict detected, retrying payment processing (attempt ${retryCount + 1}/${maxRetries})`
        // );
        // Wait a bit before retrying (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retryCount) * 100));
        continue; // Retry the while loop
      }

      // If not a write conflict or max retries reached, return failure
      return {
        success: false,
        alreadyProcessed: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // If we get here, all retries failed
  return {
    success: false,
    alreadyProcessed: false,
    error: `Payment processing failed after ${maxRetries} attempts`,
  };
}

/**
 * Grant benefits to user (entries, points, major draw entries, package tracking)
 *
 * @param user - User document
 * @param packageData - Package information
 * @param paymentMetadata - Optional payment metadata with created timestamp
 * @param paymentIntentId - Payment intent ID for tracking in queue
 */
/**
 * Check for active bonus entry promo and return bonus entries to grant
 *
 * This function checks if there's an active bonus entry promo for the given package type
 * at the time of purchase. It uses the payment timestamp to determine if the purchase
 * was made during the promo period.
 *
 * @param packageType - Type of package purchased (membership, one-time, mini-draw, upsell)
 * @param paymentMetadata - Payment metadata containing created timestamp
 * @param user - User document (for logging purposes)
 * @returns Number of bonus entries to grant (0 if no active promo)
 */
async function checkAndApplyBonusEntryPromo(
  packageType: "one-time" | "membership" | "upsell" | "mini-draw",
  paymentMetadata?: {
    created?: number;
    type?: string;
    packageType?: string;
    miniDrawId?: string;
    promoLinkCode?: string;
  },
  user?: UserDocument
): Promise<number> {
  try {
    // Map package types to promo types
    const promoType =
      packageType === "membership"
        ? "membership-packages"
        : packageType === "one-time"
        ? "one-time-packages"
        : packageType === "mini-draw"
        ? "mini-packages"
        : null; // Upsells don't have bonus entry promos (they follow the package they're attached to)

    if (!promoType) {
      // Upsells don't have bonus entry promos - this is expected, no logging needed
      return 0;
    }

    // Get purchase date from payment metadata
    // The created timestamp is in Unix milliseconds (from Stripe)
    if (!paymentMetadata?.created) {
      console.warn(
        `⚠️ No payment timestamp available for bonus entry promo check - userId: ${
          user?._id?.toString() || "unknown"
        }, packageType: ${packageType}`
      );
      return 0;
    }

    const purchaseDate = new Date(paymentMetadata.created);

    // Import BonusEntryPromo model dynamically to avoid circular dependencies
    const BonusEntryPromo = (await import("@/models/BonusEntryPromo")).default;

    // Find active promo for this type at the purchase date
    const activePromo = await BonusEntryPromo.findOne({
      type: promoType,
      isActive: true,
      startDate: { $lte: purchaseDate },
      endDate: { $gte: purchaseDate },
    }).sort({ createdAt: -1 }); // Get most recent if multiple match

    if (!activePromo) {
      // No active promo found - this is normal, no logging needed
      return 0;
    }

    // Log successful promo match with details
    console.log(`🎁 Bonus entry promo matched:`, {
      promoId: activePromo._id?.toString(),
      promoType: activePromo.type,
      bonusEntries: activePromo.bonusEntries,
      purchaseDate: purchaseDate.toISOString(),
      promoStartDate: activePromo.startDate.toISOString(),
      promoEndDate: activePromo.endDate.toISOString(),
      userId: user?._id?.toString(),
      userEmail: user?.email,
      packageType: packageType,
    });

    // Return bonus entries amount
    return activePromo.bonusEntries;
  } catch (error) {
    // Log error but don't throw - bonus entries are non-critical
    console.error("❌ Error checking bonus entry promo:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      packageType,
      userId: user?._id?.toString(),
      userEmail: user?.email,
      paymentMetadata,
    });
    return 0;
  }
}

/**
 * Check for promo link code and return bonus entries to grant
 *
 * This function checks if there's a valid promo link code in the payment metadata
 * and verifies that it applies to the purchase type. Promo links are one-time use per user.
 *
 * @param user - User document making the purchase
 * @param packageType - Type of package purchased (membership, one-time, mini-draw, upsell)
 * @param paymentMetadata - Payment metadata containing promoLinkCode
 * @returns Number of bonus entries to grant (0 if no valid promo link or type mismatch)
 */
async function checkAndApplyPromoLink(
  user: UserDocument,
  packageType: "one-time" | "membership" | "upsell" | "mini-draw",
  paymentMetadata?: PaymentMetadata
): Promise<number> {
  try {
    // Get promo link code from payment metadata
    if (!paymentMetadata?.promoLinkCode) {
      // No promo link code - this is normal, no logging needed
      return 0;
    }

    // Normalize the code - handle empty strings and whitespace
    const rawCode = paymentMetadata.promoLinkCode;
    if (!rawCode || typeof rawCode !== "string" || !rawCode.trim()) {
      return 0;
    }

    const code = rawCode.trim().toUpperCase();

    // Import PromoLink model dynamically to avoid circular dependencies
    const PromoLink = (await import("@/models/PromoLink")).default;

    // Find active promo link by code
    const promoLink = await PromoLink.findActiveByCode(code);

    if (!promoLink) {
      console.log(`ℹ️ [PROMO LINK] Code not found or inactive: ${code}`, {
        userId: user._id?.toString(),
        userEmail: user.email,
        packageType,
      });
      return 0;
    }

    // Check if expired
    if (promoLink.isExpired()) {
      console.log(`ℹ️ [PROMO LINK] Code expired: ${code}`, {
        userId: user._id?.toString(),
        userEmail: user.email,
        packageType,
        expiresAt: promoLink.expiresAt,
      });
      return 0;
    }

    // Check if promo link applies to this package type
    const isMembershipPurchase = packageType === "membership";
    const isOneTimePurchase = packageType === "one-time";

    // Promo links don't apply to mini-draw or upsell packages
    if (packageType === "mini-draw" || packageType === "upsell") {
      console.log(`ℹ️ [PROMO LINK] Code does not apply to ${packageType} packages: ${code}`, {
        userId: user._id?.toString(),
        userEmail: user.email,
        packageType,
        promoLinkCode: code,
        appliesToMembership: promoLink.appliesToMembership,
        appliesToOneTime: promoLink.appliesToOneTime,
      });
      return 0;
    }

    // Check package type match
    if (isMembershipPurchase && !promoLink.appliesToMembership) {
      console.log(`ℹ️ [PROMO LINK] Code does not apply to membership packages: ${code}`, {
        userId: user._id?.toString(),
        userEmail: user.email,
        packageType,
        promoLinkCode: code,
        appliesToMembership: promoLink.appliesToMembership,
        appliesToOneTime: promoLink.appliesToOneTime,
      });
      return 0;
    }

    if (isOneTimePurchase && !promoLink.appliesToOneTime) {
      console.log(`ℹ️ [PROMO LINK] Code does not apply to one-time packages: ${code}`, {
        userId: user._id?.toString(),
        userEmail: user.email,
        packageType,
        promoLinkCode: code,
        appliesToMembership: promoLink.appliesToMembership,
        appliesToOneTime: promoLink.appliesToOneTime,
      });
      return 0;
    }

    // Check if user has already used this code (one-time use enforcement)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (user._id as any).toString();
    if (promoLink.isUsedByUser(userId)) {
      console.log(`ℹ️ [PROMO LINK] User already used this code: ${code}`, {
        userId: userId,
        userEmail: user.email,
        packageType,
        promoLinkCode: code,
      });
      return 0;
    }

    // ✅ CRITICAL: Mark as used IMMEDIATELY to prevent race conditions
    // Use atomic operation to mark as used and increment count in one operation
    // This prevents two concurrent payments from both getting bonus entries
    try {
      const updatedPromoLink = await PromoLink.findOneAndUpdate(
        { _id: promoLink._id, usedBy: { $ne: userId } }, // Only update if user not already in usedBy
        {
          $addToSet: { usedBy: userId }, // Add user ID to usedBy array (idempotent)
          $inc: { usageCount: 1 }, // Increment usage count
        },
        { new: true } // Return updated document
      );

      if (!updatedPromoLink) {
        // Another process already marked this user as used (race condition detected)
        console.log(`ℹ️ [PROMO LINK] Code already used by this user (race condition detected): ${code}`, {
          userId: userId,
          userEmail: user.email,
          packageType,
          promoLinkCode: code,
        });
        return 0;
      }

      // Log successful promo link match and usage marking
      console.log(`🎁 [PROMO LINK] Valid promo link matched, marked as used, and applies to purchase:`, {
        promoLinkId: updatedPromoLink._id?.toString(),
        code: updatedPromoLink.code,
        bonusEntries: updatedPromoLink.bonusEntries,
        packageType,
        appliesToMembership: updatedPromoLink.appliesToMembership,
        appliesToOneTime: updatedPromoLink.appliesToOneTime,
        userId: user._id?.toString(),
        userEmail: user.email,
        newUsageCount: updatedPromoLink.usageCount,
      });

      // Return the bonus entries amount - will be granted in grantBenefits
      return updatedPromoLink.bonusEntries;
    } catch (markUsedError) {
      // If marking as used fails, log but still grant entries (non-critical)
      console.error(`❌ [PROMO LINK] Failed to mark promo link as used (non-critical):`, {
        error: markUsedError instanceof Error ? markUsedError.message : String(markUsedError),
        promoLinkId: promoLink._id?.toString(),
        code: promoLink.code,
        userId: userId,
        userEmail: user.email,
      });
      // Still return bonus entries - marking as used is non-critical
      return promoLink.bonusEntries;
    }
  } catch (error) {
    // Log error but don't throw - promo links are non-critical
    console.error("❌ [PROMO LINK] Error checking promo link:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      userId: user._id?.toString(),
      userEmail: user.email,
      packageType,
      paymentMetadata,
    });
    return 0;
  }
}

/**
 * TEMPORARY: Auto-verify email on purchase during SMTP to SendGrid migration
 * This should be removed once email verification is working properly
 * 
 * Automatically marks a user's email as verified when they complete a purchase.
 * This is a temporary workaround to ensure users can access their accounts while
 * email verification emails may not be delivered reliably during the migration.
 * 
 * @param user - The user document to potentially verify (must have isEmailVerified property)
 */
export function autoVerifyEmailOnPurchase(user: IUser | (UserDocument & { isEmailVerified?: boolean })): void {
  const isEnabled = process.env.TEMPORARY_AUTO_VERIFY_EMAIL_ON_PURCHASE === "true";
  if (isEnabled && !user.isEmailVerified) {
    (user as IUser).isEmailVerified = true;
    // Optional: Log for monitoring
    console.log(`[TEMPORARY] Auto-verified email for user ${user.email} via purchase`);
  }
}

async function grantBenefits(
  user: UserDocument,
  packageData: {
    packageType: "one-time" | "membership" | "upsell" | "mini-draw";
    packageId?: string;
    packageName?: string;
    entries: number;
    points: number;
    price: number;
  },
  paymentMetadata?: PaymentMetadata,
  paymentIntentId?: string,
  requestContext?: {
    // Optional request context for improved Facebook CAPI match quality (backward compatible)
    client_ip_address?: string;
    client_user_agent?: string;
    fbc?: string;
    fbp?: string;
  }
): Promise<void> {
  // ✅ DEBUG: Log function call with all parameters
  // console.log(`🎯 grantBenefits called with:`, {
  //   userId: user._id.toString(),
  //   userEmail: user.email,
  //   packageData,
  //   paymentMetadata,
  //   paymentIntentId,
  // });

  // ✅ CRITICAL FIX: Use atomic operations for concurrent payment safety
  // Update accumulated entries and rewards points atomically to prevent race conditions
  await User.findByIdAndUpdate(
    user._id,
    {
      $inc: {
        accumulatedEntries: packageData.entries,
        rewardsPoints: packageData.points,
      },
    },
    { new: false }
  );

  // Update local user object for subsequent operations
  user.accumulatedEntries = (user.accumulatedEntries || 0) + packageData.entries;
  user.rewardsPoints = (user.rewardsPoints || 0) + packageData.points;

  // console.log(`🎫 Added ${packageData.entries} entries (total: ${user.accumulatedEntries})`);
  // console.log(`⭐ Added ${packageData.points} points (total: ${user.rewardsPoints})`);

  // Handle package-specific tracking
  if (packageData.packageType === "one-time") {
    await handleOneTimePackage(user, packageData, paymentIntentId);
  } else if (packageData.packageType === "membership") {
    await handleSubscriptionPackage(user, packageData);
  } else if (packageData.packageType === "upsell") {
    await handleUpsellPackage(user, packageData, paymentIntentId);
  } else if (packageData.packageType === "mini-draw") {
    // console.log(`🎲 Processing mini-draw package: ${packageData.packageName}`);
    // Extract miniDrawId from paymentMetadata for package tracking
    const miniDrawId = paymentMetadata?.miniDrawId;
    await handleMiniDrawPackage(user, { ...packageData, miniDrawId }, paymentIntentId);
    // console.log(`🎲 Mini-draw package processed successfully`);
  }

  // ✅ WEBHOOK-ONLY: Route entries to appropriate draw based on package type
  // This function (grantBenefits) is ONLY called from processPaymentBenefits
  // which is ONLY called from webhook handlers - ensuring webhook is single source of truth
  if (packageData.packageType === "mini-draw") {
    // Add to specific MiniDraw instead of MajorDraw
    // addToMiniDraw is the ONLY function that grants entries to MiniDraw model
    await addToMiniDraw(user, packageData, paymentMetadata);
  } else if (packageData.packageType === "upsell" && paymentMetadata?.miniDrawId) {
    // Upsell for mini-draw: route to mini-draw instead of major draw
    // console.log(`🎲 Routing upsell entries to mini-draw: ${paymentMetadata.miniDrawId}`);
    // addToMiniDraw is the ONLY function that grants entries to MiniDraw model
    await addToMiniDraw(user, packageData, paymentMetadata);
  } else {
    // Add to major draw entries with payment metadata for freeze period handling
    await addToMajorDraw(user, packageData, paymentMetadata);
  }

  // ✅ BONUS ENTRY PROMO: Check for active bonus entry promos and grant bonus entries
  // This happens after regular entries are granted
  // Bonus entry promos are date-based and can apply simultaneously with promo links
  try {
    const bonusEntries = await checkAndApplyBonusEntryPromo(packageData.packageType, paymentMetadata, user);

    if (bonusEntries > 0) {
      console.log(`🎁 [BONUS ENTRY PROMO] Processing bonus entries from date-based promo:`, {
        userId: user._id?.toString(),
        userEmail: user.email,
        packageType: packageData.packageType,
        packageId: packageData.packageId,
        bonusEntries,
        paymentTimestamp: paymentMetadata?.created ? new Date(paymentMetadata.created).toISOString() : "unknown",
      });

      // Add bonus entries to user's accumulated entries
      const updateResult = await User.findByIdAndUpdate(
        user._id,
        {
          $inc: {
            accumulatedEntries: bonusEntries,
          },
        },
        { new: false }
      );

      if (!updateResult) {
        console.error(`❌ Failed to update accumulatedEntries for user ${user._id?.toString()}`);
      }

      // Update local user object
      const previousAccumulated = user.accumulatedEntries || 0;
      user.accumulatedEntries = previousAccumulated + bonusEntries;

      // Route bonus entries to appropriate draw (same as regular entries)
      const bonusPackageData = {
        entries: bonusEntries,
        packageType: packageData.packageType,
        packageId: packageData.packageId,
        packageName: `Bonus Entry Promo (${bonusEntries} entries)`,
      };

      // Determine target draw for logging
      let targetDraw: "mini-draw" | "major-draw";
      if (packageData.packageType === "mini-draw") {
        targetDraw = "mini-draw";
        await addToMiniDraw(user, bonusPackageData, paymentMetadata, "bonus-entry-promo");
      } else if (packageData.packageType === "upsell" && paymentMetadata?.miniDrawId) {
        targetDraw = "mini-draw";
        await addToMiniDraw(user, bonusPackageData, paymentMetadata, "bonus-entry-promo");
      } else {
        targetDraw = "major-draw";
        await addToMajorDraw(user, bonusPackageData, paymentMetadata, "bonus-entry-promo");
      }

      console.log(`✅ [BONUS ENTRY PROMO] Successfully granted bonus entries:`, {
        userId: user._id?.toString(),
        userEmail: user.email,
        packageType: packageData.packageType,
        packageId: packageData.packageId,
        bonusEntriesGranted: bonusEntries,
        targetDraw: targetDraw,
        previousAccumulatedEntries: previousAccumulated,
        newAccumulatedEntries: user.accumulatedEntries,
        paymentTimestamp: paymentMetadata?.created ? new Date(paymentMetadata.created).toISOString() : "unknown",
      });
    } else {
      // Log when no bonus entries (helpful for debugging why promos aren't applying)
      console.log(`ℹ️ [BONUS ENTRY PROMO] No active promo for ${packageData.packageType} purchase:`, {
        userId: user._id?.toString(),
        userEmail: user.email,
        packageType: packageData.packageType,
        purchaseDate: paymentMetadata?.created ? new Date(paymentMetadata.created).toISOString() : "unknown",
      });
    }
  } catch (bonusError) {
    // Non-blocking - log but don't fail payment processing
    console.error("❌ [BONUS ENTRY PROMO] Processing error (non-blocking):", {
      error: bonusError instanceof Error ? bonusError.message : String(bonusError),
      stack: bonusError instanceof Error ? bonusError.stack : undefined,
      userId: user._id?.toString(),
      userEmail: user.email,
      packageType: packageData.packageType,
      paymentMetadata,
    });
  }

  // ✅ PROMO LINK: Check for promo link codes and grant bonus entries
  // This happens after regular bonus entry promos
  // Promo links are checked separately and can apply simultaneously with bonus entry promos
  try {
    const promoLinkEntries = await checkAndApplyPromoLink(user, packageData.packageType, paymentMetadata);

    if (promoLinkEntries > 0) {
      console.log(`🎁 [PROMO LINK] Processing ${promoLinkEntries} bonus entries from promo link:`, {
        userId: user._id?.toString(),
        userEmail: user.email,
        packageType: packageData.packageType,
        packageId: packageData.packageId,
        promoLinkCode: paymentMetadata?.promoLinkCode,
        bonusEntries: promoLinkEntries,
      });

      // Note: Promo link is already marked as used in checkAndApplyPromoLink to prevent race conditions
      // No need to mark again here

      // Add promo link entries to user's accumulated entries
      const updateResult = await User.findByIdAndUpdate(
        user._id,
        {
          $inc: {
            accumulatedEntries: promoLinkEntries,
          },
        },
        { new: false }
      );

      if (!updateResult) {
        console.error(`❌ [PROMO LINK] Failed to update accumulatedEntries for user ${user._id?.toString()}`);
      }

      // Update local user object
      const previousAccumulated = user.accumulatedEntries || 0;
      user.accumulatedEntries = previousAccumulated + promoLinkEntries;

      // Route promo link entries to appropriate draw (same as regular entries)
      const promoLinkPackageData = {
        entries: promoLinkEntries,
        packageType: packageData.packageType,
        packageId: packageData.packageId,
        packageName: `Promo Link Bonus (${promoLinkEntries} entries)`,
      };

      // Determine target draw for logging
      let targetDraw: "mini-draw" | "major-draw";
      if (packageData.packageType === "mini-draw") {
        targetDraw = "mini-draw";
        await addToMiniDraw(user, promoLinkPackageData, paymentMetadata, "promo-link");
      } else if (packageData.packageType === "upsell" && paymentMetadata?.miniDrawId) {
        targetDraw = "mini-draw";
        await addToMiniDraw(user, promoLinkPackageData, paymentMetadata, "promo-link");
      } else {
        targetDraw = "major-draw";
        await addToMajorDraw(user, promoLinkPackageData, paymentMetadata, "promo-link");
      }

      console.log(`✅ [PROMO LINK] Successfully granted bonus entries from promo link:`, {
        userId: user._id?.toString(),
        userEmail: user.email,
        promoLinkCode: paymentMetadata?.promoLinkCode || null,
        bonusEntriesGranted: promoLinkEntries,
        packageType: packageData.packageType,
        packageId: packageData.packageId,
        targetDraw: targetDraw,
        previousAccumulatedEntries: previousAccumulated,
        newAccumulatedEntries: user.accumulatedEntries,
        paymentTimestamp: paymentMetadata?.created ? new Date(paymentMetadata.created).toISOString() : "unknown",
      });
    }
  } catch (promoLinkError) {
    // Non-blocking - log but don't fail payment processing
    console.error("❌ [PROMO LINK] Promo link processing error (non-blocking):", {
      error: promoLinkError instanceof Error ? promoLinkError.message : String(promoLinkError),
      stack: promoLinkError instanceof Error ? promoLinkError.stack : undefined,
      userId: user._id?.toString(),
      userEmail: user.email,
      packageType: packageData.packageType,
      paymentMetadata,
    });
  }

  // Summary log: Total bonus entries from all sources
  const totalRegularEntries = packageData.entries;
  const totalBonusEntries = (user.accumulatedEntries || 0) - (packageData.entries || 0);
  console.log(`📊 [BENEFITS SUMMARY] Total entries granted:`, {
    userId: user._id?.toString(),
    userEmail: user.email,
    packageType: packageData.packageType,
    packageId: packageData.packageId,
    regularEntries: totalRegularEntries,
    totalBonusEntries: totalBonusEntries,
    totalAccumulatedEntries: user.accumulatedEntries || 0,
    hasPromoLink: !!paymentMetadata?.promoLinkCode,
    promoLinkCode: paymentMetadata?.promoLinkCode || null,
    paymentTimestamp: paymentMetadata?.created ? new Date(paymentMetadata.created).toISOString() : "unknown",
  });

  // ✅ NEW: Track pixel events for all purchase types
  try {
    await trackPixelPurchase({
      value: packageData.price,
      currency: "AUD",
      orderId: paymentIntentId || `order-${Date.now()}`,
      packageType: packageData.packageType,
      packageId: packageData.packageId,
      packageName: packageData.packageName,
      userId: user._id.toString(),
      userEmail: user.email,
      entriesAdded: packageData.entries,
      pointsEarned: packageData.points,
      paymentIntentId: paymentIntentId,
      content_type:
        packageData.packageType === "membership"
          ? "subscription"
          : packageData.packageType === "one-time"
          ? "membership_package"
          : packageData.packageType === "mini-draw"
          ? "mini_draw_package"
          : packageData.packageType === "upsell"
          ? "upsell_package"
          : "product",
      content_ids: packageData.packageId ? [packageData.packageId] : [],
      num_items: 1,
      requestContext: requestContext, // Pass request context for improved match quality
    });
    // console.log(`📊 Pixel tracking completed for ${packageData.packageType} purchase`);
  } catch (_pixelError) {
    console.error("❌ Pixel tracking failed (non-blocking):", _pixelError);
    // Don't throw - pixel tracking should not break purchase flow
  }

  // ✅ CRITICAL: Process affiliate commissions (non-blocking, only on successful payments)
  // This function is ONLY called from webhook handlers, ensuring payment success
  if (paymentIntentId) {
    try {
      // Import commission processing functions dynamically to avoid circular dependencies
      const { processOneTimePackageCommission, processUpsellCommission, processMembershipFirstCommission } =
        await import("@/utils/affiliate/commission-processing");

      if (packageData.packageType === "one-time") {
        await processOneTimePackageCommission({
          userId: user._id.toString(),
          packageId: packageData.packageId || "",
          packageName: packageData.packageName || "",
          purchaseAmount: Math.round(packageData.price * 100), // Convert to cents
          paymentIntentId: paymentIntentId,
        });
      } else if (packageData.packageType === "upsell") {
        await processUpsellCommission({
          userId: user._id.toString(),
          offerId: packageData.packageId || "",
          offerName: packageData.packageName || "",
          purchaseAmount: Math.round(packageData.price * 100), // Convert to cents
          paymentIntentId: paymentIntentId,
        });
      } else if (packageData.packageType === "membership") {
        // Get subscription ID from user
        const subscriptionId = user.stripeSubscriptionId || "";
        await processMembershipFirstCommission({
          userId: user._id.toString(),
          packageId: packageData.packageId || "",
          packageName: packageData.packageName || "",
          purchaseAmount: Math.round(packageData.price * 100), // Convert to cents
          paymentIntentId: paymentIntentId,
          subscriptionId,
        });
      }
    } catch (_commissionError) {
      // Non-blocking - log but don't fail payment processing
      console.error("❌ Affiliate commission processing error (non-blocking):", _commissionError);
    }
  }

  // TEMPORARY: Auto-verify email on purchase (SMTP to SendGrid migration workaround)
  // This should be removed once email verification is working properly
  try {
    autoVerifyEmailOnPurchase(user);
  } catch (error) {
    // Non-blocking - don't fail purchase flow if email verification check fails
    console.error("❌ Error in auto-verify email on purchase (non-blocking):", error);
  }

  // Save user
  await user.save();
  // console.log(`💾 User ${user.email} saved with new benefits`);
}

/**
 * Track Klaviyo event based on package type (non-blocking)
 */
function trackKlaviyoEvent(
  user: UserDocument,
  packageData: {
    packageType: "one-time" | "membership" | "upsell" | "mini-draw";
    packageId?: string;
    packageName?: string;
    entries: number;
    points: number;
    price: number;
  },
  paymentIntentId: string,
  skipInvoice: boolean = false
): void {
  try {
    // console.log(`📊 trackKlaviyoEvent called for user: ${user.email}`);
    // console.log(`📊 Package data:`, packageData);
    // console.log(`📊 Skip invoice: ${skipInvoice}`);

    const commonData = {
      packageId: packageData.packageId || "unknown",
      packageName: packageData.packageName || "Unknown Package",
      price: packageData.price,
      entriesGranted: packageData.entries,
      paymentIntentId,
    };

    // Track event based on package type
    switch (packageData.packageType) {
      case "membership":
        klaviyo.trackEventBackground(
          createSubscriptionStartedEvent(user as never, {
            ...commonData,
            tier: packageData.packageId?.toLowerCase().includes("boss")
              ? "Boss"
              : packageData.packageId?.toLowerCase().includes("legend")
              ? "Legend"
              : "Mate",
          })
        );
        break;

      case "one-time":
        klaviyo.trackEventBackground(
          createOneTimePackagePurchasedEvent(user as never, {
            ...commonData,
            pointsEarned: packageData.points,
          })
        );
        break;

      case "mini-draw":
        klaviyo.trackEventBackground(
          createMiniDrawPurchasedEvent(user as never, {
            ...commonData,
            partnerDiscountHours: 0,
            partnerDiscountDays: 0,
          })
        );
        break;

      case "upsell":
        klaviyo.trackEventBackground(
          createUpsellAcceptedEvent(user as never, {
            offerId: commonData.packageId,
            offerTitle: commonData.packageName,
            amountPaid: commonData.price,
            entriesAdded: commonData.entriesGranted,
            triggerEvent: "post-purchase",
            paymentIntentId: commonData.paymentIntentId,
          })
        );
        break;
    }

    // ✅ Track "Placed Order" event for Klaviyo revenue metrics (standard event)
    // This works alongside custom events above - both fire together for dual tracking
    // Custom events: For business logic and workflows
    // Placed Order: For revenue metrics and analytics
    trackPlacedOrder(user as never, {
      packageType: packageData.packageType,
      packageId: commonData.packageId,
      packageName: commonData.packageName,
      value: packageData.price,
      currency: "AUD",
      paymentIntentId,
      entriesGranted: packageData.entries,
      pointsEarned: packageData.points,
    }).catch((error) => {
      // Log error but don't fail payment processing
      console.error(`❌ Failed to track "Placed Order" event:`, error);
    });

    // ✅ Track invoice (handled by invoice service)
    // Skip if flagged - will be finalized after upsell decision via /api/invoice/finalize
    if (!skipInvoice) {
      trackInvoice(
        user as never,
        {
          packageType: packageData.packageType,
          packageId: commonData.packageId,
          packageName: commonData.packageName,
          price: packageData.price,
          entries: packageData.entries,
          points: packageData.points,
        },
        paymentIntentId
      ).catch((error) => {
        // Log error but don't fail payment processing
        console.error(`❌ Failed to track invoice event:`, error);
      });
    }

    // console.log(`📊 Klaviyo event tracked for ${packageData.packageType} package`);
  } catch (_error) {
    console.error("Klaviyo event tracking failed:", _error);
  }
}

/**
 * Handle one-time package tracking and partner discount queue
 */
async function handleOneTimePackage(
  user: UserDocument,
  packageData: { packageId?: string; packageName?: string; entries: number; price?: number },
  paymentIntentId?: string
): Promise<void> {
  if (!packageData.packageId) return;

  const oneTimePackage = {
    packageId: packageData.packageId, // Already a string, no conversion needed
    purchaseDate: new Date(),
    startDate: new Date(),
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    isActive: true,
    entriesGranted: packageData.entries,
  };

  // ✅ CRITICAL FIX: Use atomic $push to prevent race condition duplicates
  // This ensures only one package entry is added even if webhooks arrive simultaneously
  await User.findByIdAndUpdate(
    user._id,
    {
      $push: { oneTimePackages: oneTimePackage },
    },
    { new: false }
  );

  // ✅ IMPORTANT: Don't push to local user object - we're using atomic operations
  // The package is already added to the database via $push above
  // If we push locally and then call user.save(), it will create a duplicate!
  // console.log(`📦 Added one-time package atomically: ${packageData.packageName}`);

  // Add to partner discount queue if package includes partner discount days
  const packageInfo = getPackageById(packageData.packageId);
  if (packageInfo && packageInfo.partnerDiscountDays && packageInfo.partnerDiscountDays > 0) {
    // console.log(`🎁 Adding one-time package to partner discount queue: ${packageInfo.partnerDiscountDays} days access`);

    // ✅ CRITICAL FIX: Ensure partnerDiscountQueue is initialized for existing users
    // This field might not exist for users created before this feature was added
    if (!user.partnerDiscountQueue) {
      // console.log(`🔧 Initializing partnerDiscountQueue for user (field didn't exist)`);
      user.partnerDiscountQueue = [];
      // Mark field as modified to ensure Mongoose saves it
      user.markModified("partnerDiscountQueue");
    }

    await addToPartnerDiscountQueue(user as unknown as IUser, {
      packageId: packageData.packageId,
      packageName: packageData.packageName || packageInfo.name,
      packageType: "one-time",
      discountDays: packageInfo.partnerDiscountDays,
      discountHours: packageInfo.partnerDiscountDays * 24,
      stripePaymentIntentId: paymentIntentId,
    });

    // ✅ CRITICAL FIX: Mark as modified after queue update to ensure Mongoose saves it
    user.markModified("partnerDiscountQueue");
    // console.log(`✅ Partner discount queue updated and marked for save (${user.partnerDiscountQueue?.length} items)`);

    // Dispatch purchase event for optimistic updates
    dispatchPackagePurchase(packageData.packageId, "one-time");
  }
}

/**
 * Handle subscription package tracking and partner discount queue
 *
 * Note: This function does NOT modify lastMonthAccumulatedEntries.
 * That field is only updated in the webhook handler after successful payment processing.
 * This ensures the accumulated entries tracking is preserved correctly.
 */
async function handleSubscriptionPackage(
  user: UserDocument,
  packageData: { packageId?: string; packageName?: string }
): Promise<void> {
  if (!packageData.packageId) return;

  if (user.subscription) {
    const wasActive = user.subscription.isActive;
    const wasStatus = user.subscription.status;

    // ✅ CRITICAL: If benefits are being granted, subscription must be active
    // This overrides any incorrect Stripe status that might still show "incomplete"
    user.subscription.isActive = true;
    user.subscription.status = "active";

    // ✅ PRESERVE: lastMonthAccumulatedEntries is preserved here and only updated in webhook handler

    // 🚨 CRITICAL FIX: Don't update packageId if there's a pending downgrade
    // This prevents scheduled downgrades from being processed immediately
    const userSub = user.subscription as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const hasPendingDowngrade =
      userSub.pendingChange &&
      userSub.pendingChange.changeType === "downgrade" &&
      userSub.pendingChange.effectiveDate &&
      new Date() < new Date(userSub.pendingChange.effectiveDate);

    if (hasPendingDowngrade) {
      // console.log(
      //   `🚨 SCHEDULED DOWNGRADE PROTECTION: Not updating packageId from ${user.subscription.packageId} to ${packageData.packageId} - downgrade scheduled for ${userSub.pendingChange.effectiveDate}`
      // );
    } else {
      user.subscription.packageId = packageData.packageId; // Use string directly
      // console.log(`📦 Package ID updated to: ${packageData.packageId}`);
    }

    // Log status changes for debugging
    if (!wasActive || wasStatus !== "active") {
      // console.log(`📊 Subscription activated during benefit processing: ${packageData.packageName}`);
      // console.log(`📊 Status changed: ${wasStatus} → active, isActive: ${wasActive} → true`);
    }
  } else {
    user.subscription = {
      packageId: packageData.packageId, // Use string directly
      startDate: new Date(),
      isActive: true,
      autoRenew: true,
      status: "active",
    };
    // console.log(`📊 New subscription created during benefit processing: ${packageData.packageName}`);
  }

  // console.log(`🔄 Updated subscription: ${packageData.packageName} (isActive: true, status: active)`);

  // Add subscription to partner discount queue (subscriptions always have 30 days recurring access)
  const packageInfo = getPackageById(packageData.packageId);
  if (packageInfo && user.subscription.endDate) {
    // console.log(`🎁 Adding subscription to partner discount queue: 30 days recurring access`);
    await handleSubscriptionQueueUpdate(user as unknown as IUser, "start", {
      packageId: packageData.packageId,
      packageName: packageData.packageName || packageInfo.name,
      endDate: user.subscription.endDate,
    });

    // Dispatch purchase event for optimistic updates
    dispatchPackagePurchase(packageData.packageId, "membership");
  }
}

/**
 * Handle upsell package tracking and partner discount queue
 */
async function handleUpsellPackage(
  user: UserDocument,
  packageData: { packageId?: string; packageName?: string; entries: number; price: number },
  paymentIntentId?: string
): Promise<void> {
  if (!packageData.packageId) return;

  const upsellPurchase = {
    offerId: packageData.packageId,
    offerTitle: packageData.packageName || `Upsell ${packageData.packageId}`,
    entriesAdded: packageData.entries,
    amountPaid: packageData.price,
    purchaseDate: new Date(),
  };

  // ✅ CRITICAL FIX: Use atomic $push to prevent race condition duplicates
  await User.findByIdAndUpdate(
    user._id,
    {
      $push: { upsellPurchases: upsellPurchase },
    },
    { new: false }
  );

  // ✅ IMPORTANT: Don't push to local user object - we're using atomic operations
  // console.log(`🛒 Added upsell purchase atomically: ${packageData.packageName}`);

  // Note: Upsells typically don't include partner discount access in current implementation
  // If they do in the future, add logic here similar to one-time packages
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _paymentIntentId = paymentIntentId; // Reserved for future use when upsells include partner access
}

/**
 * Handle mini draw package tracking and partner discount queue
 */
async function handleMiniDrawPackage(
  user: UserDocument,
  packageData: { packageId?: string; packageName?: string; entries: number; price: number; miniDrawId?: string },
  paymentIntentId?: string
): Promise<void> {
  // console.log(`🎲 handleMiniDrawPackage called with:`, { packageData, userId: user._id.toString() });
  if (!packageData.packageId) {
    // console.log(`🎲 No packageId provided, skipping mini-draw package tracking`);
    return;
  }

  // Get mini draw package info from static data
  const miniDrawInfo = getMiniDrawPackageById(packageData.packageId);

  // Convert miniDrawId string to ObjectId if provided
  let miniDrawIdObjectId: mongoose.Types.ObjectId | undefined;
  if (packageData.miniDrawId) {
    try {
      miniDrawIdObjectId = new mongoose.Types.ObjectId(packageData.miniDrawId);
    } catch (_error) {
      console.error(`❌ Invalid miniDrawId format: ${packageData.miniDrawId}`, _error);
    }
  }

  const miniDrawPackage = {
    packageId: packageData.packageId,
    packageName: packageData.packageName || miniDrawInfo?.name || `Mini Draw Package ${packageData.packageId}`,
    miniDrawId: miniDrawIdObjectId, // Store MiniDraw reference
    purchaseDate: new Date(),
    startDate: new Date(),
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    isActive: true,
    entriesGranted: packageData.entries,
    price: packageData.price,
    partnerDiscountHours: miniDrawInfo?.partnerDiscountHours || 0,
    partnerDiscountDays: miniDrawInfo?.partnerDiscountDays || 0,
    stripePaymentIntentId: paymentIntentId || "unknown",
  };

  // ✅ CRITICAL FIX: Use atomic $push to prevent race condition duplicates
  await User.findByIdAndUpdate(
    user._id,
    {
      $push: { miniDrawPackages: miniDrawPackage },
    },
    { new: false }
  );

  // ✅ IMPORTANT: Don't push to local user object - we're using atomic operations
  // console.log(`🎲 Added mini draw package atomically:`, miniDrawPackage);

  // Add to partner discount queue if package includes partner discount hours/days
  if (miniDrawInfo && (miniDrawInfo.partnerDiscountHours > 0 || miniDrawInfo.partnerDiscountDays > 0)) {
    // console.log(
    //   `🎁 Adding mini-draw package to partner discount queue: ${miniDrawInfo.partnerDiscountHours} hours (${miniDrawInfo.partnerDiscountDays} days) access`
    // );

    // ✅ CRITICAL FIX: Ensure partnerDiscountQueue is initialized for existing users
    if (!user.partnerDiscountQueue) {
      // console.log(`🔧 Initializing partnerDiscountQueue for user (field didn't exist)`);
      user.partnerDiscountQueue = [];
      user.markModified("partnerDiscountQueue");
    }

    await addToPartnerDiscountQueue(user as unknown as IUser, {
      packageId: packageData.packageId,
      packageName: packageData.packageName || miniDrawInfo.name,
      packageType: "mini-draw",
      discountDays: miniDrawInfo.partnerDiscountDays,
      discountHours: miniDrawInfo.partnerDiscountHours,
      stripePaymentIntentId: paymentIntentId,
    });

    // ✅ CRITICAL FIX: Mark as modified after queue update to ensure Mongoose saves it
    user.markModified("partnerDiscountQueue");
    // console.log(
    //   `✅ Partner discount queue updated and marked for save (${user.partnerDiscountQueue?.length || 0} items)`
    // );

    // Dispatch purchase event for optimistic updates
    dispatchPackagePurchase(packageData.packageId, "mini-draw");
  }
}

/**
 * Add entries to major draw with freeze period and payment timing support
 *
 * @param user - User document
 * @param packageData - Package information
 * @param paymentMetadata - Optional payment metadata with created timestamp
 */
async function addToMajorDraw(
  user: UserDocument,
  packageData: { entries: number; packageType: string; packageId?: string; packageName?: string },
  paymentMetadata?: PaymentMetadata,
  sourceTypeOverride?: string // Optional override for source type (e.g., "bonus-entry-promo")
): Promise<void> {
  try {
    // ✅ DEBUG: Log function call with all parameters
    // console.log(`🎯 addToMajorDraw called with:`, {
    //   userId: user._id.toString(),
    //   userEmail: user.email,
    //   packageData,
    //   paymentMetadata,
    // });

    // Import helper function dynamically to avoid circular dependencies
    const { getTargetMajorDraw } = await import("../draws/major-draw-helpers");

    // Get target major draw (handles freeze period, gap period, etc.)
    const majorDrawResult = await getTargetMajorDraw(paymentMetadata);

    if (!majorDrawResult) {
      // console.error(`❌ No valid major draw found - skipping major draw entry allocation`);
      // console.error(`❌ addToMajorDraw context:`, {
      //   userId: user._id.toString(),
      //   packageData,
      //   paymentMetadata,
      // });
      return;
    }

    // Type the major draw properly
    const majorDraw: IMajorDraw = majorDrawResult as IMajorDraw;

    // Log which draw entries are being added to
    // console.log(`🎯 Adding entries to major draw: ${majorDraw.name} (status: ${majorDraw.status})`);
    // if (majorDraw.status === "queued") {
    //   console.log(`⏰ Entries deferred to queued draw (activation: ${majorDraw.activationDate})`);
    // }

    // ✅ OPTION 1: Determine source type for major draw entries (single source of truth)
    // Use override if provided (for bonus entries), otherwise determine from package type
    let sourceType: "membership" | "one-time-package" | "upsell" | "mini-draw" | "bonus-entry-promo";
    if (sourceTypeOverride) {
      sourceType = sourceTypeOverride as typeof sourceType;
    } else {
      switch (packageData.packageType) {
        case "subscription":
          sourceType = "membership";
          break;
        case "one-time":
          sourceType = "one-time-package";
          break;
        case "upsell":
          sourceType = "upsell";
          break;
        case "mini-draw":
          sourceType = "mini-draw";
          break;
        default:
          sourceType = "membership"; // Default fallback
      }
    }

    // console.log(`🎯 Processing major draw entries for package (source: ${sourceType})`);

    // Add to major draw collection only if package has entries
    if (packageData.entries > 0) {
      const now = new Date();

      // ✅ CRITICAL FIX: Always create separate entries for each payment
      // This allows multiple membership entries within the same month (e.g., upgrades)
      // Each payment gets its own entry in the major draw

      // Create new user entry atomically
      const entriesBySource: {
        membership?: number;
        "one-time-package"?: number;
        upsell?: number;
        "mini-draw"?: number;
        "bonus-entry-promo"?: number;
      } = {
        membership: 0,
        "one-time-package": 0,
        upsell: 0,
        "mini-draw": 0,
        "bonus-entry-promo": 0,
      };
      entriesBySource[sourceType] = packageData.entries;

      const newEntry = {
        userId: user._id as mongoose.Types.ObjectId,
        totalEntries: packageData.entries,
        entriesBySource,
        firstAddedDate: now,
        lastUpdatedDate: now,
      };

      // ✅ FIXED: Find existing user entry and update it, or create new one if doesn't exist
      const existingUserEntry = majorDraw.entries.find(
        (entry: { userId: { toString(): string } }) => entry.userId.toString() === user._id.toString()
      );

      if (existingUserEntry) {
        // ✅ Update existing user entry - accumulate entries
        // const currentTotal = existingUserEntry.totalEntries;
        // const currentSourceEntries = existingUserEntry.entriesBySource[sourceType] || 0;

        // console.log(`🎯 UPDATING existing user entry: ${currentTotal} → ${currentTotal + packageData.entries} total`);
        // console.log(
        //   `🎯 UPDATING ${sourceType} entries: ${currentSourceEntries} → ${currentSourceEntries + packageData.entries}`
        // );

        await MajorDraw.updateOne(
          {
            _id: majorDraw._id,
            "entries.userId": user._id,
          },
          {
            $inc: {
              "entries.$.totalEntries": packageData.entries,
              [`entries.$.entriesBySource.${sourceType}`]: packageData.entries,
            },
            $set: {
              "entries.$.lastUpdatedDate": now,
            },
          }
        );
        // console.log(`🎯 Updated existing entry for user ${user._id} (+${packageData.entries} ${sourceType})`);
      } else {
        // ✅ Create new user entry if doesn't exist
        // console.log(`🎯 CREATING new user entry: ${packageData.entries} ${sourceType}`);

        await MajorDraw.updateOne({ _id: majorDraw._id }, { $push: { entries: newEntry } });
        // console.log(`🎯 Created new entry for user ${user._id} (+${packageData.entries} ${sourceType})`);
      }

      // Get updated major draw for total calculation
      const updatedMajorDraw = await MajorDraw.findById(majorDraw._id);
      const totalEntries =
        updatedMajorDraw?.entries.reduce(
          (sum: number, entry: { totalEntries: number }) => sum + entry.totalEntries,
          0
        ) || 0;

      // ✅ CRITICAL: Update totalEntries field since updateOne() bypasses pre-save middleware
      if (updatedMajorDraw && totalEntries !== updatedMajorDraw.totalEntries) {
        await MajorDraw.updateOne({ _id: majorDraw._id }, { $set: { totalEntries } });
      }

      // console.log(`🎯 Major draw entries updated for user ${user._id} (draw total: ${totalEntries})`);

      // ✅ OPTION 1: Single source of truth - no need to update user.majorDrawEntries
      // All queries now use majordraws.entries directly

      // Track major draw entry in Klaviyo (non-blocking)
      klaviyo.trackEventBackground(
        createMajorDrawEntryAddedEvent(user as never, {
          majorDrawId: String(majorDraw._id),
          majorDrawName: majorDraw.name,
          entryCount: packageData.entries,
          source: sourceType,
          packageId: packageData.packageId || "unknown",
          packageName: packageData.packageName || "Unknown Package",
          totalEntriesInDraw: totalEntries,
        })
      );
    } else {
      // console.log(`🎯 No entries to add to major draw (package has 0 entries)`);
    }
  } catch (error) {
    // console.error(`❌ ERROR in addToMajorDraw:`, error);
    // Log the error details for debugging
    if (error instanceof Error) {
      // console.error(`❌ Error message: ${error.message}`);
      // console.error(`❌ Error stack: ${error.stack}`);
    }

    // Log context for debugging
    // console.error(`❌ Error context:`, {
    //   userId: user._id,
    //   userEmail: user.email,
    //   packageType: packageData.packageType,
    //   packageId: packageData.packageId,
    //   entries: packageData.entries,
    //   paymentMetadata,
    // });

    // Don't throw - allow payment processing to continue
    // User still gets accumulated entries, points, and subscription benefits
    // This prevents payment processing from failing completely
  }
}

/**
 * ✅ WEBHOOK-ONLY ENTRY GRANTING FUNCTION
 *
 * This is the ONLY function that grants entries to MiniDraw model.
 * It is ONLY called from grantBenefits, which is ONLY called from processPaymentBenefits,
 * which is ONLY called from webhook handlers.
 *
 * DO NOT call this function directly from purchase APIs or any other code path.
 * All entry granting must go through the webhook flow for idempotency and reliability.
 *
 * @param user - User document
 * @param packageData - Package information
 * @param paymentMetadata - Optional payment metadata with created timestamp and miniDrawId
 */
async function addToMiniDraw(
  user: UserDocument,
  packageData: { entries: number; packageType: string; packageId?: string; packageName?: string },
  paymentMetadata?: PaymentMetadata,
  sourceTypeOverride?: string // Optional override for source type (e.g., "bonus-entry-promo")
): Promise<void> {
  try {
    // ✅ DEBUG: Log function call with all parameters
    // console.log(`🎲 addToMiniDraw called with:`, {
    //   userId: user._id.toString(),
    //   userEmail: user.email,
    //   packageData,
    //   paymentMetadata,
    // });

    // Extract miniDrawId from paymentMetadata
    const miniDrawId = paymentMetadata?.miniDrawId;
    if (!miniDrawId) {
      // console.error(`❌ No miniDrawId provided in paymentMetadata - skipping mini draw entry allocation`);
      // console.error(`❌ addToMiniDraw context:`, {
      //   userId: user._id.toString(),
      //   packageData,
      //   paymentMetadata,
      // });
      return;
    }

    // Import helper function dynamically to avoid circular dependencies
    const { getTargetMiniDraw } = await import("../draws/mini-draw-helpers");

    // Get target mini draw (validates existence, status, freeze period, etc.)
    let miniDraw: IMiniDraw;
    try {
      miniDraw = await getTargetMiniDraw(miniDrawId, paymentMetadata);
    } catch (_error) {
      console.error(`❌ Failed to get target mini draw:`, _error);
      // Don't throw - allow payment processing to continue
      // User still gets accumulated entries, points, and package benefits
      return;
    }

    // Log which draw entries are being added to
    // console.log(`🎲 Adding entries to mini draw: ${miniDraw.name} (status: ${miniDraw.status})`);

    // console.log(`🎲 Processing mini draw entries for package (source: mini-draw-package)`);

    // Add to mini draw collection only if package has entries
    if (packageData.entries > 0) {
      const now = new Date();

      const remainingEntries = Math.max(miniDraw.minimumEntries - miniDraw.totalEntries, 0);
      if (remainingEntries <= 0) {
        // console.warn(`⚠️ Mini draw ${miniDraw.name} already full. Skipping entry allocation.`);
        return;
      }

      if (packageData.entries > remainingEntries) {
        // console.warn(
        //   `⚠️ Mini draw ${miniDraw.name} only has ${remainingEntries} entries remaining. Skipping allocation of ${packageData.entries} entries.`
        // );
        return;
      }

      // Create new user entry atomically
      // Use override source type if provided (for bonus entries), otherwise use "mini-draw-package"
      const sourceType: "mini-draw-package" | "free-entry" | "bonus-entry-promo" =
        (sourceTypeOverride as "mini-draw-package" | "free-entry" | "bonus-entry-promo") || "mini-draw-package";
      const entriesBySource: {
        "mini-draw-package"?: number;
        "free-entry"?: number;
        "bonus-entry-promo"?: number;
      } = {
        "mini-draw-package": 0,
        "free-entry": 0,
        "bonus-entry-promo": 0,
      };
      entriesBySource[sourceType] = packageData.entries;

      const newEntry = {
        userId: user._id as mongoose.Types.ObjectId,
        totalEntries: packageData.entries,
        entriesBySource,
        firstAddedDate: now,
        lastUpdatedDate: now,
      };

      // ✅ FIXED: Find existing user entry and update it, or create new one if doesn't exist
      const existingUserEntry = miniDraw.entries.find(
        (entry: { userId: { toString(): string } }) => entry.userId.toString() === user._id.toString()
      );

      if (existingUserEntry) {
        // ✅ Update existing user entry - accumulate entries
        // const currentTotal = existingUserEntry.totalEntries;
        // const currentSourceEntries = existingUserEntry.entriesBySource["mini-draw-package"] || 0;

        // console.log(`🎲 UPDATING existing user entry: ${currentTotal} → ${currentTotal + packageData.entries} total`);
        // console.log(
        //   `🎲 UPDATING mini-draw-package entries: ${currentSourceEntries} → ${
        //     currentSourceEntries + packageData.entries
        //   }`
        // );

        await MiniDraw.updateOne(
          {
            _id: miniDraw._id,
            "entries.userId": user._id,
          },
          {
            $inc: {
              "entries.$.totalEntries": packageData.entries,
              [`entries.$.entriesBySource.${sourceType}`]: packageData.entries,
            },
            $set: {
              "entries.$.lastUpdatedDate": now,
            },
          }
        );
        // console.log(`🎲 Updated existing entry for user ${user._id} (+${packageData.entries} mini-draw-package)`);
      } else {
        // ✅ Create new user entry if doesn't exist
        // console.log(`🎲 CREATING new user entry: ${packageData.entries} mini-draw-package`);

        await MiniDraw.updateOne({ _id: miniDraw._id }, { $push: { entries: newEntry } });
        // console.log(`🎲 Created new entry for user ${user._id} (+${packageData.entries} mini-draw-package)`);
      }

      // Get updated mini draw for total calculation
      const updatedMiniDraw = await MiniDraw.findById(miniDraw._id);
      const totalEntries =
        updatedMiniDraw?.entries.reduce(
          (sum: number, entry: { totalEntries: number }) => sum + entry.totalEntries,
          0
        ) || 0;

      // ✅ CRITICAL: Update totalEntries field since updateOne() bypasses pre-save middleware
      if (updatedMiniDraw && totalEntries !== updatedMiniDraw.totalEntries) {
        await MiniDraw.updateOne({ _id: miniDraw._id }, { $set: { totalEntries } });
      }

      // console.log(`🎲 Mini draw entries updated for user ${user._id} (draw total: ${totalEntries})`);

      // ✅ Check if minimum entries has been reached and auto-close draw
      if (updatedMiniDraw && totalEntries >= updatedMiniDraw.minimumEntries) {
        // console.log(
        //   `🎲 Minimum entries reached (${totalEntries} >= ${updatedMiniDraw.minimumEntries}). Auto-closing mini draw...`
        // );
        await MiniDraw.updateOne(
          { _id: miniDraw._id },
          {
            $set: {
              status: "completed",
              isActive: false,
              configurationLocked: true,
              lockedAt: new Date(),
            },
          }
        );
        // console.log(`✅ Mini draw "${miniDraw.name}" automatically closed due to reaching minimum entries`);
      }

      // ✅ Update User.miniDrawParticipation array
      const userDoc = await User.findById(user._id);
      if (userDoc) {
        const miniDrawIdString = (miniDraw._id as mongoose.Types.ObjectId).toString();
        const existingParticipation = userDoc.miniDrawParticipation?.find(
          (p) => p.miniDrawId.toString() === miniDrawIdString
        );

        if (existingParticipation) {
          // Update existing participation
          await User.updateOne(
            {
              _id: user._id,
              "miniDrawParticipation.miniDrawId": miniDraw._id as mongoose.Types.ObjectId,
            },
            {
              $inc: {
                "miniDrawParticipation.$.totalEntries": packageData.entries,
                "miniDrawParticipation.$.entriesBySource.mini-draw-package": packageData.entries,
              },
              $set: {
                "miniDrawParticipation.$.lastParticipatedDate": now,
                "miniDrawParticipation.$.isActive": true, // Ensure it's marked as active
              },
            }
          );
          // console.log(`🎲 Updated user mini draw participation for ${miniDraw.name}`);
        } else {
          // Create new participation entry
          const newParticipation = {
            miniDrawId: miniDraw._id as mongoose.Types.ObjectId,
            totalEntries: packageData.entries,
            entriesBySource: {
              "mini-draw-package": packageData.entries,
              "free-entry": 0,
            },
            firstParticipatedDate: now,
            lastParticipatedDate: now,
            isActive: true,
          };

          await User.updateOne(
            { _id: user._id },
            {
              $push: { miniDrawParticipation: newParticipation },
            }
          );
          // console.log(`🎲 Created new user mini draw participation for ${miniDraw.name}`);
        }
      }

      // Track mini draw entry in Klaviyo (non-blocking)
      // Note: MiniDraw entry tracking can be added to klaviyoEvents.ts if needed
      // For now, using the existing createMiniDrawPurchasedEvent which is already tracked in handleMiniDrawPackage
    } else {
      // console.log(`🎲 No entries to add to mini draw (package has 0 entries)`);
    }
  } catch (error) {
    // console.error(`❌ ERROR in addToMiniDraw:`, error);
    // Log the error details for debugging
    if (error instanceof Error) {
      // console.error(`❌ Error message: ${error.message}`);
      // console.error(`❌ Error stack: ${error.stack}`);
    }

    // Log context for debugging
    // console.error(`❌ Error context:`, {
    //   userId: user._id,
    //   userEmail: user.email,
    //   packageType: packageData.packageType,
    //   packageId: packageData.packageId,
    //   entries: packageData.entries,
    //   paymentMetadata,
    // });

    // Don't throw - allow payment processing to continue
    // User still gets accumulated entries, points, and package benefits
    // This prevents payment processing from failing completely
  }
}

/**
 * Check if payment has already been processed
 */
export async function isPaymentProcessed(paymentIntentId: string): Promise<boolean> {
  try {
    // Ensure database connection
    await connectDB();

    const eventId = `BenefitsGranted-${paymentIntentId}`;
    // console.log(`🔍 Checking if payment already processed: ${eventId}`);

    const existingEvent = await PaymentEvent.findById(eventId);
    const isProcessed = !!existingEvent;

    // console.log(`🔍 Payment ${paymentIntentId} already processed: ${isProcessed}`);
    return isProcessed;
  } catch (_error) {
    console.error(`❌ Error checking if payment processed:`, _error);
    return false; // If we can't check, assume not processed
  }
}

/**
 * Get payment processing history for a user
 */
export async function getPaymentHistory(userId: string, limit: number = 50): Promise<IPaymentEvent[]> {
  return await PaymentEvent.find({ userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .populate("userId", "email firstName lastName");
}
