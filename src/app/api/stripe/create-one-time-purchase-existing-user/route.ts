import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import { getMiniDrawPackageById } from "@/data/miniDrawPackages";
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
import Promo from "@/models/Promo";
import { savePaymentMethodToUser } from "@/utils/payment/payment-method-manager";
// Klaviyo integration handled by webhook for best practices
// Benefits are granted via webhook processing only
import { createPaymentIntentConfig } from "@/utils/payment/stripe/payment-intent-config";
import { getBaseUrl } from "@/utils/url/get-base-url";
import { executeBackgroundJob } from "@/utils/webhook/background-jobs";
import { ErrorLoggingService } from "@/services/error-reporting/ErrorLoggingService";
import AnonymousIdService from "@/services/ab-testing/AnonymousIdService";
import VariantAssignmentService from "@/services/ab-testing/VariantAssignmentService";
import ExperimentRepository from "@/repositories/ab-testing/ExperimentRepository";
import mongoose from "mongoose";
import { extractRequestContext } from "@/utils/tracking/facebook-helpers";

const createOneTimePurchaseExistingUserSchema = z.object({
  packageId: z.string().min(1, "Package ID is required"),
  paymentMethodId: z.string().min(1, "Payment method ID is required").optional(),
  idempotencyKey: z.string().optional(), // ✅ STRIPE BEST PRACTICE: Idempotency key to prevent duplicate PaymentIntent creation
  referralCode: z.string().optional(),
  affiliateCode: z.string().optional(),
  promoLinkCode: z.string().optional(),
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
    const requestContext = extractRequestContext(request);
    const capiEventSourceUrl =
      request.headers.get("referer") ??
      (process.env.NEXTAUTH_URL ? `${process.env.NEXTAUTH_URL}/shop` : undefined);

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
    let membershipPackage = getPackageById(validatedData.packageId);
    let isMiniDrawPackage = false;

    // If not found in regular packages, check mini draw packages
    if (!membershipPackage) {
      const miniDrawPackage = getMiniDrawPackageById(validatedData.packageId);
      if (miniDrawPackage && miniDrawPackage.isActive) {
        // Convert mini draw package to membership package format for compatibility
        membershipPackage = {
          _id: miniDrawPackage._id,
          name: miniDrawPackage.name,
          price: miniDrawPackage.price,
          totalEntries: miniDrawPackage.entries,
          isActive: miniDrawPackage.isActive,
          type: "one-time" as const,
          description: miniDrawPackage.description,
          features: [
            `${miniDrawPackage.entries} Free Entries`,
            `${miniDrawPackage.partnerDiscountDays} Days Partner Discounts`,
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        isMiniDrawPackage = true;
        // console.log("🎲 Mini draw package detected:", miniDrawPackage.name);
      }
    }

    if (!membershipPackage || !membershipPackage.isActive) {
      return NextResponse.json({ error: "Invalid or inactive package" }, { status: 400 });
    }

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
    if (!experimentAssignment) {
      try {
        // Check all assignment cookies (format: ta_ab_assignment_<experimentId>)
        const activeExperiments = await ExperimentRepository.findAll({
          status: "active",
          page: 1,
          limit: 10,
        });
        
        for (const exp of activeExperiments.experiments) {
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
            } catch (error) {
              // Invalid cookie data, skip
              console.warn(`⚠️ [A/B Testing] Invalid assignment cookie: ${cookieName}`);
            }
          }
        }
      } catch (error) {
        // Silently fail - cookie fallback should not block payment creation
        console.warn("Error checking assignment cookies:", error);
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

    // ✅ Use centralized PaymentIntent configuration with 3DS support
    const paymentIntentConfig = createPaymentIntentConfig({
      amount: Math.round(membershipPackage.price * 100), // Convert to cents
      currency: "aud",
      customer: customer.id,
      paymentMethod: paymentMethodId,
      confirm: true,
      paymentType: isMiniDrawPackage ? "mini-draw" : "one-time",
      description: membershipPackage.name,
      setupFutureUsage: "off_session", // ✅ Save payment method for future use (required for production/staging)
      metadata: {
        items: JSON.stringify([
          {
            type: isMiniDrawPackage ? "mini-draw" : "membership",
            id: membershipPackage._id,
            name: membershipPackage.name,
            price: membershipPackage.price,
          },
        ]),
        packageId: membershipPackage._id,
        userId: existingUser._id.toString(),
        userEmail: existingUser.email, // ✅ CRITICAL: Add userEmail for webhook fallback lookup
        packageName: membershipPackage.name,
        type: isMiniDrawPackage ? "mini-draw" : "one-time", // ✅ CRITICAL: Set 'type' for webhook compatibility
        packageType: isMiniDrawPackage ? "mini-draw" : "one-time", // ✅ Also set 'packageType' for consistency
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
        ...(capiEventSourceUrl ? { capi_event_source_url: capiEventSourceUrl } : {}),
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

    return NextResponse.json({
      success: true,
      message: "One-time package purchase successful",
      data: {
        entriesAdded: membershipPackage.totalEntries,
        totalEntries: finalUser.accumulatedEntries || 0,
        packageName: membershipPackage.name,
        source: "one-time-package",
        paymentVerified: true,
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
    console.error("❌ One-time purchase creation failed:", error);

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
