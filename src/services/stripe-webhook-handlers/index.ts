/**
 * Stripe webhook event handlers.
 *
 * All handler functions and helpers that used to live inside
 * `src/app/api/stripe/webhook/route.ts` have been lifted here verbatim
 * so that the async worker route can drive them without going through
 * NextRequest.  The receiver route still calls `dispatchStripeEvent`
 * synchronously — behaviour is identical to the pre-refactor code.
 *
 * Task 7 of the Stripe Webhook Async Queue implementation plan.
 * Mechanical move only — no handler body changes.
 */

import connectDB from "@/lib/mongodb";
import User, { IUser } from "@/models/User";
import ProcessedStripeEvent from "@/models/ProcessedStripeEvent";
import Order from "@/models/Order";
import MajorDraw from "@/models/MajorDraw";
import mongoose from "mongoose";
import { stripe } from "@/lib/stripe";
import Stripe from "stripe";
import { getPackageById } from "@/data/membershipPackages";
import { getEffectivePromoType } from "@/utils/promo/get-effective-promo-type";
import { normalizeMembershipPlanId } from "@/utils/membership/additional-package-mapping";
import { getUpsellPackageById } from "@/data/upsellPackages";
import { processPaymentBenefits, isPaymentProcessed } from "@/utils/payment/payment-processing";
import { extractResolvedPlatformFromMetadata } from "@/utils/tracking/resolved-attribution-metadata";
import { calculateSubscriptionEntries } from "@/utils/payment/subscription-entries-calculator";
import { hasMembershipGrantInCurrentDrawPeriod } from "@/utils/draws/has-membership-grant-this-draw";
import { createUserFromPaymentMetadata, shouldCreateAccountFromMetadata } from "@/utils/payment/account-manager";
import { savePaymentMethodToUser } from "@/utils/payment/payment-method-manager";
import { handlePaymentCancellation } from "@/utils/payment/payment-cleanup";
// ✅ WEBHOOK-FIRST: Remove database dependency for event tracking
import { klaviyo } from "@/lib/klaviyo";
import { ensureUserProfileSynced } from "@/utils/integrations/klaviyo/klaviyo-profile-sync";
import { getRenewalEntriesPreviewForProfile } from "@/utils/integrations/klaviyo/klaviyo-renewal-entries-preview";
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
import { getSubscriptionPeriodEnd } from "@/utils/payment/stripe/subscription-period";
import { isZeroAmountTrialUpdateInvoice } from "@/utils/billing/trial-invoice";
import {
  pauseAfterRenewalFailure,
  resumeAfterSuccessfulRenewalPayment,
  reanchorAfterPastDueRecovery,
} from "@/services/subscription/SubscriptionCollectionPauseService";
import { decideClearPause, shouldReanchorAfterRecovery } from "@/services/subscription/pauseCollectionPolicy";
import { STRIPE_SUBSCRIPTION_METADATA_IS_RESUBSCRIBE } from "@/utils/payment/stripe-subscription-metadata";
import { decideStreakOnSubscriptionCreate } from "@/utils/subscription/streak";
import { trackPixelSubscriptionRenewal } from "@/utils/tracking/pixel-purchase-tracking";
import { executeBackgroundJob } from "@/utils/webhook/background-jobs";
import {
  paidAtDateFromStripeInvoice,
  shouldRecordMembershipRecurringAffiliateCharge,
} from "@/utils/affiliate/affiliate-recurring-invoice";
import {
  isFullRefundByAmounts,
  sumSucceededRefundAmountCents,
} from "@/utils/payment/stripe-refund-amount";
import {
  appendActivationStatus,
  appendMembershipStatusHistory,
  upsertRenewalCycleFromFailedInvoice,
  upsertRenewalCycleFromPaidInvoice,
} from "@/services/admin/membershipAnalyticsPersistence";
import {
  isDeadStripeSubscriptionStatus,
  isManageableStripeSubscriptionStatus,
  retrieveStripeSubscription,
  shouldAdoptPaidSubscriptionOverStored,
} from "@/services/subscription/SubscriptionReferenceService";

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

type PendingUpgradeChange = NonNullable<IUser["subscription"]>["pendingChange"];

function isValidPendingUpgrade(change: PendingUpgradeChange | undefined): change is PendingUpgradeChange {
  return (
    change?.changeType === "upgrade" &&
    typeof change.newPackageId === "string" &&
    change.newPackageId.length > 0
  );
}

function stripeSubscriptionIdFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string" && value.startsWith("sub_")) return value;
  if (value && typeof value === "object") {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.startsWith("sub_")) return id;
  }
  return undefined;
}

function objectValue(value: unknown, key: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

function resolveInvoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  const invoiceWithHints = invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
    parent?: unknown;
  };

  const parent = invoiceWithHints.parent;
  const parentSubscriptionDetails = objectValue(parent, "subscription_details");
  const parentSubscriptionId = stripeSubscriptionIdFromUnknown(
    objectValue(parentSubscriptionDetails, "subscription")
  );
  if (parentSubscriptionId) return parentSubscriptionId;

  const legacySubscriptionId = stripeSubscriptionIdFromUnknown(invoiceWithHints.subscription);
  if (legacySubscriptionId) return legacySubscriptionId;

  for (const line of invoice.lines?.data ?? []) {
    const lineParent = objectValue(line, "parent");
    const subscriptionDetails = objectValue(lineParent, "subscription_details");
    const subscriptionItemDetails = objectValue(lineParent, "subscription_item_details");
    const lineSubscriptionId =
      stripeSubscriptionIdFromUnknown(objectValue(subscriptionDetails, "subscription")) ??
      stripeSubscriptionIdFromUnknown(objectValue(subscriptionItemDetails, "subscription"));
    if (lineSubscriptionId) return lineSubscriptionId;
  }

  return undefined;
}

/**
 * On `invoice.created` for a subscription RENEWAL (`billing_reason === "subscription_cycle"`),
 * stamp the draft invoice's description as "<Package> Renewal" BEFORE Stripe finalizes and
 * attempts payment. The auto-spawned PaymentIntent + Charge inherit it, so BOTH successful AND
 * FAILED renewals read "<Package> Renewal" in the Stripe payments list — not the bare join-time
 * subscription description ("Tradie" / "Boss" / "Foreman").
 *
 * Strictly gated to `subscription_cycle` so it never touches the join charge
 * (`subscription_create`), upgrade/downgrade invoices (`subscription_update`), or the
 * $0 trial-update invoice. Non-blocking: a failure here must never fail the webhook — the
 * description is cosmetic, and the success-path relabel in handleInvoicePaymentSucceeded
 * remains as a belt-and-suspenders fallback for the succeeded case.
 */
async function handleInvoiceCreated(invoice: Stripe.Invoice): Promise<void> {
  if (invoice.billing_reason !== "subscription_cycle" || !invoice.id) return;

  try {
    const subscriptionId = resolveInvoiceSubscriptionId(invoice);
    let packageName = "Subscription";
    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      packageName = subscription.metadata?.packageName || "Subscription";
    }
    const renewalDescription = `${packageName} Renewal`;

    // Idempotent across webhook redeliveries — only write when it differs.
    if (invoice.description !== renewalDescription) {
      await stripe.invoices.update(invoice.id, { description: renewalDescription });
      webhookLog("info", `Stamped renewal description "${renewalDescription}" on draft invoice ${invoice.id}`);
    }
  } catch (err) {
    webhookLog("error", `Failed to stamp renewal description on invoice ${invoice.id}: ${err}`);
  }
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

/** Persist Stripe webhook event id so duplicate deliveries short-circuit (TTL on collection). */
async function ackProcessedStripeEventOnce(event: Stripe.Event): Promise<void> {
  try {
    await ProcessedStripeEvent.create({
      eventId: event.id,
      type: event.type,
      processedAt: new Date(),
    });
  } catch (err: unknown) {
    const code = err && typeof err === "object" && "code" in err ? (err as { code: number }).code : undefined;
    if (code !== 11000) {
      webhookLog("warn", `ProcessedStripeEvent create failed: ${err}`);
    }
  }
}

/**
 * Extract request context from payment intent metadata for Facebook CAPI
 * This context was stored by API routes when creating payment intents
 */
function extractRequestContextFromMetadata(metadata: Stripe.Metadata): {
  client_ip_address?: string;
  client_user_agent?: string;
  fbc?: string;
  fbp?: string;
  event_source_url?: string;
} | undefined {
  const clientIp = metadata.capi_client_ip;
  const userAgent = metadata.capi_user_agent;
  const fbc = metadata.capi_fbc;
  const fbp = metadata.capi_fbp;
  const eventSourceUrl = metadata.capi_event_source_url;

  // Return context if at least one CAPI field is present (event_source_url alone is valid)
  if (clientIp || userAgent || fbc || fbp || eventSourceUrl) {
    return {
      ...(clientIp && { client_ip_address: clientIp }),
      ...(userAgent && { client_user_agent: userAgent }),
      ...(fbc && { fbc }),
      ...(fbp && { fbp }),
      ...(eventSourceUrl && { event_source_url: eventSourceUrl }),
    };
  }

  return undefined;
}

/**
 * Extract attribution (UTM + campaign/adset/ad IDs) from Stripe metadata.
 * Keys: attr_utm_source, attr_utm_medium, attr_utm_campaign, attr_utm_content, attr_utm_term,
 * attr_campaign_id, attr_adset_id, attr_ad_id.
 */
function extractAttributionFromMetadata(metadata: Stripe.Metadata): {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  packages_focus?: "one-time";
} | undefined {
  const utmSource = metadata.attr_utm_source;
  const utmMedium = metadata.attr_utm_medium;
  const utmCampaign = metadata.attr_utm_campaign;
  const utmContent = metadata.attr_utm_content;
  const utmTerm = metadata.attr_utm_term;
  const campaignId = metadata.attr_campaign_id;
  const adsetId = metadata.attr_adset_id;
  const adId = metadata.attr_ad_id;
  const packagesFocus = metadata.attr_packages_focus;

  if (
    utmSource || utmMedium || utmCampaign || utmContent || utmTerm ||
    campaignId || adsetId || adId || packagesFocus === "one-time"
  ) {
    return {
      ...(utmSource && { utm_source: utmSource }),
      ...(utmMedium && { utm_medium: utmMedium }),
      ...(utmCampaign && { utm_campaign: utmCampaign }),
      ...(utmContent && { utm_content: utmContent }),
      ...(utmTerm && { utm_term: utmTerm }),
      ...(campaignId && { campaign_id: campaignId }),
      ...(adsetId && { adset_id: adsetId }),
      ...(adId && { ad_id: adId }),
      // Validate the literal so a tampered metadata value can't be persisted.
      ...(packagesFocus === "one-time" && { packages_focus: "one-time" as const }),
    };
  }
  return undefined;
}

/**
 * Get resolved promo multiplier for a package type (payment context)
 * Priority: Active Promo > Alternating Multiplier > Default (1x)
 * Uses PromoMultiplierResolverService for centralized resolution
 */
async function getActivePromoMultiplier(packageType: "membership" | "one-time" | "mini-draw"): Promise<number> {
  try {
    const { PromoMultiplierResolverService } = await import("@/services/admin/PromoMultiplierResolverService");
    const resolver = new PromoMultiplierResolverService();
    // Use payment context (returns null if no active/alternating, use 1x)
    const resolved = await resolver.resolveMultiplierForPayment(packageType);
    return resolved ?? 1; // Use 1x if no promo
  } catch (error) {
    webhookLog("error", `Error fetching resolved promo multiplier for ${packageType}: ${error}`);
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
      await new Promise((resolve) => setTimeout(resolve, 300)); // 300ms delay (reduced from 1000ms for faster response)
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
async function handlePaymentSuccess(
  paymentIntent: Stripe.PaymentIntent,
  // Stripe event.created (Unix seconds) = the moment payment actually succeeded.
  // paymentIntent.created is the PI's CREATION time, which can precede payment by
  // minutes-to-days (form opened, 3DS deferred) — wrong for Meta's event_time.
  eventCreatedUnixSeconds?: number
): Promise<boolean | undefined> {
  try {
    webhookLog("info", `🔄 Processing payment success: ${paymentIntent.id}`);

    // ✅ CRITICAL: Retrieve fresh PaymentIntent to get latest metadata
    // The webhook event might have stale data if metadata was updated after confirmation
    let freshPaymentIntent: Stripe.PaymentIntent;
    try {
      freshPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntent.id, {
        expand: ["customer", "payment_method", "latest_charge.payment_method"],
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

    // ✅ FIX: Check if payment is already processed BEFORE trying to find user
    // This prevents "User not found" errors for duplicate webhooks
    // Duplicate webhooks are common when Stripe retries or when webhooks are sent multiple times
    const alreadyProcessed = await isPaymentProcessed(paymentIntent.id);
    if (alreadyProcessed) {
      webhookLog("info", `✅ Payment ${paymentIntent.id} already processed, skipping duplicate webhook`);
      return true; // Return true to indicate webhook was handled (even though it was a duplicate)
    }

    // ✅ Transition major draws if needed (before draw selection)
    // Ensures draw statuses are up-to-date before processing payment entries
    // Service is debounced and idempotent, so safe to call here
    try {
      const { transitionMajorDrawsIfNeeded } = await import("@/utils/draws/major-draw-transition-service");
      const transitionResult = await transitionMajorDrawsIfNeeded();
      if (!transitionResult.skipped && (transitionResult.completed > 0 || transitionResult.activated > 0 || transitionResult.frozen > 0)) {
        webhookLog("info", `🔄 Major draw transitions: ${transitionResult.completed} completed, ${transitionResult.activated} activated, ${transitionResult.frozen} frozen`);
      }
      // Don't block on transition errors - continue with payment processing
      if (!transitionResult.success && transitionResult.error) {
        webhookLog("warn", `⚠️ Major draw transition had errors (non-blocking): ${transitionResult.error}`);
      }
    } catch (transitionError) {
      // Log but don't block payment processing
      webhookLog("warn", `⚠️ Major draw transition service error (non-blocking): ${transitionError}`);
    }

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

    // ✅ CRITICAL FIX: If user still not found and charge has no customer, check charge billing_details.email
    // This handles cases where PaymentIntent was confirmed before customer was set (wallet payments)
    // The charge will have the user's email in billing_details even if customer is null
    if (!user && paymentIntent.latest_charge && paymentIntent.metadata.userEmail === "guest") {
      try {
        const chargeId =
          typeof paymentIntent.latest_charge === "string"
            ? paymentIntent.latest_charge
            : paymentIntent.latest_charge.id;
        const charge = await stripe.charges.retrieve(chargeId);
        
        // Check charge billing_details for email
        if (charge.billing_details?.email) {
          const chargeEmail = charge.billing_details.email.toLowerCase();
          webhookLog("info", `🔍 Charge has no customer but has billing email: ${chargeEmail}`);
          
          // Try to find user by email
          user = await User.findOne({ email: chargeEmail });
          if (user) {
            webhookLog("info", `✅ Found user by charge billing email: ${user._id.toString()}`);
            
            // Update PaymentIntent metadata with correct user info
            try {
              await stripe.paymentIntents.update(paymentIntent.id, {
                metadata: {
                  ...paymentIntent.metadata,
                  userId: user._id.toString(),
                  userEmail: user.email,
                },
              });
              webhookLog("info", `✅ Updated PaymentIntent metadata with correct user info`);
            } catch (updateError) {
              webhookLog("warn", `Failed to update PaymentIntent metadata: ${updateError}`);
            }
          } else {
            // ✅ CRITICAL: Check if metadata has isNewUser flag and user data
            // If yes, create account using charge email instead of "guest"
            if (paymentIntent.metadata.isNewUser === "true" && 
                paymentIntent.metadata.firstName && 
                paymentIntent.metadata.lastName) {
              webhookLog("info", `🆕 Creating new user account from charge billing email: ${chargeEmail}`);
              
              // Create modified PaymentIntent metadata with charge email
              const metadataWithEmail = {
                ...paymentIntent.metadata,
                userEmail: chargeEmail, // Use charge email instead of "guest"
              };
              
              // Create a modified PaymentIntent object for account creation
              const paymentIntentWithEmail = {
                ...paymentIntent,
                metadata: metadataWithEmail,
                customer: null, // Will be created during account creation
              };
              
              user = await createUserFromPaymentMetadata(paymentIntentWithEmail as Stripe.PaymentIntent);
              if (user) {
                webhookLog("info", `✅ Created new user account from charge billing email: ${user._id.toString()}`);
              } else {
                webhookLog("error", `❌ Failed to create user account from charge billing email`);
              }
            }
          }
        } else {
          webhookLog("warn", `⚠️ Charge ${chargeId} has no billing_details.email`);
        }
      } catch (chargeBillingError) {
        webhookLog("warn", `Failed to check charge billing_details: ${chargeBillingError}`);
      }
    }

    // ✅ FIX: If user still not found and customer exists, try to find user by customer email
    // This handles race conditions where metadata has "guest" but customer was created with real email
    if (!user && paymentIntent.customer && paymentIntent.metadata.userEmail === "guest") {
      try {
        const customerId =
          typeof paymentIntent.customer === "string" ? paymentIntent.customer : paymentIntent.customer.id;
        const customer = await stripe.customers.retrieve(customerId);
        
        if (customer && !("deleted" in customer && customer.deleted) && customer.email) {
          const customerEmail = customer.email.toLowerCase();
          webhookLog("info", `🔍 Metadata has 'guest' but customer exists, trying customer email: ${customerEmail}`);
          
          user = await User.findOne({ email: customerEmail });
          if (user) {
            webhookLog("info", `✅ Found user by customer email: ${user._id.toString()}`);
            
            // Update PaymentIntent metadata with correct userId and userEmail for future webhooks
            try {
              await stripe.paymentIntents.update(paymentIntent.id, {
                metadata: {
                  ...paymentIntent.metadata,
                  userId: user._id.toString(),
                  userEmail: user.email,
                },
              });
              webhookLog("info", `✅ Updated PaymentIntent metadata with correct user info`);
            } catch (updateError) {
              webhookLog("warn", `Failed to update PaymentIntent metadata: ${updateError}`);
            }
          } else {
            webhookLog("warn", `❌ User not found by customer email: ${customerEmail}`);
          }
        }
      } catch (customerError) {
        webhookLog("warn", `Failed to retrieve customer for email lookup: ${customerError}`);
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
    if (user) {
      let paymentMethodId: string | null = null;
      let paymentMethodSource = "none";
      let resolvedPm: Stripe.PaymentMethod | null = null;

      const pmDirect = paymentIntent.payment_method;
      if (typeof pmDirect === "string") {
        paymentMethodId = pmDirect;
        paymentMethodSource = "paymentIntent";
      } else if (pmDirect && typeof pmDirect === "object" && "id" in pmDirect) {
        resolvedPm = pmDirect as Stripe.PaymentMethod;
        paymentMethodId = resolvedPm.id;
        paymentMethodSource = "paymentIntent";
      }

      if (!paymentMethodId && paymentIntent.metadata.paymentMethodId) {
        paymentMethodId = paymentIntent.metadata.paymentMethodId;
        paymentMethodSource = "metadata";
        webhookLog("info", `💳 Found payment method in metadata: ${paymentMethodId}`);
      }

      if (!paymentMethodId && paymentIntent.latest_charge) {
        const lc = paymentIntent.latest_charge as Stripe.Charge | string;
        if (typeof lc === "object" && lc.payment_method) {
          const cpm = lc.payment_method;
          if (typeof cpm === "string") {
            paymentMethodId = cpm;
            paymentMethodSource = "latest_charge.payment_method";
          } else if (cpm && typeof cpm === "object" && "id" in cpm) {
            resolvedPm = resolvedPm ?? (cpm as Stripe.PaymentMethod);
            paymentMethodId = (cpm as Stripe.PaymentMethod).id;
            paymentMethodSource = "latest_charge.payment_method";
            webhookLog("info", `💳 Found payment method on expanded charge: ${paymentMethodId}`);
          }
        }
      }

      if (!paymentMethodId && paymentIntent.customer) {
        try {
          const customerId =
            typeof paymentIntent.customer === "string" ? paymentIntent.customer : paymentIntent.customer.id;
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
          webhookLog("info", `💳 Saving payment method to user account (source: ${paymentMethodSource}): ${paymentMethodId}`);
          
          if (user.stripeCustomerId) {
            try {
              const pm = resolvedPm ?? (await stripe.paymentMethods.retrieve(paymentMethodId));
              const pmCustomerId = typeof pm.customer === "string" ? pm.customer : pm.customer?.id;

              if (!pmCustomerId || pmCustomerId !== user.stripeCustomerId) {
                webhookLog("info", `🔄 Payment method not attached to customer, attaching now: ${paymentMethodId}`);
                await stripe.paymentMethods.attach(paymentMethodId, {
                  customer: user.stripeCustomerId,
                });
                webhookLog("info", `✅ Payment method attached to customer: ${paymentMethodId}`);
              } else {
                webhookLog("info", `✅ Payment method already attached to customer: ${paymentMethodId}`);
              }
            } catch (attachError) {
              webhookLog("warn", `⚠️ Failed to verify/attach payment method, continuing anyway: ${attachError}`);
            }
          }
          
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
      await handleUpsellWebhook(user, paymentIntent, eventCreatedUnixSeconds);
    } else if (paymentType === "mini-draw") {
      webhookLog("info", `Processing mini-draw payment: ${paymentIntent.id}`);
      await handleMiniDrawWebhook(user, paymentIntent, eventCreatedUnixSeconds);
    } else if (paymentType === "one-time") {
      webhookLog("info", `🔄 Processing one-time payment: ${paymentIntent.id}`);

      // ✅ CRITICAL: Validate required metadata for one-time purchases
      if (!paymentIntent.metadata.packageId) {
        webhookLog("error", `❌ Missing packageId in one-time payment metadata: ${paymentIntent.id}`);
        return false;
      }
      
      // ✅ RESILIENT: Attempt to retrieve entriesCount from package data if missing in metadata
      if (!paymentIntent.metadata.entriesCount) {
        webhookLog("warn", `⚠️ Missing entriesCount in metadata, attempting to retrieve from package data`);
        
        const packageId = paymentIntent.metadata.packageId;
        if (packageId) {
          const packageData = getPackageById(packageId);
          if (packageData?.totalEntries || packageData?.entriesPerMonth) {
            // Use totalEntries for one-time packages, entriesPerMonth for subscription packages
            const entriesCount = packageData.totalEntries || packageData.entriesPerMonth || 0;
            // Update metadata object (create a mutable copy)
            paymentIntent.metadata.entriesCount = String(entriesCount);
            webhookLog("info", `✅ Retrieved entriesCount from package data: ${paymentIntent.metadata.entriesCount}`);
          }
        }
        
        // Only fail if we couldn't retrieve entriesCount from package data
        if (!paymentIntent.metadata.entriesCount) {
          webhookLog("error", `❌ Missing entriesCount in one-time payment metadata and package lookup failed: ${paymentIntent.id}`);
          return false;
        }
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
      await handleOneTimeWebhook(user, paymentIntent, eventCreatedUnixSeconds);
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

    // ✅ NON-CRITICAL: Update Klaviyo profile with latest user data after purchase (fire-and-forget)
    // MongoDB transactions handle consistency automatically - no delay needed
    executeBackgroundJob("Klaviyo profile sync after payment success", async () => {
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
          await ensureUserProfileSynced(fullUser);
        }
      }
    });
  } catch (error) {
    webhookLog("error", `Error handling payment success: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Handle upsell payments in webhook (backup processing)
 */
async function handleUpsellWebhook(
  user: { _id: { toString: () => string } },
  paymentIntent: Stripe.PaymentIntent,
  eventCreatedUnixSeconds?: number
) {
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
  let _entriesSource: string;
  
  if (calculatedEntriesCount > 0) {
    // Use calculated entries (from dynamic calculation)
    finalEntriesCount = calculatedEntriesCount;
    _entriesSource = "calculated";
    webhookLog(
      "info",
      `✅ Using calculated upsell entries: ${finalEntriesCount} (package: ${upsellPackage.entriesCount}, static: ${staticEntriesCount})`
    );
  } else if (staticEntriesCount > 0) {
    // Fallback to static entries from metadata
    finalEntriesCount = staticEntriesCount;
    _entriesSource = "static-metadata";
    webhookLog(
      "info",
      `ℹ️ Using static entries from metadata: ${finalEntriesCount} (package fallback: ${upsellPackage.entriesCount})`
    );
  } else {
    // Final fallback to package static value (backward compatibility)
    finalEntriesCount = upsellPackage.entriesCount;
    _entriesSource = "package-static";
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

  // ✅ A/B Testing: Extract experiment assignment from payment intent metadata
  const experimentId = paymentIntent.metadata.experimentId;
  const variantId = paymentIntent.metadata.variantId;
  if (experimentId && variantId) {
    webhookLog("info", `✅ Retrieved experiment assignment from payment intent metadata for upsell:`, { 
      experimentId, 
      variantId,
      paymentIntentId: paymentIntent.id,
      userId: user._id.toString(),
    });
  } else {
    // ✅ ADD: Enhanced logging when experiment assignment is missing
    webhookLog("warn", `⚠️ No experiment assignment found in payment intent metadata for upsell:`, {
      paymentIntentId: paymentIntent.id,
      userId: user._id.toString(),
      metadataKeys: Object.keys(paymentIntent.metadata),
      hasExperimentId: !!paymentIntent.metadata.experimentId,
      hasVariantId: !!paymentIntent.metadata.variantId,
    });
  }

  const sessionAttribution = extractAttributionFromMetadata(paymentIntent.metadata);
  const resolvedAttribution = extractResolvedPlatformFromMetadata(paymentIntent.metadata);

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
      // Payment SUCCESS moment (event.created) for Meta event_time — PI creation can
      // precede payment (form opened, deferred confirm), which would back-date the conversion.
      chargedAt: (eventCreatedUnixSeconds ?? paymentIntent.created) * 1000,
      type: "upsell",
      packageType: "upsell",
      // ✅ Pass original package type for bonus entry promo checks
      ...(originalPackageType && { originalPackageType: originalPackageType }),
      ...(miniDrawId && { miniDrawId: miniDrawId }), // Include miniDrawId if present
      // One purchase per appearance: pass trigger id so handleUpsellPackage can store it
      ...(paymentIntent.metadata.triggeringPaymentIntentId && {
        triggeringPaymentIntentId: paymentIntent.metadata.triggeringPaymentIntentId,
      }),
      affiliateCode: paymentIntent.metadata.affiliateCode,
      promoLinkCode: paymentIntent.metadata.promoLinkCode,
      campaignCode: paymentIntent.metadata.campaignCode,
      // ✅ A/B Testing: Include experiment assignment from metadata (most reliable source)
      ...(experimentId && variantId && {
        experimentId,
        variantId,
      }),
    },
    requestContext, // Pass request context for improved match quality
    undefined, // billingReason (not applicable for upsell)
    sessionAttribution,
    undefined, // affiliateOptions
    undefined, // isResubscribe
    undefined, // subscriptionLedgerContext
    resolvedAttribution
  );

  // ✅ ADD: Log if experiment assignment was passed to processPaymentBenefits
  if (experimentId && variantId) {
    webhookLog("info", `✅ Passed experiment assignment to processPaymentBenefits for upsell:`, {
      experimentId,
      variantId,
      paymentIntentId: paymentIntent.id,
    });
  } else {
    webhookLog("warn", `⚠️ No experiment assignment to pass to processPaymentBenefits for upsell`);
  }

  if (!result.success) {
    webhookLog("error", `Failed to process upsell ${offerId}: ${result.error}`);
  }
}

// handleSubscriptionPaymentWebhook removed - subscription processing now handled only by handleInvoicePaid

/**
 * Handle one-time package payments in webhook (backup processing)
 */
async function handleOneTimeWebhook(
  user: { _id: { toString: () => string } },
  paymentIntent: Stripe.PaymentIntent,
  eventCreatedUnixSeconds?: number
) {
  webhookLog("info", `🎯 handleOneTimeWebhook called for PaymentIntent: ${paymentIntent.id}`);
  /** Canonical id (matches static `membershipPackages`); `-member` suffix from useMemberships breaks getPackageById + promo parity with UI. */
  const rawPackageId = paymentIntent.metadata.packageId || "";
  const packageId = rawPackageId ? normalizeMembershipPlanId(rawPackageId) : "";
  const packageName = paymentIntent.metadata.packageName || `One-Time Package ${packageId || rawPackageId}`;
  const entriesCount = parseInt(paymentIntent.metadata.entriesCount || "0");
  
  // ✅ FIX: Parse and validate price - ensure it's always a valid number
  let priceInCents = parseInt(paymentIntent.metadata.price || "0");
  
  // ✅ FIX: If price is missing, invalid (NaN), or 0, get it from package static data
  // This ensures price is always recorded correctly, even if metadata is missing
  // This matches the pattern used by upsell purchases (which get price from static data)
  if (!priceInCents || isNaN(priceInCents) || priceInCents === 0) {
    if (packageId) {
      try {
        const packageData = getPackageById(packageId);
        if (packageData?.price) {
          // Convert package price (in dollars) to cents
          priceInCents = Math.round(packageData.price * 100);
          webhookLog("info", `✅ Retrieved price from package static data: ${priceInCents} cents (${packageData.price} dollars)`);
        }
      } catch (error) {
        webhookLog("warn", `⚠️ Failed to get price from package data: ${error}`);
      }
    }
  }
  
  // ✅ FIX: Final validation - ensure price is always a valid number
  if (!priceInCents || isNaN(priceInCents)) {
    priceInCents = 0;
    webhookLog("warn", `⚠️ Price could not be determined for one-time package, defaulting to 0`);
  }

  webhookLog("info", `📦 One-time package details:`, {
    packageId,
    packageName,
    entriesCount,
    price: priceInCents,
    priceInDollars: priceInCents / 100,
    userId: user._id.toString(),
  });

  if (entriesCount <= 0) {
    webhookLog("error", `❌ No entries found for one-time package ${packageId}`);
    return;
  }

  // Match SpecialPackagesModal / getEffectivePromoType (handles `-member` ids via resolvePackageForPromo)
  const userWithSub = await User.findById(user._id).select("subscription").lean();
  const isMember = userWithSub?.subscription?.isActive === true;
  const effectivePromoKind = packageId
    ? getEffectivePromoType(packageId, "one-time", isMember)
    : "one-time-packages";
  const promoTypeShort: "membership" | "one-time" | "mini-draw" =
    effectivePromoKind === "membership-packages"
      ? "membership"
      : effectivePromoKind === "mini-packages"
        ? "mini-draw"
        : "one-time";
  const promoMultiplier = await getActivePromoMultiplier(promoTypeShort);
  const finalEntriesCount = entriesCount * promoMultiplier;

  if (effectivePromoKind === "membership-packages") {
    webhookLog(
      "info",
      `One-time package ${packageId}: using membership promo multiplier (${promoMultiplier}x) — aligns with member-only UI`
    );
  }
  webhookLog(
    "info",
    `One-time package ${packageId}: ${entriesCount} base entries × ${promoMultiplier} = ${finalEntriesCount} final entries`
  );

  // Extract request context from payment intent metadata for improved Facebook CAPI match quality
  const requestContext = extractRequestContextFromMetadata(paymentIntent.metadata);

  // ✅ A/B Testing: Extract experiment assignment from payment intent metadata
  const experimentId = paymentIntent.metadata.experimentId;
  const variantId = paymentIntent.metadata.variantId;
  if (experimentId && variantId) {
    webhookLog("info", `✅ Retrieved experiment assignment from payment intent metadata:`, { 
      experimentId, 
      variantId,
      paymentIntentId: paymentIntent.id,
      userId: user._id.toString(),
    });
  } else {
    // ✅ ADD: Enhanced logging when experiment assignment is missing
    webhookLog("warn", `⚠️ No experiment assignment found in payment intent metadata:`, {
      paymentIntentId: paymentIntent.id,
      userId: user._id.toString(),
      metadataKeys: Object.keys(paymentIntent.metadata),
      hasExperimentId: !!paymentIntent.metadata.experimentId,
      hasVariantId: !!paymentIntent.metadata.variantId,
    });
  }

  // Process benefits using event-based system with payment metadata
  webhookLog("info", `🔄 Calling processPaymentBenefits for one-time package:`, {
    paymentIntentId: paymentIntent.id,
    userId: user._id.toString(),
    packageId,
    entries: finalEntriesCount,
    points: Math.floor(priceInCents / 100),
    price: priceInCents / 100, // ✅ FIX: Use validated priceInCents
  });

  const sessionAttribution = extractAttributionFromMetadata(paymentIntent.metadata);
  const resolvedAttribution = extractResolvedPlatformFromMetadata(paymentIntent.metadata);

  const result = await processPaymentBenefits(
    paymentIntent.id,
    user._id.toString(),
    {
      packageType: "one-time",
      packageId: packageId,
      packageName: packageName,
      entries: finalEntriesCount, // Apply promo multiplier to entries
      points: Math.floor(priceInCents / 100), // Convert from cents - points remain unchanged
      price: priceInCents / 100, // ✅ FIX: Use validated priceInCents converted to dollars
    },
    "webhook",
    {
      created: paymentIntent.created * 1000, // Convert Stripe timestamp (seconds) to milliseconds
      // Payment SUCCESS moment (event.created) for Meta event_time — PI creation can
      // precede payment (form opened, deferred confirm), which would back-date the conversion.
      chargedAt: (eventCreatedUnixSeconds ?? paymentIntent.created) * 1000,
      type: "one-time",
      packageType: "one-time",
      affiliateCode: paymentIntent.metadata.affiliateCode,
      promoLinkCode: paymentIntent.metadata.promoLinkCode,
      campaignCode: paymentIntent.metadata.campaignCode,
      // ✅ A/B Testing: Include experiment assignment from metadata (most reliable source)
      ...(experimentId && variantId && {
        experimentId,
        variantId,
      }),
    },
    requestContext, // Pass request context for improved match quality
    undefined, // billingReason (not applicable for one-time)
    sessionAttribution,
    undefined, // affiliateOptions
    undefined, // isResubscribe
    undefined, // subscriptionLedgerContext
    resolvedAttribution
  );

  // ✅ ADD: Log if experiment assignment was passed to processPaymentBenefits
  if (experimentId && variantId) {
    webhookLog("info", `✅ Passed experiment assignment to processPaymentBenefits:`, {
      experimentId,
      variantId,
      paymentIntentId: paymentIntent.id,
    });
  } else {
    webhookLog("warn", `⚠️ No experiment assignment to pass to processPaymentBenefits for one-time purchase`);
  }

  if (result.success) {
    webhookLog("info", `✅ Successfully processed one-time package ${packageId}:`, {
      paymentIntentId: paymentIntent.id,
      userId: user._id.toString(),
      entriesAdded: finalEntriesCount,
      pointsAdded: Math.floor(priceInCents / 100),
      priceRecorded: priceInCents / 100, // ✅ FIX: Log the price that was recorded
    });

    // ✅ Process referral if this is first purchase (processedPayments.length === 1)
    try {
      const referralCode = paymentIntent.metadata.referralCode as string | undefined;
      if (referralCode) {
        // Check if user is first-time (processedPayments.length === 1 after this purchase)
        const freshUser = await User.findById(user._id).select("processedPayments email firstName lastName").lean();
        const processedPaymentsCount = freshUser?.processedPayments?.length || 0;

        if (processedPaymentsCount === 1 && freshUser) {
          // This is their first purchase - process referral
          const { recordReferralPurchase } = await import("@/lib/referral");
          await recordReferralPurchase({
            referralCode,
            inviteeUserId: user._id.toString(),
            inviteeEmail: freshUser.email,
            inviteeName: `${freshUser.firstName || ""} ${freshUser.lastName || ""}`.trim(),
            qualifyingOrderId: paymentIntent.id,
            qualifyingOrderType: "one-time",
          });
          webhookLog("info", `✅ Referral processed for first-time user: ${freshUser.email}`);
        } else {
          webhookLog("info", `⚠️ Referral code provided but user is not first-time (processedPayments: ${processedPaymentsCount})`);
        }
      }
    } catch (referralError) {
      webhookLog("error", `Referral processing error (non-blocking): ${referralError}`);
      // Don't throw - referral processing should not break webhook
    }

    // ✅ NON-CRITICAL: Sync Klaviyo profile after one-time package purchase (fire-and-forget)
    // This ensures current_draw_one_time_packages is updated in real-time
    executeBackgroundJob("Klaviyo profile sync after one-time package", async () => {
      // Fetch fresh user data to ensure we have the latest oneTimePackages array
      const freshUser = await User.findById(user._id);
      if (freshUser) {
        await ensureUserProfileSynced(freshUser);
        webhookLog("info", `✅ Klaviyo profile synced after one-time package purchase for: ${freshUser.email}`);
      }
    });
  } else {
    webhookLog("error", `❌ Failed to process one-time package ${packageId}: ${result.error}`);
  }
}

/**
 * Handle mini draw payments in webhook (backup processing)
 */
async function handleMiniDrawWebhook(
  user: { _id: { toString: () => string } },
  paymentIntent: Stripe.PaymentIntent,
  eventCreatedUnixSeconds?: number
) {
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

  // ✅ A/B Testing: Extract experiment assignment from payment intent metadata
  const experimentId = paymentIntent.metadata.experimentId;
  const variantId = paymentIntent.metadata.variantId;
  if (experimentId && variantId) {
    webhookLog("info", `✅ Retrieved experiment assignment from payment intent metadata:`, { 
      experimentId, 
      variantId,
      paymentIntentId: paymentIntent.id,
      userId: user._id.toString(),
    });
  } else {
    // ✅ ADD: Enhanced logging when experiment assignment is missing
    webhookLog("warn", `⚠️ No experiment assignment found in payment intent metadata for mini-draw:`, {
      paymentIntentId: paymentIntent.id,
      userId: user._id.toString(),
      metadataKeys: Object.keys(paymentIntent.metadata),
      hasExperimentId: !!paymentIntent.metadata.experimentId,
      hasVariantId: !!paymentIntent.metadata.variantId,
    });
  }

  const sessionAttribution = extractAttributionFromMetadata(paymentIntent.metadata);
  const resolvedAttribution = extractResolvedPlatformFromMetadata(paymentIntent.metadata);

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
      // Payment SUCCESS moment (event.created) for Meta event_time — PI creation can
      // precede payment (form opened, deferred confirm), which would back-date the conversion.
      chargedAt: (eventCreatedUnixSeconds ?? paymentIntent.created) * 1000,
      type: "mini-draw",
      packageType: "mini-draw",
      miniDrawId: miniDrawId, // Pass MiniDraw ID to payment processing
      affiliateCode: paymentIntent.metadata.affiliateCode,
      promoLinkCode: paymentIntent.metadata.promoLinkCode,
      campaignCode: paymentIntent.metadata.campaignCode,
      // ✅ A/B Testing: Include experiment assignment from metadata (most reliable source)
      ...(experimentId && variantId && {
        experimentId,
        variantId,
      }),
    },
    requestContext, // Pass request context for improved match quality
    undefined, // billingReason (not applicable for mini-draw)
    sessionAttribution,
    undefined, // affiliateOptions
    undefined, // isResubscribe
    undefined, // subscriptionLedgerContext
    resolvedAttribution
  );

  // ✅ ADD: Log if experiment assignment was passed to processPaymentBenefits
  if (experimentId && variantId) {
    webhookLog("info", `✅ Passed experiment assignment to processPaymentBenefits for mini-draw:`, {
      experimentId,
      variantId,
      paymentIntentId: paymentIntent.id,
    });
  } else {
    webhookLog("warn", `⚠️ No experiment assignment to pass to processPaymentBenefits for mini-draw`);
  }

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
    // ✅ FIX: Skip cancelled payment intents - they should not be logged as failures
    // Cancelled payment intents are handled by payment_intent.canceled event
    if (paymentIntent.status === "canceled") {
      webhookLog("info", `Skipping cancelled payment intent ${paymentIntent.id} - handled by payment_intent.canceled event`);
      return;
    }
    
    // Expected business event (a customer card declined) — warn, not error, so it
    // doesn't drown real handler exceptions in the production error log.
    webhookLog("warn", `Payment failed: ${paymentIntent.id}`);

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
      } catch {
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

    // ✅ NON-CRITICAL: Update Klaviyo profile to reflect failed payment status (fire-and-forget)
    executeBackgroundJob("Klaviyo profile sync after payment failure", async () => {
      await ensureUserProfileSynced(user);
    });

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
    
    // ✅ RACE CONDITION HANDLING: Find user by customer ID with retry logic
    // This handles cases where the webhook fires before the user record is saved to the database
    // The invoice.payment_succeeded webhook will handle the actual activation, so this is non-critical
    let user;
    let retries = 3;
    while (!user && retries > 0) {
      if (subscription.customer) {
        const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
        user = await User.findOne({ stripeCustomerId: customerId });
      }
      
      if (!user && retries > 1) {
        await new Promise((resolve) => setTimeout(resolve, 200)); // 200ms delay (reduced from 500ms for faster response)
        retries--;
      } else {
        break;
      }
    }

    if (!user) {
      webhookLog("warn", `User not found for subscription: ${subscription.id} (race condition - invoice.payment_succeeded will handle activation)`);
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

    const pendingUpgrade = isValidPendingUpgrade(user.subscription?.pendingChange)
      ? user.subscription?.pendingChange
      : undefined;

    // Check if this is an upgrade (has a valid pendingChange)
    if (pendingUpgrade?.stripeSubscriptionId === subscription.id) {
      if (!user.subscription) return;
      webhookLog("info", `Activating upgrade subscription: ${subscription.id}`);

      // Activate the upgrade
      user.subscription.packageId = pendingUpgrade.newPackageId;
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

      if (subscription.status === "active" || subscription.status === "trialing") {
        try {
          const pkgId = user.subscription?.packageId != null ? String(user.subscription.packageId) : undefined;
          await appendActivationStatus({
            userId: new mongoose.Types.ObjectId(String(user._id)),
            effectiveAt: new Date(subscription.created * 1000),
            source: "webhook_subscription_created",
            subscriptionPackageId: pkgId,
            isTrialing: subscription.status === "trialing",
            metadata: { stripeSubscriptionId: subscription.id, status: subscription.status },
          });
        } catch (err) {
          webhookLog("warn", "Failed to append activation history from subscription.created:", err);
        }
      }

      return;
    } else {
      // Regular subscription creation - only update autoRenew
      if (user.subscription) {
        user.subscription.autoRenew = !subscription.cancel_at_period_end;
      }
    }

    await user.save();

    if (subscription.status === "active" || subscription.status === "trialing") {
      try {
        const pkgId = user.subscription?.packageId != null ? String(user.subscription.packageId) : undefined;
        await appendActivationStatus({
          userId: new mongoose.Types.ObjectId(String(user._id)),
          effectiveAt: new Date(subscription.created * 1000),
          source: "webhook_subscription_created",
          subscriptionPackageId: pkgId,
          isTrialing: subscription.status === "trialing",
          metadata: { stripeSubscriptionId: subscription.id, status: subscription.status },
        });
      } catch (err) {
        webhookLog("warn", "Failed to append activation history from subscription.created:", err);
      }
    }

    // ✅ NON-CRITICAL: Update Klaviyo profile after subscription activation (fire-and-forget)
    executeBackgroundJob("Klaviyo profile sync after subscription activation", async () => {
      const freshUser = await User.findById(user._id);
      if (freshUser) {
        await ensureUserProfileSynced(freshUser);
      }
    });
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

    const pendingUpgrade = isValidPendingUpgrade(user.subscription?.pendingChange)
      ? user.subscription?.pendingChange
      : undefined;

    // ✅ PRORATION UPGRADE: Check if this is from subscription.update() (new best practice pattern)
    // When using subscription.update() for upgrades, the subscription ID doesn't change
    const isProrationUpgrade =
      user.stripeSubscriptionId === subscription.id &&
      pendingUpgrade != null &&
      subscription.metadata?.upgradeType === "proration";

    webhookLog(
      "info",
      `Checking subscription update - isProrationUpgrade: ${isProrationUpgrade}, hasPendingChange: ${!!pendingUpgrade}, subscriptionStatus: ${subscription.status}`
    );

    // Check if this is a pending change activation (upgrade or downgrade)
    webhookLog(
      "info",
      `Checking pending change - hasPendingChange: ${!!pendingUpgrade}, pendingSubscriptionId: ${
        pendingUpgrade?.stripeSubscriptionId
      }, currentSubscriptionId: ${subscription.id}, subscriptionStatus: ${subscription.status}`
    );

    // 🎯 NEW APPROACH: No special downgrade handling needed
    // previousSubscription in user model handles benefit preservation automatically
    // Webhook just processes subscription updates normally

    if (
      pendingUpgrade &&
      (pendingUpgrade.stripeSubscriptionId === subscription.id || isProrationUpgrade) &&
      subscription.status === "active"
    ) {
      const changeType = pendingUpgrade.changeType;

      // 🔧 CRITICAL FIX: Only process upgrades immediately, not downgrades
      if (changeType === "upgrade") {
        if (!user.subscription) return;
        webhookLog(
          "info",
          `Activating pending upgrade: ${pendingUpgrade.newPackageId} (proration: ${isProrationUpgrade})`
        );

        // Get package details for entries
        const packageId = pendingUpgrade.newPackageId;
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
        const pendingUpgradePaymentIntentId = pendingUpgrade.paymentIntentId || "";
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
            paymentIntentId: pendingUpgradePaymentIntentId,
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
    const hasPendingChange = isValidPendingUpgrade(user.subscription?.pendingChange);
    const hasRecentUpgrade =
      user.subscription?.lastUpgradeDate && Date.now() - user.subscription.lastUpgradeDate.getTime() < 60000; // 1 minute window

    // If user has pending changes or recent upgrades, be extra cautious
    if (hasPendingChange || hasRecentUpgrade) {
      // Still sync endDate even when skipping other updates — Stripe advanced the billing period
      if (
        subscription.id === user.stripeSubscriptionId &&
        (subscription.status === "active" || subscription.status === "trialing")
      ) {
        const periodEnd = getSubscriptionPeriodEnd(subscription);
        if (periodEnd != null) {
          await User.findByIdAndUpdate(user._id, {
            $set: { "subscription.endDate": new Date(periodEnd * 1000) },
          });
          webhookLog("info", `Synced endDate despite pending changes/recent upgrade for ${user.email}`);
        }
      }
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

    // Capture status before any mutations (used below for activation history after save)
    const prevSubStatus = user.subscription?.status;
    // Capture wasActive before mutations so it is in scope after the if(user.subscription) block
    const wasActiveBeforeUpdate = user.subscription?.isActive ?? false;

    // Update user subscription status based on Stripe subscription
    if (user.subscription) {
      const wasActive = user.subscription.isActive;

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

      // Only process updates if this is the user's current subscription.
      // Exception: if the stored stripeSubscriptionId points to a dead subscription
      // (incomplete/incomplete_expired/canceled) or 404, adopt the incoming manageable one instead.
      if (user.stripeSubscriptionId && user.stripeSubscriptionId !== subscription.id) {
        if (isManageableStripeSubscriptionStatus(subscription.status)) {
          const storedRetrieve = await retrieveStripeSubscription(user.stripeSubscriptionId);
          if (!storedRetrieve.ok) {
            if (storedRetrieve.is404) {
              webhookLog(
                "info",
                `Adopting subscription ${subscription.id} — stored ${user.stripeSubscriptionId} is 404/deleted`
              );
              user.stripeSubscriptionId = subscription.id;
            } else if (storedRetrieve.isRetryable) {
              webhookLog(
                "info",
                `Skipping subscription.updated for ${subscription.id} - Stripe verification retryable: ${storedRetrieve.message}`
              );
              return;
            } else {
              webhookLog(
                "info",
                `Ignoring update of subscription ${subscription.id} - could not verify stored sub: ${storedRetrieve.message}`
              );
              return;
            }
          } else if (isDeadStripeSubscriptionStatus(storedRetrieve.subscription.status)) {
            webhookLog(
              "info",
              `Adopting subscription ${subscription.id} (${subscription.status}) — stored ${user.stripeSubscriptionId} is ${storedRetrieve.subscription.status}`
            );
            user.stripeSubscriptionId = subscription.id;
          } else {
            webhookLog(
              "info",
              `Ignoring update of subscription ${subscription.id} - user has active subscription ${user.stripeSubscriptionId}`
            );
            return;
          }
        } else {
          webhookLog(
            "info",
            `Ignoring update of old subscription ${subscription.id} - user has newer subscription ${user.stripeSubscriptionId}`
          );
          return;
        }
      }

      // Only update status for specific cases to avoid conflicts
      if (wasActive && prevSubStatus === "active") {
        // Subscription already processed as active, only update autoRenew
        user.subscription.autoRenew = !subscription.cancel_at_period_end;
        // If cancel_at_period_end is true and cancelledAt is not set, this is a new cancellation
        if (subscription.cancel_at_period_end && !user.subscription.cancelledAt) {
          user.subscription.cancelledAt = new Date();
          const periodEnd = getSubscriptionPeriodEnd(subscription);
          if (periodEnd != null) user.subscription.endDate = new Date(periodEnd * 1000);
        } else if (!subscription.cancel_at_period_end && user.subscription.cancelledAt) {
          // If cancel_at_period_end is false (cancellation cancelled), clear cancelledAt
          user.subscription.cancelledAt = undefined;
          user.subscription.endDate = undefined;
        }
        // Sync endDate from Stripe period end for active/trialing subs so dashboard "Added on renewal" is correct
        // (e.g. after migration sets trial_end, subscription.updated fires with status trialing and we need to show new renewal date)
        if (subscription.status === "active" || subscription.status === "trialing") {
          const periodEnd = getSubscriptionPeriodEnd(subscription);
          if (periodEnd != null) user.subscription.endDate = new Date(periodEnd * 1000);
        }
      } else if (subscription.status === "past_due") {
        // Past due = failed renewal payment — NOT a user cancellation; do not set cancelledAt
        console.log(`🔄 [SUBSCRIPTION UPDATED] Status changed to: past_due for user ${user.email}`);

        const periodEnd = getSubscriptionPeriodEnd(subscription);
        const endDate = periodEnd != null ? new Date(periodEnd * 1000) : new Date();

        const preservedAccumulatedEntries = user.subscription.lastMonthAccumulatedEntries;

        user.subscription.isActive = false;
        user.subscription.status = "past_due";
        user.subscription.autoRenew = !subscription.cancel_at_period_end;
        user.subscription.endDate = endDate;

        if (prevSubStatus !== "past_due") {
          user.subscription.pastDueAt = new Date();
        }

        if (preservedAccumulatedEntries !== undefined) {
          user.subscription.lastMonthAccumulatedEntries = preservedAccumulatedEntries;
          console.log(
            `✅ [SUBSCRIPTION UPDATED] Preserved lastMonthAccumulatedEntries: ${preservedAccumulatedEntries}`
          );
          webhookLog(
            "info",
            `✅ Preserved lastMonthAccumulatedEntries: ${preservedAccumulatedEntries} for user ${user.email} (subscription past_due)`
          );
        }

        user.markModified("subscription");
      } else if (subscription.status === "unpaid") {
        // Unpaid = failed payments (similar recovery path to past_due for Klaviyo / app rules)
        console.log(`🔄 [SUBSCRIPTION UPDATED] Status changed to: unpaid for user ${user.email}`);

        const periodEndUnpaid = getSubscriptionPeriodEnd(subscription);
        const endDateUnpaid = periodEndUnpaid != null ? new Date(periodEndUnpaid * 1000) : new Date();
        const preservedAccumulatedUnpaid = user.subscription.lastMonthAccumulatedEntries;

        user.subscription.isActive = false;
        user.subscription.status = "unpaid";
        user.subscription.autoRenew = !subscription.cancel_at_period_end;
        user.subscription.endDate = endDateUnpaid;

        if (prevSubStatus !== "unpaid" && prevSubStatus !== "past_due") {
          user.subscription.pastDueAt = new Date();
        }

        if (preservedAccumulatedUnpaid !== undefined) {
          user.subscription.lastMonthAccumulatedEntries = preservedAccumulatedUnpaid;
        }

        user.markModified("subscription");
      } else if (subscription.status === "canceled") {
        // Explicit cancellation — set cancelledAt for activity log / product rules
        console.log(`🔄 [SUBSCRIPTION UPDATED] Status changed to: canceled for user ${user.email}`);

        const periodEnd = getSubscriptionPeriodEnd(subscription);
        const endDate = periodEnd != null ? new Date(periodEnd * 1000) : new Date();

        const preservedAccumulatedEntries = user.subscription.lastMonthAccumulatedEntries;

        user.subscription.isActive = false;
        user.subscription.status = "canceled";
        user.subscription.autoRenew = !subscription.cancel_at_period_end;
        user.subscription.endDate = endDate;
        if (!user.subscription.cancelledAt) {
          user.subscription.cancelledAt = new Date();
        }

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

        user.markModified("subscription");
      } else {
        user.subscription.autoRenew = !subscription.cancel_at_period_end;
        // Sync endDate for active/trialing even when DB had stale inactive state
        if (subscription.status === "active" || subscription.status === "trialing") {
          const periodEnd = getSubscriptionPeriodEnd(subscription);
          if (periodEnd != null) {
            user.subscription.endDate = new Date(periodEnd * 1000);
            user.subscription.isActive = true;
            user.subscription.status = subscription.status;
            // Stripe is active — clear stale cancellation timestamp (e.g. mis-set during past_due)
            user.subscription.cancelledAt = undefined;
          }
        }
      }

    }

    // ✅ Mark subscription as modified if we made changes
    if (user.subscription) {
      user.markModified("subscription");
    }

    await user.save();

    if (
      (user.subscription?.status === "active" || user.subscription?.status === "trialing") &&
      prevSubStatus !== "active" &&
      prevSubStatus !== "trialing"
    ) {
      try {
        const pkgId = user.subscription?.packageId != null ? String(user.subscription.packageId) : undefined;
        await appendActivationStatus({
          userId: new mongoose.Types.ObjectId(String(user._id)),
          effectiveAt: new Date(),
          source: "webhook_subscription_updated_active",
          subscriptionPackageId: pkgId,
          isTrialing: user.subscription?.status === "trialing",
          metadata: { stripeSubscriptionId: subscription.id, fromStatus: prevSubStatus, toStatus: user.subscription.status },
        });
      } catch (err) {
        webhookLog("warn", "Failed to append activation history from subscription.updated:", err);
      }
    }

    // Transition INTO active/trialing (past-due recovery OR a fresh first activation): refresh Klaviyo
    // so next_renewal_date / past_due_renewal_entries are current. Idempotent upsert; never re-subscribes.
    // Only fires on transitions INTO active/trialing (wasActiveBeforeUpdate === false), NOT on the fast-path
    // (wasActive && prevSubStatus === "active") which handles already-active routine updates.
    if (
      !wasActiveBeforeUpdate &&
      (subscription.status === "active" || subscription.status === "trialing")
    ) {
      ensureUserProfileSynced(user as IUser);
      webhookLog("info", `Klaviyo profile sync queued after recovery to ${subscription.status} for ${user.email}`);
    }

    // ✅ Verify save for canceled/past_due/unpaid status + Klaviyo profile (past_due renewal entries on profile)
    if (subscription.status === "canceled" || subscription.status === "past_due" || subscription.status === "unpaid") {
      const savedUser = await User.findById(user._id);
      console.log(
        `✅ [SUBSCRIPTION UPDATED] Verified - isActive: ${savedUser?.subscription?.isActive}, status: ${
          savedUser?.subscription?.status
        }, endDate: ${savedUser?.subscription?.endDate?.toISOString() || "undefined"}`
      );
      if (
        savedUser &&
        (savedUser.subscription?.status === "past_due" || savedUser.subscription?.status === "unpaid")
      ) {
        ensureUserProfileSynced(savedUser as IUser);
        webhookLog("info", `Klaviyo profile sync queued after subscription ${savedUser.subscription?.status} for ${savedUser.email}`);
      }
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
    const pendingChange = isValidPendingUpgrade(user.subscription?.pendingChange)
      ? user.subscription?.pendingChange
      : undefined;
    const hasRelevantPendingChange =
      pendingChange?.stripeSubscriptionId === subscription.id; // Only relevant if for THIS subscription

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

    // ✅ Set endDate consistently - use subscription period end (Basil: items; legacy: sub) or current date
    const periodEnd = getSubscriptionPeriodEnd(subscription);
    const endDate = periodEnd != null ? new Date(periodEnd * 1000) : new Date(); // Fallback to now

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
    // Expected business event (subscription renewal / invoice decline — the canonical
    // payment-failure event) — warn, not error. Genuine exceptions while handling it
    // are still logged at error level in the catch block below.
    webhookLog("warn", `Invoice payment failed: ${invoice.id}`);

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
    const prevSubStatus = user.subscription?.status;

    webhookLog("info", `Invoice billing_reason: ${billingReason}, isRenewal: ${isRenewal}, isInitialPayment: ${isInitialPayment}, subscriptionId: ${subscriptionId || 'none'}`);

    if (subscriptionId) {
      // ✅ CRITICAL FIX: Handle initial subscription creation failures differently from renewal failures
      // - Initial failures (subscription_create): Set status to "incomplete" or "incomplete_expired", NOT "past_due"
      // - Renewal failures (subscription_cycle): Set status to "past_due" (existing behavior is correct)
      
      if (user.subscription) {
        if (isInitialPayment) {
          // Initial subscription creation failed - this is NOT a past_due situation
          // The subscription never became active, so it should be marked as incomplete
          webhookLog("info", `Initial subscription creation failed - setting status to incomplete (not past_due)`);
          
          // Get Stripe subscription to check its actual status
          try {
            const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
            
            // Use Stripe's subscription status as source of truth
            // Stripe will set it to "incomplete" or "incomplete_expired" for failed initial payments
            const stripeStatus = stripeSubscription.status;
            
            // Map Stripe status to our database status
            if (stripeStatus === "incomplete" || stripeStatus === "incomplete_expired") {
              user.subscription.status = stripeStatus; // Use Stripe's status
              user.subscription.isActive = false;
              
              webhookLog("info", `Subscription status set to ${stripeStatus} for initial payment failure`);
            } else {
              // Fallback: if Stripe status is unexpected, set to incomplete
              user.subscription.status = "incomplete";
              user.subscription.isActive = false;
              
              webhookLog("warn", `Unexpected Stripe subscription status ${stripeStatus} for initial payment failure, setting to incomplete`);
            }
          } catch (stripeError) {
            // If we can't retrieve subscription, default to incomplete
            webhookLog("warn", `Failed to retrieve subscription status: ${stripeError}, defaulting to incomplete`);
            user.subscription.status = "incomplete";
            user.subscription.isActive = false;
          }
        } else if (isRenewal) {
          // Renewal payment failed - this IS a past_due situation
          // The subscription was active but payment for renewal failed
          webhookLog("info", `Renewal payment failed - setting status to past_due`);

          const wasAlreadyPastDue = user.subscription.status === "past_due";
          user.subscription.status = "past_due";
          user.subscription.isActive = false;
          if (!wasAlreadyPastDue) {
            user.subscription.pastDueAt = new Date();
          }

          // Stamp a durable dunning marker on THIS invoice so any later recovery (esp. the
          // renew-subscription channel, which pre-flips DB status + clears pause before the webhook)
          // can be detected by the reanchor gate. attempt_count is unreliable under pause_collection.
          if (invoice.id) {
            try {
              await stripe.invoices.update(invoice.id, {
                metadata: { ...(invoice.metadata ?? {}), dunning_recovery: "1" },
              });
            } catch (stampErr) {
              console.error(`[reanchor] could not stamp dunning_recovery on invoice ${invoice.id}:`, stampErr);
            }
          }

          // ✅ If subscription will be canceled after max retries, set endDate
          // Only check for renewal failures - initial failures don't have a period to end
          try {
            const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
            const periodEnd = getSubscriptionPeriodEnd(stripeSubscription);
            if (stripeSubscription.cancel_at_period_end && periodEnd != null) {
              const endDate = new Date(periodEnd * 1000);
              user.subscription.endDate = endDate;
              console.log(
                `📅 [INVOICE PAYMENT FAILED] Set endDate to ${endDate.toISOString()} for subscription that will be canceled`
              );
            }
          } catch (stripeError) {
            console.error(`❌ [INVOICE PAYMENT FAILED] Error retrieving subscription: ${stripeError}`);
            // Continue without endDate if we can't retrieve subscription
          }
        } else {
          // Unknown billing reason - default to past_due for safety (conservative approach)
          webhookLog("warn", `Unknown billing_reason: ${billingReason}, defaulting to past_due`);
          const wasAlreadyPastDueUnknown = user.subscription.status === "past_due";
          user.subscription.status = "past_due";
          user.subscription.isActive = false;
          if (!wasAlreadyPastDueUnknown) {
            user.subscription.pastDueAt = new Date();
          }
        }

        // ✅ CRITICAL FIX: Mark subscription as modified so Mongoose detects the changes
        user.markModified("subscription");
      }
      
      // ✅ CRITICAL FIX: If initial subscription creation failed, detach payment method to prevent it from being saved
      // This prevents payment methods from being saved when subscription creation fails due to insufficient funds
      if (isInitialPayment) {
        try {
          // Get payment method from invoice or payment intent
          const invoiceWithPaymentIntent = invoice as Stripe.Invoice & { 
            payment_intent?: string | Stripe.PaymentIntent;
            latest_payment_intent?: string | Stripe.PaymentIntent;
          };
          
          let paymentMethodId: string | undefined;
          
          // Try to get payment method ID from invoice payment intent
          if (invoiceWithPaymentIntent.payment_intent) {
            const piId = typeof invoiceWithPaymentIntent.payment_intent === "string"
              ? invoiceWithPaymentIntent.payment_intent
              : invoiceWithPaymentIntent.payment_intent?.id;
            
            if (piId) {
              const paymentIntent = await stripe.paymentIntents.retrieve(piId);
              if (paymentIntent.payment_method) {
                paymentMethodId = typeof paymentIntent.payment_method === "string"
                  ? paymentIntent.payment_method
                  : paymentIntent.payment_method.id;
              }
            }
          }
          
          // Try latest_payment_intent if payment_intent didn't work
          if (!paymentMethodId && invoiceWithPaymentIntent.latest_payment_intent) {
            const piId = typeof invoiceWithPaymentIntent.latest_payment_intent === "string"
              ? invoiceWithPaymentIntent.latest_payment_intent
              : invoiceWithPaymentIntent.latest_payment_intent?.id;
            
            if (piId) {
              const paymentIntent = await stripe.paymentIntents.retrieve(piId);
              if (paymentIntent.payment_method) {
                paymentMethodId = typeof paymentIntent.payment_method === "string"
                  ? paymentIntent.payment_method
                  : paymentIntent.payment_method.id;
              }
            }
          }
          
          // Detach payment method if found
          if (paymentMethodId && user.stripeCustomerId) {
            try {
              const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
              const pmCustomerId = typeof paymentMethod.customer === "string" 
                ? paymentMethod.customer 
                : paymentMethod.customer?.id;
              
              // Only detach if it's attached to this customer
              if (pmCustomerId === user.stripeCustomerId) {
                await stripe.paymentMethods.detach(paymentMethodId);
                webhookLog("info", `✅ Detached payment method ${paymentMethodId} after initial subscription creation failure`);
                
                // Also remove from user's saved payment methods if it exists
                if (user.savedPaymentMethods && user.savedPaymentMethods.length > 0) {
                  const pmIndex = user.savedPaymentMethods.findIndex(pm => pm.paymentMethodId === paymentMethodId);
                  if (pmIndex !== -1) {
                    user.savedPaymentMethods.splice(pmIndex, 1);
                    webhookLog("info", `✅ Removed payment method ${paymentMethodId} from user's saved payment methods`);
                  }
                }
              }
            } catch (detachError) {
              webhookLog("warn", `Failed to detach payment method ${paymentMethodId}: ${detachError}`);
              // Continue - not critical if detach fails
            }
          }
        } catch (pmCleanupError) {
          webhookLog("warn", `Error during payment method cleanup for initial subscription failure: ${pmCleanupError}`);
          // Continue - cleanup failure shouldn't block the rest of the process
        }
      }
    }

    await user.save();

    if (invoice.id && subscriptionId && isRenewal) {
      try {
        await upsertRenewalCycleFromFailedInvoice({
          invoice,
          userId: new mongoose.Types.ObjectId(String(user._id)),
          stripeSubscriptionId: subscriptionId,
        });
      } catch (cycleErr) {
        webhookLog("warn", `Membership renewal cycle persist failed (non-blocking): ${cycleErr}`);
      }
    }

    if (
      invoice.id &&
      user.subscription?.status === "past_due" &&
      prevSubStatus !== "past_due"
    ) {
      try {
        const pkgId = user.subscription?.packageId != null ? String(user.subscription.packageId) : undefined;
        await appendMembershipStatusHistory({
          userId: new mongoose.Types.ObjectId(String(user._id)),
          effectiveAt: new Date(),
          membershipStatus: "past_due",
          actor: "stripe",
          source: "webhook_invoice_payment_failed",
          dedupeKey: `pastdue_inv_${invoice.id}`,
          subscriptionPackageId: pkgId,
          autoRenew: user.subscription?.autoRenew,
          endDate: user.subscription?.endDate ?? undefined,
          pastDueAt: user.subscription?.pastDueAt ?? new Date(),
          metadata: { invoiceId: invoice.id, billingReason: billingReason ?? null },
        });
      } catch (histErr) {
        webhookLog("warn", `Membership status history persist failed (non-blocking): ${histErr}`);
      }
    }

    // ✅ Verify save for payment failures
    if (subscriptionId && user.subscription) {
      const savedUser = await User.findById(user._id);
      console.log(
        `✅ [INVOICE PAYMENT FAILED] Verified - isActive: ${savedUser?.subscription?.isActive}, status: ${savedUser?.subscription?.status}`
      );
    }

    // Prevent stacking multiple finalized renewal invoices while past_due (Stripe pause_collection)
    if (isRenewal && subscriptionId) {
      try {
        await pauseAfterRenewalFailure(subscriptionId);
        webhookLog(
          "info",
          `pause_collection(keep_as_draft) after renewal failure for subscription ${subscriptionId}`
        );
      } catch (pauseErr) {
        webhookLog(
          "error",
          `Failed to pause subscription collection after renewal failure (non-blocking): ${pauseErr}`
        );
      }
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
            expand: ["payment_intent", "charges.data.payment_intent"],
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
            expand: ["latest_invoice.payment_intent"],
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
      } catch {
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
        
        const expectedEntries = getRenewalEntriesPreviewForProfile(user as IUser) ?? undefined;
        if (expectedEntries !== undefined) {
          webhookLog("info", `Calculated expected entries for renewal (shared helper): ${expectedEntries}`);
        } else {
          webhookLog("warn", `Could not compute expected entries for renewal (package/status) user=${user._id}`);
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

    // ✅ NON-CRITICAL: Update Klaviyo profile to reflect failed payment status (fire-and-forget)
    executeBackgroundJob("Klaviyo profile sync after invoice payment failed", async () => {
      await ensureUserProfileSynced(user);
    });

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
      // Basil (2025-08-27): invoices no longer carry top-level payment_intent/charge —
      // they live under payments.data[].payment. Keep legacy keys for older API safety.
      expand: [
        "parent.subscription_details.subscription",
        "payment_intent",
        "charge",
        "payments.data.payment",
      ],
    });

    // ✅ GUARD: Stripe auto-creates a $0 "Trial period" invoice (billing_reason=subscription_update,
    // total=0) whenever trial_end is set on a subscription (past-due reanchor, the anchor-billing
    // migration, join-anchoring). It is NOT a real payment — granting benefits for it double-counts
    // renewal entries (the real renewal is a separate subscription_cycle invoice) and produces a
    // spurious "Subscribed to X" admin activity row. Skip it entirely. See docs/PAST_DUE_REANCHOR.md.
    if (isZeroAmountTrialUpdateInvoice(expandedInvoice)) {
      webhookLog(
        "info",
        `Skipping $0 trial-period subscription_update invoice ${invoiceId} (Stripe trial_end bookkeeping; no benefits/activity).`
      );
      return;
    }

    // ✅ CRITICAL FIX: ATOMIC PaymentEvent creation to prevent race conditions
    // Create PaymentEvent FIRST using MongoDB unique constraint
    // If creation fails (duplicate key), another webhook is already processing
    const invoicePaymentId = `invoice_${expandedInvoice.id}`;
    const eventId = `BenefitsGranted-${invoicePaymentId}`;

    // ✅ DEBUG: Log invoice details (correlationId from subscription metadata when available)
    const invoiceSubId = resolveInvoiceSubscriptionId(expandedInvoice);
    webhookLog("info", `Invoice details:`, {
      invoiceId: expandedInvoice.id,
      customerId: expandedInvoice.customer,
      subscriptionId: invoiceSubId,
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

    /** DB subscription status before this payment (e.g. past_due recovery vs regular renewal) */
    const previousSubscriptionDbStatus = user.subscription?.status;

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

    // Resolve subscription from invoice (expanded). For invoice.payment_succeeded, Stripe's invoice.subscription
    // is the source of truth for which subscription was billed — not Mongo stripeSubscriptionId (can be stale
    // after duplicate incomplete subs / checkout races).
    const invoiceSubscription = (expandedInvoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription })
      .subscription;
    const invoiceSubscriptionId = resolveInvoiceSubscriptionId(expandedInvoice);
    const pendingSubscriptionId = user.subscription?.pendingStripeSubscriptionId;

    /**
     * Canonical ID for this payment: Stripe invoice first, then customer-correlated pending attempt,
     * then canonical DB fallback for legacy/renewal paths.
     */
    const subscriptionId: string | undefined =
      invoiceSubscriptionId ?? pendingSubscriptionId ?? user.stripeSubscriptionId ?? undefined;

    // Observability for upgrade flows (subscriptionId already matches invoice when invoice has a subscription)
    if (user.subscription?.pendingChange?.stripeSubscriptionId && invoiceSubscriptionId) {
      if (invoiceSubscriptionId === user.subscription.pendingChange.stripeSubscriptionId) {
        webhookLog(
          "info",
          `Processing upgrade payment for subscription: ${subscriptionId} (proration: ${hasProrationItems})`
        );
      } else if (invoiceSubscriptionId === user.stripeSubscriptionId && isProrationInvoice) {
        webhookLog("info", `Processing proration charge on existing subscription: ${subscriptionId}`);
      }
    }

    if (!subscriptionId) {
      webhookLog("warn", `No subscription ID found for user: ${user.email}`);
      return;
    }

    if (expandedInvoice.billing_reason === "subscription_cycle" && expandedInvoice.id) {
      let firstTimePaidCycle = false;
      try {
        ({ firstTimeSucceeded: firstTimePaidCycle } = await upsertRenewalCycleFromPaidInvoice({
          invoice: expandedInvoice,
          userId: new mongoose.Types.ObjectId(String(user._id)),
          stripeSubscriptionId: subscriptionId,
        }));
      } catch (cycleErr) {
        webhookLog("warn", `Membership renewal cycle (paid) persist failed (non-blocking): ${cycleErr}`);
      }
      // Membership Streak: +1 per first-paid renewal cycle (replay-proof via the
      // ledger pre-image — a redelivered webhook sees "succeeded" and skips).
      if (firstTimePaidCycle) {
        try {
          await User.updateOne({ _id: user._id }, { $inc: { "subscription.streakMonths": 1 } });
          if (user.subscription) {
            // Keep the in-memory doc fresh so any later user.save() in this handler can't regress the counter.
            user.subscription.streakMonths = (user.subscription.streakMonths ?? 0) + 1;
          }
          webhookLog("info", `Streak +1 → ${user.subscription?.streakMonths} (cycle invoice ${expandedInvoice.id})`);
        } catch (streakErr) {
          // Counter drift is repairable by re-running scripts/backfill-membership-streaks.ts --live
          console.error(`Streak increment failed for user ${user._id} invoice ${expandedInvoice.id}:`, streakErr);
        }
      }
    }

    if (invoiceSubscriptionId && invoiceSubscriptionId !== user.stripeSubscriptionId) {
      webhookLog("info", `Invoice subscription ${invoiceSubscriptionId} (canonical) vs DB stripeSubscriptionId ${user.stripeSubscriptionId ?? "(none)"} — processing payment for invoice subscription`);
    }

    // Use expanded subscription from invoice when it matches subscriptionId (metadata + fewer round trips)
    let subscription: Stripe.Subscription;
    try {
      if (
        typeof invoiceSubscription === "object" &&
        invoiceSubscription !== null &&
        "id" in invoiceSubscription &&
        (invoiceSubscription as Stripe.Subscription).id === subscriptionId
      ) {
        subscription = invoiceSubscription as Stripe.Subscription;
      } else {
        subscription = await stripe.subscriptions.retrieve(subscriptionId);
      }

      // Relabel recurring renewal charges so the Stripe transactions list reads
      // "Tradie Renewal" instead of the join-time subscription.description ("Tradie").
      if (expandedInvoice.billing_reason === "subscription_cycle") {
        try {
          const packageName = subscription.metadata.packageName || "Subscription";
          const renewalDescription = `${packageName} Renewal`;

          // Basil: invoice.payment_intent/charge are gone — resolve the PI via the
          // shared payments[].payment-aware helper, then derive the Charge from the PI.
          const [paymentIntentId] = paymentIntentIdsOnInvoice(expandedInvoice);
          if (paymentIntentId) {
            const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
              expand: ["latest_charge"],
            });
            await stripe.paymentIntents.update(paymentIntentId, {
              description: renewalDescription,
            });

            // The transactions list renders the *Charge* description, not the PI's,
            // and the auto-cycle charge has already settled by the time this runs —
            // so the Charge must be updated directly.
            const chargeId = pi.latest_charge
              ? typeof pi.latest_charge === "string"
                ? pi.latest_charge
                : pi.latest_charge.id
              : undefined;
            if (chargeId) {
              await stripe.charges.update(chargeId, { description: renewalDescription });
            } else {
              webhookLog("warn", `No charge to relabel for renewal invoice ${expandedInvoice.id}`);
            }
          } else {
            webhookLog("warn", `No payment intent on renewal invoice ${expandedInvoice.id} — cannot relabel`);
          }
        } catch (updateError) {
          webhookLog("error", `Failed to relabel renewal charge/payment intent description: ${updateError}`);
        }
      }
    } catch (stripeError) {
      webhookLog("error", `Stripe subscription retrieval failed: ${stripeError}`);
      throw stripeError;
    }

    const paidSubscriptionId = subscription.id;
    const invoiceCustomerId =
      typeof expandedInvoice.customer === "string" ? expandedInvoice.customer : expandedInvoice.customer?.id;
    const subscriptionCustomerId =
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;

    if (invoiceCustomerId && subscriptionCustomerId && invoiceCustomerId !== subscriptionCustomerId) {
      webhookLog(
        "error",
        `Invoice customer ${invoiceCustomerId} does not match subscription customer ${subscriptionCustomerId}; skipping benefit grant`
      );
      return;
    }

    if (!isManageableStripeSubscriptionStatus(subscription.status)) {
      webhookLog(
        "warn",
        `Paid invoice resolved subscription ${subscription.id}, but status ${subscription.status} is not manageable; skipping benefit grant`
      );
      return;
    }

    if (user.stripeSubscriptionId !== paidSubscriptionId) {
      await User.findByIdAndUpdate(user._id, {
        $set: { stripeSubscriptionId: paidSubscriptionId },
      });
      user.stripeSubscriptionId = paidSubscriptionId;
      webhookLog(
        "info",
        `Promoted paid subscription ${paidSubscriptionId} (${subscription.status}) to canonical stripeSubscriptionId before benefits`
      );
    }

    // Affiliate eligibility (moved up): needed for processPaymentBenefits and for resuming collection early.
    const recordMembershipRecurringAffiliate = await shouldRecordMembershipRecurringAffiliateCharge(
      stripe,
      expandedInvoice,
      subscriptionId
    );

    // Clear pause_collection BEFORE processPaymentBenefits. Benefits processing can be slow; Stripe CLI / proxies
    // may time out while waiting for the HTTP response, and processPaymentBenefits can still return success: false
    // — in those cases a late resume never ran, leaving the subscription in "Collection paused" despite a paid invoice.
    const invoiceAmountPaid = expandedInvoice.amount_paid ?? 0;
    const invoiceIsPaid = expandedInvoice.status === "paid" && invoiceAmountPaid > 0;
    // Snapshot pause_collection BEFORE resumeAfterSuccessfulRenewalPayment clears it in Stripe,
    // so the reanchor gate can use it as a dunning signal.
    const pauseCollectionPresentAtPayment = subscription.pause_collection != null;
    if (invoiceIsPaid) {
      const shouldClearPauseForCollection = decideClearPause({
        billingReason: expandedInvoice.billing_reason ?? undefined,
        previousSubscriptionDbStatus: previousSubscriptionDbStatus ?? undefined,
        pauseCollectionPresent: subscription.pause_collection != null,
        pauseReason: (subscription.metadata?.pauseReason as string | undefined) ?? undefined,
        recordMembershipRecurringAffiliate,
      });
      if (shouldClearPauseForCollection) {
        try {
          await resumeAfterSuccessfulRenewalPayment(subscription.id);
          webhookLog(
            "info",
            `Cleared pause_collection (before processPaymentBenefits) for subscription ${subscription.id} invoice ${expandedInvoice.id}`
          );
        } catch (earlyResumeErr) {
          webhookLog("warn", `Non-critical: could not resume collection before benefits: ${earlyResumeErr}`);
        }
      }
    }

    // --- Past-due reanchor: move future renewals to the recovery-payment date ---
    if (invoiceIsPaid && expandedInvoice.id) {
      const reanchorGate = shouldReanchorAfterRecovery({
        billingReason: expandedInvoice.billing_reason ?? undefined,
        invoiceIsPaid,
        previousSubscriptionDbStatus: previousSubscriptionDbStatus ?? undefined,
        pauseCollectionPresentAtPayment,
        invoiceAttemptCount: expandedInvoice.attempt_count ?? undefined,
        invoiceMetadataDunningRecovery: expandedInvoice.metadata?.dunning_recovery === "1",
        pauseReason: (subscription.metadata?.pauseReason as string | undefined) ?? undefined,
        cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
        autoRenew: user.subscription?.autoRenew,
        alreadyReanchoredInvoiceId: user.subscription?.lastReanchoredInvoiceId,
        invoiceId: expandedInvoice.id,
      });
      if (reanchorGate) {
        const recoveryDate = paidAtDateFromStripeInvoice(expandedInvoice) ?? new Date();
        const reanchorResult = await reanchorAfterPastDueRecovery({
          subscriptionId: subscription.id,
          userId: new mongoose.Types.ObjectId(String(user._id)),
          recoveryDate,
          invoiceId: expandedInvoice.id,
          packageId: user.subscription?.packageId ?? undefined,
        });
        if (reanchorResult.reanchored) {
          webhookLog(
            "info",
            `Reanchored subscription ${subscription.id} after past-due recovery (invoice ${expandedInvoice.id})`
          );
        }
      }
    }

    // Auto-correct stripeSubscriptionId when DB points at a different subscription than the one this invoice paid for,
    // and the stored subscription is dead (incomplete / incomplete_expired / canceled) or missing (404).
    // Compare against subscription.id (paid sub), not a local variable seeded only from DB — that made the old check a no-op.
    if (
      paidSubscriptionId &&
      user.stripeSubscriptionId &&
      user.stripeSubscriptionId !== paidSubscriptionId &&
      isManageableStripeSubscriptionStatus(subscription.status)
    ) {
      const storedRetrieve = await retrieveStripeSubscription(user.stripeSubscriptionId);
      const shouldCorrect =
        (!storedRetrieve.ok && storedRetrieve.is404) ||
        (storedRetrieve.ok &&
          shouldAdoptPaidSubscriptionOverStored(
            paidSubscriptionId,
            user.stripeSubscriptionId,
            subscription.status,
            storedRetrieve.subscription.status
          ));
      if (shouldCorrect) {
        await User.findByIdAndUpdate(user._id, {
          $set: { stripeSubscriptionId: paidSubscriptionId },
        });
        user.stripeSubscriptionId = paidSubscriptionId;
        webhookLog(
          "info",
          `Auto-corrected stripeSubscriptionId → ${paidSubscriptionId} (${subscription.status}) for ${user.email}`
        );
      } else if (!storedRetrieve.ok && !storedRetrieve.is404) {
        webhookLog(
          "warn",
          `Non-critical: could not verify stored stripeSubscriptionId: ${storedRetrieve.message}`
        );
      }
    }

    // 🎯 NEW APPROACH: Simply use packageId from Stripe subscription metadata
    // previousSubscription handles benefit preservation automatically
    const packageId = subscription.metadata.packageId;

    if (!packageId) {
      webhookLog("error", `No packageId found in subscription metadata`);
      return;
    }

    webhookLog("info", `Processing subscription payment for package: ${packageId}`, {
      ...(subscription.metadata?.subscriptionRequestId && { correlationId: subscription.metadata.subscriptionRequestId }),
    });

    // Get membership package data
    const membershipPackage = getPackageById(packageId);
    if (!membershipPackage) {
      webhookLog("error", `Membership package not found: ${packageId}`);
      return;
    }

    // Resubscribe: use subscription metadata first (API may have set user.subscription.isActive before webhook runs)
    const isResubscribeFromMetadata =
      expandedInvoice.billing_reason === "subscription_create" &&
      subscription.metadata?.[STRIPE_SUBSCRIPTION_METADATA_IS_RESUBSCRIBE] === "true";
    const isResubscribeFromUser =
      expandedInvoice.billing_reason === "subscription_create" &&
      !user.subscription?.isActive &&
      user.subscription?.lastMonthAccumulatedEntries !== undefined;
    const isResubscribe = isResubscribeFromMetadata || isResubscribeFromUser;

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

    // Membership Streak: start/continue/reset on subscription_create (upgrades excluded — continuity).
    // Renewal increments live beside the renewal-cycle upsert above. Idempotent per invoice id.
    try {
      const streakDecision = decideStreakOnSubscriptionCreate({
        billingReason: expandedInvoice.billing_reason,
        isUpgrade,
        isResubscribe,
        previousEndDate: user.subscription?.endDate ?? null,
        currentStreakMonths: user.subscription?.streakMonths ?? 0,
        currentStreakGeneration: user.subscription?.streakGeneration ?? 1,
        now: new Date(),
      });
      if (streakDecision.action === "start" && expandedInvoice.id) {
        const res = await User.updateOne(
          { _id: user._id, "subscription.lastStreakStartInvoiceId": { $ne: expandedInvoice.id } },
          {
            $set: {
              "subscription.streakMonths": streakDecision.streakMonths,
              "subscription.streakGeneration": streakDecision.streakGeneration,
              "subscription.lastStreakStartInvoiceId": expandedInvoice.id,
            },
          }
        );
        if (res.modifiedCount === 1 && user.subscription) {
          user.subscription.streakMonths = streakDecision.streakMonths;
          user.subscription.streakGeneration = streakDecision.streakGeneration;
          user.subscription.lastStreakStartInvoiceId = expandedInvoice.id;
          webhookLog(
            "info",
            `Streak ${isResubscribe ? "reset (out-of-grace resubscribe)" : "started"} — generation ${streakDecision.streakGeneration} (invoice ${expandedInvoice.id})`
          );
        }
      } else if (streakDecision.action === "continue") {
        webhookLog("info", `Streak continues at ${user.subscription?.streakMonths ?? 0} (grace-window resubscribe)`);
      }
    } catch (streakErr) {
      console.error(`Streak start writer failed for user ${user._id}:`, streakErr);
    }

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

    // Normalize for entry math: subscription_update / subscription_threshold behave like renewals (cycle)
    const rawBillingReason = expandedInvoice.billing_reason;
    const billingReasonForEntries: "subscription_create" | "subscription_cycle" =
      rawBillingReason === "subscription_create"
        ? "subscription_create"
        : rawBillingReason === "subscription_cycle" ||
            rawBillingReason === "subscription_update" ||
            rawBillingReason === "subscription_threshold"
          ? "subscription_cycle"
          : "subscription_create";

    // Calculate entries using the new system
    // ✅ NOTE: For downgrades, lastMonthAccumulatedEntries is preserved during downgrade
    // Renewals after downgrade will correctly use: lastMonthAccumulatedEntries + newBaseEntries
    // (e.g., if user had 500 accumulated, downgrades to package with 40 base, next renewal = 500 + 40 = 540)
    const hasGrantThisDraw = isUpgrade
      ? await hasMembershipGrantInCurrentDrawPeriod(user._id)
      : false;

    const entryCalculation = calculateSubscriptionEntries({
      billingReason: billingReasonForEntries,
      baseEntries,
      lastMonthAccumulatedEntries: user.subscription?.lastMonthAccumulatedEntries,
      isResubscribe,
      promoMultiplier,
      isUpgrade,
      currentAccumulatedEntries,
      hasMembershipGrantInCurrentDrawPeriod: hasGrantThisDraw,
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
      hasMembershipGrantInCurrentDrawPeriod: hasGrantThisDraw,
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
      webhookLog(
        "info",
        `🎯 UPGRADE MODE: ${hasGrantThisDraw ? "B (legacy — grant already this draw period)" : "A (stack — no prior membership grant this draw)"}`
      );
    } else if (expandedInvoice.billing_reason === "subscription_cycle") {
      webhookLog("info", `Processing renewal for package ${packageId} - granting full benefits`);
      // Grant full benefits for renewal
    } else if (expandedInvoice.billing_reason === "subscription_create") {
      webhookLog("info", `Processing new subscription for package ${packageId} - granting full benefits`);
      // Grant full benefits for new subscription
    } else if (
      expandedInvoice.billing_reason === "subscription_update" ||
      expandedInvoice.billing_reason === "subscription_threshold"
    ) {
      webhookLog(
        "info",
        `Processing subscription invoice (${expandedInvoice.billing_reason}) for package ${packageId} - granting benefits`
      );
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

    // Extract request context from subscription or invoice metadata (if available)
    // For new subscriptions, CAPI metadata is set on the subscription at creation; invoice may not have it
    // Note: For subscription renewals, original request context may not be available
    const requestContext =
      (subscription?.metadata ? extractRequestContextFromMetadata(subscription.metadata) : undefined) ??
      (expandedInvoice.metadata ? extractRequestContextFromMetadata(expandedInvoice.metadata) : undefined);

    // ✅ CRITICAL: Retrieve promoLinkCode, affiliateCode, and A/B testing assignment from metadata
    // For subscriptions, check subscription metadata FIRST (most reliable)
    // Then fall back to payment_intent metadata
    let promoLinkCode: string | undefined;
    let campaignCode: string | undefined;
    let affiliateCode: string | undefined;
    let experimentId: string | undefined;
    let variantId: string | undefined;
    // A/B-test attribution: only the INITIAL subscription purchase counts toward the experiment.
    // Renewals (subscription_cycle) and upgrades/downgrades (subscription_update) carry the same
    // subscription metadata for the lifetime of the subscription — attributing them would inflate
    // the original variant's revenue every month forever, even after the experiment ended.
    const isInitialSubscriptionInvoice = expandedInvoice.billing_reason === "subscription_create";
    try {
      const invoiceTyped = expandedInvoice as Stripe.Invoice & {
        payment_intent?: string | Stripe.PaymentIntent;
        charge?: string | Stripe.Charge;
        subscription?: string | Stripe.Subscription;
      };

      // ✅ METHOD 1: Check subscription metadata FIRST (for subscription payments) - MOST RELIABLE
      // For subscriptions, metadata is set on the subscription object when created
      // We already have the subscription object from line 1796, so use it directly
      if (subscription?.metadata) {
        if (subscription.metadata.promoLinkCode) {
          promoLinkCode = subscription.metadata.promoLinkCode;
          affiliateCode = subscription.metadata.affiliateCode;
          webhookLog("info", `✅ Retrieved promoLinkCode from subscription metadata: ${promoLinkCode}`);
        }
        if (subscription.metadata.campaignCode) {
          campaignCode = subscription.metadata.campaignCode;
        }
        // ✅ A/B Testing: Extract experiment assignment from subscription metadata
        // Gated on initial-invoice only so renewals don't keep crediting the original variant.
        if (
          isInitialSubscriptionInvoice &&
          subscription.metadata.experimentId &&
          subscription.metadata.variantId
        ) {
          experimentId = subscription.metadata.experimentId;
          variantId = subscription.metadata.variantId;
          webhookLog("info", `✅ Retrieved experiment assignment from subscription metadata:`, {
            experimentId,
            variantId,
            invoiceId: expandedInvoice.id,
            subscriptionId: subscription.id,
          });
        } else if (
          !isInitialSubscriptionInvoice &&
          subscription.metadata.experimentId &&
          subscription.metadata.variantId
        ) {
          webhookLog(
            "info",
            `↩️ Skipping A/B attribution for non-initial subscription invoice (billing_reason=${expandedInvoice.billing_reason})`,
            { invoiceId: expandedInvoice.id, subscriptionId: subscription.id }
          );
        }
      }

      // Method 2: Check invoice payment_intent field (fallback for subscriptions, primary for one-time)
      if ((!promoLinkCode || !experimentId) && invoiceTyped.payment_intent) {
        const paymentIntentId =
          typeof invoiceTyped.payment_intent === "string"
            ? invoiceTyped.payment_intent
            : invoiceTyped.payment_intent.id;
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (!promoLinkCode) {
          promoLinkCode = paymentIntent.metadata.promoLinkCode;
          affiliateCode = paymentIntent.metadata.affiliateCode;
          if (promoLinkCode) {
            webhookLog("info", `✅ Retrieved promoLinkCode from invoice payment_intent: ${promoLinkCode}`);
          }
        }
        if (!campaignCode && paymentIntent.metadata.campaignCode) {
          campaignCode = paymentIntent.metadata.campaignCode;
        }
        // ✅ A/B Testing: Extract experiment assignment from payment intent metadata (if not in subscription)
        // Same initial-invoice gate as METHOD 1.
        if (
          !experimentId &&
          isInitialSubscriptionInvoice &&
          paymentIntent.metadata.experimentId &&
          paymentIntent.metadata.variantId
        ) {
          experimentId = paymentIntent.metadata.experimentId;
          variantId = paymentIntent.metadata.variantId;
          webhookLog("info", `✅ Retrieved experiment assignment from payment intent metadata:`, {
            experimentId,
            variantId,
            invoiceId: expandedInvoice.id,
            paymentIntentId: paymentIntent.id,
          });
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
          if (!campaignCode && paymentIntent.metadata.campaignCode) {
            campaignCode = paymentIntent.metadata.campaignCode;
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
      if (!campaignCode && expandedInvoice.metadata?.campaignCode) {
        campaignCode = expandedInvoice.metadata.campaignCode;
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

    const sessionAttribution =
      (subscription?.metadata ? extractAttributionFromMetadata(subscription.metadata) : undefined) ??
      (expandedInvoice.metadata ? extractAttributionFromMetadata(expandedInvoice.metadata) : undefined);

    // Renewals inherit the edge-resolved decision stamped on the subscription (sticky);
    // fall back to the invoice metadata when the subscription has none.
    const resolvedAttribution =
      extractResolvedPlatformFromMetadata(subscription?.metadata) ??
      extractResolvedPlatformFromMetadata(expandedInvoice.metadata);

    const previousLastMonthAccumulated = user.subscription?.lastMonthAccumulatedEntries ?? 0;
    const lastMonthDeltaForLedger = newLastMonthAccumulatedEntries - previousLastMonthAccumulated;

    // Resolve the real PaymentIntent id from the invoice so the Facebook Purchase event_id
    // matches what the browser pixel fires with (`pi_…`). Storage key (`invoicePaymentId`)
    // remains `invoice_${invoice.id}` for idempotency; only Meta's event_id is overridden.
    //
    // Basil (2025-08-27): `invoice.payment_intent` is REMOVED — reading it always returns
    // undefined, which left `trackingOrderId` unset, so the server Purchase fired with
    // `invoice_<id>` while the browser fired with the real `pi_<id>`. Different event_ids =
    // NO dedup = Meta counts the membership purchase TWICE (inflated conversions / ROAS).
    // `paymentIntentIdsOnInvoice` resolves the PI via `payments.data[].payment.payment_intent`
    // (expandedInvoice is expanded with `payments.data.payment` above), restoring dedup.
    const [facebookTrackingPaymentIntentId] = paymentIntentIdsOnInvoice(expandedInvoice);

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
        // Same paid_at moment, under the tracking-specific name so Meta event_time
        // derivation reads one field with one meaning across all purchase paths.
        chargedAt: Math.floor(paymentTimestamp * 1000),
        type: "subscription",
        packageType: "membership",
        promoLinkCode: promoLinkCode || undefined,
        campaignCode: campaignCode || undefined,
        affiliateCode: affiliateCode || undefined,
        // ✅ A/B Testing: Include experiment assignment from metadata (most reliable source)
        ...(experimentId && variantId && {
          experimentId,
          variantId,
        }),
        // Bug fix 2026-05-12: align Facebook Purchase event_id with browser pixel (real PI id).
        ...(facebookTrackingPaymentIntentId && { trackingOrderId: facebookTrackingPaymentIntentId }),
      },
      requestContext, // Pass request context if available (may be undefined for renewals)
      expandedInvoice.billing_reason || undefined, // ✅ Pass billing_reason for accurate renewal tracking (e.g., "subscription_create", "subscription_cycle")
      sessionAttribution,
      {
        skipMembershipFirstCommission: recordMembershipRecurringAffiliate,
      },
      isResubscribe,
      {
        lastMonthDelta: lastMonthDeltaForLedger,
        calculationType: entryCalculation.calculationType,
      },
      resolvedAttribution
    );
    webhookLog("info", `Affiliate recurring eligibility`, {
      invoiceId: expandedInvoice.id,
      billingReason: expandedInvoice.billing_reason,
      recordMembershipRecurringAffiliate,
    });

    // ✅ ADD: Log if experiment assignment was passed to processPaymentBenefits
    if (experimentId && variantId) {
      webhookLog("info", `✅ Passed experiment assignment to processPaymentBenefits for subscription:`, {
        experimentId,
        variantId,
        invoiceId: expandedInvoice.id,
        billingReason: expandedInvoice.billing_reason,
      });
    } else {
      webhookLog("warn", `⚠️ No experiment assignment to pass to processPaymentBenefits for subscription:`, {
        invoiceId: expandedInvoice.id,
        billingReason: expandedInvoice.billing_reason,
        hasSubscriptionMetadata: !!subscription?.metadata,
        hasInvoicePaymentIntent: !!(expandedInvoice as Stripe.Invoice & { payment_intent?: string | Stripe.PaymentIntent }).payment_intent,
      });
    }

    if (result.success) {
      // pause_collection is cleared before processPaymentBenefits (see above) so collection is not left paused on timeout/benefit errors.

      // ✅ Safety net: Sync canonical subscription state and clear pending initial checkout bridge.
      if (expandedInvoice.billing_reason === "subscription_create") {
        try {
          const subStatus = subscription?.status;
          const shouldBeActive = subStatus === "active" || subStatus === "trialing";
          if (shouldBeActive) {
            await User.findByIdAndUpdate(
              user._id,
              {
                $set: {
                  stripeSubscriptionId: paidSubscriptionId,
                  "subscription.isActive": true,
                  "subscription.status": subStatus,
                },
                $unset: {
                  "subscription.pendingStripeSubscriptionId": "",
                  "subscription.pendingStripeSubscriptionRequestId": "",
                  "subscription.pendingStripeSubscriptionCreatedAt": "",
                },
              }
            );
            user.stripeSubscriptionId = paidSubscriptionId;
            if (user.subscription) {
              user.subscription.isActive = true;
              user.subscription.status = subStatus;
              user.subscription.pendingStripeSubscriptionId = undefined;
              user.subscription.pendingStripeSubscriptionRequestId = undefined;
              user.subscription.pendingStripeSubscriptionCreatedAt = undefined;
            }
            webhookLog("info", `Synced canonical subscription state (status=${subStatus}) for ${user.email}`);
          }
        } catch (syncErr) {
          webhookLog("warn", `Non-critical: could not sync subscription_create state: ${syncErr}`);
        }
      }

      // ✅ Process referral if this is first purchase (processedPayments.length === 1)
      // Only process for initial subscription creation, not renewals or upgrades
      if (expandedInvoice.billing_reason === "subscription_create") {
        try {
          // Check invoice metadata first, then subscription metadata
          const referralCode =
            expandedInvoice.metadata?.referralCode ||
            (subscription?.metadata?.referralCode as string | undefined);

          if (referralCode) {
            // Check if user is first-time (processedPayments.length === 1 after this purchase)
            const freshUser = await User.findById(user._id).select("processedPayments").lean();
            const processedPaymentsCount = freshUser?.processedPayments?.length || 0;

            if (processedPaymentsCount === 1) {
              // This is their first purchase - process referral
              const { recordReferralPurchase } = await import("@/lib/referral");
              await recordReferralPurchase({
                referralCode,
                inviteeUserId: user._id.toString(),
                inviteeEmail: user.email,
                inviteeName: `${user.firstName} ${user.lastName}`.trim(),
                qualifyingOrderId: subscriptionId,
                qualifyingOrderType: "membership",
              });
              webhookLog("info", `✅ Referral processed for first-time user: ${user.email}`);
            } else {
              webhookLog("info", `⚠️ Referral code provided but user is not first-time (processedPayments: ${processedPaymentsCount})`);
            }
          }
        } catch (referralError) {
          webhookLog("error", `Referral processing error (non-blocking): ${referralError}`);
          // Don't throw - referral processing should not break webhook
        }
      }

      // ✅ CRITICAL: Save payment method to user only in invoice.payment_succeeded (not in create-subscription or payment_intent.succeeded)
      try {
        const invoiceWithPi = expandedInvoice as Stripe.Invoice & { payment_intent?: string | Stripe.PaymentIntent };
        let paymentMethodId: string | null = null;
        if (invoiceWithPi.payment_intent) {
          const pi = invoiceWithPi.payment_intent;
          const paymentIntent = typeof pi === "string" ? await stripe.paymentIntents.retrieve(pi, { expand: ["payment_method"] }) : pi;
          if (paymentIntent.payment_method) {
            paymentMethodId = typeof paymentIntent.payment_method === "string" ? paymentIntent.payment_method : paymentIntent.payment_method.id;
          }
        }
        if (paymentMethodId && user.stripeCustomerId) {
          const hasPaymentMethod = user.savedPaymentMethods?.some((pm) => pm.paymentMethodId === paymentMethodId);
          if (!hasPaymentMethod) {
            const freshUser = await User.findById(user._id);
            if (freshUser) {
              const saveResult = await savePaymentMethodToUser(freshUser, paymentMethodId, {
                setAsDefault: (freshUser.savedPaymentMethods?.length ?? 0) === 0,
              });
              if (saveResult.success) {
                webhookLog("info", `✅ Saved payment method to user (invoice.payment_succeeded): ${paymentMethodId}`);
              } else {
                webhookLog("warn", `⚠️ Failed to save payment method in invoice.payment_succeeded: ${saveResult.error}`);
              }
            }
          }
        }
      } catch (savePmError) {
        webhookLog("warn", `⚠️ Save payment method in invoice.payment_succeeded (non-blocking): ${savePmError}`);
      }

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
      if (recordMembershipRecurringAffiliate) {
        // Track "Subscription Renewed" event for renewals
        klaviyo.trackEventBackground(
          createSubscriptionRenewedEvent(user as never, {
            packageId,
            packageName: membershipPackage.name,
            tier: membershipPackage.name,
            price: membershipPackage.price,
            renewalType: "subscription_cycle",
            previousStatus: previousSubscriptionDbStatus === "past_due" ? "past_due" : "active",
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

      // ✅ NON-CRITICAL: Track subscription renewal to TikTok/Klaviyo (if this is a renewal) (fire-and-forget)
      // NOTE: Renewals are NOT sent to Facebook as Purchase events per best practices
      // Facebook should only receive new purchase events, not renewals
      if (recordMembershipRecurringAffiliate) {
        executeBackgroundJob("TikTok/Klaviyo subscription renewal tracking", async () => {
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
          webhookLog("info", `✅ Subscription renewal tracked to TikTok/Klaviyo (not Facebook) for: ${user.email}`);
        });
      }

      // ✅ NON-CRITICAL: Fetch fresh user data and sync to Klaviyo (fire-and-forget)
      // This ensures we have the latest subscription startDate and other updated fields
      // MongoDB transactions handle consistency automatically - no delay needed
      executeBackgroundJob("Klaviyo profile sync after invoice payment succeeded", async () => {
        const freshUserForKlaviyo = await User.findById(user._id);
        if (freshUserForKlaviyo) {
          // Update Klaviyo profile with fresh user data (includes updated subscription startDate)
          await ensureUserProfileSynced(freshUserForKlaviyo);
          webhookLog("info", `✅ Klaviyo profile synced with fresh user data for: ${freshUserForKlaviyo.email}`);
        } else {
          // Fallback to original user if fresh fetch fails
          await ensureUserProfileSynced(user);
          webhookLog("warn", `⚠️ Could not fetch fresh user data, synced with original user object`);
        }
      });

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

    // Recurring affiliate commission: align with money collected, independent of benefit grant success
    if (recordMembershipRecurringAffiliate) {
      const amountPaid = expandedInvoice.amount_paid ?? 0;
      if (amountPaid > 0) {
        const safeInvoiceId =
          expandedInvoice.id ?? expandedInvoice.number ?? `invoice_${expandedInvoice.created}`;
        const commissionParams = {
          userId: user._id.toString(),
          invoiceId: safeInvoiceId,
          subscriptionId: subscriptionId,
          purchaseAmount: amountPaid,
          packageId,
          packageName: membershipPackage.name,
          earnedAt: paidAtDateFromStripeInvoice(expandedInvoice),
        };

        // Retry up to 2 times on transient failures (e.g. DB contention)
        const MAX_COMMISSION_RETRIES = 2;
        let commissionRecord = null;
        for (let attempt = 0; attempt <= MAX_COMMISSION_RETRIES; attempt++) {
          try {
            const { processMembershipRecurringCommission } = await import("@/utils/affiliate/commission-processing");
            commissionRecord = await processMembershipRecurringCommission(commissionParams);
            break;
          } catch (commErr) {
            if (attempt < MAX_COMMISSION_RETRIES) {
              webhookLog("warn", `Recurring commission attempt ${attempt + 1} failed, retrying...`, {
                invoiceId: safeInvoiceId,
                error: String(commErr),
              });
              await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
            } else {
              webhookLog("error", `Recurring membership commission failed after ${MAX_COMMISSION_RETRIES + 1} attempts`, {
                invoiceId: safeInvoiceId,
                userId: user._id.toString(),
                error: String(commErr),
              });
            }
          }
        }
        if (commissionRecord) {
          webhookLog("info", `Recurring membership commission recorded`, {
            invoiceId: safeInvoiceId,
            userId: user._id.toString(),
            commissionId: commissionRecord._id?.toString?.(),
          });
        } else {
          webhookLog("warn", `Recurring commission returned null (no affiliate or already exists)`, {
            invoiceId: safeInvoiceId,
            userId: user._id.toString(),
          });
        }
      } else {
        webhookLog("info", `[AffiliateCommission] skip recurring: zero_amount`, {
          invoiceId: expandedInvoice.id,
          userId: user._id.toString(),
        });
      }
    }

    // Always sync endDate for renewals, regardless of processPaymentBenefits result.
    // The user was charged — their access period must be updated even if benefit
    // processing failed or the subscription.updated webhook was missed/skipped.
    if (recordMembershipRecurringAffiliate) {
      try {
        const freshSubscription = await stripe.subscriptions.retrieve(subscriptionId);
        const periodEnd = getSubscriptionPeriodEnd(freshSubscription);
        if (periodEnd != null) {
          await User.findByIdAndUpdate(user._id, {
            $set: { "subscription.endDate": new Date(periodEnd * 1000) },
          });
          webhookLog("info", `Synced subscription.endDate from Stripe for renewal: ${user.email}`);
        }
      } catch (endDateSyncError) {
        webhookLog(
          "warn",
          `Non-critical: could not sync subscription.endDate for renewal: ${endDateSyncError}`
        );
      }
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
/** Invoice id (in_…) from expanded charge / expanded payment_intent on charge. */
function tryInvoiceIdFromChargeOrExpandedPi(charge: Stripe.Charge): string | undefined {
  const withInv = charge as Stripe.Charge & { invoice?: string | Stripe.Invoice | null };
  if (withInv.invoice) {
    return typeof withInv.invoice === "string" ? withInv.invoice : withInv.invoice.id;
  }
  const pi = charge.payment_intent;
  if (pi && typeof pi === "object") {
    const inv = (pi as Stripe.PaymentIntent & { invoice?: string | Stripe.Invoice | null }).invoice;
    if (inv) {
      return typeof inv === "string" ? inv : inv.id;
    }
  }
  return undefined;
}

/** PI ids on an invoice (top-level + Invoice Payments — Billing refresh / invoice_payment.paid flow). */
function paymentIntentIdsOnInvoice(inv: Stripe.Invoice): string[] {
  const typed = inv as Stripe.Invoice & {
    payment_intent?: string | Stripe.PaymentIntent | null;
    latest_payment_intent?: string | Stripe.PaymentIntent | null;
    payments?: {
      data?: Array<{
        payment?: {
          type?: string;
          payment_intent?: string | Stripe.PaymentIntent | null;
          charge?: string | Stripe.Charge | null;
        } | null;
      }>;
    };
  };
  const ids: string[] = [];
  const pi = typed.payment_intent;
  const lpi = typed.latest_payment_intent;
  if (pi) ids.push(typeof pi === "string" ? pi : pi.id);
  if (lpi) ids.push(typeof lpi === "string" ? lpi : lpi.id);
  for (const row of typed.payments?.data ?? []) {
    const p = row?.payment;
    if (!p) continue;
    if (p.payment_intent) {
      ids.push(typeof p.payment_intent === "string" ? p.payment_intent : p.payment_intent.id);
    }
  }
  return [...new Set(ids.filter(Boolean))];
}

/** Paginate customer invoices until we find one whose payment_intent matches (subscription refunds). */
async function findInvoiceIdByCustomerAndPaymentIntent(
  customerId: string,
  paymentIntentId: string
): Promise<string | undefined> {
  let startingAfter: string | undefined;
  const maxPages = 15;

  for (let page = 0; page < maxPages; page++) {
    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    const matchingInvoice = invoices.data.find((inv) => {
      return paymentIntentIdsOnInvoice(inv).includes(paymentIntentId);
    });

    if (matchingInvoice) {
      return matchingInvoice.id;
    }

    let deepRetrieves = 0;
    const maxDeepPerPage = 40;
    for (const inv of invoices.data) {
      if (deepRetrieves >= maxDeepPerPage) break;
      const shallow = paymentIntentIdsOnInvoice(inv);
      if (shallow.includes(paymentIntentId)) {
        return inv.id;
      }
      if (shallow.length > 0) {
        continue;
      }
      deepRetrieves += 1;
      if (!inv.id) continue;
      try {
        const full = await stripe.invoices.retrieve(inv.id, {
          expand: ["payments.data.payment", "payment_intent"],
        });
        if (paymentIntentIdsOnInvoice(full).includes(paymentIntentId)) {
          return full.id;
        }
      } catch (deepErr) {
        webhookLog("warn", `Deep invoice retrieve failed for ${inv.id}: ${deepErr}`);
        continue;
      }
    }

    if (!invoices.has_more || invoices.data.length === 0) {
      break;
    }
    startingAfter = invoices.data[invoices.data.length - 1]?.id;
    if (!startingAfter) {
      break;
    }
  }

  return undefined;
}

async function resolveInvoiceIdFromRefund(
  paymentIntentId: string,
  charge?: Stripe.Charge,
  refund?: Stripe.Refund
): Promise<string | undefined> {
  // Method 1: Invoice on charge, or on expanded payment_intent embedded in charge
  if (charge) {
    const fromCharge = tryInvoiceIdFromChargeOrExpandedPi(charge);
    if (fromCharge) {
      webhookLog("info", `✅ Found invoice ID from charge / expanded payment intent: ${fromCharge}`);
      return fromCharge;
    }
  }

  // Method 2: Retrieve payment intent with invoice expanded (needed when charge was not expanded)
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["invoice"] });
    const paymentIntentWithInvoice = paymentIntent as Stripe.PaymentIntent & {
      invoice?: string | Stripe.Invoice | null;
    };
    if (paymentIntentWithInvoice.invoice) {
      const invoiceId =
        typeof paymentIntentWithInvoice.invoice === "string"
          ? paymentIntentWithInvoice.invoice
          : paymentIntentWithInvoice.invoice.id;
      webhookLog("info", `✅ Found invoice ID from payment intent retrieve: ${invoiceId}`);
      return invoiceId;
    }
  } catch (piError) {
    webhookLog("warn", `Could not retrieve payment intent to get invoice: ${piError}`);
  }

  // Method 2b: PI → latest_charge → invoice (subscription PI often omits invoice on PI object but charge has it)
  try {
    const piWithCharge = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge", "latest_charge.invoice"],
    });
    const lc = piWithCharge.latest_charge;
    if (lc && typeof lc === "object") {
      const ch = lc as Stripe.Charge & { invoice?: string | Stripe.Invoice | null };
      if (ch.invoice) {
        const invoiceId = typeof ch.invoice === "string" ? ch.invoice : ch.invoice.id;
        webhookLog("info", `✅ Found invoice ID from payment intent latest_charge: ${invoiceId}`);
        return invoiceId;
      }
    }
  } catch (piChargeError) {
    webhookLog("warn", `Could not resolve invoice from payment intent latest_charge: ${piChargeError}`);
  }

  // Method 3: Paginate customer invoices (older invoices are often beyond the first page)
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
      const matchingId = await findInvoiceIdByCustomerAndPaymentIntent(customerId, paymentIntentId);
      if (matchingId) {
        webhookLog("info", `✅ Found invoice by searching customer invoices: ${matchingId}`);
        return matchingId;
      }
    } catch (searchError) {
      webhookLog("warn", `Could not search invoices: ${searchError}`);
    }
  }

  webhookLog(
    "info",
    `Could not resolve invoice ID for payment intent: ${paymentIntentId} (BenefitsGranted for subscriptions use invoice_in_… in DB)`
  );
  return undefined;
}

/**
 * Shared refund reversal: only runs when Stripe has at least one refund with status succeeded
 * on this charge. Idempotent via PaymentEvent RefundProcessed.
 */
async function runRefundReversalFromChargeId(chargeId: string): Promise<void> {
  // Stripe enforces a 4-level expand limit. From a Charge, `invoice.payments.data.payment` is the
  // deepest legal path; `payment.payment_intent` then comes back as a string ID by default, which
  // is all we need to match against stored `BenefitsGranted-invoice_in_…` events.
  const richExpand = [
    "refunds",
    "invoice",
    "invoice.payment_intent",
    "invoice.payments.data.payment",
    "payment_intent",
    "payment_intent.invoice",
  ];
  let fullCharge: Stripe.Charge;
  try {
    fullCharge = await stripe.charges.retrieve(chargeId, { expand: richExpand });
  } catch (err) {
    webhookLog("warn", `Rich charge expand failed, retrying with conservative expand: ${err}`);
    fullCharge = await stripe.charges.retrieve(chargeId, {
      expand: ["refunds", "invoice", "invoice.payment_intent", "payment_intent", "payment_intent.invoice"],
    });
  }

  const paymentIntentId =
    typeof fullCharge.payment_intent === "string" ? fullCharge.payment_intent : fullCharge.payment_intent?.id;

  if (!paymentIntentId) {
    webhookLog("error", `No payment intent found in charge: ${chargeId}`);
    return;
  }

  const refundList = fullCharge.refunds?.data ?? [];
  const succeededCents = sumSucceededRefundAmountCents(refundList);

  if (succeededCents <= 0) {
    webhookLog(
      "info",
      `Charge ${chargeId}: no succeeded refunds yet (pending/failed only), skipping benefit reversal`
    );
    return;
  }

  const chargeAmount = fullCharge.amount ?? 0;
  const isFullRefund = isFullRefundByAmounts(succeededCents, chargeAmount);

  if (!fullCharge.customer) {
    webhookLog("error", `No customer on charge: ${chargeId}`);
    return;
  }

  const customerId =
    typeof fullCharge.customer === "string" ? fullCharge.customer : fullCharge.customer.id;
  const user = await User.findOne({ stripeCustomerId: customerId });

  if (!user) {
    webhookLog("error", `User not found for charge refund: ${chargeId}`);
    return;
  }

  // If charge already expanded a full Invoice, match PI to that invoice (Invoice Payments API omits top-level payment_intent on list)
  let invoiceIdQuick: string | undefined;
  const chargeTyped = fullCharge as unknown as Stripe.Charge & {
    invoice?: string | Stripe.Invoice | null;
  };
  const invOnCharge = chargeTyped.invoice;
  if (invOnCharge && typeof invOnCharge === "object") {
    const invObj = invOnCharge as Stripe.Invoice;
    if (paymentIntentIdsOnInvoice(invObj).includes(paymentIntentId)) {
      invoiceIdQuick = invObj.id;
      webhookLog("info", `✅ Matched refund PI to expanded charge.invoice: ${invoiceIdQuick}`);
    }
  } else if (invOnCharge && typeof invOnCharge === "string") {
    invoiceIdQuick = invOnCharge;
    webhookLog("info", `✅ Using invoice id from charge.invoice string: ${invoiceIdQuick}`);
  }

  const invoiceId =
    invoiceIdQuick ?? (await resolveInvoiceIdFromRefund(paymentIntentId, fullCharge));

  const { processRefundReversal } = await import("@/utils/payment/refund-processing");
  const result = await processRefundReversal(paymentIntentId, user._id.toString(), succeededCents, isFullRefund, {
    invoiceId,
  });

  if (result.success) {
    webhookLog(
      "info",
      `✅ Refund reversal processed for payment: ${paymentIntentId}${
        invoiceId ? ` (invoice: ${invoiceId})` : ""
      } (succeeded refund total: ${succeededCents} cents)`
    );
  } else if (!result.alreadyProcessed) {
    webhookLog("error", `❌ Refund reversal failed: ${result.error}`);
  }
}

/**
 * Handle charge refunded event (handles both one-time payments and subscription refunds)
 * Refunds are processed in Stripe Dashboard - we listen and sync database
 * Note: Stripe doesn't have an "invoice.refunded" event - invoice refunds also trigger charge.refunded
 */
async function handleChargeRefunded(charge: Stripe.Charge) {
  try {
    webhookLog("info", `Processing charge refunded: ${charge.id}`);
    await runRefundReversalFromChargeId(charge.id);
  } catch (error) {
    webhookLog("error", `Error handling charge refunded: ${error}`);
  }
}

/**
 * When a refund transitions to succeeded (e.g. async methods), apply the same reversal as charge.refunded.
 * Shared by refund.updated, refund.created, and charge.refund.updated (succeeded refunds only).
 * Idempotent: duplicate events no-op via RefundProcessed.
 */
async function handleRefundUpdated(refund: Stripe.Refund) {
  try {
    webhookLog("info", `Processing refund object: ${refund.id}, status: ${refund.status}`);

    if (refund.status !== "succeeded") {
      webhookLog("info", `Refund ${refund.id} status is ${refund.status}, skipping reversal`);
      return;
    }

    if (!refund.charge) {
      webhookLog("error", `No charge on refund: ${refund.id}`);
      return;
    }

    const chargeId = typeof refund.charge === "string" ? refund.charge : refund.charge.id;
    await runRefundReversalFromChargeId(chargeId);
  } catch (error) {
    webhookLog("error", `Error handling refund.updated: ${error}`);
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
 * Funds withdrawn (chargeback) — reverse benefits early; idempotent via RefundProcessed.
 */
async function handleChargeDisputeFundsWithdrawn(dispute: Stripe.Dispute) {
  try {
    webhookLog("warn", `Dispute funds withdrawn: ${dispute.id}`);
    if (!dispute.charge) {
      webhookLog("error", `No charge on dispute ${dispute.id}`);
      return;
    }
    const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
    const charge = await stripe.charges.retrieve(chargeId, { expand: ["refunds"] });

    const paymentIntentId =
      typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;

    if (!paymentIntentId) {
      webhookLog("error", `No payment intent on charge ${chargeId}`);
      return;
    }

    const invoiceId = await resolveInvoiceIdFromRefund(paymentIntentId, charge);

    let user;
    if (charge.customer) {
      const customerId = typeof charge.customer === "string" ? charge.customer : charge.customer.id;
      user = await User.findOne({ stripeCustomerId: customerId });
    }

    if (!user) {
      webhookLog("error", `User not found for dispute funds_withdrawn ${dispute.id}`);
      return;
    }

    const refundList = charge.refunds?.data ?? [];
    const succeededCents = sumSucceededRefundAmountCents(refundList);
    const refundAmount = succeededCents > 0 ? succeededCents : dispute.amount ?? charge.amount ?? 0;

    if (refundAmount <= 0) {
      webhookLog("warn", `No refund/dispute amount for funds_withdrawn ${dispute.id}`);
      return;
    }

    const chargeAmount = charge.amount ?? refundAmount;
    const isFullRefund = isFullRefundByAmounts(refundAmount, chargeAmount);

    const { processRefundReversal } = await import("@/utils/payment/refund-processing");
    const result = await processRefundReversal(paymentIntentId, user._id.toString(), refundAmount, isFullRefund, {
      invoiceId,
    });

    if (result.success) {
      webhookLog("info", `✅ Dispute funds_withdrawn reversal processed for ${paymentIntentId}`);
    } else if (!result.alreadyProcessed) {
      webhookLog("error", `❌ Dispute funds_withdrawn reversal failed: ${result.error}`);
    }
  } catch (error) {
    webhookLog("error", `Error handling charge.dispute.funds_withdrawn: ${error}`);
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

    const invoiceId = await resolveInvoiceIdFromRefund(paymentIntentId, charge);

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
    const result = await processRefundReversal(paymentIntentId, user._id.toString(), refundAmount, isFullRefund, {
      invoiceId,
    });

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
async function _handlePaymentIntentCanceled(paymentIntent: Stripe.PaymentIntent) {
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
 * Dispatch a Stripe event to the appropriate handler. Equivalent to the
 * switch that used to live inside the webhook route, lifted out so the
 * async worker route can drive it without going through NextRequest.
 *
 * Returns shouldMarkAsProcessed so the caller can decide whether to call
 * ackProcessedStripeEventOnce for payment-idempotency purposes.
 */
export async function dispatchStripeEvent(event: Stripe.Event): Promise<{ shouldMarkAsProcessed: boolean }> {
  let shouldMarkAsProcessed = false;

  switch (event.type) {
    case "payment_intent.succeeded":
      webhookLog("info", `📥 Received payment_intent.succeeded event for: ${event.data.object.id}`);
      const paymentProcessed = await handlePaymentSuccess(event.data.object, event.created);
      shouldMarkAsProcessed = paymentProcessed !== false; // Only if actually processed
      webhookLog(
        "info",
        `📤 payment_intent.succeeded processing result: ${
          paymentProcessed !== false ? "processed" : "skipped/failed"
        } for ${event.data.object.id}`
      );
      break;
    case "payment_intent.payment_failed": {
      const failedPi = event.data.object as Stripe.PaymentIntent;
      await handlePaymentFailure(failedPi);

      // Auto-allowlist eligibility check. Best-effort — see allowlist gotchas.md.
      try {
        const charge =
          failedPi.latest_charge && typeof failedPi.latest_charge !== "string"
            ? failedPi.latest_charge
            : failedPi.latest_charge
            ? await stripe.charges.retrieve(failedPi.latest_charge)
            : null;

        const isBlocked =
          charge?.outcome?.type === "blocked" ||
          charge?.outcome?.network_status === "declined_by_network";

        const card = charge?.payment_method_details?.card;
        const fingerprint = card?.fingerprint;
        if (isBlocked && card && fingerprint && charge) {
          try {
            const { buildBlockedTransactionRecord, upsertBlockedTransaction } =
              await import("@/services/allowlist/blockedTransactionRepo");
            const record = buildBlockedTransactionRecord(failedPi, charge);
            if (record) await upsertBlockedTransaction(record);
          } catch (btErr) {
            webhookLog(
              "error",
              `BlockedTransaction upsert failed for PI ${failedPi.id}: ${
                btErr instanceof Error ? btErr.message : String(btErr)
              }`
            );
          }

          const { getAllowlistService } = await import("@/services/allowlist");
          const allowlist = getAllowlistService();
          await allowlist.apply(
            {
              cardFingerprint: fingerprint,
              cardLast4: card.last4 ?? "",
              cardBrand: card.brand ?? "unknown",
              stripeCustomerId:
                typeof failedPi.customer === "string"
                  ? failedPi.customer
                  : failedPi.customer?.id ?? null,
              customerEmail:
                failedPi.receipt_email ?? charge.billing_details?.email ?? null,
              declineCode: failedPi.last_payment_error?.decline_code ?? null,
              failureCode: failedPi.last_payment_error?.code ?? null,
              triggeringPaymentIntentId: failedPi.id,
              triggeringChargeId: charge.id,
            },
            "webhook",
            null
          );
        }
      } catch (allowlistErr) {
        webhookLog(
          "error",
          `AllowlistService.apply failed for PI ${failedPi.id}: ${
            allowlistErr instanceof Error ? allowlistErr.message : String(allowlistErr)
          }`
        );
      }
      break;
    }
    case "charge.failed": {
      const failedCharge = event.data.object as Stripe.Charge;

      if (failedCharge.outcome?.type !== "blocked") break;
      if (!failedCharge.payment_method_details?.card?.fingerprint) break;

      try {
        const piRef = failedCharge.payment_intent;
        const pi: Stripe.PaymentIntent | null =
          typeof piRef === "string"
            ? await stripe.paymentIntents.retrieve(piRef)
            : piRef ?? null;
        if (!pi) {
          webhookLog(
            "warn",
            `charge.failed for ${failedCharge.id} has no payment_intent; skipping BlockedTransaction upsert`
          );
          break;
        }

        const { buildBlockedTransactionRecord, upsertBlockedTransaction } =
          await import("@/services/allowlist/blockedTransactionRepo");
        const record = buildBlockedTransactionRecord(pi, failedCharge);
        if (record) await upsertBlockedTransaction(record);
      } catch (err) {
        webhookLog(
          "error",
          `BlockedTransaction upsert (charge.failed) failed for ${failedCharge.id}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
      break;
    }
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
      // Let errors bubble to the worker's catch — it calls markFailed(),
      // which puts the queue row back in `queued` with exponential backoff,
      // then dead-letters at the cap. Pre-cutover this swallowed quietly;
      // post-cutover that would leave the row permanently `succeeded` with
      // no benefits granted and no retry, so the silence is no longer safe.
      // Layer-4 PaymentEvent (`BenefitsGranted-invoice_<id>`) makes retries
      // idempotent — re-throwing here is correct.
      await handleInvoicePaymentSucceeded(event.data.object);
      shouldMarkAsProcessed = true;
      break;

    case "invoice.created":
      // Label renewal invoices "<Package> Renewal" while still a draft so the
      // spawned PI/Charge inherit it for BOTH success and failure.
      await handleInvoiceCreated(event.data.object);
      break;
    case "invoice.finalized":
      webhookLog("info", `Invoice finalized: ${event.data.object.id} - waiting for payment confirmation`);
      break;
    case "invoice.paid":
      webhookLog("info", `Skipping invoice.paid - using invoice.payment_succeeded as canonical event`);
      break;
    case "invoice.finalization_failed": {
      const finalizationInvoice = event.data.object as Stripe.Invoice & { subscription?: string | Stripe.Subscription };
      const finalizationSubId =
        typeof finalizationInvoice.subscription === "string"
          ? finalizationInvoice.subscription
          : finalizationInvoice.subscription?.id;
      webhookLog("warn", `invoice.finalization_failed`, {
        eventId: event.id,
        invoiceId: finalizationInvoice.id,
        subscriptionId: finalizationSubId,
        correlationId: finalizationInvoice.metadata?.subscriptionRequestId ?? event.id,
      });
      break;
    }
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object);
      break;
    case "charge.refunded":
      await handleChargeRefunded(event.data.object);
      break;
    case "charge.refund.updated":
      await handleRefundUpdated(event.data.object as Stripe.Refund);
      break;
    case "refund.updated":
      await handleRefundUpdated(event.data.object as Stripe.Refund);
      break;
    case "refund.created":
      await handleRefundUpdated(event.data.object as Stripe.Refund);
      break;
    case "charge.dispute.created":
      await handleChargeDisputeCreated(event.data.object);
      break;
    case "charge.dispute.updated":
      await handleChargeDisputeUpdated(event.data.object);
      break;
    case "charge.dispute.funds_withdrawn":
      await handleChargeDisputeFundsWithdrawn(event.data.object);
      break;
    case "charge.dispute.closed":
      await handleChargeDisputeClosed(event.data.object);
      break;
    case "payment_intent.canceled": {
      webhookLog("info", `📥 Received payment_intent.canceled event for: ${event.data.object.id}`);
      // Let errors bubble to the worker for retry + dead-letter. Cleanup is
      // not catastrophic to miss, but a permanent silent failure leaves
      // orphaned state with no operator visibility.
      await handlePaymentCancellation(event.data.object as Stripe.PaymentIntent);
      break;
    }
    default:
      webhookLog("warn", `Unhandled event type: ${event.type}`);
    // ✅ CRITICAL: Don't mark unhandled events as processed!
  }

  return { shouldMarkAsProcessed };
}

// Re-export helpers the receiver uses pre-cutover (sig verification path
// in route.ts calls these). Once Task 10 cuts the receiver over, these
// re-exports can be removed.
export { ackProcessedStripeEventOnce, isEventProcessed, markEventProcessed, webhookLog };
