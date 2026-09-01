import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import { normalizeMembershipPlanId } from "@/utils/membership/additional-package-mapping";
import { isMiniDrawPackageId } from "@/data/miniDrawPackages";
import { stripe } from "@/lib/stripe";
import Stripe from "stripe";
// Referral processing moved to webhook - no longer needed here
import { trackAffiliateSignup } from "@/lib/affiliate";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
// ✅ REMOVED: processPaymentBenefits and isPaymentProcessed imports
// Fallback processing removed to prevent duplicate Facebook tracking
// Webhook is now the single source of truth for payment processing
import { savePaymentMethodToUser } from "@/utils/payment/payment-method-manager";
// Klaviyo integration handled by webhook for best practices
// Benefits are granted via webhook processing only
import { createPaymentIntentConfig } from "@/utils/payment/stripe/payment-intent-config";
import { buildAttributionMetadata } from "@/utils/tracking/attribution-metadata";
import { attributionSchema } from "@/utils/tracking/attribution-schema";
import { resolveAttributionAtEdge } from "@/services/attribution/resolveAtEdge";
import { enforceMajorDrawOpenForNewPurchasesOr403 } from "@/utils/draws/major-draw-gate-http";
import { executeBackgroundJob } from "@/utils/webhook/background-jobs";
import { isStripeCardError } from "@/utils/payment/stripe/payment-error-detection";
import { analyzeStripePayErrorForExcessiveRetry } from "@/utils/payment/stripe/stripe-excessive-retry";
import { ErrorLoggingService } from "@/services/error-reporting/ErrorLoggingService";
import AnonymousIdService from "@/services/ab-testing/AnonymousIdService";
import VariantAssignmentService from "@/services/ab-testing/VariantAssignmentService";
import ExperimentRepository from "@/repositories/ab-testing/ExperimentRepository";
import mongoose from "mongoose";
import { extractRequestContext } from "@/utils/tracking/facebook-helpers";
import { extractTikTokContext } from "@/utils/tracking/tiktok-helpers";
import { safeEventSourceUrl } from "@/utils/tracking/event-source-url";
import { CampaignCodeValidationService } from "@/services/redeemables/CampaignCodeValidationService";
import { isExpectedPaymentDeclineError } from "@/utils/error-reporting/error-severity-classifier";

const createOneTimePurchaseExistingUserSchema = z.object({
  packageId: z.string().min(1, "Package ID is required"),
  paymentMethodId: z.string().min(1, "Payment method ID is required").optional(),
  idempotencyKey: z.string().optional(), // ✅ STRIPE BEST PRACTICE: Idempotency key to prevent duplicate PaymentIntent creation
  referralCode: z.string().optional(),
  affiliateCode: z.string().optional(),
  promoLinkCode: z.string().optional(),
  campaignCode: z.string().optional(),
  attribution: attributionSchema,
});

/**
 * Note: Benefits are granted via webhook processing only
 * This function is kept for API response structure but no longer processes benefits
 */
type MinimalUser = { _id: string };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleOneTimePaymentSuccess(
  user: MinimalUser,
  membershipPackage: {
    _id: string;
    name: string;
    price: number;
    totalEntries: number;
  },
  paymentIntentId: string
) {
  // console.log(`✅ ONE-TIME PAYMENT SUCCESS: Payment ${paymentIntentId} created successfully`);
  // console.log(`📋 Benefits will be granted via webhook processing shortly`);

  // No benefit processing here - webhook will handle it
  return {
    success: true,
    message: "Payment successful. Benefits will be processed shortly.",
    paymentIntentId,
    packageName: membershipPackage.name,
    entriesCount: membershipPackage.totalEntries,
  };
}

// ✅ REMOVED: addEntriesToMajorDrawImmediately function - now handled by processPaymentBenefits utility
// ✅ REMOVED: getBaseUrl() function - now using centralized utility from @/utils/url/get-base-url

/**
 * POST /api/stripe/create-one-time-purchase-existing-user
 * Create a one-time purchase payment intent for an existing logged-in user
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    // Get the authenticated user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createOneTimePurchaseExistingUserSchema.parse(body);
    const normalizedAffiliateCode = validatedData.affiliateCode?.trim().toUpperCase();

    // Extract request context for Facebook CAPI (webhook will use for match quality)
    // Carries every provider's match signals: Meta's fbc/fbp and TikTok's ttclid/ttp.
    // Both get stashed in Stripe metadata (capi_*) because Purchase fires from the
    // webhook, which has no cookies to read them back from.
    const requestContext = { ...extractRequestContext(request), ...extractTikTokContext(request) };
    const capiEventSourceUrl = safeEventSourceUrl(
      request.headers.get("referer") ??
      (process.env.NEXTAUTH_URL ? `${process.env.NEXTAUTH_URL}/shop` : undefined)
    );
    const { metadata: resolvedAttr } = resolveAttributionAtEdge(request);

    // console.log(`🛒 Creating one-time purchase for existing user: ${session.user.id}`);

    // Get the existing user
    let existingUser = await User.findById(session.user.id);
    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (normalizedAffiliateCode && (!existingUser.affiliateReferral || !existingUser.affiliateReferral.affiliateId)) {
      try {
        await trackAffiliateSignup({
          affiliateCode: normalizedAffiliateCode,
          userId: existingUser._id.toString(),
          userEmail: existingUser.email,
        });
        existingUser = (await User.findById(existingUser._id)) ?? existingUser;
      } catch (affiliateError) {
        console.error("Affiliate tracking error during existing-user one-time purchase:", affiliateError);
      }
    }

    // Get the package (check both regular membership packages and mini draw packages)
    /**
     * A mini-draw package cannot be sold here — reject BEFORE any money moves. See the twin guard
     * in `create-one-time-purchase/route.ts` for the full history.
     *
     * Checked on BOTH the raw and canonical id. `normalizeMembershipPlanId` only strips `-member`,
     * so `-mini` survives it and the two forms agree today — belt and braces so a future
     * normalisation rule cannot open the hole by rewriting a mini id into something that passes.
     *
     * 400, not 404: the id is real, the endpoint is wrong.
     */
    const canonicalPackageId = normalizeMembershipPlanId(validatedData.packageId);
    if (isMiniDrawPackageId(validatedData.packageId) || isMiniDrawPackageId(canonicalPackageId)) {
      return NextResponse.json(
        {
          error: "Mini draw packages must be purchased through the mini draw flow",
          code: "MINI_DRAW_PACKAGE_WRONG_ENDPOINT",
        },
        { status: 400 }
      );
    }

    let membershipPackage = getPackageById(canonicalPackageId);
    if (!membershipPackage && validatedData.packageId !== canonicalPackageId) {
      membershipPackage = getPackageById(validatedData.packageId);
    }
    if (!membershipPackage || !membershipPackage.isActive) {
      return NextResponse.json({ error: "Invalid or inactive package" }, { status: 400 });
    }

    // Unconditional now that mini packages are rejected above — they were the only family that
    // skipped the major-draw freeze gate, and they can no longer reach this route.
    const gateResponse = await enforceMajorDrawOpenForNewPurchasesOr403();
    if (gateResponse) return gateResponse;

    // Create or retrieve Stripe customer
    let stripeCustomerId = existingUser.stripeCustomerId;
    let customer: Stripe.Customer | Stripe.DeletedCustomer;

    if (!stripeCustomerId) {
      // console.log("Creating new Stripe customer for existing user");
      customer = await stripe.customers.create({
        email: existingUser.email,
        name: `${existingUser.firstName} ${existingUser.lastName}`,
        phone: existingUser.mobile || undefined,
      });
      stripeCustomerId = customer.id;

      // Update user with Stripe customer ID
      existingUser.stripeCustomerId = stripeCustomerId;
      // ✅ OPTIMIZED: Make user save fire-and-forget (webhook handles final updates)
      existingUser.save().catch((error) => {
        console.warn("Non-critical user save failed (webhook will handle):", error);
      });
    } else {
      // ✅ SYNC: Retrieve customer and ensure email is in sync
      const retrievedCustomer = await stripe.customers.retrieve(stripeCustomerId);

      // Check if customer was deleted
      if (retrievedCustomer.deleted) {
        // Customer was deleted, create a new one
        customer = await stripe.customers.create({
          email: existingUser.email,
          name: `${existingUser.firstName} ${existingUser.lastName}`,
          phone: existingUser.mobile || undefined,
        });
        stripeCustomerId = customer.id;
        existingUser.stripeCustomerId = stripeCustomerId;
        // ✅ OPTIMIZED: Make user save fire-and-forget (webhook handles final updates)
        existingUser.save().catch((error) => {
          console.warn("Non-critical user save failed (webhook will handle):", error);
        });
      } else {
        customer = retrievedCustomer as Stripe.Customer;
        const customerEmail = customer.email || "";

        // Update customer email if it differs from user's current email
        if (customerEmail.toLowerCase() !== existingUser.email.toLowerCase()) {
          console.log(`🔄 Syncing customer email: ${customerEmail} → ${existingUser.email}`);
          customer = await stripe.customers.update(stripeCustomerId, {
            email: existingUser.email,
            name: `${existingUser.firstName} ${existingUser.lastName}`,
            phone: existingUser.mobile || undefined,
          });
          console.log(`✅ Customer email synced: ${stripeCustomerId}`);
        }
      }
    }

    // Ensure customer is not deleted before using customer.id
    if ("deleted" in customer && customer.deleted) {
      throw new Error("Stripe customer was deleted");
    }

    let paymentMethodId = validatedData.paymentMethodId;

    if (!paymentMethodId) {
      const defaultMethod = existingUser.savedPaymentMethods?.find((pm: Record<string, unknown>) => pm.isDefault);
      if (defaultMethod && typeof defaultMethod.paymentMethodId === "string") {
        paymentMethodId = defaultMethod.paymentMethodId;
      } else if (existingUser.savedPaymentMethods?.length) {
        const fallbackMethod = existingUser.savedPaymentMethods[0];
        if (fallbackMethod && typeof fallbackMethod.paymentMethodId === "string") {
          paymentMethodId = fallbackMethod.paymentMethodId;
        }
      }

      if (!paymentMethodId) {
        return NextResponse.json(
          { success: false, error: "No saved payment method available. Please add a card first." },
          { status: 400 }
        );
      }
    }

    // Ensure payment method belongs to this customer
    const stripePaymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    if (!stripePaymentMethod) {
      return NextResponse.json({ success: false, error: "Payment method not found" }, { status: 404 });
    }

    if (stripePaymentMethod.customer !== customer.id) {
      try {
        await stripe.paymentMethods.attach(paymentMethodId, {
          customer: customer.id,
        });
      } catch (error) {
        console.error("❌ Failed to attach payment method to customer:", error);
        return NextResponse.json(
          { success: false, error: "Unable to attach payment method to customer" },
          { status: 400 }
        );
      }
    }

    // ✅ CRITICAL: Set payment method as default on customer (matches subscription pattern)
    // This ensures Stripe properly saves it and webhook can find it via customer default
    try {
      await stripe.customers.update(customer.id, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
      console.log(`✅ Set ${paymentMethodId} as default payment method for customer ${customer.id}`);
    } catch (error) {
      console.error("⚠️ Failed to set default payment method (non-critical):", error);
      // Continue - payment method is still attached, just not set as default
    }

    // console.log(`💳 Using payment method ${paymentMethodId} for one-time purchase`);

    // ✅ STRIPE BEST PRACTICE: Generate idempotency key to prevent duplicate PaymentIntent creation
    // This ensures that even if the API is called twice (e.g., double-click), only one PaymentIntent is created
    const idempotencyKey =
      validatedData.idempotencyKey || 
      `pi_${validatedData.packageId}_${existingUser._id.toString()}_${Date.now()}`;

    // ✅ CRITICAL: Get experiment assignment for A/B testing tracking
    // Store in metadata so webhook can use it directly (more reliable than lookup)
    const anonymousId = AnonymousIdService.extractAnonymousId(request);
    
    // ✅ Auto-merge anonymous assignments to userId when user logs in
    if (anonymousId) {
      try {
        const mergeResult = await VariantAssignmentService.mergeAnonymousToUser(anonymousId, existingUser._id.toString());
        if (mergeResult.merged > 0) {
          console.log(`✅ [A/B Testing] Auto-merged ${mergeResult.merged} anonymous assignment(s) to user ${existingUser._id}`);
        }
      } catch (error) {
        // Silently fail - merge should not block payment creation
        console.error("Error auto-merging anonymous assignments:", error);
      }
    }
    
    // Get experiment assignment for existing user
    let experimentAssignment: { experimentId: string; variantId: string } | null = null;
    
    try {
      const { getUserActiveExperimentAssignment } = await import("@/utils/ab-testing/get-user-experiment-assignment");
      // ✅ Pass anonymousId to find assignments created before user logged in
      experimentAssignment = await getUserActiveExperimentAssignment(
        existingUser._id.toString(),
        undefined, // slug
        anonymousId || undefined // anonymousId from cookies
      );
      
      if (experimentAssignment) {
        console.log(`✅ [A/B Testing] Found assignment from database for existing user:`, experimentAssignment);
      }
    } catch (error) {
      // Silently fail - experiment tracking should not block payment creation
      console.error("Error getting experiment assignment from database:", error);
    }
    
    // ✅ Fallback: Check cookies if database lookup failed
    // Priority rule (matches getUserActiveExperimentAssignment): page-targeted
    // experiments beat wildcard, and the membership-theme sentinel is excluded
    // so a cosmetic UI test can never steal purchase credit from a real promo.
    if (!experimentAssignment) {
      try {
        const { attributionRank } = await import("@/utils/ab-testing/get-user-experiment-assignment");
        // Check all assignment cookies (format: ta_ab_assignment_<experimentId>)
        const activeExperiments = await ExperimentRepository.findAll({
          status: "active",
          page: 1,
          limit: 100,
        });

        const orderedExperiments = [...activeExperiments.experiments]
          .map((exp) => ({ exp, rank: attributionRank(exp.slugTargets) }))
          .filter(({ rank }) => rank < 2)
          .sort((a, b) => a.rank - b.rank)
          .map(({ exp }) => exp);

        for (const exp of orderedExperiments) {
          const experimentId = exp._id instanceof mongoose.Types.ObjectId
            ? exp._id.toString()
            : String(exp._id);
          const cookieName = `ta_ab_assignment_${experimentId}`;
          const cookieValue = request.cookies.get(cookieName)?.value;

          if (cookieValue) {
            try {
              const assignmentData = JSON.parse(cookieValue);
              if (assignmentData.experimentId && assignmentData.variantId) {
                experimentAssignment = {
                  experimentId: assignmentData.experimentId,
                  variantId: assignmentData.variantId,
                };
                console.log(`✅ [A/B Testing] Found assignment from cookie (fallback):`, experimentAssignment);
                break;
              }
            } catch {
              // Invalid cookie data, skip
              console.warn(`⚠️ [A/B Testing] Invalid assignment cookie: ${cookieName}`);
            }
          }
        }
      } catch (_error) {
        // Silently fail - cookie fallback should not block payment creation
        console.warn("Error checking assignment cookies:", _error);
      }
    }
    
    if (experimentAssignment) {
      console.log(`✅ [A/B Testing] Storing experiment assignment in payment metadata:`, experimentAssignment);
    } else {
      console.warn(`⚠️ [A/B Testing] No experiment assignment found for existing user one-time purchase:`, {
        userId: existingUser._id.toString(),
        hasAnonymousId: !!anonymousId,
      });
    }

    // AUTHORITATIVE campaign-code check. `/api/codes/validate` answers a GUEST
    // from the campaign window alone (it has no session to key a per-user lookup
    // on), and step-1 registration in this codebase does not authenticate — so a
    // customer applying a code right after registering reaches checkout as a
    // guest and would otherwise see APPLIED, pay, and receive nothing. Here the
    // user id was resolved by the SERVER, so the per-user check can actually run.
    // Refusal drops the code and logs; it never fails the purchase.
    const verifiedCampaignCode = await CampaignCodeValidationService.resolveCodeForCheckout({
      code: validatedData.campaignCode,
      userId: existingUser._id.toString(),
      context: "create-one-time-purchase-existing-user",
    });

    // ✅ Use centralized PaymentIntent configuration with 3DS support
    const paymentIntentConfig = createPaymentIntentConfig({
      amount: Math.round(membershipPackage.price * 100), // Convert to cents
      currency: "aud",
      customer: customer.id,
      paymentMethod: paymentMethodId,
      confirm: true,
      paymentType: "one-time",
      description: membershipPackage.name,
      setupFutureUsage: "off_session", // ✅ Save payment method for future use (required for production/staging)
      metadata: {
        items: JSON.stringify([
          {
            type: "membership",
            id: membershipPackage._id,
            name: membershipPackage.name,
            price: membershipPackage.price,
          },
        ]),
        packageId: membershipPackage._id,
        userId: existingUser._id.toString(),
        userEmail: existingUser.email, // ✅ CRITICAL: Add userEmail for webhook fallback lookup
        packageName: membershipPackage.name,
        type: "one-time", // ✅ CRITICAL: Set 'type' for webhook compatibility
        packageType: "one-time", // ✅ Also set 'packageType' for consistency
        entriesCount: (membershipPackage.totalEntries || membershipPackage.entriesPerMonth || 0).toString(),
        price: Math.round(membershipPackage.price * 100).toString(), // Price in cents for webhook processing
        // ✅ ADD: Store payment method ID for webhook to save after payment succeeds
        paymentMethodId: paymentMethodId,
        ...(normalizedAffiliateCode
          ? { affiliateCode: normalizedAffiliateCode }
          : existingUser.affiliateReferral?.affiliateCode
          ? { affiliateCode: existingUser.affiliateReferral.affiliateCode }
          : {}),
        ...(validatedData.promoLinkCode && { promoLinkCode: validatedData.promoLinkCode }),
        ...(validatedData.referralCode && { referralCode: validatedData.referralCode }),
        ...(verifiedCampaignCode && { campaignCode: verifiedCampaignCode }),
        // ✅ A/B Testing: Store experiment assignment in metadata for accurate tracking
        ...(experimentAssignment && {
          experimentId: experimentAssignment.experimentId,
          variantId: experimentAssignment.variantId,
        }),
        // Store request context for Facebook CAPI (webhook will extract and use)
        ...(requestContext.client_ip_address ? { capi_client_ip: requestContext.client_ip_address } : {}),
        ...(requestContext.client_user_agent ? { capi_user_agent: requestContext.client_user_agent } : {}),
        ...(requestContext.fbc ? { capi_fbc: requestContext.fbc } : {}),
        ...(requestContext.fbp ? { capi_fbp: requestContext.fbp } : {}),
        ...(requestContext.ttclid ? { capi_ttclid: requestContext.ttclid } : {}),
        ...(requestContext.ttp ? { capi_ttp: requestContext.ttp } : {}),
        ...(capiEventSourceUrl ? { capi_event_source_url: capiEventSourceUrl } : {}),
        ...buildAttributionMetadata(validatedData.attribution),
        ...resolvedAttr,
      },
    });

    const paymentIntent = await stripe.paymentIntents.create(
      paymentIntentConfig,
      {
        idempotencyKey: idempotencyKey, // ✅ STRIPE BEST PRACTICE: Prevent duplicate PaymentIntent creation
      }
    );

    // console.log(`✅ Payment intent created: ${paymentIntent.id} with status: ${paymentIntent.status}`);

    // ✅ OPTIMIZED: Trust Stripe's status - webhook handles verification
    // Payment status is accurate when returned - no delay or re-retrieve needed
    if (paymentIntent.status === "succeeded") {
      // ✅ OPTIMIZED: Save payment method as fire-and-forget (webhook handles as backup)
      // This prevents "No Payment Method" error when upsell modal opens
      // Webhook will also try to save as backup, but this ensures it's saved in background
      if (paymentMethodId) {
        executeBackgroundJob("Save payment method after purchase", async () => {
          try {
            const freshUser = await User.findById(existingUser._id);
            if (freshUser && paymentMethodId) {
              console.log(`💳 [BACKGROUND] Saving payment method after payment success: ${paymentMethodId}`);
              
              const saveResult = await savePaymentMethodToUser(freshUser, paymentMethodId, {
                setAsDefault: !freshUser.savedPaymentMethods || freshUser.savedPaymentMethods.length === 0,
              });
              
              if (saveResult.success) {
                console.log(`✅ [BACKGROUND] Payment method saved successfully: ${paymentMethodId}`);
              } else {
                console.error(`❌ [BACKGROUND] Failed to save payment method: ${saveResult.error}`);
                // Webhook will try as backup
              }
            }
          } catch (pmError) {
            console.error(`❌ [BACKGROUND] Error saving payment method: ${pmError}`);
            // Webhook will try as backup
          }
        });
      }
      
      // Benefits will be processed by webhook - just log success
      console.log(`✅ Payment succeeded - benefits will be processed by webhook`);
    } else if (paymentIntent.status === "requires_action" || paymentIntent.status === "processing") {
      // Trust Stripe's status - webhook will handle when payment completes
      // For processing status, return success - webhook will handle completion
      // For requires_action, frontend will handle 3DS redirect
      
      if (paymentIntent.status === "processing") {
        // Processing status - return success, webhook will handle when complete
        console.log(`✅ Payment is processing - benefits will be processed by webhook when complete`);
      }
      // requires_action - frontend will handle 3DS redirect via client_secret
    } else {
      // ✅ FIX: Distinguish between cancelled and failed payment intents
      // Cancelled payment intents should not be logged as "Payment failed"
      if (paymentIntent.status === "canceled") {
        console.log(`ℹ️ Payment intent was cancelled: ${paymentIntent.id}`);
        return NextResponse.json(
          {
            success: false,
            error: "Payment was cancelled",
            details: "This payment attempt was cancelled. Please try again.",
          },
          { status: 400 }
        );
      }
      
      console.error(`❌ Payment intent status: ${paymentIntent.status} for package: ${membershipPackage._id}`);
      
      // ✅ CRITICAL FIX: Payment method is NOT saved to user database when payment fails
      // Payment methods are only saved after payment succeeds (lines 317-344, 374-402)
      // This ensures failed payment methods (e.g., insufficient funds) are not saved
      
      // Extract error details from payment intent if available
      const lastPaymentError = paymentIntent.last_payment_error;
      const errorMessage = lastPaymentError?.message || "Payment failed";
      const errorCode = lastPaymentError?.code;
      const declineCode = lastPaymentError?.decline_code;
      
      return NextResponse.json(
        {
          success: false,
          error: "Payment failed",
          details: errorMessage,
          ...(errorCode && { code: errorCode }),
          ...(declineCode && { decline_code: declineCode }),
        },
        { status: 400 }
      );
    }

    // ✅ REMOVED: Fallback processing to prevent duplicate Facebook tracking
    // Webhook is the single source of truth for payment processing
    // All benefits and Facebook tracking are handled by webhook handlers
    // This prevents duplicate tracking that causes inflated revenue in Facebook Ads
    console.log(`✅ Payment ${paymentIntent.id} will be processed by webhook`);

    // ✅ Referral processing moved to webhook (after payment succeeds)
    // Referral code is stored in payment intent metadata and processed by webhook

    // ✅ CRITICAL: Final refresh to ensure we have latest user data including saved payment methods
    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const finalUser = await User.findById(existingUser._id);
    if (!finalUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // `requires_action` means the buyer's bank still has to authenticate the charge — Stripe
    // holds it as Incomplete until they do. Saying "successful" / `paymentVerified: true` there
    // was how a 3-D Secure purchase reached the customer as "Purchase Complete! Your payment was
    // successful" while no money moved and no webhook ever fired. The client completes the
    // challenge (utils/payment/stripe/complete-pending-authentication.ts); this response must
    // not claim the payment is done before it is.
    const awaitingAuthentication = paymentIntent.status === "requires_action";

    return NextResponse.json({
      success: true,
      message: awaitingAuthentication
        ? "Payment requires bank authentication"
        : "One-time package purchase successful",
      data: {
        entriesAdded: membershipPackage.totalEntries,
        totalEntries: finalUser.accumulatedEntries || 0,
        packageName: membershipPackage.name,
        source: "one-time-package",
        paymentVerified: !awaitingAuthentication,
      },
      paymentIntent: {
        id: paymentIntent.id,
        status: paymentIntent.status,
        clientSecret: paymentIntent.client_secret,
      },
      user: {
        id: finalUser._id,
        email: finalUser.email,
        subscription: finalUser.subscription,
        oneTimePackages: finalUser.oneTimePackages,
        entryWallet: finalUser.entryWallet,
        accumulatedEntries: finalUser.accumulatedEntries,
        rewardsPoints: finalUser.rewardsPoints,
        savedPaymentMethods: finalUser.savedPaymentMethods || [], // ✅ CRITICAL: Include saved payment methods
      },
    });
  } catch (error) {
    // An issuer decline is an expected outcome, not a fault — `warn` (stripped in
    // production) keeps it out of the error stream. Anything else still logs as an error.
    // The `ErrorLoggingService.logError` call below is unconditional either way, so the
    // decline is still captured with full context in the `ErrorReport` collection.
    if (isExpectedPaymentDeclineError(error)) {
      console.warn("One-time purchase declined by issuer:", error);
    } else {
      console.error("❌ One-time purchase creation failed:", error);
    }

    // ✅ OPTIMIZED: Auto-log error for monitoring (fire-and-forget, non-blocking)
    // Don't await - let it run in background without blocking error response
    getServerSession(authOptions)
      .then((session) => {
        return request.json().catch(() => ({})).then((requestBody) => {
          ErrorLoggingService.logError(error, {
            userId: session?.user?.id,
            userEmail: session?.user?.email || undefined, // Convert null to undefined
            endpoint: request.url,
            requestMethod: "POST",
            requestBody,
            component: "create-one-time-purchase-existing-user",
            flow: "one-time-purchase",
            packageId: (requestBody as { packageId?: string })?.packageId,
          }, {
            isServerSide: true,
            request,
            skipRateLimit: true, // Critical payment errors should bypass rate limiting
          }).catch((logError) => {
            console.warn("Failed to auto-log error:", logError);
          });
        });
      })
      .catch(() => {
        // Silently fail if session/request body extraction fails
        ErrorLoggingService.logError(error, {
          endpoint: request.url,
          requestMethod: "POST",
          component: "create-one-time-purchase-existing-user",
          flow: "one-time-purchase",
        }, {
          isServerSide: true,
          request,
          skipRateLimit: true,
        }).catch(() => {
          // Silently fail
        });
      });

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: error.issues }, { status: 400 });
    }

    // Card declines: with confirm:true, stripe.paymentIntents.create THROWS a
    // StripeCardError instead of returning a failed intent, so they land here —
    // not in the last_payment_error branch above. Return the sibling 400
    // "Payment failed" shape (see create-subscription-existing-user) so the
    // client can show accurate decline guidance instead of a generic 500.
    if (isStripeCardError(error)) {
      const stripeError = error as { message?: string; code?: string; decline_code?: string; type?: string };
      const excessiveRetry = await analyzeStripePayErrorForExcessiveRetry(stripe, error);
      return NextResponse.json(
        {
          success: false,
          error: "Payment failed",
          details: stripeError.message || "Unable to process payment",
          ...(stripeError.code && { code: stripeError.code }),
          ...(stripeError.decline_code && { decline_code: stripeError.decline_code }),
          ...(stripeError.type && { type: stripeError.type }),
          ...(excessiveRetry.requiresDifferentPaymentMethod && {
            requiresDifferentPaymentMethod: true,
            ...(excessiveRetry.failureReason && { failureReason: excessiveRetry.failureReason }),
          }),
        },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json(
        { error: "Failed to create one-time purchase", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: "Failed to create one-time purchase" }, { status: 500 });
  }
}

// REMOVED: addEntriesToMajorDraw function moved to webhook-only processing
