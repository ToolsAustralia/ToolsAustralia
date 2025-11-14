import PaymentEvent, { IPaymentEvent } from "@/models/PaymentEvent";
import User, { IUser } from "@/models/User";
import MajorDraw, { IMajorDraw } from "@/models/MajorDraw";
import MiniDraw, { IMiniDraw } from "@/models/MiniDraw";
import connectDB from "@/lib/mongodb";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { klaviyo } from "@/lib/klaviyo";
import {
  createSubscriptionStartedEvent,
  createOneTimePackagePurchasedEvent,
  createMiniDrawPurchasedEvent,
  createUpsellAcceptedEvent,
  createMajorDrawEntryAddedEvent,
  createInvoiceGeneratedEvent,
} from "@/utils/integrations/klaviyo/klaviyo-events";
import {
  addToPartnerDiscountQueue,
  handleSubscriptionQueueUpdate,
} from "@/utils/partner-discounts/partner-discount-queue";
import { getPackageById } from "@/data/membershipPackages";
import { getMiniDrawPackageById } from "@/data/miniDrawPackages";
import { dispatchPackagePurchase } from "@/utils/tracking/purchase-events";
import { getUpsellPackagesForPurchase } from "@/data/upsellPackages";
import { trackPixelPurchase } from "@/utils/tracking/pixel-purchase-tracking";

// Global processing lock to prevent concurrent processing of same payment
const processingLocks = new Map<string, Promise<{ success: boolean; alreadyProcessed: boolean; error?: string }>>();

// Type definitions for better type safety
interface UserDocument {
  _id: { toString: () => string };
  email: string;
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
    packageType: "subscription" | "one-time" | "mini-draw" | "upsell";
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
    packageType: "one-time" | "subscription" | "upsell" | "mini-draw";
    packageId?: string;
    packageName?: string;
    entries: number;
    points: number;
    price: number;
  },
  processedBy: "api" | "webhook",
  paymentMetadata?: { created?: number; type?: string; packageType?: string; miniDrawId?: string }
): Promise<{ success: boolean; alreadyProcessed: boolean; error?: string }> {
  // ✅ CRITICAL: Validate input parameters
  console.log(`🔍 processPaymentBenefits called with:`, {
    paymentIntentId,
    userId,
    packageData,
    processedBy,
  });

  if (!paymentIntentId || !userId || !packageData || !processedBy) {
    console.error(`❌ processPaymentBenefits: Missing required parameters:`, {
      paymentIntentId: !!paymentIntentId,
      userId: !!userId,
      packageData: !!packageData,
      processedBy: !!processedBy,
    });
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
    console.log(`🔒 Payment ${paymentIntentId} already being processed, waiting...`);
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
    paymentMetadata
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
    packageType: "one-time" | "subscription" | "upsell" | "mini-draw";
    packageId?: string;
    packageName?: string;
    entries: number;
    points: number;
    price: number;
  },
  processedBy: "api" | "webhook",
  paymentMetadata?: { created?: number; type?: string; packageType?: string }
): Promise<{ success: boolean; alreadyProcessed: boolean; error?: string }> {
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      // Ensure database connection
      await connectDB();
      console.log(`🔗 Database connected for payment processing: ${paymentIntentId} (attempt ${retryCount + 1})`);

      const eventId = `BenefitsGranted-${paymentIntentId}`;

      // Get user first (required for atomic operation)
      const user = await User.findById(userId);
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      console.log(`🎯 Processing benefits for payment ${paymentIntentId} via ${processedBy}`);

      // ✅ CRITICAL: Atomic check-and-create for PaymentEvent to prevent race conditions
      // This ensures that only one process can create the PaymentEvent, preventing duplicate processing
      const webhookTimestamp = Date.now();
      console.log(`🔒 [WEBHOOK ${webhookTimestamp}] Attempting atomic PaymentEvent creation for: ${eventId}`);

      // ✅ CRITICAL FIX: Use .create() with try/catch to leverage database constraints
      // The unique compound index on (paymentIntentId + eventType) prevents duplicate processing
      // This is more reliable than pre-checking, as it's atomic at the database level
      let paymentEventCreated = false;
      try {
        console.log(`🔒 [WEBHOOK ${webhookTimestamp}] Attempting to create PaymentEvent with:`, {
          eventId,
          paymentIntentId,
          eventType: "BenefitsGranted",
          userId: user._id.toString(),
        });

        await PaymentEvent.create({
          _id: eventId,
          paymentIntentId,
          eventType: "BenefitsGranted",
          userId: user._id,
          packageType: packageData.packageType,
          packageId: packageData.packageId ? String(packageData.packageId) : undefined,
          packageName: packageData.packageName,
          data: {
            entries: packageData.entries,
            points: packageData.points,
            price: packageData.price,
          },
          processedBy,
          timestamp: new Date(),
        });
        paymentEventCreated = true;
        console.log(
          `✅ [WEBHOOK ${webhookTimestamp}] [${
            Date.now() - webhookTimestamp
          }ms] PaymentEvent created successfully: ${eventId}`
        );
        console.log(`✅ PaymentEvent details:`, {
          _id: eventId,
          paymentIntentId,
          eventType: "BenefitsGranted",
          packageType: packageData.packageType,
          packageId: packageData.packageId,
        });
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
          const isDuplicatePayment = mongoError.message?.includes("paymentIntentId");
          const reason = isDuplicatePayment
            ? `PaymentIntent ${paymentIntentId} already processed`
            : `Event ${eventId} already exists`;

          console.log(
            `🛑 [WEBHOOK ${webhookTimestamp}] [${
              Date.now() - webhookTimestamp
            }ms] ${reason} - DUPLICATE WEBHOOK DETECTED - SKIPPING`
          );
          return { success: true, alreadyProcessed: true };
        }
        // If it's a different error, log and rethrow
        console.error(`❌ [WEBHOOK ${webhookTimestamp}] Error creating PaymentEvent:`, mongoError);
        throw error;
      }

      if (!paymentEventCreated) {
        console.log(`⚠️ [WEBHOOK ${webhookTimestamp}] PaymentEvent not created but no error - this should not happen`);
        return { success: false, alreadyProcessed: false, error: "PaymentEvent creation failed silently" };
      }

      console.log(`✅ PaymentEvent created successfully: ${eventId}`);
      console.log(`🎯 Continuing to grant benefits for payment: ${paymentIntentId}`);

      // ✅ CRITICAL: Check user's processedPayments but only if PaymentEvent exists
      // If payment is in processedPayments but no PaymentEvent exists, it means previous processing failed
      if (user.processedPayments && user.processedPayments.includes(paymentIntentId)) {
        console.log(
          `⚠️ Payment ${paymentIntentId} in user's processedPayments but no PaymentEvent found - previous processing failed, retrying`
        );
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
          console.log(
            `⚠️ Found duplicate invoice payment: ${duplicateInvoicePayment} for invoice ${invoiceId}, skipping processing`
          );
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
      await grantBenefits(user as UserDocument, packageData, finalPaymentMetadata, paymentIntentId);

      // ✅ CRITICAL: Persist processed payment idempotently using canonical invoice id and $addToSet
      // Store the payment ID as-is to match webhook expectations
      // For invoice payments, keep the invoice_ prefix for consistency
      await User.updateOne({ _id: userId }, { $addToSet: { processedPayments: paymentIntentId } });
      console.log(`✅ Added to processedPayments: ${paymentIntentId}`);

      console.log(`✅ Benefits granted and recorded for payment ${paymentIntentId} via ${processedBy}`);

      // ✅ Check if this purchase has eligible upsells OR is an upsell itself
      // If it does, skip invoice generation (will be finalized after upsell decision)
      let shouldSkipInvoice = false;
      if (packageData.packageType === "upsell") {
        // Always skip invoice for upsells - handled by finalization API
        shouldSkipInvoice = true;
        console.log(`📊 Upsell purchase detected - invoice will be sent via finalization API`);
      } else if (
        packageData.packageId &&
        (packageData.packageType === "subscription" ||
          packageData.packageType === "one-time" ||
          packageData.packageType === "mini-draw")
      ) {
        // Map mini-draw to "one-time" for upsell lookups (as mini-draw is treated as one-time for upsells)
        const lookupPackageType = packageData.packageType === "mini-draw" ? "one-time" : packageData.packageType;
        const eligibleUpsells = getUpsellPackagesForPurchase(packageData.packageId, lookupPackageType);
        shouldSkipInvoice = eligibleUpsells.length > 0;
        if (shouldSkipInvoice) {
          console.log(`📊 Package has ${eligibleUpsells.length} eligible upsells - invoice will be delayed`);
        }
      }

      // Track purchase event in Klaviyo (non-blocking)
      trackKlaviyoEvent(user as UserDocument, packageData, paymentIntentId, shouldSkipInvoice);

      // ✅ CRITICAL: Update Klaviyo profile with latest user data after benefits are granted
      try {
        const { ensureUserProfileSynced } = await import("@/utils/integrations/klaviyo/klaviyo-profile-sync");
        console.log(`📊 Updating Klaviyo profile after ${packageData.packageType} benefits granted`);

        // ✅ CRITICAL: Refetch user to ensure we have the latest data after grantBenefits()
        const freshUser = await User.findById(userId);
        if (freshUser) {
          console.log(
            `📊 Fresh user data - accumulatedEntries: ${freshUser.accumulatedEntries}, rewardsPoints: ${freshUser.rewardsPoints}`
          );
          ensureUserProfileSynced(freshUser as never);
        } else {
          console.error(`❌ Could not refetch user ${userId} for profile sync`);
        }
      } catch (klaviyoError) {
        console.error("Klaviyo profile sync error (non-critical):", klaviyoError);
      }

      return { success: true, alreadyProcessed: false };
    } catch (error) {
      console.error(`❌ Error processing payment ${paymentIntentId} (attempt ${retryCount + 1}):`, error);
      console.error(`❌ Error details:`, {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        paymentIntentId,
        userId,
        packageData,
        processedBy,
        attempt: retryCount + 1,
      });

      // Log to file for debugging
      try {
        const logPath = path.join(process.cwd(), "webhook-debug.log");
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ❌ processPaymentBenefits failed for ${paymentIntentId} (attempt ${
          retryCount + 1
        }): ${error instanceof Error ? error.message : "Unknown error"}\n`;
        fs.appendFileSync(logPath, logMessage);
      } catch (logError) {
        console.error("Failed to write to log file:", logError);
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
        console.log(
          `🔄 Write conflict detected, retrying payment processing (attempt ${retryCount + 1}/${maxRetries})`
        );
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
async function grantBenefits(
  user: UserDocument,
  packageData: {
    packageType: "one-time" | "subscription" | "upsell" | "mini-draw";
    packageId?: string;
    packageName?: string;
    entries: number;
    points: number;
    price: number;
  },
  paymentMetadata?: { created?: number; type?: string; packageType?: string; miniDrawId?: string },
  paymentIntentId?: string
): Promise<void> {
  // ✅ DEBUG: Log function call with all parameters
  console.log(`🎯 grantBenefits called with:`, {
    userId: user._id.toString(),
    userEmail: user.email,
    packageData,
    paymentMetadata,
    paymentIntentId,
  });

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

  console.log(`🎫 Added ${packageData.entries} entries (total: ${user.accumulatedEntries})`);
  console.log(`⭐ Added ${packageData.points} points (total: ${user.rewardsPoints})`);

  // Handle package-specific tracking
  if (packageData.packageType === "one-time") {
    await handleOneTimePackage(user, packageData, paymentIntentId);
  } else if (packageData.packageType === "subscription") {
    await handleSubscriptionPackage(user, packageData);
  } else if (packageData.packageType === "upsell") {
    await handleUpsellPackage(user, packageData, paymentIntentId);
  } else if (packageData.packageType === "mini-draw") {
    console.log(`🎲 Processing mini-draw package: ${packageData.packageName}`);
    // Extract miniDrawId from paymentMetadata for package tracking
    const miniDrawId = paymentMetadata?.miniDrawId;
    await handleMiniDrawPackage(user, { ...packageData, miniDrawId }, paymentIntentId);
    console.log(`🎲 Mini-draw package processed successfully`);
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
    console.log(`🎲 Routing upsell entries to mini-draw: ${paymentMetadata.miniDrawId}`);
    // addToMiniDraw is the ONLY function that grants entries to MiniDraw model
    await addToMiniDraw(user, packageData, paymentMetadata);
  } else {
    // Add to major draw entries with payment metadata for freeze period handling
    await addToMajorDraw(user, packageData, paymentMetadata);
  }

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
        packageData.packageType === "subscription"
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
    });
    console.log(`📊 Pixel tracking completed for ${packageData.packageType} purchase`);
  } catch (pixelError) {
    console.error("❌ Pixel tracking failed (non-blocking):", pixelError);
    // Don't throw - pixel tracking should not break purchase flow
  }

  // Save user
  await user.save();
  console.log(`💾 User ${user.email} saved with new benefits`);
}

/**
 * Track Klaviyo event based on package type (non-blocking)
 */
function trackKlaviyoEvent(
  user: UserDocument,
  packageData: {
    packageType: "one-time" | "subscription" | "upsell" | "mini-draw";
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
    console.log(`📊 trackKlaviyoEvent called for user: ${user.email}`);
    console.log(`📊 Package data:`, packageData);
    console.log(`📊 Skip invoice: ${skipInvoice}`);

    const commonData = {
      packageId: packageData.packageId || "unknown",
      packageName: packageData.packageName || "Unknown Package",
      price: packageData.price,
      entriesGranted: packageData.entries,
      paymentIntentId,
    };

    // Track event based on package type
    switch (packageData.packageType) {
      case "subscription":
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

    // ✅ Invoice generation - skip if flagged (will be sent after upsell decision)
    if (!skipInvoice) {
      const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

      klaviyo.trackEventBackground(
        createInvoiceGeneratedEvent(user as never, {
          invoiceId: `inv_${paymentIntentId}`,
          invoiceNumber,
          packageType: packageData.packageType,
          packageId: commonData.packageId,
          packageName: commonData.packageName,
          packageTier:
            packageData.packageType === "subscription"
              ? packageData.packageId?.toLowerCase().includes("boss")
                ? "Boss"
                : packageData.packageId?.toLowerCase().includes("foreman")
                ? "Foreman"
                : packageData.packageId?.toLowerCase().includes("tradie")
                ? "Tradie"
                : undefined
              : undefined,
          totalAmount: packageData.price,
          paymentIntentId,
          billingReason: packageData.packageType === "subscription" ? "subscription_create" : undefined,
          entries_gained: commonData.entriesGranted,
          items: [
            {
              description: commonData.packageName,
              quantity: 1,
              unit_price: packageData.price,
              total_price: packageData.price,
            },
          ],
        })
      );
      console.log(`📊 Invoice sent for ${packageData.packageType} package`);
    } else {
      console.log(
        `📊 Invoice skipped for ${packageData.packageType} package - will be finalized after upsell decision`
      );
    }

    console.log(`📊 Klaviyo event tracked for ${packageData.packageType} package`);
  } catch (error) {
    console.error("Klaviyo event tracking failed:", error);
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
  console.log(`📦 Added one-time package atomically: ${packageData.packageName}`);

  // Add to partner discount queue if package includes partner discount days
  const packageInfo = getPackageById(packageData.packageId);
  if (packageInfo && packageInfo.partnerDiscountDays && packageInfo.partnerDiscountDays > 0) {
    console.log(`🎁 Adding one-time package to partner discount queue: ${packageInfo.partnerDiscountDays} days access`);

    // ✅ CRITICAL FIX: Ensure partnerDiscountQueue is initialized for existing users
    // This field might not exist for users created before this feature was added
    if (!user.partnerDiscountQueue) {
      console.log(`🔧 Initializing partnerDiscountQueue for user (field didn't exist)`);
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
    console.log(`✅ Partner discount queue updated and marked for save (${user.partnerDiscountQueue?.length} items)`);

    // Dispatch purchase event for optimistic updates
    dispatchPackagePurchase(packageData.packageId, "one-time");
  }
}

/**
 * Handle subscription package tracking and partner discount queue
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

    // 🚨 CRITICAL FIX: Don't update packageId if there's a pending downgrade
    // This prevents scheduled downgrades from being processed immediately
    const userSub = user.subscription as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const hasPendingDowngrade =
      userSub.pendingChange &&
      userSub.pendingChange.changeType === "downgrade" &&
      userSub.pendingChange.effectiveDate &&
      new Date() < new Date(userSub.pendingChange.effectiveDate);

    if (hasPendingDowngrade) {
      console.log(
        `🚨 SCHEDULED DOWNGRADE PROTECTION: Not updating packageId from ${user.subscription.packageId} to ${packageData.packageId} - downgrade scheduled for ${userSub.pendingChange.effectiveDate}`
      );
    } else {
      user.subscription.packageId = packageData.packageId; // Use string directly
      console.log(`📦 Package ID updated to: ${packageData.packageId}`);
    }

    // Log status changes for debugging
    if (!wasActive || wasStatus !== "active") {
      console.log(`📊 Subscription activated during benefit processing: ${packageData.packageName}`);
      console.log(`📊 Status changed: ${wasStatus} → active, isActive: ${wasActive} → true`);
    }
  } else {
    user.subscription = {
      packageId: packageData.packageId, // Use string directly
      startDate: new Date(),
      isActive: true,
      autoRenew: true,
      status: "active",
    };
    console.log(`📊 New subscription created during benefit processing: ${packageData.packageName}`);
  }

  console.log(`🔄 Updated subscription: ${packageData.packageName} (isActive: true, status: active)`);

  // Add subscription to partner discount queue (subscriptions always have 30 days recurring access)
  const packageInfo = getPackageById(packageData.packageId);
  if (packageInfo && user.subscription.endDate) {
    console.log(`🎁 Adding subscription to partner discount queue: 30 days recurring access`);
    await handleSubscriptionQueueUpdate(user as unknown as IUser, "start", {
      packageId: packageData.packageId,
      packageName: packageData.packageName || packageInfo.name,
      endDate: user.subscription.endDate,
    });

    // Dispatch purchase event for optimistic updates
    dispatchPackagePurchase(packageData.packageId, "subscription");
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
  console.log(`🛒 Added upsell purchase atomically: ${packageData.packageName}`);

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
  console.log(`🎲 handleMiniDrawPackage called with:`, { packageData, userId: user._id.toString() });
  if (!packageData.packageId) {
    console.log(`🎲 No packageId provided, skipping mini-draw package tracking`);
    return;
  }

  // Get mini draw package info from static data
  const miniDrawInfo = getMiniDrawPackageById(packageData.packageId);

  // Convert miniDrawId string to ObjectId if provided
  let miniDrawIdObjectId: mongoose.Types.ObjectId | undefined;
  if (packageData.miniDrawId) {
    try {
      miniDrawIdObjectId = new mongoose.Types.ObjectId(packageData.miniDrawId);
    } catch (error) {
      console.error(`❌ Invalid miniDrawId format: ${packageData.miniDrawId}`, error);
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
  console.log(`🎲 Added mini draw package atomically:`, miniDrawPackage);

  // Add to partner discount queue if package includes partner discount hours/days
  if (miniDrawInfo && (miniDrawInfo.partnerDiscountHours > 0 || miniDrawInfo.partnerDiscountDays > 0)) {
    console.log(
      `🎁 Adding mini-draw package to partner discount queue: ${miniDrawInfo.partnerDiscountHours} hours (${miniDrawInfo.partnerDiscountDays} days) access`
    );

    // ✅ CRITICAL FIX: Ensure partnerDiscountQueue is initialized for existing users
    if (!user.partnerDiscountQueue) {
      console.log(`🔧 Initializing partnerDiscountQueue for user (field didn't exist)`);
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
    console.log(
      `✅ Partner discount queue updated and marked for save (${user.partnerDiscountQueue?.length || 0} items)`
    );

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
  paymentMetadata?: { created?: number; type?: string; packageType?: string }
): Promise<void> {
  try {
    // ✅ DEBUG: Log function call with all parameters
    console.log(`🎯 addToMajorDraw called with:`, {
      userId: user._id.toString(),
      userEmail: user.email,
      packageData,
      paymentMetadata,
    });

    // Import helper function dynamically to avoid circular dependencies
    const { getTargetMajorDraw } = await import("../draws/major-draw-helpers");

    // Get target major draw (handles freeze period, gap period, etc.)
    const majorDrawResult = await getTargetMajorDraw(paymentMetadata);

    if (!majorDrawResult) {
      console.error(`❌ No valid major draw found - skipping major draw entry allocation`);
      console.error(`❌ addToMajorDraw context:`, {
        userId: user._id.toString(),
        packageData,
        paymentMetadata,
      });
      return;
    }

    // Type the major draw properly
    const majorDraw: IMajorDraw = majorDrawResult as IMajorDraw;

    // Log which draw entries are being added to
    console.log(`🎯 Adding entries to major draw: ${majorDraw.name} (status: ${majorDraw.status})`);
    if (majorDraw.status === "queued") {
      console.log(`⏰ Entries deferred to queued draw (activation: ${majorDraw.activationDate})`);
    }

    // ✅ OPTION 1: Determine source type for major draw entries (single source of truth)
    let sourceType: "membership" | "one-time-package" | "upsell" | "mini-draw";
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

    console.log(`🎯 Processing major draw entries for package (source: ${sourceType})`);

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
      } = {
        membership: 0,
        "one-time-package": 0,
        upsell: 0,
        "mini-draw": 0,
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
        const currentTotal = existingUserEntry.totalEntries;
        const currentSourceEntries = existingUserEntry.entriesBySource[sourceType] || 0;

        console.log(`🎯 UPDATING existing user entry: ${currentTotal} → ${currentTotal + packageData.entries} total`);
        console.log(
          `🎯 UPDATING ${sourceType} entries: ${currentSourceEntries} → ${currentSourceEntries + packageData.entries}`
        );

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
        console.log(`🎯 Updated existing entry for user ${user._id} (+${packageData.entries} ${sourceType})`);
      } else {
        // ✅ Create new user entry if doesn't exist
        console.log(`🎯 CREATING new user entry: ${packageData.entries} ${sourceType}`);

        await MajorDraw.updateOne({ _id: majorDraw._id }, { $push: { entries: newEntry } });
        console.log(`🎯 Created new entry for user ${user._id} (+${packageData.entries} ${sourceType})`);
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

      console.log(`🎯 Major draw entries updated for user ${user._id} (draw total: ${totalEntries})`);

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
      console.log(`🎯 No entries to add to major draw (package has 0 entries)`);
    }
  } catch (error) {
    console.error(`❌ ERROR in addToMajorDraw:`, error);
    // Log the error details for debugging
    if (error instanceof Error) {
      console.error(`❌ Error message: ${error.message}`);
      console.error(`❌ Error stack: ${error.stack}`);
    }

    // Log context for debugging
    console.error(`❌ Error context:`, {
      userId: user._id,
      userEmail: user.email,
      packageType: packageData.packageType,
      packageId: packageData.packageId,
      entries: packageData.entries,
      paymentMetadata,
    });

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
  paymentMetadata?: { created?: number; type?: string; packageType?: string; miniDrawId?: string }
): Promise<void> {
  try {
    // ✅ DEBUG: Log function call with all parameters
    console.log(`🎲 addToMiniDraw called with:`, {
      userId: user._id.toString(),
      userEmail: user.email,
      packageData,
      paymentMetadata,
    });

    // Extract miniDrawId from paymentMetadata
    const miniDrawId = paymentMetadata?.miniDrawId;
    if (!miniDrawId) {
      console.error(`❌ No miniDrawId provided in paymentMetadata - skipping mini draw entry allocation`);
      console.error(`❌ addToMiniDraw context:`, {
        userId: user._id.toString(),
        packageData,
        paymentMetadata,
      });
      return;
    }

    // Import helper function dynamically to avoid circular dependencies
    const { getTargetMiniDraw } = await import("../draws/mini-draw-helpers");

    // Get target mini draw (validates existence, status, freeze period, etc.)
    let miniDraw: IMiniDraw;
    try {
      miniDraw = await getTargetMiniDraw(miniDrawId, paymentMetadata);
    } catch (error) {
      console.error(`❌ Failed to get target mini draw:`, error);
      // Don't throw - allow payment processing to continue
      // User still gets accumulated entries, points, and package benefits
      return;
    }

    // Log which draw entries are being added to
    console.log(`🎲 Adding entries to mini draw: ${miniDraw.name} (status: ${miniDraw.status})`);

    console.log(`🎲 Processing mini draw entries for package (source: mini-draw-package)`);

    // Add to mini draw collection only if package has entries
    if (packageData.entries > 0) {
      const now = new Date();

      const remainingEntries = Math.max(miniDraw.minimumEntries - miniDraw.totalEntries, 0);
      if (remainingEntries <= 0) {
        console.warn(`⚠️ Mini draw ${miniDraw.name} already full. Skipping entry allocation.`);
        return;
      }

      if (packageData.entries > remainingEntries) {
        console.warn(
          `⚠️ Mini draw ${miniDraw.name} only has ${remainingEntries} entries remaining. Skipping allocation of ${
            packageData.entries
          } entries.`
        );
        return;
      }

      // Create new user entry atomically
      const entriesBySource: {
        "mini-draw-package"?: number;
        "free-entry"?: number;
      } = {
        "mini-draw-package": packageData.entries,
        "free-entry": 0,
      };

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
        const currentTotal = existingUserEntry.totalEntries;
        const currentSourceEntries = existingUserEntry.entriesBySource["mini-draw-package"] || 0;

        console.log(`🎲 UPDATING existing user entry: ${currentTotal} → ${currentTotal + packageData.entries} total`);
        console.log(
          `🎲 UPDATING mini-draw-package entries: ${currentSourceEntries} → ${
            currentSourceEntries + packageData.entries
          }`
        );

        await MiniDraw.updateOne(
          {
            _id: miniDraw._id,
            "entries.userId": user._id,
          },
          {
            $inc: {
              "entries.$.totalEntries": packageData.entries,
              "entries.$.entriesBySource.mini-draw-package": packageData.entries,
            },
            $set: {
              "entries.$.lastUpdatedDate": now,
            },
          }
        );
        console.log(`🎲 Updated existing entry for user ${user._id} (+${packageData.entries} mini-draw-package)`);
      } else {
        // ✅ Create new user entry if doesn't exist
        console.log(`🎲 CREATING new user entry: ${packageData.entries} mini-draw-package`);

        await MiniDraw.updateOne({ _id: miniDraw._id }, { $push: { entries: newEntry } });
        console.log(`🎲 Created new entry for user ${user._id} (+${packageData.entries} mini-draw-package)`);
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

      console.log(`🎲 Mini draw entries updated for user ${user._id} (draw total: ${totalEntries})`);

      // ✅ Check if minimum entries has been reached and auto-close draw
      if (updatedMiniDraw && totalEntries >= updatedMiniDraw.minimumEntries) {
        console.log(
          `🎲 Minimum entries reached (${totalEntries} >= ${updatedMiniDraw.minimumEntries}). Auto-closing mini draw...`
        );
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
        console.log(`✅ Mini draw "${miniDraw.name}" automatically closed due to reaching minimum entries`);
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
          console.log(`🎲 Updated user mini draw participation for ${miniDraw.name}`);
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
          console.log(`🎲 Created new user mini draw participation for ${miniDraw.name}`);
        }
      }

      // Track mini draw entry in Klaviyo (non-blocking)
      // Note: MiniDraw entry tracking can be added to klaviyoEvents.ts if needed
      // For now, using the existing createMiniDrawPurchasedEvent which is already tracked in handleMiniDrawPackage
    } else {
      console.log(`🎲 No entries to add to mini draw (package has 0 entries)`);
    }
  } catch (error) {
    console.error(`❌ ERROR in addToMiniDraw:`, error);
    // Log the error details for debugging
    if (error instanceof Error) {
      console.error(`❌ Error message: ${error.message}`);
      console.error(`❌ Error stack: ${error.stack}`);
    }

    // Log context for debugging
    console.error(`❌ Error context:`, {
      userId: user._id,
      userEmail: user.email,
      packageType: packageData.packageType,
      packageId: packageData.packageId,
      entries: packageData.entries,
      paymentMetadata,
    });

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
    console.log(`🔍 Checking if payment already processed: ${eventId}`);

    const existingEvent = await PaymentEvent.findById(eventId);
    const isProcessed = !!existingEvent;

    console.log(`🔍 Payment ${paymentIntentId} already processed: ${isProcessed}`);
    return isProcessed;
  } catch (error) {
    console.error(`❌ Error checking if payment processed:`, error);
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
