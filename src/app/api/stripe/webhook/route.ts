import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User, { IUser } from "@/models/User";
// import { Types } from "mongoose"; // No longer needed with Option 1
import Order from "@/models/Order";
import MajorDraw from "@/models/MajorDraw";
import mongoose from "mongoose";
import { stripe } from "@/lib/stripe";
import { headers } from "next/headers";
import Stripe from "stripe";
import { getPackageById } from "@/data/membershipPackages";
import { ensureIndexesOnce } from "@/utils/database/ensure-indexes";
import { getUpsellPackageById } from "@/data/upsellPackages";
import { processPaymentBenefits, isPaymentProcessed } from "@/utils/payment/payment-processing";
import { calculateSubscriptionEntries } from "@/utils/payment/subscription-entries-calculator";
import Promo from "@/models/Promo";
import { createUserFromPaymentMetadata, shouldCreateAccountFromMetadata } from "@/utils/payment/account-manager";
import { savePaymentMethodToUser } from "@/utils/payment/payment-method-manager";
import { handlePaymentCancellation } from "@/utils/payment/payment-cleanup";
// ✅ WEBHOOK-FIRST: Remove database dependency for event tracking
import { klaviyo } from "@/lib/klaviyo";
import { ensureUserProfileSynced } from "@/utils/integrations/klaviyo/klaviyo-profile-sync";
import {
  createSubscriptionStartedEvent,
  createSubscriptionRenewedEvent,
  createSubscriptionCancelledEvent,
  createSubscriptionRenewalFailedEvent,
  createSubscriptionPaymentFailedEvent,
  createPaymentFailedEvent,
  createInvoiceGeneratedEvent,
} from "@/utils/integrations/klaviyo/klaviyo-events";
import { handleSubscriptionQueueUpdate } from "@/utils/partner-discounts/partner-discount-queue";
import { trackPixelPaymentFailed, trackPixelSubscriptionRenewal } from "@/utils/tracking/pixel-purchase-tracking";

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
 * Extract request context from payment intent metadata for Facebook CAPI
 * This context was stored by API routes when creating payment intents
 */
function extractRequestContextFromMetadata(
  metadata: Stripe.Metadata
): { client_ip_address?: string; client_user_agent?: string; fbc?: string; fbp?: string } | undefined {
  const clientIp = metadata.capi_client_ip;
  const userAgent = metadata.capi_user_agent;
  const fbc = metadata.capi_fbc;
  const fbp = metadata.capi_fbp;

  // Only return context if at least one field is present
  if (clientIp || userAgent || fbc || fbp) {
    return {
      ...(clientIp && { client_ip_address: clientIp }),
      ...(userAgent && { client_user_agent: userAgent }),
      ...(fbc && { fbc }),
      ...(fbp && { fbp }),
    };
  }

  return undefined;
}

/**
 * Get active promo multiplier for a package type
 */
async function getActivePromoMultiplier(packageType: "membership" | "one-time" | "mini-draw"): Promise<number> {
  try {
    const promoType =
      packageType === "membership"
        ? "membership-packages"
        : packageType === "one-time"
        ? "one-time-packages"
        : "mini-packages";

    const activePromo = await Promo.findOne({
      type: promoType,
      isActive: true,
    }).sort({ createdAt: -1 });

    return activePromo?.multiplier || 1;
  } catch (error) {
    webhookLog("error", `Error fetching active promo for ${packageType}: ${error}`);
    return 1; // Default to no multiplier on error
  }
}

/**
 * Save user with verification to ensure cancellation actually persisted
 * Retries once if verification fails
 */
async function saveUserWithVerification(
  user: import("@/models/User").IUser,
  expectedState: { isActive?: boolean; status?: string; stripeSubscriptionId?: string | undefined },
  retryCount = 0
): Promise<boolean> {
  try {
    // Mark subscription as modified so Mongoose detects changes
    if (user.subscription) {
      user.markModified("subscription");
    }

    await user.save();

    // Verify the save actually worked
    const savedUser = await User.findById(user._id);
    const matches =
      (expectedState.isActive === undefined || savedUser?.subscription?.isActive === expectedState.isActive) &&
      (expectedState.status === undefined || savedUser?.subscription?.status === expectedState.status) &&
      (expectedState.stripeSubscriptionId === undefined ||
        (expectedState.stripeSubscriptionId === undefined && !savedUser?.stripeSubscriptionId) ||
        (expectedState.stripeSubscriptionId !== undefined &&
          savedUser?.stripeSubscriptionId === expectedState.stripeSubscriptionId));

    if (!matches && retryCount < 1) {
      console.warn(`⚠️ [SAVE VERIFICATION] Retry ${retryCount + 1} for user ${user.email}`);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
      return saveUserWithVerification(user, expectedState, retryCount + 1);
    }

    return matches;
  } catch (error) {
    console.error(`❌ [SAVE VERIFICATION] Error: ${error}`);
    return false;
  }
}

/**
 * Handle payment success with event-based idempotency
 * @returns false if payment was not processed, undefined otherwise
 */
async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent): Promise<boolean | undefined> {
  try {
    webhookLog("info", `🔄 Processing payment success: ${paymentIntent.id}`);

    // ✅ CRITICAL: Retrieve fresh PaymentIntent to get latest metadata
    // The webhook event might have stale data if metadata was updated after confirmation
    let freshPaymentIntent: Stripe.PaymentIntent;
    try {
      freshPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntent.id, {
        expand: ["customer", "payment_method", "latest_charge"],
      });
      webhookLog("info", `📋 Retrieved fresh PaymentIntent metadata:`, {
        id: freshPaymentIntent.id,
        customer: freshPaymentIntent.customer,
        metadata: freshPaymentIntent.metadata,
        status: freshPaymentIntent.status,
        hasCharge: !!freshPaymentIntent.latest_charge,
        hasPaymentMethod: !!freshPaymentIntent.payment_method,
      });
    } catch (retrieveError) {
      webhookLog("warn", `Failed to retrieve fresh PaymentIntent, using event data: ${retrieveError}`);
      freshPaymentIntent = paymentIntent;
    }

    // Use fresh PaymentIntent for all processing
    paymentIntent = freshPaymentIntent;

    // Remove database connection tests - they're unnecessary overhead

    // Find user by customer ID
    let user;
    if (paymentIntent.customer) {
      const customerId =
        typeof paymentIntent.customer === "string" ? paymentIntent.customer : paymentIntent.customer.id;
      webhookLog("info", `🔍 Looking up user by customer ID: ${customerId}`);
      user = await User.findOne({ stripeCustomerId: customerId });
      if (user) {
        webhookLog("info", `✅ Found user by customer ID: ${user._id.toString()}`);
      } else {
        webhookLog("warn", `❌ User not found by customer ID: ${customerId}`);
      }
    }

    // ✅ FIX: Fallback to finding user by email if customer lookup fails
    // This handles cases where PaymentIntent was created without a customer initially
    if (!user && paymentIntent.metadata.userEmail) {
      const userEmail = paymentIntent.metadata.userEmail.toLowerCase();
      webhookLog("info", `🔍 Customer lookup failed, trying email fallback: ${userEmail}`);

      // Skip if email is "guest" - that means metadata hasn't been updated yet
      if (userEmail !== "guest") {
        user = await User.findOne({ email: userEmail });
        if (user) {
          webhookLog("info", `✅ Found user by email: ${user._id.toString()}`);
        } else {
          webhookLog("warn", `❌ User not found by email: ${userEmail}`);
        }

        // If found, update PaymentIntent with customer ID for future lookups
        if (user && user.stripeCustomerId) {
          try {
            await stripe.paymentIntents.update(paymentIntent.id, {
              customer: user.stripeCustomerId,
            });
            webhookLog("info", `✅ Updated PaymentIntent ${paymentIntent.id} with customer ${user.stripeCustomerId}`);
          } catch (updateError) {
            webhookLog("warn", `Failed to update PaymentIntent customer: ${updateError}`);
          }
        }
      } else {
        webhookLog(
          "warn",
          `⚠️ PaymentIntent metadata has 'guest' email - metadata may not be updated yet. Will retry on next webhook.`
        );
      }
    }

    // ✅ FIX: If user still not found and customer is null, try to find user via charge/payment method
    // This handles cases where PaymentIntent was confirmed before customer was set
    if (!user && !paymentIntent.customer) {
      webhookLog("info", `🔍 PaymentIntent has no customer, trying to find user via charge or payment method...`);

      // Try to get the charge to find customer
      if (paymentIntent.latest_charge) {
        try {
          const chargeId =
            typeof paymentIntent.latest_charge === "string"
              ? paymentIntent.latest_charge
              : paymentIntent.latest_charge.id;
          const charge = await stripe.charges.retrieve(chargeId);

          if (charge.customer) {
            const chargeCustomerId = typeof charge.customer === "string" ? charge.customer : charge.customer.id;
            webhookLog("info", `🔍 Found customer from charge: ${chargeCustomerId}`);
            user = await User.findOne({ stripeCustomerId: chargeCustomerId });
            if (user) {
              webhookLog("info", `✅ Found user via charge customer: ${user._id.toString()}`);
            } else {
              webhookLog("warn", `❌ User not found by charge customer ID: ${chargeCustomerId}`);
            }
          } else {
            webhookLog("warn", `⚠️ Charge ${chargeId} also has no customer`);
          }
        } catch (chargeError) {
          webhookLog("warn", `Failed to retrieve charge: ${chargeError}`);
        }
      } else {
        webhookLog("warn", `⚠️ PaymentIntent has no latest_charge`);
      }

      // If still not found, try payment method
      if (!user && paymentIntent.payment_method) {
        try {
          const pmId =
            typeof paymentIntent.payment_method === "string"
              ? paymentIntent.payment_method
              : paymentIntent.payment_method.id;
          const pm = await stripe.paymentMethods.retrieve(pmId);

          if (pm.customer) {
            const pmCustomerId = typeof pm.customer === "string" ? pm.customer : pm.customer.id;
            webhookLog("info", `🔍 Found customer from payment method: ${pmCustomerId}`);
            user = await User.findOne({ stripeCustomerId: pmCustomerId });
            if (user) {
              webhookLog("info", `✅ Found user via payment method customer: ${user._id.toString()}`);
            } else {
              webhookLog("warn", `❌ User not found by payment method customer ID: ${pmCustomerId}`);
            }
          } else {
            webhookLog("warn", `⚠️ Payment method ${pmId} also has no customer`);
          }
        } catch (pmError) {
          webhookLog("warn", `Failed to retrieve payment method: ${pmError}`);
        }
      } else if (!paymentIntent.payment_method) {
        webhookLog("warn", `⚠️ PaymentIntent has no payment_method`);
      }
    }

    // ✅ FIX: If user doesn't exist, check if we need to create account from metadata
    // This handles new users who didn't register first
    if (!user) {
      if (shouldCreateAccountFromMetadata(paymentIntent)) {
        webhookLog("info", `🆕 Creating new user account from PaymentIntent metadata: ${paymentIntent.metadata.userEmail}`);
        
        try {
          user = await createUserFromPaymentMetadata(paymentIntent);
          
          if (user) {
            webhookLog("info", `✅ Created new user account from webhook: ${user._id.toString()}`);
          } else {
            webhookLog("error", `❌ Failed to create user account from metadata`);
            return; // Return undefined to indicate processing failed
          }
        } catch (createError) {
          webhookLog("error", `❌ Failed to create user account from metadata: ${createError}`);
          return; // Return undefined to indicate processing failed
        }
      } else {
        webhookLog("error", `❌ User not found for payment intent: ${paymentIntent.id}`, {
          customerId: paymentIntent.customer,
          userEmail: paymentIntent.metadata.userEmail,
          metadata: paymentIntent.metadata,
          hasCharge: !!paymentIntent.latest_charge,
          hasPaymentMethod: !!paymentIntent.payment_method,
        });
        webhookLog("warn", `⚠️ PaymentIntent ${paymentIntent.id} will be retried when metadata is updated`);
        return; // Return undefined to indicate processing failed, webhook will retry
      }
    }
    
    // ✅ ENHANCED: For existing users, ensure payment method is saved if not already saved
    // For new users, payment method is already saved during account creation
    // Check multiple sources for payment method ID to handle all edge cases
    if (user) {
      let paymentMethodId: string | null = null;
      let paymentMethodSource = "none";

      // Try multiple sources in order of reliability
      // 1. PaymentIntent.payment_method (most direct)
      if (paymentIntent.payment_method) {
        paymentMethodId = typeof paymentIntent.payment_method === "string"
          ? paymentIntent.payment_method
          : paymentIntent.payment_method.id;
        if (paymentMethodId) {
          paymentMethodSource = "paymentIntent";
        }
      }

      // 2. PaymentIntent.metadata.paymentMethodId (from one-time purchase API)
      if (!paymentMethodId && paymentIntent.metadata.paymentMethodId) {
        paymentMethodId = paymentIntent.metadata.paymentMethodId;
        paymentMethodSource = "metadata";
        webhookLog("info", `💳 Found payment method in metadata: ${paymentMethodId}`);
      }

      // 3. Charge's payment method (some payment methods are on charges)
      if (!paymentMethodId && paymentIntent.latest_charge) {
        try {
          const chargeId = typeof paymentIntent.latest_charge === "string"
            ? paymentIntent.latest_charge
            : paymentIntent.latest_charge.id;
          const charge = await stripe.charges.retrieve(chargeId);
          
          if (charge.payment_method) {
            const pm = charge.payment_method;
            if (typeof pm === "string") {
              paymentMethodId = pm;
            } else if (pm && typeof pm === "object") {
              const pmObj = pm as { id?: string };
              paymentMethodId = pmObj.id || null;
            }
            if (paymentMethodId) {
              paymentMethodSource = "charge";
              webhookLog("info", `💳 Found payment method on charge: ${paymentMethodId}`);
            }
          }
        } catch (chargeError) {
          webhookLog("warn", `Failed to retrieve charge for payment method: ${chargeError}`);
        }
      }

      // 4. Customer's default payment method (last resort)
      if (!paymentMethodId && paymentIntent.customer) {
        try {
          const customerId = typeof paymentIntent.customer === "string"
            ? paymentIntent.customer
            : paymentIntent.customer.id;
          const customer = await stripe.customers.retrieve(customerId);
          
          if (!("deleted" in customer) && customer.invoice_settings?.default_payment_method) {
            const defaultPm = customer.invoice_settings.default_payment_method;
            paymentMethodId = typeof defaultPm === "string" ? defaultPm : defaultPm?.id || null;
            if (paymentMethodId) {
              paymentMethodSource = "customerDefault";
              webhookLog("info", `💳 Found payment method from customer default: ${paymentMethodId}`);
            }
          }
        } catch (customerError) {
          webhookLog("warn", `Failed to retrieve customer for payment method: ${customerError}`);
        }
      }

      if (paymentMethodId) {
        // Check if payment method is already saved
        const hasPaymentMethod = user.savedPaymentMethods?.some(
          (pm) => pm.paymentMethodId === paymentMethodId
        );
        
        if (!hasPaymentMethod) {
          // ✅ ENHANCED: Save payment method with retry logic for transient failures
          webhookLog("info", `💳 Saving payment method to user account (source: ${paymentMethodSource}): ${paymentMethodId}`);
          
          let saveSuccess = false;
          let lastError: string | undefined;
          
          // Try once, then one quick retry (max 500ms total delay)
          // This keeps webhook response time fast while improving success rate
          for (let attempt = 1; attempt <= 2 && !saveSuccess; attempt++) {
            // ✅ CRITICAL: Refresh user object before each attempt to get latest data
            const freshUser: IUser | null = await User.findById(user._id);
            if (!freshUser) {
              webhookLog("error", `❌ User not found during payment method save attempt ${attempt}`);
              break;
            }
            user = freshUser;
            
            const saveResult = await savePaymentMethodToUser(
              user,
              paymentMethodId,
              {
                setAsDefault: user.savedPaymentMethods?.length === 0, // Set as default if no other payment methods
              }
            );
            
            if (saveResult.success) {
              webhookLog("info", `✅ Saved payment method to user account (attempt ${attempt}/2): ${paymentMethodId}`);
              user = saveResult.user;
              saveSuccess = true;
            } else {
              lastError = saveResult.error;
              webhookLog("warn", `⚠️ Failed to save payment method (attempt ${attempt}/2): ${lastError}`);
              
              // Quick retry with short delay (200ms) - only if first attempt failed
              if (attempt === 1) {
                await new Promise((resolve) => setTimeout(resolve, 200));
              }
            }
          }
          
          if (!saveSuccess) {
            // ✅ CRITICAL: Log as error but don't block webhook processing
            // Payment succeeded, but payment method wasn't saved - this needs attention
            webhookLog("error", `❌ CRITICAL: Failed to save payment method after 2 attempts: ${paymentMethodId}. Error: ${lastError}. Payment succeeded but payment method not saved.`);
            
            // TODO: Consider adding to a monitoring/alerting system
            // For now, we continue processing to avoid blocking the webhook
          }
        } else {
          webhookLog("info", `ℹ️ Payment method already saved to user account: ${paymentMethodId}`);
        }
      } else {
        webhookLog("warn", `⚠️ No payment method found for PaymentIntent ${paymentIntent.id}. Payment succeeded but cannot save payment method.`);
      }
    }

    // ✅ NEW: Use event-based idempotency check
    const alreadyProcessed = await isPaymentProcessed(paymentIntent.id);

    if (alreadyProcessed) {
      webhookLog("info", `Payment ${paymentIntent.id} already processed, skipping`);
      return;
    }

    // ✅ WEBHOOK-FIRST: Process only explicit non-subscription payments here
    const paymentType = paymentIntent.metadata.type || paymentIntent.metadata.packageType;

    // ✅ DEBUG: Log payment metadata for troubleshooting
    webhookLog("info", `PaymentIntent metadata:`, {
      paymentIntentId: paymentIntent.id,
      customerId: paymentIntent.customer,
      type: paymentIntent.metadata.type,
      packageType: paymentIntent.metadata.packageType,
      packageId: paymentIntent.metadata.packageId,
      userEmail: paymentIntent.metadata.userEmail,
      resolvedPaymentType: paymentType,
      hasInvoice: !!(paymentIntent as { invoice?: string | Stripe.Invoice }).invoice,
    });

    // ✅ CRITICAL: Skip subscription payments - they're handled by invoice.payment_succeeded
    // This prevents duplicate processing when both payment_intent.succeeded and invoice.payment_succeeded fire
    // Also skip upfront PaymentIntents marked for subscriptions (they're just for wallet display)
    // ✅ IMPORTANT: Only skip if it's actually a subscription - never skip one-time purchases
    // ✅ BACKWARD COMPATIBILITY: Check both metadata.type === "subscription" and metadata.packageType === "membership"
    // This ensures compatibility during migration from "subscription" to "membership" packageType
    // Old Stripe metadata may have type: "subscription", new metadata uses packageType: "membership"
    const isSubscriptionPayment =
      paymentIntent.metadata.type === "subscription" ||
      paymentIntent.metadata.packageType === "membership" ||
      paymentIntent.metadata.subscription_id ||
      (paymentIntent.metadata.isUpfrontPayment === "true" &&
        (paymentIntent.metadata.type === "subscription" || paymentIntent.metadata.packageType === "membership")) || // ✅ Only skip upfront payments for memberships
      !!(paymentIntent as { invoice?: string | Stripe.Invoice }).invoice; // ✅ NEW: Also check if payment has an invoice (subscription payments always have invoices)

    if (isSubscriptionPayment) {
      webhookLog("info", `Skipping subscription payment ${paymentIntent.id} - handled by invoice.payment_succeeded`);
      return false; // Return false to indicate no processing happened
    }

    // Process ONLY non-subscription payments (explicit types)
    if (paymentType === "upsell") {
      webhookLog("info", `Processing upsell payment: ${paymentIntent.id}`);
      await handleUpsellWebhook(user, paymentIntent);
    } else if (paymentType === "mini-draw") {
      webhookLog("info", `Processing mini-draw payment: ${paymentIntent.id}`);
      await handleMiniDrawWebhook(user, paymentIntent);
    } else if (paymentType === "one-time") {
      webhookLog("info", `🔄 Processing one-time payment: ${paymentIntent.id}`);

      // ✅ CRITICAL: Validate required metadata for one-time purchases
      if (!paymentIntent.metadata.packageId) {
        webhookLog("error", `❌ Missing packageId in one-time payment metadata: ${paymentIntent.id}`);
        return false;
      }
      if (!paymentIntent.metadata.entriesCount) {
        webhookLog("error", `❌ Missing entriesCount in one-time payment metadata: ${paymentIntent.id}`);
        return false;
      }

      webhookLog("info", `📋 One-time payment details:`, {
        paymentIntentId: paymentIntent.id,
        customerId: paymentIntent.customer,
        userId: user._id.toString(),
        userEmail: paymentIntent.metadata.userEmail,
        packageId: paymentIntent.metadata.packageId,
        packageName: paymentIntent.metadata.packageName,
        entriesCount: paymentIntent.metadata.entriesCount,
        price: paymentIntent.metadata.price,
        amount: paymentIntent.amount,
        status: paymentIntent.status,
        type: paymentIntent.metadata.type,
        packageType: paymentIntent.metadata.packageType,
      });
      await handleOneTimeWebhook(user, paymentIntent);
      webhookLog("info", `✅ One-time payment processing completed: ${paymentIntent.id}`);
    } else {
      // ✅ CRITICAL: Never process membership/subscription via PI here
      // Only explicit non-subscription types are allowed above
      webhookLog(
        "warn",
        `Skipping payment_intent.succeeded for non-explicit type: ${paymentType || "undefined"}. PaymentIntent ID: ${
          paymentIntent.id
        }`
      );
      return false;
    }

    webhookLog("info", `Payment ${paymentIntent.id} processing completed`);

    // ✅ Update Klaviyo profile with latest user data after purchase
    try {
      // Wait a bit to ensure MongoDB has committed all changes (especially for atomic operations like upsells)
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second buffer

      const fullUser = await User.findById(user._id.toString());
      if (fullUser && paymentIntent.metadata) {
        const packageType = paymentIntent.metadata.type || paymentIntent.metadata.packageType;
        const packageId = paymentIntent.metadata.packageId;
        const packageName = paymentIntent.metadata.packageName;

        // Log user data before sync to debug
        webhookLog(
          "info",
          `Klaviyo sync - User data: upsellPurchases=${fullUser.upsellPurchases?.length || 0}, accumulatedEntries=${
            fullUser.accumulatedEntries
          }, rewardsPoints=${fullUser.rewardsPoints}`
        );

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
  
  // Get upsell package details
  const upsellPackage = getUpsellPackageById(offerId);
  if (!upsellPackage) {
    webhookLog("error", `Upsell package not found: ${offerId}`);
    return;
  }

  // ✅ Prioritize calculated entries from metadata (new dynamic calculation)
  // Fallback order: calculated entriesCount > staticEntriesCount > package entriesCount
  const calculatedEntriesCount = parseInt(paymentIntent.metadata.entriesCount || "0");
  const staticEntriesCount = parseInt(paymentIntent.metadata.staticEntriesCount || "0");
  
  let finalEntriesCount: number;
  let entriesSource: string;
  
  if (calculatedEntriesCount > 0) {
    // Use calculated entries (from dynamic calculation)
    finalEntriesCount = calculatedEntriesCount;
    entriesSource = "calculated";
    webhookLog(
      "info",
      `✅ Using calculated upsell entries: ${finalEntriesCount} (package: ${upsellPackage.entriesCount}, static: ${staticEntriesCount})`
    );
  } else if (staticEntriesCount > 0) {
    // Fallback to static entries from metadata
    finalEntriesCount = staticEntriesCount;
    entriesSource = "static-metadata";
    webhookLog(
      "info",
      `ℹ️ Using static entries from metadata: ${finalEntriesCount} (package fallback: ${upsellPackage.entriesCount})`
    );
  } else {
    // Final fallback to package static value (backward compatibility)
    finalEntriesCount = upsellPackage.entriesCount;
    entriesSource = "package-static";
    webhookLog(
      "info",
      `⚠️ Using package static entries (backward compatibility): ${finalEntriesCount}`
    );
  }

  // Extract miniDrawId from payment intent metadata (for mini-draw upsells)
  const miniDrawId = paymentIntent.metadata.miniDrawId;

  if (miniDrawId) {
    webhookLog("info", `Upsell ${offerId} is for mini-draw: ${miniDrawId}`);
  }

  // ✅ Extract original package type for bonus entry promo checks
  // Upsells should use the promo multiplier from the original package type (membership/one-time)
  const originalPackageType = paymentIntent.metadata.originalPackageType as
    | "membership"
    | "one-time"
    | "mini-draw"
    | undefined;

  if (originalPackageType) {
    webhookLog(
      "info",
      `✅ Upsell ${offerId} will use promo from original package type: ${originalPackageType}`
    );
  } else {
    webhookLog(
      "warn",
      `⚠️ No originalPackageType in metadata for upsell ${offerId}, bonus entry promos will not apply`
    );
  }

  // Extract request context from payment intent metadata for improved Facebook CAPI match quality
  const requestContext = extractRequestContextFromMetadata(paymentIntent.metadata);

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
      // ✅ Pass original package type for bonus entry promo checks
      ...(originalPackageType && { originalPackageType: originalPackageType }),
      ...(miniDrawId && { miniDrawId: miniDrawId }), // Include miniDrawId if present
      affiliateCode: paymentIntent.metadata.affiliateCode,
      promoLinkCode: paymentIntent.metadata.promoLinkCode,
    },
    requestContext // Pass request context for improved match quality
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
  webhookLog("info", `🎯 handleOneTimeWebhook called for PaymentIntent: ${paymentIntent.id}`);
  const packageId = paymentIntent.metadata.packageId;
  const packageName = paymentIntent.metadata.packageName || `One-Time Package ${packageId}`;
  const entriesCount = parseInt(paymentIntent.metadata.entriesCount || "0");
  const price = parseInt(paymentIntent.metadata.price || "0");

  webhookLog("info", `📦 One-time package details:`, {
    packageId,
    packageName,
    entriesCount,
    price,
    userId: user._id.toString(),
  });

  if (entriesCount <= 0) {
    webhookLog("error", `❌ No entries found for one-time package ${packageId}`);
    return;
  }

  // Get active promo multiplier for one-time packages
  const promoMultiplier = await getActivePromoMultiplier("one-time");
  const finalEntriesCount = entriesCount * promoMultiplier;

  webhookLog(
    "info",
    `One-time package ${packageId}: ${entriesCount} base entries × ${promoMultiplier} = ${finalEntriesCount} final entries`
  );

  // Extract request context from payment intent metadata for improved Facebook CAPI match quality
  const requestContext = extractRequestContextFromMetadata(paymentIntent.metadata);

  // Process benefits using event-based system with payment metadata
  webhookLog("info", `🔄 Calling processPaymentBenefits for one-time package:`, {
    paymentIntentId: paymentIntent.id,
    userId: user._id.toString(),
    packageId,
    entries: finalEntriesCount,
    points: Math.floor(price / 100),
    price: price / 100,
  });

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
      affiliateCode: paymentIntent.metadata.affiliateCode,
      promoLinkCode: paymentIntent.metadata.promoLinkCode,
    },
    requestContext // Pass request context for improved match quality
  );

  if (result.success) {
    webhookLog("info", `✅ Successfully processed one-time package ${packageId}:`, {
      paymentIntentId: paymentIntent.id,
      userId: user._id.toString(),
      entriesAdded: finalEntriesCount,
      pointsAdded: Math.floor(price / 100),
    });

    // ✅ CRITICAL: Sync Klaviyo profile immediately after one-time package purchase
    // This ensures current_draw_one_time_packages is updated in real-time
    try {
      // Fetch fresh user data to ensure we have the latest oneTimePackages array
      const freshUser = await User.findById(user._id);
      if (freshUser) {
        ensureUserProfileSynced(freshUser);
        webhookLog("info", `✅ Klaviyo profile synced after one-time package purchase for: ${freshUser.email}`);
      }
    } catch (klaviyoError) {
      webhookLog("error", `Klaviyo profile sync error after one-time package: ${klaviyoError}`);
    }
  } else {
    webhookLog("error", `❌ Failed to process one-time package ${packageId}: ${result.error}`);
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

  // Extract request context from payment intent metadata for improved Facebook CAPI match quality
  const requestContext = extractRequestContextFromMetadata(paymentIntent.metadata);

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
      affiliateCode: paymentIntent.metadata.affiliateCode,
      promoLinkCode: paymentIntent.metadata.promoLinkCode,
    },
    requestContext // Pass request context for improved match quality
  );

  if (!result.success) {
    webhookLog("error", `Failed to process mini draw ${packageId}: ${result.error}`);
  }
}

/**
 * Handle payment failure - Track all payment failures to Klaviyo
 * 
 * ✅ BEST PRACTICES:
 * 1. For ALL subscription payments (both initial and renewals), skip this handler
 *    - invoice.payment_failed is the canonical event for ALL subscription payment failures
 *    - This prevents duplicate tracking when both payment_intent.payment_failed and invoice.payment_failed fire
 * 2. Only track non-subscription payments here (one-time, mini-draw, upsell)
 * 3. All Klaviyo tracking is wrapped in try-catch to prevent webhook failures
 */
async function handlePaymentFailure(paymentIntent: Stripe.PaymentIntent) {
  try {
    webhookLog("error", `Payment failed: ${paymentIntent.id}`);

    // Find user by customer ID first to check subscription status
    let user;
    if (paymentIntent.customer) {
      const customerId =
        typeof paymentIntent.customer === "string" ? paymentIntent.customer : paymentIntent.customer.id;
      user = await User.findOne({ stripeCustomerId: customerId });
    }

    // ✅ BEST PRACTICE: Check if this is a subscription payment
    // For subscription payments, invoice.payment_failed is the canonical event
    // We should skip payment_intent.payment_failed for subscription payments to prevent duplicates
    const paymentIntentWithInvoice = paymentIntent as { invoice?: string | Stripe.Invoice };
    const hasInvoice = !!paymentIntentWithInvoice.invoice;
    
    // Check if this is a subscription payment (multiple indicators)
    const isSubscriptionPayment =
      hasInvoice || // PaymentIntent with invoice is always a subscription payment
      paymentIntent.metadata.type === "subscription" ||
      paymentIntent.metadata.packageType === "membership" ||
      !!user?.subscription; // User has an active subscription

    // ✅ BEST PRACTICE: Skip ALL subscription payments - handled by invoice.payment_failed
    // This prevents duplicate tracking when both payment_intent.payment_failed and invoice.payment_failed fire
    // Note: Even initial subscription payments will have invoice.payment_failed fire, so we skip payment_intent.payment_failed
    if (isSubscriptionPayment) {
      webhookLog("info", `Skipping subscription payment failure ${paymentIntent.id} - handled by invoice.payment_failed (canonical event)`);
      return; // Exit early - invoice.payment_failed will handle this
    }

    if (!user) {
      webhookLog("error", `User not found for failed payment: ${paymentIntent.id}`);
      return;
    }

    // Update order status if it exists
    const order = await Order.findOne({ paymentIntentId: paymentIntent.id });
    if (order) {
      order.status = "failed";
      await order.save();
    }

    // Extract payment type and details from metadata
    // Determine payment type: if has invoice, it's a subscription; otherwise check metadata
    const paymentType = hasInvoice 
      ? "subscription" 
      : (paymentIntent.metadata.type || paymentIntent.metadata.packageType || "unknown");
    
    // Get package info - for subscription payments, get from user subscription if available
    let packageId = paymentIntent.metadata.packageId || "unknown";
    let packageName = paymentIntent.metadata.packageName || "Unknown Package";
    
    // For subscription payments, prefer user subscription data over metadata
    if (paymentType === "subscription" && user.subscription) {
      packageId = user.subscription.packageId || packageId;
      // Try to get package name from package data
      try {
        const packageData = await getPackageById(packageId);
        if (packageData) {
          packageName = packageData.name || packageName;
        }
      } catch (error) {
        webhookLog("warn", `Could not fetch package name for ${packageId}, using default`);
      }
    }
    
    const amount = (paymentIntent.amount || 0) / 100; // Convert from cents to dollars

    // Get failure details from last payment error
    const lastPaymentError = paymentIntent.last_payment_error;
    const failureReason = lastPaymentError?.message || "Payment declined";
    const failureCode = lastPaymentError?.code || "";
    const declineCode = lastPaymentError?.decline_code || "";
    // Create combined failure_message as code:decline_code format (e.g., "card_declined:insufficient_funds")
    const failureMessage = failureCode && declineCode 
      ? `${failureCode}:${declineCode}` 
      : failureCode || declineCode || "";

    // Track to Klaviyo based on payment type
    if (paymentType === "subscription") {
      // ✅ BEST PRACTICE: For subscription payments without invoice (initial payments),
      // track using subscription payment failed event
      // Note: Renewals with invoices are handled by invoice.payment_failed (canonical event)
      const isInitialPayment = !hasInvoice;

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

      // ✅ BEST PRACTICE: Only track initial subscription payment failures here
      // Renewals are handled by invoice.payment_failed (which we skip payment_intent.payment_failed for)
      // This prevents duplicate tracking
      try {
        webhookLog("info", `📧 Tracking "Subscription Payment Failed" (initial) event to Klaviyo for user ${user.email}`);
        klaviyo.trackEventBackground(
          createSubscriptionPaymentFailedEvent(user as never, {
            paymentIntentId: paymentIntent.id,
            packageId,
            packageName,
            tier,
            amount,
            failureReason,
            failureCode,
            failureMessage,
            isInitialPayment,
          })
        );
        webhookLog("info", `✅ "Subscription Payment Failed" (initial) event queued for Klaviyo - Payment ID: ${paymentIntent.id}`);
      } catch (klaviyoError) {
        webhookLog("error", `❌ Failed to track "Subscription Payment Failed" event to Klaviyo for user ${user.email}: ${klaviyoError}`);
        // Don't throw - Klaviyo tracking failure shouldn't break webhook processing
      }
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

    // Track payment failure to Facebook Pixel (server-side)
    try {
      await trackPixelPaymentFailed({
        value: amount,
        currency: paymentIntent.currency.toUpperCase() || "AUD",
        paymentIntentId: paymentIntent.id,
        orderId: order?.orderId,
        packageId,
        packageName,
        packageType: paymentType as "membership" | "one-time" | "mini-draw" | "upsell" | undefined,
        userId: user._id.toString(),
        userEmail: user.email,
        userPhone: user.mobile,
        userFirstName: user.firstName,
        userLastName: user.lastName,
        errorMessage: failureReason,
        errorCode: failureCode,
        failureReason: failureMessage || failureReason,
      });
      webhookLog("info", `✅ Payment failure tracked to Facebook Pixel for: ${user.email}`);
    } catch (pixelError) {
      webhookLog("error", `Error tracking payment failure to Facebook Pixel: ${pixelError}`);
      // Don't throw - pixel tracking should not break webhook processing
    }

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
      user.subscription.cancelledAt = undefined; // Clear cancellation timestamp when subscription is created/activated
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
        user.subscription.cancelledAt = undefined; // Clear cancellation timestamp when subscription is reactivated
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
            toPrice: membershipPackage.price, // Already in dollars
            upgradeAmount: membershipPackage.price, // Already in dollars, don't multiply
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
        // If cancel_at_period_end is true and cancelledAt is not set, this is a new cancellation
        if (subscription.cancel_at_period_end && !user.subscription.cancelledAt) {
          user.subscription.cancelledAt = new Date();
        } else if (!subscription.cancel_at_period_end && user.subscription.cancelledAt) {
          // If cancel_at_period_end is false (cancellation cancelled), clear cancelledAt
          user.subscription.cancelledAt = undefined;
          user.subscription.endDate = undefined;
        }
      } else if (subscription.status === "canceled" || subscription.status === "past_due") {
        // Only update for explicit cancellations or past due
        console.log(`🔄 [SUBSCRIPTION UPDATED] Status changed to: ${subscription.status} for user ${user.email}`);

        // ✅ Set endDate consistently - use subscription period end or current date
        const subscriptionWithPeriod = subscription as Stripe.Subscription & { current_period_end?: number };
        const endDate = subscriptionWithPeriod.current_period_end
          ? new Date(subscriptionWithPeriod.current_period_end * 1000)
          : new Date(); // Fallback to now

        // ✅ PRESERVE: lastMonthAccumulatedEntries is preserved when subscription is canceled
        const preservedAccumulatedEntries = user.subscription.lastMonthAccumulatedEntries;

        user.subscription.isActive = false;
        user.subscription.status = subscription.status;
        user.subscription.autoRenew = !subscription.cancel_at_period_end;
        user.subscription.endDate = endDate; // ✅ Set endDate consistently
        // Set cancelledAt if not already set (to track when cancellation was triggered)
        if (!user.subscription.cancelledAt) {
          user.subscription.cancelledAt = new Date();
        }

        // Explicitly preserve lastMonthAccumulatedEntries
        if (preservedAccumulatedEntries !== undefined) {
          user.subscription.lastMonthAccumulatedEntries = preservedAccumulatedEntries;
          console.log(
            `✅ [SUBSCRIPTION UPDATED] Preserved lastMonthAccumulatedEntries: ${preservedAccumulatedEntries}`
          );
          webhookLog(
            "info",
            `✅ Preserved lastMonthAccumulatedEntries: ${preservedAccumulatedEntries} for user ${user.email} (subscription canceled via update)`
          );
        }

        // ✅ CRITICAL FIX: Mark subscription as modified so Mongoose detects the changes
        user.markModified("subscription");
      } else {
        // For other statuses, let invoice.paid handle it
        user.subscription.autoRenew = !subscription.cancel_at_period_end;
      }
    }

    // ✅ Mark subscription as modified if we made changes
    if (user.subscription) {
      user.markModified("subscription");
    }

    await user.save();

    // ✅ Verify save for canceled/past_due status
    if (subscription.status === "canceled" || subscription.status === "past_due") {
      const savedUser = await User.findById(user._id);
      console.log(
        `✅ [SUBSCRIPTION UPDATED] Verified - isActive: ${savedUser?.subscription?.isActive}, status: ${
          savedUser?.subscription?.status
        }, endDate: ${savedUser?.subscription?.endDate?.toISOString() || "undefined"}`
      );
    }
  } catch (error) {
    console.error(`❌ [SUBSCRIPTION UPDATED] Error: ${error}`);
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
    // ✅ ALWAYS LOG: Use console.log for critical subscription events (not filtered)
    console.log(`🔄 [SUBSCRIPTION DELETED] Processing: ${subscription.id}`);
    webhookLog("info", `Processing subscription deleted: ${subscription.id}`);

    // Find user by customer ID
    let user;
    if (subscription.customer) {
      const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      user = await User.findOne({ stripeCustomerId: customerId });
      console.log(`🔍 [SUBSCRIPTION DELETED] Found user: ${user?.email || "NOT FOUND"} (customer: ${customerId})`);
    }

    if (!user) {
      console.error(`❌ [SUBSCRIPTION DELETED] User not found for subscription: ${subscription.id}`);
      webhookLog("error", `User not found for subscription: ${subscription.id}`);
      return;
    }

    console.log(
      `👤 [SUBSCRIPTION DELETED] User: ${user.email}, Current subscription ID: ${user.stripeSubscriptionId}, Deleted subscription ID: ${subscription.id}`
    );

    // ✅ BEST PRACTICE: Early return if not current subscription (check first)
    const isCurrentSubscription = user.stripeSubscriptionId === subscription.id;
    if (!isCurrentSubscription) {
      console.log(`⚠️ [SUBSCRIPTION DELETED] Ignoring - not user's current subscription`);
      webhookLog(
        "info",
        `Ignoring deletion of old subscription ${subscription.id} - not user's current subscription ${user.stripeSubscriptionId}`
      );
      return;
    }

    // ✅ BEST PRACTICE: Verify subscription cancellation state
    const isCanceled = user.subscription?.autoRenew === false;
    const hasEndDate = user.subscription?.endDate !== undefined;
    const periodHasEnded =
      hasEndDate && user.subscription?.endDate ? new Date(user.subscription.endDate) <= new Date() : false;

    // ✅ BEST PRACTICE: Check for relevant pending activity (only block if actually relevant)
    const pendingChange = user.subscription?.pendingChange;
    const hasRelevantPendingChange =
      pendingChange !== undefined && pendingChange.stripeSubscriptionId === subscription.id; // Only relevant if for THIS subscription

    // ✅ BEST PRACTICE: Check for recent upgrade activity (only block if very recent AND subscription still active)
    const lastUpgradeDate = user.subscription?.lastUpgradeDate;
    const upgradeAgeMs = lastUpgradeDate ? Date.now() - lastUpgradeDate.getTime() : Infinity;
    const upgradeAgeSeconds = Math.floor(upgradeAgeMs / 1000);
    const hasRecentUpgrade =
      lastUpgradeDate !== undefined &&
      upgradeAgeMs < 60000 && // Within 1 minute
      !isCanceled; // Only block if subscription is still active (not canceled)

    // ✅ BEST PRACTICE: Comprehensive logging for debugging
    console.log(`🔍 [SUBSCRIPTION DELETED] State check:`, {
      isCurrentSubscription,
      isCanceled,
      periodHasEnded,
      hasRelevantPendingChange,
      hasRecentUpgrade,
      upgradeAgeSeconds: lastUpgradeDate ? upgradeAgeSeconds : "N/A",
      pendingChangeSubscriptionId: pendingChange?.stripeSubscriptionId,
      deletedSubscriptionId: subscription.id,
    });

    // ✅ BEST PRACTICE: Decision logic with period end override
    // CRITICAL: If subscription is canceled and period has ended, ALWAYS process deletion
    // This is the primary use case - user canceled, period ended, subscription should be deactivated
    if (isCanceled && periodHasEnded) {
      console.log(`✅ [SUBSCRIPTION DELETED] Subscription canceled and period ended - proceeding with deletion`);
      // Continue to deletion processing below
    }
    // ✅ PROTECTION: Block only if there's actual conflicting activity AND subscription is not canceled
    else if (hasRelevantPendingChange || hasRecentUpgrade) {
      console.log(`⚠️ [SUBSCRIPTION DELETED] Skipping - conflicting activity detected`, {
        reason: hasRelevantPendingChange ? "pending_change_for_this_subscription" : "recent_upgrade_within_60s",
        hasRelevantPendingChange,
        hasRecentUpgrade,
        upgradeAgeSeconds: lastUpgradeDate ? upgradeAgeSeconds : "N/A",
      });
      webhookLog(
        "info",
        `Skipping deletion of ${subscription.id} - user has pending changes or recent upgrade activity`
      );
      return;
    }
    // ✅ DEFAULT: If no conflicts and subscription is current, process deletion
    else {
      console.log(`✅ [SUBSCRIPTION DELETED] No conflicts detected - proceeding with deletion`);
    }

    console.log(`✅ [SUBSCRIPTION DELETED] Processing deletion for user ${user.email}`);

    // ✅ Set endDate consistently - use subscription period end or current date
    const subscriptionWithPeriod = subscription as Stripe.Subscription & { current_period_end?: number };
    const endDate = subscriptionWithPeriod.current_period_end
      ? new Date(subscriptionWithPeriod.current_period_end * 1000)
      : new Date(); // Fallback to now

    // Only deactivate if this is genuinely the user's current subscription
    if (user.subscription) {
      // ✅ PRESERVE: lastMonthAccumulatedEntries is preserved when subscription ends
      // This allows resubscribe to continue from where user left off
      // The field is NOT cleared - it persists for resubscribe continuation
      const preservedAccumulatedEntries = user.subscription.lastMonthAccumulatedEntries;

      user.subscription.isActive = false;
      user.subscription.status = "canceled";
      user.subscription.autoRenew = false;
      user.subscription.endDate = endDate; // ✅ Set endDate consistently

      // Explicitly preserve lastMonthAccumulatedEntries
      if (preservedAccumulatedEntries !== undefined) {
        user.subscription.lastMonthAccumulatedEntries = preservedAccumulatedEntries;
        console.log(`✅ [SUBSCRIPTION DELETED] Preserved lastMonthAccumulatedEntries: ${preservedAccumulatedEntries}`);
        webhookLog(
          "info",
          `✅ Preserved lastMonthAccumulatedEntries: ${preservedAccumulatedEntries} for user ${user.email} (subscription ended at period end)`
        );
      }
    }

    // Clear subscription ID only if this was the user's current subscription
    user.stripeSubscriptionId = undefined;

    // Update partner discount queue - subscription has ended
    console.log(`🎁 [SUBSCRIPTION DELETED] Ending subscription in partner discount queue`);
    webhookLog("info", `Ending subscription in partner discount queue for user ${user.email}`);
    await handleSubscriptionQueueUpdate(user as unknown as import("@/models/User").IUser, "end");

    // ✅ Save with verification to ensure cancellation actually persisted
    const saveSuccess = await saveUserWithVerification(
      user,
      { isActive: false, status: "canceled", stripeSubscriptionId: undefined },
      0
    );

    if (!saveSuccess) {
      console.error(`❌ [SUBSCRIPTION DELETED] Save verification failed for ${user.email} - retrying...`);
      // Retry once more
      if (user.subscription) {
        user.subscription.isActive = false;
        user.subscription.status = "canceled";
        user.subscription.endDate = endDate;
        user.markModified("subscription");
      }
      user.stripeSubscriptionId = undefined;
      await user.save();
    }

    // ✅ Verify final state
    const savedUser = await User.findById(user._id);
    console.log(
      `✅ [SUBSCRIPTION DELETED] Final state - isActive: ${savedUser?.subscription?.isActive}, status: ${
        savedUser?.subscription?.status
      }, stripeSubscriptionId: ${savedUser?.stripeSubscriptionId || "undefined"}, endDate: ${
        savedUser?.subscription?.endDate?.toISOString() || "undefined"
      }`
    );

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
    console.error(`❌ [SUBSCRIPTION DELETED] Error: ${error}`);
    webhookLog("error", `Error handling subscription deleted: ${error}`);
  }
}

/**
 * Handle invoice payment failure - Canonical event for subscription payment failures
 * 
 * ✅ BEST PRACTICES:
 * 1. This is the canonical event for subscription payment failures (both initial and renewals)
 * 2. For renewals (billing_reason: subscription_cycle), use "Subscription Renewal Failed" event
 * 3. For initial payments (billing_reason: subscription_create), use "Subscription Payment Failed" event
 * 4. Robustly retrieve subscriptionId from multiple sources (invoice, expanded invoice, user record)
 * 5. All Klaviyo tracking is wrapped in try-catch to prevent webhook failures
 */
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

    // Get subscription details - try multiple methods to get subscription ID
    let subscriptionId: string | undefined;
    
    // Method 1: Try from invoice object (may be string or Subscription object)
    const invoiceSubscription = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription }).subscription;
    if (invoiceSubscription) {
      subscriptionId = typeof invoiceSubscription === "string" ? invoiceSubscription : invoiceSubscription.id;
    }
    
    // Method 2: If not found, retrieve invoice from Stripe with expansions
    if (!subscriptionId && invoice.id) {
      try {
        const expandedInvoice = await stripe.invoices.retrieve(invoice.id, {
          expand: ["subscription"],
        });
        const expandedSubscription = (expandedInvoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription }).subscription;
        if (expandedSubscription) {
          subscriptionId = typeof expandedSubscription === "string" ? expandedSubscription : expandedSubscription.id;
        }
      } catch (error) {
        webhookLog("warn", `Could not retrieve expanded invoice: ${error}`);
      }
    }
    
    // Method 3: Fallback to user's stored subscription ID
    if (!subscriptionId && user.stripeSubscriptionId) {
      subscriptionId = user.stripeSubscriptionId;
      webhookLog("info", `Using subscription ID from user record: ${subscriptionId}`);
    }
    
    const billingReason = invoice.billing_reason;
    const isInitialPayment = billingReason === "subscription_create";
    const isRenewal = billingReason === "subscription_cycle";
    
    webhookLog("info", `Invoice billing_reason: ${billingReason}, isRenewal: ${isRenewal}, isInitialPayment: ${isInitialPayment}, subscriptionId: ${subscriptionId || 'none'}`);

    if (subscriptionId) {
      // Update subscription status to reflect payment failure
      if (user.subscription) {
        user.subscription.status = "past_due";
        user.subscription.isActive = false;

        // ✅ If subscription will be canceled after max retries, set endDate
        // Retrieve subscription from Stripe to check cancel_at_period_end
        try {
          const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
          const subscriptionWithPeriod = stripeSubscription as Stripe.Subscription & { current_period_end?: number };
          if (stripeSubscription.cancel_at_period_end && subscriptionWithPeriod.current_period_end) {
            const endDate = new Date(subscriptionWithPeriod.current_period_end * 1000);
            user.subscription.endDate = endDate;
            console.log(
              `📅 [INVOICE PAYMENT FAILED] Set endDate to ${endDate.toISOString()} for subscription that will be canceled`
            );
          }
        } catch (stripeError) {
          console.error(`❌ [INVOICE PAYMENT FAILED] Error retrieving subscription: ${stripeError}`);
          // Continue without endDate if we can't retrieve subscription
        }

        // ✅ CRITICAL FIX: Mark subscription as modified so Mongoose detects the changes
        user.markModified("subscription");
      }
    }

    await user.save();

    // ✅ Verify save for payment failures
    if (subscriptionId && user.subscription) {
      const savedUser = await User.findById(user._id);
      console.log(
        `✅ [INVOICE PAYMENT FAILED] Verified - isActive: ${savedUser?.subscription?.isActive}, status: ${savedUser?.subscription?.status}`
      );
    }

    // Track failure in Klaviyo (for both initial and renewal failures)
    webhookLog("info", `Checking Klaviyo tracking conditions: hasSubscription: ${!!user.subscription}, subscriptionId: ${subscriptionId || 'none'}`);
    if (user.subscription && subscriptionId) {
      // Extract payment intent ID from invoice
      // ✅ BEST PRACTICE: Try multiple methods to get payment_intent ID
      const invoiceWithPaymentIntent = invoice as Stripe.Invoice & { 
        payment_intent?: string | Stripe.PaymentIntent;
        latest_payment_intent?: string | Stripe.PaymentIntent;
        charges?: Stripe.ApiList<Stripe.Charge>;
      };
      let paymentIntentId: string = "unknown";
      
      // Method 1: Try invoice.payment_intent (direct or expanded)
      if (invoiceWithPaymentIntent.payment_intent) {
        paymentIntentId = typeof invoiceWithPaymentIntent.payment_intent === "string"
          ? invoiceWithPaymentIntent.payment_intent
          : invoiceWithPaymentIntent.payment_intent?.id || "unknown";
        if (paymentIntentId !== "unknown") {
          webhookLog("info", `PaymentIntent ID from invoice.payment_intent: ${paymentIntentId}`);
        }
      }
      
      // Method 2: Try invoice.latest_payment_intent (if Method 1 didn't work)
      if (paymentIntentId === "unknown" && invoiceWithPaymentIntent.latest_payment_intent) {
        paymentIntentId = typeof invoiceWithPaymentIntent.latest_payment_intent === "string"
          ? invoiceWithPaymentIntent.latest_payment_intent
          : invoiceWithPaymentIntent.latest_payment_intent?.id || "unknown";
        if (paymentIntentId !== "unknown") {
          webhookLog("info", `PaymentIntent ID from invoice.latest_payment_intent: ${paymentIntentId}`);
        }
      }
      
      // Method 3: Try invoice.charges.data[0].payment_intent (from charges array)
      if (paymentIntentId === "unknown" && invoiceWithPaymentIntent.charges?.data?.[0]) {
        const charge = invoiceWithPaymentIntent.charges.data[0];
        const chargeWithPaymentIntent = charge as Stripe.Charge & { payment_intent?: string | Stripe.PaymentIntent };
        if (chargeWithPaymentIntent.payment_intent) {
          paymentIntentId = typeof chargeWithPaymentIntent.payment_intent === "string"
            ? chargeWithPaymentIntent.payment_intent
            : chargeWithPaymentIntent.payment_intent?.id || "unknown";
          if (paymentIntentId !== "unknown") {
            webhookLog("info", `PaymentIntent ID from invoice.charges.data[0].payment_intent: ${paymentIntentId}`);
          }
        }
      }
      
      // Method 4: Retrieve expanded invoice with charges.data.payment_intent expansion (if still unknown)
      if (paymentIntentId === "unknown" && invoice.id) {
        try {
          const expandedInvoice = await stripe.invoices.retrieve(invoice.id, {
            expand: ["payment_intent", "latest_payment_intent", "charges.data.payment_intent"],
          });
          const expandedInvoiceTyped = expandedInvoice as Stripe.Invoice & { 
            payment_intent?: string | Stripe.PaymentIntent;
            latest_payment_intent?: string | Stripe.PaymentIntent;
            charges?: Stripe.ApiList<Stripe.Charge>;
          };
          
          // Try payment_intent from expanded invoice
          if (expandedInvoiceTyped.payment_intent) {
            paymentIntentId = typeof expandedInvoiceTyped.payment_intent === "string"
              ? expandedInvoiceTyped.payment_intent
              : expandedInvoiceTyped.payment_intent?.id || "unknown";
            if (paymentIntentId !== "unknown") {
              webhookLog("info", `PaymentIntent ID from expanded invoice.payment_intent: ${paymentIntentId}`);
            }
          }
          
          // Try latest_payment_intent from expanded invoice
          if (paymentIntentId === "unknown" && expandedInvoiceTyped.latest_payment_intent) {
            paymentIntentId = typeof expandedInvoiceTyped.latest_payment_intent === "string"
              ? expandedInvoiceTyped.latest_payment_intent
              : expandedInvoiceTyped.latest_payment_intent?.id || "unknown";
            if (paymentIntentId !== "unknown") {
              webhookLog("info", `PaymentIntent ID from expanded invoice.latest_payment_intent: ${paymentIntentId}`);
            }
          }
          
          // Try charges from expanded invoice
          if (paymentIntentId === "unknown" && expandedInvoiceTyped.charges?.data?.[0]) {
            const charge = expandedInvoiceTyped.charges.data[0];
            const chargeWithPaymentIntent = charge as Stripe.Charge & { payment_intent?: string | Stripe.PaymentIntent };
            if (chargeWithPaymentIntent.payment_intent) {
              paymentIntentId = typeof chargeWithPaymentIntent.payment_intent === "string"
                ? chargeWithPaymentIntent.payment_intent
                : chargeWithPaymentIntent.payment_intent?.id || "unknown";
              if (paymentIntentId !== "unknown") {
                webhookLog("info", `PaymentIntent ID from expanded invoice.charges.data[0].payment_intent: ${paymentIntentId}`);
              }
            }
          }
        } catch (expandError) {
          webhookLog("warn", `Could not retrieve expanded invoice for payment_intent: ${expandError}`);
        }
      }
      
      // Method 5: Try to get from subscription's latest invoice (for subscription renewals)
      if (paymentIntentId === "unknown" && subscriptionId) {
        try {
          const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId, {
            expand: ["latest_invoice.payment_intent", "latest_invoice.latest_payment_intent"],
          });
          
          const latestInvoice = stripeSubscription.latest_invoice;
          if (latestInvoice && typeof latestInvoice !== "string") {
            const latestInvoiceTyped = latestInvoice as Stripe.Invoice & {
              payment_intent?: string | Stripe.PaymentIntent;
              latest_payment_intent?: string | Stripe.PaymentIntent;
            };
            
            // Try payment_intent from latest invoice
            if (latestInvoiceTyped.payment_intent) {
              paymentIntentId = typeof latestInvoiceTyped.payment_intent === "string"
                ? latestInvoiceTyped.payment_intent
                : latestInvoiceTyped.payment_intent.id || "unknown";
              if (paymentIntentId !== "unknown") {
                webhookLog("info", `PaymentIntent ID from subscription's latest invoice.payment_intent: ${paymentIntentId}`);
              }
            }
            
            // Try latest_payment_intent from latest invoice
            if (paymentIntentId === "unknown" && latestInvoiceTyped.latest_payment_intent) {
              paymentIntentId = typeof latestInvoiceTyped.latest_payment_intent === "string"
                ? latestInvoiceTyped.latest_payment_intent
                : latestInvoiceTyped.latest_payment_intent.id || "unknown";
              if (paymentIntentId !== "unknown") {
                webhookLog("info", `PaymentIntent ID from subscription's latest invoice.latest_payment_intent: ${paymentIntentId}`);
              }
            }
          }
        } catch (subError) {
          webhookLog("warn", `Could not retrieve PaymentIntent from subscription's latest invoice: ${subError}`);
        }
      }
      
      if (paymentIntentId === "unknown") {
        webhookLog("warn", `Could not find PaymentIntent ID after checking all methods for invoice ${invoice.id}`);
      }

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

      // Get package name properly (not hardcoded)
      let packageName = "Subscription";
      try {
        const packageData = await getPackageById(packageId);
        if (packageData) {
          packageName = packageData.name || packageName;
        }
      } catch (error) {
        webhookLog("warn", `Could not fetch package name for ${packageId}, using default`);
      }

      const amount = (invoice.amount_due || 0) / 100; // Convert cents to dollars
      
      // ✅ BEST PRACTICE: Extract failure details from PaymentIntent (align with handlePaymentFailure pattern)
      // Priority: PaymentIntent error > Invoice error > Charge error > "Payment declined"
      let failureReason = "Payment declined";
      let failureCode = "";
      let declineCode = "";
      
      // First, try to get error details from PaymentIntent (most reliable source)
      try {
        if (paymentIntentId && paymentIntentId !== "unknown" && paymentIntentId !== invoice.id) {
          webhookLog("info", `Attempting to retrieve PaymentIntent ${paymentIntentId} for error details...`);
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
          
          const lastPaymentError = paymentIntent.last_payment_error;
          if (lastPaymentError) {
            // Prioritize PaymentIntent error message (most specific)
            failureReason = lastPaymentError.message || invoice.last_finalization_error?.message || "Payment declined";
            failureCode = lastPaymentError.code || invoice.last_finalization_error?.code || "";
            declineCode = lastPaymentError.decline_code || "";
            
            webhookLog("info", `PaymentIntent error details - code: ${failureCode || 'none'}, decline_code: ${declineCode || 'none'}, message: ${failureReason}`);
          } else {
            // Fallback to invoice error if PaymentIntent has no error
            failureReason = invoice.last_finalization_error?.message || "Payment declined";
            failureCode = invoice.last_finalization_error?.code || "";
            webhookLog("info", `PaymentIntent has no error, using invoice error: ${failureReason}`);
          }
        } else {
          // ✅ FIX: Extract error details from invoice even when paymentIntentId is unknown
          const invoiceError = invoice.last_finalization_error;
          if (invoiceError) {
            failureReason = invoiceError.message || "Payment declined";
            failureCode = invoiceError.code || "";
            webhookLog("info", `Using invoice error details - code: ${failureCode || 'none'}, message: ${failureReason}`);
            
            // ✅ FIX: Try to get decline_code from invoice's charge if available
            try {
              const invoiceWithCharges = invoice as Stripe.Invoice & {
                charge?: string | Stripe.Charge;
                charges?: Stripe.ApiList<Stripe.Charge>;
              };
              
              let charge: Stripe.Charge | null = null;
              if (invoiceWithCharges.charge) {
                const chargeId = typeof invoiceWithCharges.charge === "string" 
                  ? invoiceWithCharges.charge 
                  : invoiceWithCharges.charge.id;
                charge = await stripe.charges.retrieve(chargeId);
              } else if (invoiceWithCharges.charges?.data?.[0]) {
                charge = invoiceWithCharges.charges.data[0];
              }
              
              const chargeOutcome = charge?.outcome as Stripe.Charge.Outcome & { decline_code?: string };
              if (chargeOutcome?.decline_code) {
                declineCode = chargeOutcome.decline_code;
                webhookLog("info", `Found decline_code from charge: ${declineCode}`);
              }
            } catch (chargeError) {
              webhookLog("warn", `Could not retrieve charge for decline_code: ${chargeError}`);
            }
          } else {
            // If invoice has no error, try to get from subscription's latest invoice attempt
            webhookLog("warn", `Invoice has no last_finalization_error, paymentIntentId: ${paymentIntentId}, invoice.id: ${invoice.id}`);
            
            // ✅ FIX: Try to get PaymentIntent from subscription's latest invoice attempt
            if (subscriptionId) {
              try {
                const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId, {
                  expand: ["latest_invoice.payment_intent"],
                });
                
                const latestInvoice = stripeSubscription.latest_invoice;
                if (latestInvoice && typeof latestInvoice !== "string") {
                  const latestInvoiceTyped = latestInvoice as Stripe.Invoice & {
                    payment_intent?: string | Stripe.PaymentIntent;
                  };
                  
                  if (latestInvoiceTyped.payment_intent) {
                    const latestPaymentIntentId = typeof latestInvoiceTyped.payment_intent === "string"
                      ? latestInvoiceTyped.payment_intent
                      : latestInvoiceTyped.payment_intent.id;
                    
                    if (latestPaymentIntentId && latestPaymentIntentId !== "unknown") {
                      webhookLog("info", `Found PaymentIntent from subscription's latest invoice: ${latestPaymentIntentId}`);
                      const paymentIntent = await stripe.paymentIntents.retrieve(latestPaymentIntentId);
                      
                      const lastPaymentError = paymentIntent.last_payment_error;
                      if (lastPaymentError) {
                        failureReason = lastPaymentError.message || "Payment declined";
                        failureCode = lastPaymentError.code || "";
                        declineCode = lastPaymentError.decline_code || "";
                        webhookLog("info", `PaymentIntent error details from latest invoice - code: ${failureCode || 'none'}, decline_code: ${declineCode || 'none'}, message: ${failureReason}`);
                      }
                    }
                  }
                }
              } catch (subError) {
                webhookLog("warn", `Could not retrieve PaymentIntent from subscription's latest invoice: ${subError}`);
              }
            }
          }
        }
      } catch (error) {
        // Fallback to invoice error if PaymentIntent retrieval fails
        const invoiceError = invoice.last_finalization_error;
        failureReason = invoiceError?.message || "Payment declined";
        failureCode = invoiceError?.code || "";
        webhookLog("error", `Could not retrieve payment intent ${paymentIntentId} for error details: ${error}, using invoice error`);
      }

      // Create combined failure_message as code:decline_code format (e.g., "card_declined:insufficient_funds")
      const failureMessage = failureCode && declineCode 
        ? `${failureCode}:${declineCode}` 
        : failureCode || declineCode || "";
      
      // Log extracted error details for debugging
      webhookLog("info", `Extracted error details - failureReason: ${failureReason}, failureCode: ${failureCode || 'none'}, declineCode: ${declineCode || 'none'}, failureMessage: ${failureMessage || 'none'}`);

      webhookLog("info", `About to check renewal status. isRenewal: ${isRenewal}, packageId: ${packageId}, packageName: ${packageName}, amount: ${amount}`);
      
      // Extract next_payment_attempt from invoice with validation
      let nextPaymentAttempt: number | null = null;
      
      // Primary source: invoice.next_payment_attempt (Unix timestamp)
      if (invoice.next_payment_attempt) {
        nextPaymentAttempt = invoice.next_payment_attempt;
        webhookLog("info", `Next payment attempt from invoice: ${new Date(nextPaymentAttempt * 1000).toISOString()}`);
      } else {
        // ✅ FIX: If invoice doesn't have next_payment_attempt, check subscription's latest invoice
        if (subscriptionId) {
          try {
            const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId, {
              expand: ["latest_invoice"],
            });
            
            const latestInvoice = stripeSubscription.latest_invoice;
            if (latestInvoice && typeof latestInvoice !== "string" && latestInvoice.next_payment_attempt) {
              nextPaymentAttempt = latestInvoice.next_payment_attempt;
              webhookLog("info", `Next payment attempt from subscription's latest invoice: ${new Date(nextPaymentAttempt * 1000).toISOString()}`);
            } else {
              webhookLog("info", `No next payment attempt found - retries may be exhausted or subscription will be canceled`);
            }
          } catch (subError) {
            webhookLog("warn", `Could not retrieve subscription for next_payment_attempt: ${subError}`);
          }
        }
        
        // If still null, log that retries are exhausted
        if (nextPaymentAttempt === null) {
          webhookLog("info", `No next payment attempt scheduled - retries exhausted or subscription will be canceled`);
        }
      }
      
      if (isRenewal) {
        // ✅ BEST PRACTICE: Use renewal-specific event for subscription renewals
        // This is the canonical event for renewal failures (invoice.payment_failed with billing_reason: subscription_cycle)
        
        // Calculate expected entries for renewal (lastMonthAccumulatedEntries + baseEntries)
        let expectedEntries: number | undefined = undefined;
        try {
          const packageData = await getPackageById(packageId);
          if (packageData && packageData.entriesPerMonth !== undefined) {
            const baseEntries = packageData.entriesPerMonth;
            const lastMonthAccumulatedEntries = user.subscription?.lastMonthAccumulatedEntries || baseEntries;
            expectedEntries = lastMonthAccumulatedEntries + baseEntries;
            webhookLog("info", `Calculated expected entries for renewal: ${lastMonthAccumulatedEntries} + ${baseEntries} = ${expectedEntries}`);
          } else {
            webhookLog("warn", `Could not get baseEntries from package ${packageId} for entries calculation`);
          }
        } catch (error) {
          webhookLog("warn", `Error calculating expected entries: ${error}`);
        }
        
        try {
          const renewalFailedEvent = createSubscriptionRenewalFailedEvent(user as never, {
            packageId: packageId,
            packageName: packageName,
            tier,
            failureReason,
            failureCode,
            failureMessage,
            amount,
            paymentIntentId: paymentIntentId,
            entries: expectedEntries,
            nextPaymentAttempt: nextPaymentAttempt,
          });
          webhookLog("info", `📧 Tracking "Subscription Renewal Failed" event (canonical) to Klaviyo for user ${user.email} (${user._id})`);
          klaviyo.trackEventBackground(renewalFailedEvent);
          webhookLog("info", `✅ "Subscription Renewal Failed" event queued for Klaviyo: ${renewalFailedEvent.event} - Payment ID: ${paymentIntentId}`);
        } catch (klaviyoError) {
          webhookLog("error", `❌ Failed to track "Subscription Renewal Failed" event to Klaviyo for user ${user.email}: ${klaviyoError}`);
          // Don't throw - Klaviyo tracking failure shouldn't break webhook processing
        }
      } else if (isInitialPayment) {
        // ✅ BEST PRACTICE: Use subscription payment failed event for initial subscription payments
        try {
          webhookLog("info", `📧 Tracking "Subscription Payment Failed" (initial) event to Klaviyo for user ${user.email}`);
          klaviyo.trackEventBackground(
            createSubscriptionPaymentFailedEvent(user as never, {
              paymentIntentId: paymentIntentId,
              packageId: packageId,
              packageName: packageName,
              tier,
              amount,
              failureReason,
              failureCode,
              failureMessage,
              isInitialPayment: true,
            })
          );
          webhookLog("info", `✅ "Subscription Payment Failed" (initial) event queued for Klaviyo - Payment ID: ${paymentIntentId}`);
        } catch (klaviyoError) {
          webhookLog("error", `❌ Failed to track "Subscription Payment Failed" (initial) event to Klaviyo for user ${user.email}: ${klaviyoError}`);
          // Don't throw - Klaviyo tracking failure shouldn't break webhook processing
        }
      } else {
        // ✅ BEST PRACTICE: Fallback for other billing reasons (subscription_update, etc.)
        // Use subscription payment failed event with isInitialPayment: false
        try {
          webhookLog("info", `📧 Tracking "Subscription Payment Failed" (billing_reason: ${billingReason}) event to Klaviyo for user ${user.email}`);
          klaviyo.trackEventBackground(
            createSubscriptionPaymentFailedEvent(user as never, {
              paymentIntentId: paymentIntentId,
              packageId: packageId,
              packageName: packageName,
              tier,
              amount,
              failureReason,
              failureCode,
              failureMessage,
              isInitialPayment: false,
            })
          );
          webhookLog("info", `✅ "Subscription Payment Failed" event queued for Klaviyo - Payment ID: ${paymentIntentId}`);
        } catch (klaviyoError) {
          webhookLog("error", `❌ Failed to track "Subscription Payment Failed" event to Klaviyo for user ${user.email}: ${klaviyoError}`);
          // Don't throw - Klaviyo tracking failure shouldn't break webhook processing
        }
      }
    }

    // Update Klaviyo profile to reflect failed payment status
    ensureUserProfileSynced(user);

    // Track payment failure to Facebook Pixel (server-side)
    // ✅ BEST PRACTICE: Use improved error extraction (same as Klaviyo event)
    try {
      // Get payment intent ID (simplified version for pixel tracking)
      const invoiceWithPaymentIntent = invoice as Stripe.Invoice & { payment_intent?: string | Stripe.PaymentIntent };
      let pixelPaymentIntentId: string = "unknown";
      
      if (invoiceWithPaymentIntent.payment_intent) {
        pixelPaymentIntentId = typeof invoiceWithPaymentIntent.payment_intent === "string"
          ? invoiceWithPaymentIntent.payment_intent
          : invoiceWithPaymentIntent.payment_intent?.id || "unknown";
      }
      
      if (pixelPaymentIntentId === "unknown") {
        pixelPaymentIntentId = invoice.id || "unknown";
      }

      const amount = (invoice.amount_due || 0) / 100; // Convert cents to dollars
      const packageId = user.subscription?.packageId || "unknown";
      
      // ✅ BEST PRACTICE: Extract error details from PaymentIntent (same improved logic as Klaviyo event)
      let pixelFailureReason = invoice.last_finalization_error?.message || "Payment declined";
      let pixelFailureCode = invoice.last_finalization_error?.code || "";
      let pixelFailureMessage = "";
      
      // Try to get error details from PaymentIntent if available
      if (pixelPaymentIntentId && pixelPaymentIntentId !== "unknown" && pixelPaymentIntentId !== invoice.id) {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(pixelPaymentIntentId);
          const lastPaymentError = paymentIntent.last_payment_error;
          if (lastPaymentError) {
            pixelFailureReason = lastPaymentError.message || invoice.last_finalization_error?.message || "Payment declined";
            pixelFailureCode = lastPaymentError.code || invoice.last_finalization_error?.code || "";
            const declineCode = lastPaymentError.decline_code || "";
            pixelFailureMessage = pixelFailureCode && declineCode 
              ? `${pixelFailureCode}:${declineCode}` 
              : pixelFailureCode || declineCode || "";
          }
        } catch (error) {
          webhookLog("warn", `Could not retrieve PaymentIntent for Facebook Pixel error details: ${error}`);
        }
      }
      
      await trackPixelPaymentFailed({
        value: amount,
        currency: invoice.currency.toUpperCase() || "AUD",
        paymentIntentId: pixelPaymentIntentId,
        packageId,
        packageName: "Subscription",
        packageType: "membership",
        userId: user._id.toString(),
        userEmail: user.email,
        userPhone: user.mobile,
        userFirstName: user.firstName,
        userLastName: user.lastName,
        errorMessage: pixelFailureReason, // Use improved failureReason from PaymentIntent
        errorCode: pixelFailureCode, // Use improved failureCode from PaymentIntent
        failureReason: pixelFailureMessage || pixelFailureReason, // Use failureMessage (code:decline_code) or fallback to failureReason
      });
      webhookLog("info", `✅ Invoice payment failure tracked to Facebook Pixel with improved error details`);
    } catch (pixelError) {
      webhookLog("error", `Error tracking invoice payment failure to Facebook Pixel: ${pixelError}`);
      // Don't throw - pixel tracking should not break webhook processing
    }

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
    // ✅ Type guard: Invoice ID is always present in webhook events
    const invoiceId = invoice.id;
    if (!invoiceId) {
      webhookLog("error", `Invoice ID is missing`);
      return;
    }

    webhookLog("info", `🎯 INVOICE PAYMENT SUCCEEDED HANDLER CALLED for ${invoiceId}`);
    webhookLog("info", `Processing invoice.payment_succeeded for ${invoiceId}`);

    // ✅ CRITICAL: Retrieve invoice fresh from Stripe with expansions
    // Webhook events don't always include all fields expanded, so we need to retrieve it fresh
    // This ensures we have access to subscription, payment_intent, and charge fields
    const expandedInvoice = await stripe.invoices.retrieve(invoiceId, {
      expand: ["subscription", "payment_intent", "charge"],
    });

    // ✅ CRITICAL FIX: ATOMIC PaymentEvent creation to prevent race conditions
    // Create PaymentEvent FIRST using MongoDB unique constraint
    // If creation fails (duplicate key), another webhook is already processing
    const invoicePaymentId = `invoice_${expandedInvoice.id}`;
    const eventId = `BenefitsGranted-${invoicePaymentId}`;

    // ✅ DEBUG: Log invoice details for debugging
    webhookLog("info", `Invoice details:`, {
      invoiceId: expandedInvoice.id,
      customerId: expandedInvoice.customer,
      subscriptionId: (() => {
        const subscriptionField = (expandedInvoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription })
          .subscription;
        return typeof subscriptionField === "string"
          ? subscriptionField
          : (subscriptionField as Stripe.Subscription)?.id;
      })(),
      metadata: expandedInvoice.metadata,
    });

    // Ensure database connection
    await connectDB();

    // Find user by customer ID first
    let user;
    if (expandedInvoice.customer) {
      const customerId =
        typeof expandedInvoice.customer === "string" ? expandedInvoice.customer : expandedInvoice.customer.id;
      user = await User.findOne({ stripeCustomerId: customerId });
    } else {
      webhookLog("error", `No customer ID in invoice`);
      return;
    }

    if (!user) {
      webhookLog("warn", `User not found for customer: ${expandedInvoice.customer}`);
      return;
    }

    // ✅ PRORATION DETECTION: Check if this invoice contains proration items
    const hasProrationItems =
      expandedInvoice.lines?.data?.some((line) => {
        const lineItem = line as Stripe.InvoiceLineItem & { proration?: boolean };
        return lineItem.proration === true;
      }) || false;
    const isProrationInvoice =
      hasProrationItems ||
      expandedInvoice.billing_reason === "subscription_update" ||
      expandedInvoice.billing_reason === "subscription_cycle";

    webhookLog("info", `Invoice analysis:`, {
      billingReason: expandedInvoice.billing_reason,
      hasProrationItems,
      isProrationInvoice,
      lineItems: expandedInvoice.lines?.data?.length || 0,
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
      const invoiceWithPaymentIntent = expandedInvoice as Stripe.Invoice & {
        payment_intent?: string | Stripe.PaymentIntent;
      };
      if (expandedInvoice.billing_reason === "subscription_cycle" && invoiceWithPaymentIntent.payment_intent) {
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

    // ✅ DETECT RESUBSCRIBE SCENARIO
    // User is resubscribing if: subscription is not active, has lastMonthAccumulatedEntries, and this is a new subscription
    const isResubscribe =
      invoice.billing_reason === "subscription_create" &&
      !user.subscription?.isActive &&
      user.subscription?.lastMonthAccumulatedEntries !== undefined;

    // ✅ CONSOLE LOG: Resubscription detection
    if (isResubscribe) {
      console.log(`\n🔄 ========== RESUBSCRIPTION DETECTED ==========`);
      console.log(`📧 User: ${user.email}`);
      console.log(`📦 Package: ${membershipPackage.name} (${membershipPackage.entriesPerMonth} base entries/month)`);
      console.log(`💾 Preserved lastMonthAccumulatedEntries: ${user.subscription?.lastMonthAccumulatedEntries}`);
      console.log(`📊 Current accumulatedEntries: ${user.accumulatedEntries || 0}`);
    }

    // Check if this is an upgrade scenario by looking at subscription metadata
    // ✅ FIX: Only treat as upgrade for the actual upgrade payment, not renewals
    // Renewals after upgrade should use renewal calculation (lastMonthAccumulatedEntries + baseEntries)
    // not upgrade calculation (which only grants newBaseEntries)
    const isUpgrade = Boolean(
      subscription.metadata?.upgradeFrom &&
        subscription.metadata?.upgradeType === "no_proration" &&
        invoice.billing_reason !== "subscription_cycle" // ✅ CRITICAL: Renewals should NOT be treated as upgrades
    );

    // ✅ NEW: Calculate entries using accumulated entries system
    const baseEntries = membershipPackage.entriesPerMonth || 0;
    const pointsToGrant = Math.floor(membershipPackage.price);

    // Get promo multiplier for initial subscriptions, resubscribes, and upgrades
    let promoMultiplier = 1;
    if (expandedInvoice.billing_reason === "subscription_create" || isResubscribe || isUpgrade) {
      try {
        promoMultiplier = await getActivePromoMultiplier("membership");
      } catch (promoError) {
        webhookLog("error", `Failed to fetch promo multiplier: ${promoError}`);
        // Default to 1 if promo fetch fails
        promoMultiplier = 1;
      }
    }

    // ✅ CONSOLE LOG: Promo multiplier for resubscription
    if (isResubscribe) {
      console.log(`🎁 Active Promo Multiplier: ${promoMultiplier}x`);
      console.log(
        `📈 New promo entries to add: ${baseEntries} × ${promoMultiplier} = ${baseEntries * promoMultiplier}`
      );
    }

    // ✅ CONSOLE LOG: Promo multiplier for upgrade
    if (isUpgrade) {
      console.log(`🎁 Active Promo Multiplier: ${promoMultiplier}x`);
      console.log(`📈 Upgrade entries to add: ${baseEntries} × ${promoMultiplier} = ${baseEntries * promoMultiplier}`);
    }

    // Get current accumulated entries for upgrade calculation
    const currentAccumulatedEntries = user.accumulatedEntries || 0;

    // Calculate entries using the new system
    // ✅ NOTE: For downgrades, lastMonthAccumulatedEntries is preserved during downgrade
    // Renewals after downgrade will correctly use: lastMonthAccumulatedEntries + newBaseEntries
    // (e.g., if user had 500 accumulated, downgrades to package with 40 base, next renewal = 500 + 40 = 540)
    const entryCalculation = calculateSubscriptionEntries({
      billingReason: invoice.billing_reason as "subscription_create" | "subscription_cycle",
      baseEntries,
      lastMonthAccumulatedEntries: user.subscription?.lastMonthAccumulatedEntries,
      isResubscribe,
      promoMultiplier,
      isUpgrade,
      currentAccumulatedEntries,
    });

    const entriesToGrant = entryCalculation.entriesToGrant;
    const newLastMonthAccumulatedEntries = entryCalculation.newLastMonthAccumulatedEntries;

    // ✅ CONSOLE LOG: Calculation results for resubscription
    if (isResubscribe) {
      console.log(`\n📊 ========== RESUBSCRIPTION CALCULATION ==========`);
      console.log(`💾 Preserved entries: ${user.subscription?.lastMonthAccumulatedEntries}`);
      console.log(`➕ New promo entries: ${entriesToGrant} (${baseEntries} base × ${promoMultiplier}x promo)`);
      console.log(
        `🎯 Expected lastMonthAccumulatedEntries: ${newLastMonthAccumulatedEntries} (${user.subscription?.lastMonthAccumulatedEntries} + ${entriesToGrant})`
      );
      console.log(
        `📈 Expected accumulatedEntries: ${currentAccumulatedEntries} + ${entriesToGrant} = ${
          currentAccumulatedEntries + entriesToGrant
        }`
      );
    }

    webhookLog("info", `📊 Entry calculation:`, {
      calculationType: entryCalculation.calculationType,
      baseEntries,
      entriesToGrant,
      newLastMonthAccumulatedEntries,
      isResubscribe,
      isUpgrade,
      promoMultiplier:
        expandedInvoice.billing_reason === "subscription_create" || isResubscribe ? promoMultiplier : "N/A (renewal)",
      previousAccumulated: user.subscription?.lastMonthAccumulatedEntries,
    });

    if (isUpgrade) {
      webhookLog("info", `🎯 UPGRADE DETECTED: ${subscription.metadata.upgradeFromName} → ${membershipPackage.name}`);
      webhookLog("info", `Processing upgrade invoice - granting FULL benefits for new package (no proration)`);

      // ✅ CRITICAL: For upgrades with no proration, grant FULL benefits for the new package
      // The user gets full benefits for both packages since we're using proration_behavior: "none"
      webhookLog(
        "info",
        `🎯 UPGRADE: Granting full ${membershipPackage.name} benefits (${entriesToGrant} entries, ${pointsToGrant} points)`
      );
    } else if (expandedInvoice.billing_reason === "subscription_cycle") {
      webhookLog("info", `Processing renewal for package ${packageId} - granting full benefits`);
      // Grant full benefits for renewal
    } else if (expandedInvoice.billing_reason === "subscription_create") {
      webhookLog("info", `Processing new subscription for package ${packageId} - granting full benefits`);
      // Grant full benefits for new subscription
    } else {
      webhookLog(
        "warn",
        `Unknown billing reason ${expandedInvoice.billing_reason} for package ${packageId} - skipping benefits`
      );
      return; // Skip processing for unknown billing reasons
    }

    // ✅ Let processPaymentBenefits handle atomic PaymentEvent creation
    // It already has proper findOneAndUpdate logic
    webhookLog("info", `🔒 Processing payment with atomic PaymentEvent check: ${eventId}`);
    // ✅ CRITICAL: Use invoice.status_transitions.paid_at for actual payment time
    // This ensures entries route correctly during freeze period
    const paymentTimestamp = expandedInvoice.status_transitions?.paid_at || expandedInvoice.created;

    // Extract request context from invoice metadata (if available)
    // Note: For subscription renewals, original request context may not be available
    const requestContext = expandedInvoice.metadata
      ? extractRequestContextFromMetadata(expandedInvoice.metadata)
      : undefined;

    // ✅ CRITICAL: Retrieve promoLinkCode and affiliateCode from metadata
    // For subscriptions, check subscription metadata FIRST (most reliable)
    // Then fall back to payment_intent metadata
    let promoLinkCode: string | undefined;
    let affiliateCode: string | undefined;
    try {
      const invoiceTyped = expandedInvoice as Stripe.Invoice & {
        payment_intent?: string | Stripe.PaymentIntent;
        charge?: string | Stripe.Charge;
        subscription?: string | Stripe.Subscription;
      };

      // ✅ METHOD 1: Check subscription metadata FIRST (for subscription payments) - MOST RELIABLE
      // For subscriptions, metadata is set on the subscription object when created
      // We already have the subscription object from line 1796, so use it directly
      if (subscription?.metadata?.promoLinkCode) {
        promoLinkCode = subscription.metadata.promoLinkCode;
        affiliateCode = subscription.metadata.affiliateCode;
        if (promoLinkCode) {
          webhookLog("info", `✅ Retrieved promoLinkCode from subscription metadata: ${promoLinkCode}`);
        }
      }

      // Method 2: Check invoice payment_intent field (fallback for subscriptions, primary for one-time)
      if (!promoLinkCode && invoiceTyped.payment_intent) {
        const paymentIntentId =
          typeof invoiceTyped.payment_intent === "string"
            ? invoiceTyped.payment_intent
            : invoiceTyped.payment_intent.id;
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        promoLinkCode = paymentIntent.metadata.promoLinkCode;
        affiliateCode = paymentIntent.metadata.affiliateCode;
        if (promoLinkCode) {
          webhookLog("info", `✅ Retrieved promoLinkCode from invoice payment_intent: ${promoLinkCode}`);
        }
      }

      // Method 3: Check charge payment intent (for some payment methods)
      if (!promoLinkCode && invoiceTyped.charge && typeof invoiceTyped.charge === "string") {
        const charge = await stripe.charges.retrieve(invoiceTyped.charge);
        if (charge.payment_intent && typeof charge.payment_intent === "string") {
          const paymentIntent = await stripe.paymentIntents.retrieve(charge.payment_intent);
          promoLinkCode = paymentIntent.metadata.promoLinkCode;
          affiliateCode = paymentIntent.metadata.affiliateCode;
          if (promoLinkCode) {
            webhookLog("info", `✅ Retrieved promoLinkCode from charge payment_intent: ${promoLinkCode}`);
          }
        }
      }

      // Method 4: Check invoice metadata directly (final fallback)
      if (!promoLinkCode && expandedInvoice.metadata?.promoLinkCode) {
        promoLinkCode = expandedInvoice.metadata.promoLinkCode;
        affiliateCode = expandedInvoice.metadata.affiliateCode;
        if (promoLinkCode) {
          webhookLog("info", `✅ Retrieved promoLinkCode from invoice metadata: ${promoLinkCode}`);
        }
      }

      // Final check: If still no promoLinkCode, log warning for debugging
      if (!promoLinkCode) {
        webhookLog(
          "warn",
          `⚠️ No promoLinkCode found. Invoice ID: ${
            expandedInvoice.id
          }, Has subscription: ${!!invoiceTyped.subscription}, Has payment_intent: ${!!invoiceTyped.payment_intent}, Has charge: ${!!invoiceTyped.charge}, Subscription metadata: ${!!subscription
            ?.metadata?.promoLinkCode}`
        );
      }
    } catch (error) {
      webhookLog("warn", `Failed to retrieve payment intent for promo link code: ${error}`);
    }

    // ✅ DEBUG: Log billing_reason before passing to processPaymentBenefits
    webhookLog("info", `📊 Passing billing_reason to processPaymentBenefits:`, {
      invoiceId: expandedInvoice.id,
      billing_reason: expandedInvoice.billing_reason,
      billing_reason_type: typeof expandedInvoice.billing_reason,
      willPass: expandedInvoice.billing_reason || undefined,
      packageId: packageId,
      packageName: membershipPackage.name,
    });

    const result = await processPaymentBenefits(
      invoicePaymentId,
      user._id.toString(),
      {
        packageType: "membership",
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
        packageType: "membership",
        promoLinkCode: promoLinkCode || undefined, // Ensure undefined instead of empty string
        affiliateCode: affiliateCode || undefined,
      },
      requestContext, // Pass request context if available (may be undefined for renewals)
      expandedInvoice.billing_reason || undefined // ✅ Pass billing_reason for accurate renewal tracking (e.g., "subscription_create", "subscription_cycle")
    );

    if (result.success) {
      // ✅ CRITICAL: For resubscription, set accumulatedEntries to newLastMonthAccumulatedEntries
      // This ensures accumulated entries continue from where they left off, not double-counted
      // processPaymentBenefits increments accumulatedEntries, but for resubscription we need to SET it
      // because newLastMonthAccumulatedEntries already includes preserved entries + new promo entries
      if (isResubscribe) {
        try {
          const accumulatedBefore = user.accumulatedEntries || 0;
          const preservedEntries = newLastMonthAccumulatedEntries - entriesToGrant; // 400 (550 - 150)

          // Step 1: Add preserved entries to Major Draw manually
          if (preservedEntries > 0) {
            try {
              const { getTargetMajorDraw } = await import("@/utils/draws/major-draw-helpers");
              const majorDrawResult = await getTargetMajorDraw({
                created: Math.floor(paymentTimestamp * 1000),
                type: "subscription",
                packageType: "membership",
              });

              if (majorDrawResult) {
                const freshUserForDraw = await User.findById(user._id);
                if (freshUserForDraw) {
                  const now = new Date();
                  const entriesBySource = {
                    membership: preservedEntries,
                    "one-time-package": 0,
                    upsell: 0,
                    "mini-draw": 0,
                  };

                  const existingUserEntry = majorDrawResult.entries.find(
                    (entry: { userId: { toString(): string } }) =>
                      entry.userId.toString() === freshUserForDraw._id.toString()
                  );

                  if (existingUserEntry) {
                    // Update existing entry
                    await MajorDraw.updateOne(
                      {
                        _id: majorDrawResult._id,
                        "entries.userId": freshUserForDraw._id,
                      },
                      {
                        $inc: {
                          "entries.$.totalEntries": preservedEntries,
                          "entries.$.entriesBySource.membership": preservedEntries,
                        },
                        $set: {
                          "entries.$.lastUpdatedDate": now,
                        },
                      }
                    );
                  } else {
                    // Create new entry
                    const newEntry = {
                      userId: new mongoose.Types.ObjectId(freshUserForDraw._id.toString()),
                      totalEntries: preservedEntries,
                      entriesBySource,
                      firstAddedDate: now,
                      lastUpdatedDate: now,
                    };
                    await MajorDraw.updateOne({ _id: majorDrawResult._id }, { $push: { entries: newEntry } });
                  }

                  // Update totalEntries
                  const updatedMajorDraw = await MajorDraw.findById(majorDrawResult._id);
                  if (updatedMajorDraw) {
                    const totalEntries =
                      updatedMajorDraw.entries.reduce(
                        (sum: number, entry: { totalEntries: number }) => sum + entry.totalEntries,
                        0
                      ) || 0;
                    if (totalEntries !== updatedMajorDraw.totalEntries) {
                      await MajorDraw.updateOne({ _id: majorDrawResult._id }, { $set: { totalEntries } });
                    }
                  }

                  console.log(`🎯 [RESUBSCRIBE] Added ${preservedEntries} preserved entries to Major Draw`);
                  webhookLog("info", `Added ${preservedEntries} preserved entries to Major Draw for resubscription`);
                }
              }
            } catch (majorDrawError) {
              console.error(`❌ [RESUBSCRIBE] Failed to add preserved entries to Major Draw: ${majorDrawError}`);
              webhookLog("error", `Failed to add preserved entries to Major Draw: ${majorDrawError}`);
            }
          }

          // Step 2: Update lastMonthAccumulatedEntries with markModified
          const userToUpdate = await User.findById(user._id);
          if (userToUpdate && userToUpdate.subscription) {
            userToUpdate.subscription.lastMonthAccumulatedEntries = newLastMonthAccumulatedEntries;
            userToUpdate.markModified("subscription");
            await userToUpdate.save();
          } else {
            // Fallback to findByIdAndUpdate
            await User.findByIdAndUpdate(
              user._id,
              {
                $set: {
                  "subscription.lastMonthAccumulatedEntries": newLastMonthAccumulatedEntries,
                },
              },
              { new: false }
            );
          }

          // Step 3: Fetch ACTUAL user data and Major Draw entries
          const actualUser = await User.findById(user._id).lean();
          const { getTargetMajorDraw } = await import("@/utils/draws/major-draw-helpers");
          const majorDrawResult = await getTargetMajorDraw({
            created: Math.floor(paymentTimestamp * 1000),
            type: "subscription",
            packageType: "membership",
          });

          let actualMajorDrawEntries = 0;
          if (majorDrawResult) {
            const userEntry = majorDrawResult.entries?.find(
              (e: { userId: { toString(): string }; totalEntries?: number }) =>
                e.userId?.toString() === user._id.toString()
            );
            actualMajorDrawEntries = userEntry?.totalEntries || 0;
          }

          // Step 4: Comprehensive logging with ACTUAL values
          console.log(`\n✅ ========== RESUBSCRIPTION COMPLETED ==========`);
          console.log(`📧 User: ${user.email}`);
          console.log(`\n📊 EXPECTED VALUES:`);
          console.log(`   💾 lastMonthAccumulatedEntries: ${newLastMonthAccumulatedEntries}`);
          console.log(`   📈 accumulatedEntries: ${accumulatedBefore + entriesToGrant}`);
          console.log(`   🎯 Major Draw entries: ${newLastMonthAccumulatedEntries}`);
          console.log(`\n✅ ACTUAL VALUES (from database):`);
          console.log(
            `   💾 lastMonthAccumulatedEntries: ${actualUser?.subscription?.lastMonthAccumulatedEntries ?? "NOT SET"}`
          );
          console.log(`   📈 accumulatedEntries: ${actualUser?.accumulatedEntries ?? "NOT SET"}`);
          console.log(`   🎯 Major Draw entries: ${actualMajorDrawEntries}`);
          console.log(`\n🔍 VERIFICATION:`);
          const lastMonthMatch =
            actualUser?.subscription?.lastMonthAccumulatedEntries === newLastMonthAccumulatedEntries;
          const accumulatedMatch = actualUser?.accumulatedEntries === accumulatedBefore + entriesToGrant;
          const majorDrawMatch = actualMajorDrawEntries === newLastMonthAccumulatedEntries;
          console.log(
            `   ${lastMonthMatch ? "✅" : "❌"} lastMonthAccumulatedEntries: ${lastMonthMatch ? "MATCH" : "MISMATCH"}`
          );
          console.log(
            `   ${accumulatedMatch ? "✅" : "❌"} accumulatedEntries: ${accumulatedMatch ? "MATCH" : "MISMATCH"}`
          );
          console.log(
            `   ${majorDrawMatch ? "✅" : "❌"} Major Draw entries: ${majorDrawMatch ? "MATCH" : "MISMATCH"}`
          );
          console.log(`==========================================\n`);

          webhookLog(
            "info",
            `✅ Resubscribe: Updated lastMonthAccumulatedEntries to ${newLastMonthAccumulatedEntries} for user ${user.email}`
          );
        } catch (updateError) {
          console.error(`❌ [RESUBSCRIBE] Failed to update: ${updateError}`);
          webhookLog("error", `Failed to update for resubscribe: ${updateError}`);
        }
      } else {
        // For initial/renewal/upgrade, just update lastMonthAccumulatedEntries
        // accumulatedEntries is already correctly updated by processPaymentBenefits ($inc)
        try {
          await User.findByIdAndUpdate(
            user._id,
            {
              $set: {
                "subscription.lastMonthAccumulatedEntries": newLastMonthAccumulatedEntries,
              },
            },
            { new: false }
          );
          webhookLog(
            "info",
            `✅ Updated lastMonthAccumulatedEntries: ${newLastMonthAccumulatedEntries} for user ${user.email}`
          );
        } catch (updateError) {
          webhookLog("error", `Failed to update lastMonthAccumulatedEntries: ${updateError}`);
          // Don't throw - entry calculation is more critical than tracking field
        }
      }

      // ✅ Track in Klaviyo - Use appropriate event based on billing reason
      if (invoice.billing_reason === "subscription_cycle") {
        // Track "Subscription Renewed" event for renewals
        klaviyo.trackEventBackground(
          createSubscriptionRenewedEvent(user as never, {
            packageId,
            packageName: membershipPackage.name,
            tier: membershipPackage.name,
            price: membershipPackage.price,
            renewalType: "subscription_cycle",
            previousStatus: "active", // Regular renewal from active subscription
            paymentIntentId: invoicePaymentId,
            entriesGranted: entriesToGrant,
          })
        );
        webhookLog("info", `✅ Subscription Renewed event tracked to Klaviyo for: ${user.email}`);
      } else {
        // Track "Subscription Started" event for initial subscriptions
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
        webhookLog("info", `✅ Subscription Started event tracked to Klaviyo for: ${user.email}`);
      }

      // Track subscription renewal to Facebook Pixel (if this is a renewal)
      if (invoice.billing_reason === "subscription_cycle") {
        try {
          await trackPixelSubscriptionRenewal({
            value: membershipPackage.price,
            currency: invoice.currency.toUpperCase() || "AUD",
            subscriptionId: subscriptionId,
            invoiceId: invoice.id || `invoice_${Date.now()}`,
            packageId: packageId,
            packageName: membershipPackage.name,
            userId: user._id.toString(),
            userEmail: user.email,
            userPhone: user.mobile,
            userFirstName: user.firstName,
            userLastName: user.lastName,
            entriesPerMonth: entriesToGrant,
          });
          webhookLog("info", `✅ Subscription renewal tracked to Facebook Pixel for: ${user.email}`);
        } catch (pixelError) {
          webhookLog("error", `Error tracking subscription renewal to Facebook Pixel: ${pixelError}`);
          // Don't throw - pixel tracking should not break webhook processing
        }
      }

      // ✅ CRITICAL: Fetch fresh user data from database before syncing to Klaviyo
      // This ensures we have the latest subscription startDate and other updated fields
      // processPaymentBenefits modifies the user internally, so we need to refresh it
      // Wait a bit to ensure MongoDB has committed all changes (especially subscription startDate)
      await new Promise((resolve) => setTimeout(resolve, 500)); // 500ms buffer for database consistency
      
      const freshUserForKlaviyo = await User.findById(user._id);
      if (freshUserForKlaviyo) {
        // Update Klaviyo profile with fresh user data (includes updated subscription startDate)
        ensureUserProfileSynced(freshUserForKlaviyo);
        webhookLog("info", `✅ Klaviyo profile synced with fresh user data for: ${freshUserForKlaviyo.email}`);
      } else {
        // Fallback to original user if fresh fetch fails
        ensureUserProfileSynced(user);
        webhookLog("warn", `⚠️ Could not fetch fresh user data, synced with original user object`);
      }

      // ✅ CRITICAL: Process recurring membership commission (non-blocking)
      // Only process for subscription_cycle (recurring payments), not initial subscription_create
      if (invoice.billing_reason === "subscription_cycle") {
        try {
          const { processMembershipRecurringCommission } = await import("@/utils/affiliate/commission-processing");
          const invoiceAmount = invoice.amount_paid; // Already in cents
          const safeInvoiceId = invoice.id ?? invoice.number ?? `invoice_${invoice.created}`;

          await processMembershipRecurringCommission({
            userId: user._id.toString(),
            invoiceId: safeInvoiceId,
            subscriptionId: subscriptionId,
            purchaseAmount: invoiceAmount,
          });
          webhookLog("info", `✅ Recurring membership commission processed for affiliate`);
        } catch (commissionError) {
          webhookLog("error", `Affiliate recurring commission error (non-blocking): ${commissionError}`);
        }
      }

      // ✅ NEW: Add invoice event for upgrades
      if (isUpgrade) {
        try {
          const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

          klaviyo.trackEventBackground(
            createInvoiceGeneratedEvent(user, {
              invoiceId: `inv_${invoice.id}`,
              invoiceNumber,
              packageType: "membership",
              packageId: membershipPackage._id.toString(),
              packageName: membershipPackage.name,
              packageTier: membershipPackage.name,
              totalAmount: invoice.amount_paid / 100, // Convert from cents to dollars
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
                  unit_price: membershipPackage.price, // Already in dollars, don't multiply
                  total_price: invoice.amount_paid / 100, // Convert from cents to dollars
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
 * Resolves invoice ID from a refund webhook event
 * Tries multiple methods: charge invoice field → payment intent invoice → invoice search
 *
 * @param paymentIntentId - Payment intent ID from the refund event
 * @param charge - Optional charge object (from webhook or retrieved)
 * @param refund - Optional refund object (for refund.updated events)
 * @returns Invoice ID if found, undefined otherwise
 */
async function resolveInvoiceIdFromRefund(
  paymentIntentId: string,
  charge?: Stripe.Charge,
  refund?: Stripe.Refund
): Promise<string | undefined> {
  // Method 1: Try to get invoice from charge object if available
  if (charge) {
    const chargeWithInvoice = charge as Stripe.Charge & { invoice?: string | Stripe.Invoice };
    if (chargeWithInvoice.invoice) {
      const invoiceId =
        typeof chargeWithInvoice.invoice === "string" ? chargeWithInvoice.invoice : chargeWithInvoice.invoice.id;
      webhookLog("info", `✅ Found invoice ID from charge: ${invoiceId}`);
      return invoiceId;
    }
  }

  // Method 2: Retrieve payment intent and check invoice field
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const paymentIntentWithInvoice = paymentIntent as Stripe.PaymentIntent & {
      invoice?: string | Stripe.Invoice;
    };
    if (paymentIntentWithInvoice.invoice) {
      const invoiceId =
        typeof paymentIntentWithInvoice.invoice === "string"
          ? paymentIntentWithInvoice.invoice
          : paymentIntentWithInvoice.invoice.id;
      webhookLog("info", `✅ Found invoice ID from payment intent: ${invoiceId}`);
      return invoiceId;
    }
  } catch (piError) {
    webhookLog("warn", `Could not retrieve payment intent to get invoice: ${piError}`);
  }

  // Method 3: Search customer's invoices if we have customer info
  let customerId: string | undefined;
  if (charge?.customer) {
    customerId = typeof charge.customer === "string" ? charge.customer : charge.customer.id;
  } else if (refund?.charge) {
    try {
      const chargeId = typeof refund.charge === "string" ? refund.charge : refund.charge.id;
      const retrievedCharge = await stripe.charges.retrieve(chargeId);
      if (retrievedCharge.customer) {
        customerId =
          typeof retrievedCharge.customer === "string" ? retrievedCharge.customer : retrievedCharge.customer.id;
      }
    } catch (chargeError) {
      webhookLog("warn", `Could not retrieve charge to get customer: ${chargeError}`);
    }
  }

  if (customerId) {
    try {
      webhookLog("info", `Searching customer invoices to find invoice for payment: ${paymentIntentId}`);
      const invoices = await stripe.invoices.list({
        customer: customerId,
        limit: 20,
      });

      const matchingInvoice = invoices.data.find((inv) => {
        const invPaymentIntent = (
          inv as Stripe.Invoice & {
            payment_intent?: string | Stripe.PaymentIntent;
          }
        ).payment_intent;
        const invPaymentIntentId = typeof invPaymentIntent === "string" ? invPaymentIntent : invPaymentIntent?.id;
        return invPaymentIntentId === paymentIntentId;
      });

      if (matchingInvoice) {
        webhookLog("info", `✅ Found invoice by searching customer invoices: ${matchingInvoice.id}`);
        return matchingInvoice.id;
      }
    } catch (searchError) {
      webhookLog("warn", `Could not search invoices: ${searchError}`);
    }
  }

  webhookLog("info", `Could not resolve invoice ID for payment intent: ${paymentIntentId}`);
  return undefined;
}

/**
 * Handle charge refunded event (handles both one-time payments and subscription refunds)
 * Refunds are processed in Stripe Dashboard - we listen and sync database
 * Note: Stripe doesn't have an "invoice.refunded" event - invoice refunds also trigger charge.refunded
 */
async function handleChargeRefunded(charge: Stripe.Charge) {
  try {
    webhookLog("info", `Processing charge refunded: ${charge.id}`);

    // Find payment intent ID from charge
    const paymentIntentId =
      typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;

    if (!paymentIntentId) {
      webhookLog("error", `No payment intent found in charge: ${charge.id}`);
      return;
    }

    // Resolve invoice ID for subscription refunds (subscription payments use invoice_xxx format)
    const invoiceId = await resolveInvoiceIdFromRefund(paymentIntentId, charge);

    // Find user by customer ID
    let user;
    if (charge.customer) {
      const customerId = typeof charge.customer === "string" ? charge.customer : charge.customer.id;
      user = await User.findOne({ stripeCustomerId: customerId });
    }

    if (!user) {
      webhookLog("error", `User not found for charge refund: ${charge.id}`);
      return;
    }

    // Get refund amount
    const refundAmount = charge.amount_refunded || 0;
    const chargeAmount = charge.amount || 0;
    const isFullRefund = refundAmount >= chargeAmount;

    // Process refund reversal - pass invoice ID if available (for subscription refunds)
    const { processRefundReversal } = await import("@/utils/payment/refund-processing");
    const result = await processRefundReversal(
      paymentIntentId,
      user._id.toString(),
      refundAmount,
      isFullRefund,
      invoiceId
    );

    if (result.success) {
      webhookLog(
        "info",
        `✅ Refund reversal processed successfully for payment: ${paymentIntentId}${
          invoiceId ? ` (invoice: ${invoiceId})` : ""
        }`
      );
    } else {
      webhookLog("error", `❌ Refund reversal failed: ${result.error}`);
    }
  } catch (error) {
    webhookLog("error", `Error handling charge refunded: ${error}`);
  }
}

/**
 * Handle charge refund updated event (when refund status changes)
 */
async function handleChargeRefundUpdated(refund: Stripe.Refund) {
  try {
    webhookLog("info", `Processing charge refund updated: ${refund.id}, status: ${refund.status}`);

    // Only process if refund is now succeeded
    if (refund.status !== "succeeded") {
      webhookLog("info", `Refund ${refund.id} status is ${refund.status}, skipping`);
      return;
    }

    // Find payment intent ID from refund
    const paymentIntentId =
      typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;

    if (!paymentIntentId) {
      webhookLog("error", `No payment intent found in refund: ${refund.id}`);
      return;
    }

    // Retrieve the charge to get customer info
    if (!refund.charge) {
      webhookLog("error", `No charge found in refund: ${refund.id}`);
      return;
    }

    const chargeId = typeof refund.charge === "string" ? refund.charge : refund.charge.id;
    const charge = await stripe.charges.retrieve(chargeId);

    // Resolve invoice ID for subscription refunds (subscription payments use invoice_xxx format)
    const invoiceId = await resolveInvoiceIdFromRefund(paymentIntentId, charge, refund);

    // Find user by customer ID
    let user;
    if (charge.customer) {
      const customerId = typeof charge.customer === "string" ? charge.customer : charge.customer.id;
      user = await User.findOne({ stripeCustomerId: customerId });
    }

    if (!user) {
      webhookLog("error", `User not found for refund update: ${refund.id}`);
      return;
    }

    // Get refund amount
    const refundAmount = refund.amount || 0;
    const chargeAmount = charge.amount || 0;
    const isFullRefund = refundAmount >= chargeAmount;

    // Process refund reversal - pass invoice ID if available (for subscription refunds)
    const { processRefundReversal } = await import("@/utils/payment/refund-processing");
    const result = await processRefundReversal(
      paymentIntentId,
      user._id.toString(),
      refundAmount,
      isFullRefund,
      invoiceId
    );

    if (result.success) {
      webhookLog("info", `✅ Refund reversal processed successfully for payment: ${paymentIntentId}`);
    } else {
      webhookLog("error", `❌ Refund reversal failed: ${result.error}`);
    }
  } catch (error) {
    webhookLog("error", `Error handling charge refund updated: ${error}`);
  }
}

/**
 * Handle charge dispute created (chargeback initiated)
 * For now, we just log it - the actual reversal happens when dispute is closed and lost
 */
async function handleChargeDisputeCreated(dispute: Stripe.Dispute) {
  try {
    webhookLog("warn", `Chargeback dispute created: ${dispute.id}, amount: ${dispute.amount}`);
    webhookLog("info", `Dispute reason: ${dispute.reason}, status: ${dispute.status}`);
    // No action needed - we'll handle reversal when dispute is closed and lost
  } catch (error) {
    webhookLog("error", `Error handling dispute created: ${error}`);
  }
}

/**
 * Handle charge dispute updated (dispute status changed)
 * We just log it - actual reversal happens when dispute is closed
 */
async function handleChargeDisputeUpdated(dispute: Stripe.Dispute) {
  try {
    webhookLog("info", `Dispute updated: ${dispute.id}, status: ${dispute.status}`);
    // No action needed - we'll handle reversal when dispute is closed and lost
  } catch (error) {
    webhookLog("error", `Error handling dispute updated: ${error}`);
  }
}

/**
 * Handle charge dispute closed (CRITICAL - handles based on outcome)
 * If won: No refund needed, restore access if previously revoked
 * If lost: Process as refund, reverse all benefits
 */
async function handleChargeDisputeClosed(dispute: Stripe.Dispute) {
  try {
    webhookLog("info", `Processing dispute closed: ${dispute.id}, status: ${dispute.status}`);

    // Only process if dispute was lost (chargeback upheld)
    if (dispute.status !== "lost") {
      webhookLog("info", `Dispute ${dispute.id} was ${dispute.status}, no reversal needed`);
      return;
    }

    webhookLog("warn", `Dispute ${dispute.id} was LOST - processing refund reversal`);

    // Find payment intent ID from dispute charge
    if (!dispute.charge) {
      webhookLog("error", `No charge found in dispute: ${dispute.id}`);
      return;
    }

    const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
    const charge = await stripe.charges.retrieve(chargeId);

    const paymentIntentId =
      typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;

    if (!paymentIntentId) {
      webhookLog("error", `No payment intent found in charge: ${chargeId}`);
      return;
    }

    // Find user by customer ID
    let user;
    if (charge.customer) {
      const customerId = typeof charge.customer === "string" ? charge.customer : charge.customer.id;
      user = await User.findOne({ stripeCustomerId: customerId });
    }

    if (!user) {
      webhookLog("error", `User not found for dispute: ${dispute.id}`);
      return;
    }

    // Get dispute amount (full refund)
    const refundAmount = dispute.amount || charge.amount || 0;
    const isFullRefund = true; // Disputes are always full chargebacks

    // Process refund reversal
    const { processRefundReversal } = await import("@/utils/payment/refund-processing");
    const result = await processRefundReversal(paymentIntentId, user._id.toString(), refundAmount, isFullRefund);

    if (result.success) {
      webhookLog("info", `✅ Dispute refund reversal processed successfully for payment: ${paymentIntentId}`);
    } else {
      webhookLog("error", `❌ Dispute refund reversal failed: ${result.error}`);
    }
  } catch (error) {
    webhookLog("error", `Error handling dispute closed: ${error}`);
  }
}

/**
 * Handle payment intent canceled (payment canceled before completion)
 * Just cleanup - no refund needed as payment never completed
 */
async function handlePaymentIntentCanceled(paymentIntent: Stripe.PaymentIntent) {
  try {
    webhookLog("info", `Payment intent canceled: ${paymentIntent.id}`);
    
    // ✅ FIX: Clean up orphaned accounts/payment methods for cancelled payments
    // This prevents accounts from being created with payment methods when users cancel payment
    await handlePaymentCancellation(paymentIntent);
  } catch (error) {
    webhookLog("error", `Error handling payment intent canceled: ${error}`);
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
    // console.log("🔒 WEBHOOK (Old Handler): Ensuring indexes before processing...");
    await ensureIndexesOnce();
    // console.log("✅ WEBHOOK (Old Handler): Indexes ensured, proceeding with webhook processing");

    const body = await request.text();
    const signature = (await headers()).get("stripe-signature");

    if (!signature) {
      // console.error("❌ Missing stripe-signature header");
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    // ✅ CRITICAL: Validate webhook secret before using it
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      // console.error("❌ CRITICAL: STRIPE_WEBHOOK_SECRET is not set - webhook processing disabled");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
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
        webhookLog("info", `📥 Received payment_intent.succeeded event for: ${event.data.object.id}`);
        const paymentProcessed = await handlePaymentSuccess(event.data.object);
        shouldMarkAsProcessed = paymentProcessed !== false; // Only if actually processed
        webhookLog(
          "info",
          `📤 payment_intent.succeeded processing result: ${
            paymentProcessed !== false ? "processed" : "skipped/failed"
          } for ${event.data.object.id}`
        );
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
      // ✅ REFUND HANDLERS: React to refunds processed in Stripe Dashboard
      // Note: invoice.refunded doesn't exist in Stripe - invoice refunds trigger charge.refunded instead
      // So we only need to handle charge.refunded which covers both one-time and subscription refunds
      case "charge.refunded":
        await handleChargeRefunded(event.data.object);
        break;
      case "charge.refund.updated":
        // Skip charge.refund.updated - charge.refunded is the canonical event for refunds
        // This prevents duplicate processing when both events fire for the same refund
        // charge.refunded fires when refund is created, charge.refund.updated fires when status changes
        // Both can trigger processRefundReversal, causing double deduction of accumulated entries
        webhookLog("info", `Skipping charge.refund.updated - using charge.refunded as canonical event`);
        // ✅ CRITICAL: Don't mark as processed - we're skipping this event!
        break;
      case "charge.dispute.created":
        await handleChargeDisputeCreated(event.data.object);
        break;
      case "charge.dispute.updated":
        await handleChargeDisputeUpdated(event.data.object);
        break;
      case "charge.dispute.closed":
        await handleChargeDisputeClosed(event.data.object);
        break;
      case "payment_intent.canceled":
        webhookLog("info", `📥 Received payment_intent.canceled event for: ${event.data.object.id}`);
        const canceledPaymentIntent = event.data.object as Stripe.PaymentIntent;
        
        // ✅ FIX: Clean up orphaned accounts/payment methods for cancelled payments
        try {
          await handlePaymentCancellation(canceledPaymentIntent);
        } catch (error) {
          webhookLog("error", `Error handling payment cancellation: ${error}`);
        }
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
