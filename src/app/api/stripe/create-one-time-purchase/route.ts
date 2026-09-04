import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import { isMiniDrawPackageId } from "@/data/miniDrawPackages";
import { stripe } from "@/lib/stripe";
// Referral processing moved to webhook - no longer needed here
import { trackAffiliateSignup } from "@/lib/affiliate";
import Stripe from "stripe";
import { z } from "zod";
import { extractRequestContext } from "@/utils/tracking/facebook-helpers";
import { extractTikTokContext } from "@/utils/tracking/tiktok-helpers";
import { safeEventSourceUrl } from "@/utils/tracking/event-source-url";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolvePurchaseIdentity } from "@/utils/payment/checkout-identity";
// ✅ REMOVED: processPaymentBenefits and isPaymentProcessed imports
// Fallback processing removed to prevent duplicate Facebook tracking
// Webhook is now the single source of truth for payment processing
import { savePaymentMethodToUser } from "@/utils/payment/payment-method-manager";
import { isStripeCardError } from "@/utils/payment/stripe/payment-error-detection";
import { analyzeStripePayErrorForExcessiveRetry } from "@/utils/payment/stripe/stripe-excessive-retry";
import { autoLogPaymentErrorServer } from "@/utils/error-reporting/auto-log-error-server";
import AnonymousIdService from "@/services/ab-testing/AnonymousIdService";
import VariantAssignmentService from "@/services/ab-testing/VariantAssignmentService";
import ExperimentRepository from "@/repositories/ab-testing/ExperimentRepository";
import mongoose from "mongoose";
// Klaviyo integration handled by webhook for best practices
// Benefits are granted via webhook processing only
import { createPaymentIntentConfig } from "@/utils/payment/stripe/payment-intent-config";
import {
  resolvePurchasePaymentIntent,
  PaymentIntentNotAdoptableError,
} from "@/utils/payment/stripe/resolve-purchase-payment-intent";
import { buildAttributionMetadata } from "@/utils/tracking/attribution-metadata";
import { attributionSchema } from "@/utils/tracking/attribution-schema";
import { resolveAttributionAtEdge } from "@/services/attribution/resolveAtEdge";
import { executeBackgroundJob } from "@/utils/webhook/background-jobs";
import { enforceMajorDrawOpenForNewPurchasesOr403 } from "@/utils/draws/major-draw-gate-http";
import { CampaignCodeValidationService } from "@/services/redeemables/CampaignCodeValidationService";

const createOneTimePurchaseSchema = z.object({
  userEmail: z.string().email("Invalid email address"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  mobile: z.string().optional(),
  packageId: z.string().min(1, "Package ID is required"),
  password: z.string().min(6, "Password must be at least 6 characters").optional(), // Made optional for passwordless users
  paymentMethodId: z.string().min(1, "Payment method is required"),
  paymentIntentId: z.string().optional(), // Optional PaymentIntent ID if already confirmed upfront
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
 * POST /api/stripe/create-one-time-purchase
 * Create a one-time purchase payment intent and user account
 */
export async function POST(request: NextRequest) {
  // Store request body and context for error logging
  let requestBody: Record<string, unknown> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let membershipPackage: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, prefer-const
  let user: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, prefer-const
  let customer: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, prefer-const
  let paymentIntent: any = null;
  
  try {
    await connectDB();

    // Extract request context for Facebook CAPI (IP, user agent, fbc, fbp)
    // Store in payment metadata so webhook can use it for improved match quality
    // Carries every provider's match signals: Meta's fbc/fbp and TikTok's ttclid/ttp.
    // Both get stashed in Stripe metadata (capi_*) because Purchase fires from the
    // webhook, which has no cookies to read them back from.
    const requestContext = { ...extractRequestContext(request), ...extractTikTokContext(request) };
    const capiEventSourceUrl = safeEventSourceUrl(
      request.headers.get("referer") ??
      (process.env.NEXTAUTH_URL ? `${process.env.NEXTAUTH_URL}/shop` : undefined)
    );
    const { metadata: resolvedAttr } = resolveAttributionAtEdge(request);

    const body = await request.json();
    requestBody = body; // Store for error logging
    const validatedData = createOneTimePurchaseSchema.parse(body);
    const normalizedAffiliateCode = validatedData.affiliateCode?.trim().toUpperCase();

    console.log(`🛒 Creating one-time purchase for: ${validatedData.userEmail}`);

    /**
     * A mini-draw package cannot be sold here — reject BEFORE any money moves.
     *
     * This route has no draw in scope, so it cannot put `miniDrawId` in the PaymentIntent
     * metadata. It used to accept these ids anyway: it synthesised a fake one-time package from
     * the mini catalogue and stamped `type: "mini-draw"` with no `miniDrawId`, Stripe captured
     * the money, and `handleMiniDrawWebhook` then bailed at its `if (!miniDrawId)` guard —
     * charged, nothing granted. No live UI ever sent one (every mini surface posts to
     * `/api/mini-draw/purchase`), but the branch was one `activePlan.id` away from being live:
     * `MembershipModal` still carries seven `startsWith("mini-pack-")` branches pointed here.
     *
     * 400, not 404: the id is real, the endpoint is wrong.
     */
    if (isMiniDrawPackageId(validatedData.packageId)) {
      return NextResponse.json(
        {
          error: "Mini draw packages must be purchased through the mini draw flow",
          code: "MINI_DRAW_PACKAGE_WRONG_ENDPOINT",
        },
        { status: 400 }
      );
    }

    membershipPackage = getPackageById(validatedData.packageId);

    if (!membershipPackage) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    }

    if (membershipPackage.type !== "one-time") {
      return NextResponse.json({ error: "Package must be a one-time type" }, { status: 400 });
    }

    // Unconditional now that mini packages are rejected above — they were the only family that
    // skipped the major-draw freeze gate, and they can no longer reach this route.
    const gateResponse = await enforceMajorDrawOpenForNewPurchasesOr403();
    if (gateResponse) return gateResponse;

    // Check if user already exists (from registration)
    //
    // SECURITY (2026-08-28): this was a bare `User.findOne({ email })` on a route that
    // takes NO session, with `userEmail` supplied by the caller. Naming any member's email
    // bound the PaymentIntent to their Stripe customer and stamped their id into metadata
    // — the same account-takeover shape fixed in `create-payment-intent`. The email must
    // now be PROVEN by the cookie `/api/auth/register` sets, or the caller is treated as a
    // true guest. See src/utils/payment/checkout-identity.ts.
    console.log("👤 Checking if user already exists...");
    const sessionForBind = await getServerSession(authOptions);
    const purchaseIdentity = await resolvePurchaseIdentity({
      request,
      sessionUserId: sessionForBind?.user?.id ?? null,
      userEmail: validatedData.userEmail ?? null,
    });

    if (purchaseIdentity.kind === "must_authenticate") {
      return NextResponse.json(
        {
          success: false,
          error: "This email is already associated with an account. Please log in to continue.",
          code: "ACCOUNT_EXISTS_LOGIN_REQUIRED",
        },
        { status: 403 }
      );
    }

    // `null` for a genuine new buyer — every downstream use is already null-safe
    // (`registeredUser?.`), which is what the true-guest path has always relied on.
    const registeredUser = purchaseIdentity.kind === "bound" ? purchaseIdentity.user : null;
    const existingAffiliateCode = registeredUser?.affiliateReferral?.affiliateCode;
    const affiliateMetadataCode = normalizedAffiliateCode || existingAffiliateCode;

    // Handle payment method creation following Stripe best practices
    const finalPaymentMethodId = validatedData.paymentMethodId;

    // Payment method should already be created via SetupIntent
    // If we receive "new_payment_method", it means the frontend didn't complete the setup
    if (validatedData.paymentMethodId === "new_payment_method") {
      return NextResponse.json(
        {
          success: false,
          error: "Payment method not properly set up. Please complete card details first.",
        },
        { status: 400 }
      );
    }

    // Determine which customer to use
    let customer;

    // First, check if we have a registered user with an existing Stripe customer
    if (registeredUser && registeredUser.stripeCustomerId) {
      console.log(`👤 Using existing Stripe customer: ${registeredUser.stripeCustomerId}`);
      const retrievedCustomer = await stripe.customers.retrieve(registeredUser.stripeCustomerId);

      // ✅ FIX: Check if customer was deleted
      if ("deleted" in retrievedCustomer && retrievedCustomer.deleted) {
        // Customer was deleted, create a new one
        console.log("⚠️ Existing customer was deleted, creating new customer...");
        customer = await stripe.customers.create({
          email: validatedData.userEmail,
          name: `${validatedData.firstName} ${validatedData.lastName}`,
          phone: validatedData.mobile,
          metadata: {
            packageId: validatedData.packageId,
            packageName: membershipPackage.name,
            userId: registeredUser._id.toString(),
          },
        });
        registeredUser.stripeCustomerId = customer.id;
        // ✅ OPTIMIZED: Make user save fire-and-forget (webhook handles final updates)
        registeredUser.save().catch((error) => {
          console.warn("Non-critical user save failed (webhook will handle):", error);
        });
        console.log(`✅ Created new customer ${customer.id} to replace deleted one`);
      } else {
        customer = retrievedCustomer as Stripe.Customer;
      }

      // ✅ FIX: Attach payment method to customer if not already attached
      // This handles cases where PaymentIntent was created without a customer
      try {
        const paymentMethod = await stripe.paymentMethods.retrieve(finalPaymentMethodId);
        if (!paymentMethod.customer || paymentMethod.customer !== customer.id) {
          await stripe.paymentMethods.attach(finalPaymentMethodId, {
            customer: customer.id,
          });
          console.log(`✅ Attached payment method to existing customer: ${customer.id}`);
        }
      } catch (attachError) {
        console.error("❌ Failed to attach payment method to customer:", attachError);
        // Continue - payment method might already be attached or error is non-critical
      }
    } else {
      // For guest users or new users, get the customer ID from the payment method
      console.log("🔍 Retrieving payment method to get customer ID...");
      try {
        const paymentMethod = await stripe.paymentMethods.retrieve(finalPaymentMethodId);
        if (paymentMethod.customer) {
          // Payment method has a customer - use it
          console.log(`👤 Payment method attached to customer: ${paymentMethod.customer}`);
          const retrievedCustomer = await stripe.customers.retrieve(paymentMethod.customer as string);

          // ✅ FIX: Check if customer was deleted
          if ("deleted" in retrievedCustomer && retrievedCustomer.deleted) {
            // Customer was deleted, create a new one
            console.log("⚠️ Customer from payment method was deleted, creating new customer...");
            customer = await stripe.customers.create({
              email: validatedData.userEmail,
              name: `${validatedData.firstName} ${validatedData.lastName}`,
              phone: validatedData.mobile,
              metadata: {
                packageId: validatedData.packageId,
                packageName: membershipPackage.name,
                userId: registeredUser?._id?.toString() || "guest",
              },
            });
            // Attach payment method to new customer
            await stripe.paymentMethods.attach(finalPaymentMethodId, {
              customer: customer.id,
            });
            console.log(`✅ Created new customer ${customer.id} and attached payment method`);
          } else {
            customer = retrievedCustomer as Stripe.Customer;
            console.log(`✅ Using customer from payment method: ${customer.id}`);

            // Update the customer with proper details if it's a temporary guest customer
            if (customer.metadata?.type === "guest" || customer.metadata?.temporary === "true") {
              console.log("🔄 Updating temporary customer with proper details...");
              customer = await stripe.customers.update(customer.id, {
                email: validatedData.userEmail,
                name: `${validatedData.firstName} ${validatedData.lastName}`,
                phone: validatedData.mobile,
                metadata: {
                  packageId: validatedData.packageId,
                  packageName: membershipPackage.name,
                  userId: registeredUser?._id?.toString() || "guest",
                },
              });
              console.log(`✅ Updated customer details: ${customer.id}`);
            }
          }
        } else {
          // ✅ FIX: Payment method has no customer - create one and attach it
          // This happens when PaymentIntent was created without a customer
          console.log("🆕 Payment method has no customer - creating new customer...");

          customer = await stripe.customers.create({
            email: validatedData.userEmail,
            name: `${validatedData.firstName} ${validatedData.lastName}`,
            phone: validatedData.mobile,
            metadata: {
              packageId: validatedData.packageId,
              packageName: membershipPackage.name,
              userId: registeredUser?._id?.toString() || "guest",
            },
          });

          // Attach payment method to the newly created customer
          await stripe.paymentMethods.attach(finalPaymentMethodId, {
            customer: customer.id,
          });

          console.log(`✅ Created customer ${customer.id} and attached payment method`);

          // If registered user exists, update them with the customer ID
          if (registeredUser) {
            registeredUser.stripeCustomerId = customer.id;
            // ✅ OPTIMIZED: Make user save fire-and-forget (webhook handles final updates)
            registeredUser.save().catch((error) => {
              console.warn("Non-critical user save failed (webhook will handle):", error);
            });
            console.log(`✅ Linked customer ${customer.id} to registered user ${registeredUser._id}`);
          }
        }
      } catch (error) {
        console.error("❌ Failed to retrieve payment method:", error);
        throw new Error("Failed to retrieve payment method details");
      }
    }

    // Payment method is already attached to customer via SetupIntent
    // Just set it as the default payment method
    // ✅ SYNC: Also update customer email if it differs from form email
    // ✅ FIX: Ensure customer is not deleted before accessing email
    if ("deleted" in customer && customer.deleted) {
      throw new Error("Stripe customer was deleted - cannot proceed with purchase");
    }

    const customerEmail = customer.email || "";
    const needsEmailUpdate = customerEmail.toLowerCase() !== validatedData.userEmail.toLowerCase();

    if (needsEmailUpdate) {
      console.log(`🔄 Syncing customer email: ${customerEmail} → ${validatedData.userEmail}`);
      await stripe.customers.update(customer.id, {
        email: validatedData.userEmail,
        invoice_settings: {
          default_payment_method: finalPaymentMethodId,
        },
      });
      console.log(`✅ Customer email synced: ${customer.id}`);
    } else {
      await stripe.customers.update(customer.id, {
        invoice_settings: {
          default_payment_method: finalPaymentMethodId,
        },
      });
    }
    console.log(`💳 Set ${finalPaymentMethodId} as default payment method for customer ${customer.id}`);

    // ✅ CRITICAL: Get experiment assignment for A/B testing tracking (BEFORE PaymentIntent creation/update)
    // Store in metadata so webhook can use it directly (more reliable than lookup)
    // ✅ FIX: Extract anonymousId from request to find assignments created before user logged in
    const anonymousId = AnonymousIdService.extractAnonymousId(request);
    
    // ✅ Auto-merge anonymous assignments to userId when user registers/logs in
    if (registeredUser?._id && anonymousId) {
      try {
        const mergeResult = await VariantAssignmentService.mergeAnonymousToUser(anonymousId, registeredUser._id.toString());
        if (mergeResult.merged > 0) {
          console.log(`✅ [A/B Testing] Auto-merged ${mergeResult.merged} anonymous assignment(s) to user ${registeredUser._id}`);
        }
      } catch (error) {
        // Silently fail - merge should not block payment creation
        console.error("Error auto-merging anonymous assignments:", error);
      }
    }
    
    // ✅ FIX: Get experiment assignment for ALL users (registered and new)
    // This ensures one-time purchases are tracked even for new users who haven't registered yet
    let experimentAssignment: { experimentId: string; variantId: string } | null = null;
    
    // 1. If registeredUser exists, check database first (most reliable)
    if (registeredUser?._id) {
      try {
        const { getUserActiveExperimentAssignment } = await import("@/utils/ab-testing/get-user-experiment-assignment");
        // ✅ Pass anonymousId to find assignments created before user logged in
        experimentAssignment = await getUserActiveExperimentAssignment(
          registeredUser._id.toString(),
          undefined, // slug
          anonymousId || undefined // anonymousId from cookies
        );
        
        if (experimentAssignment) {
          console.log(`✅ [A/B Testing] Found assignment from database for registered user:`, experimentAssignment);
        }
      } catch (error) {
        // Silently fail - experiment tracking should not block payment creation
        console.error("Error getting experiment assignment from database:", error);
      }
    }
    
    // 2. If assignment not found (or user not registered), check cookies for anonymous assignments
    // This handles new users who visited promotion page before registering.
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
                console.log(`✅ [A/B Testing] Found assignment from cookie (for new user or fallback):`, experimentAssignment);
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
      console.warn(`⚠️ [A/B Testing] No experiment assignment found for one-time purchase:`, {
        hasRegisteredUser: !!registeredUser?._id,
        hasAnonymousId: !!anonymousId,
        userEmail: validatedData.userEmail,
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
      userId: registeredUser?._id?.toString(),
      context: "create-one-time-purchase",
    });

    // ✅ SINGLE SOURCE OF TRUTH: one config, one resolver, for BOTH reuse and create.
    // This route used to carry its own copy of the reuse logic while
    // create-one-time-purchase-existing-user carried none. That divergence is exactly what
    // double-charged 54 members (see resolve-purchase-payment-intent.ts) — so both routes
    // now share the one implementation, and a third caller cannot quietly miss it.

    // (Customer email sync + deleted-customer guard already ran unconditionally above,
    // before the payment method was attached — no second pass needed here.)

    // ✅ STRIPE BEST PRACTICE: idempotency key so a double-submit cannot create two intents.
    const idempotencyKey =
      validatedData.idempotencyKey ||
      `pi_${validatedData.packageId}_${validatedData.userEmail}_${Date.now()}`;

    // Note: experimentAssignment is already retrieved above.
    const paymentIntentConfig = createPaymentIntentConfig({
      amount: Math.round(membershipPackage.price * 100), // Convert to cents
      currency: "aud",
      customer: customer.id,
      paymentMethod: finalPaymentMethodId, // Use the final payment method ID
      confirm: true, // Auto-confirm
      paymentType: "one-time",
      description: membershipPackage.name,
      setupFutureUsage: "off_session", // ✅ Save payment method for future use (required for production/staging)
      metadata: {
        items: JSON.stringify([
          {
            type: "membership",
            id: validatedData.packageId,
            name: membershipPackage.name,
            price: membershipPackage.price,
          },
        ]),
        packageId: validatedData.packageId,
        userEmail: validatedData.userEmail,
        // ✅ FIX: Add userId for registered users so webhook can find them
        // This fixes the issue where userId remains "guest" even for registered users
        ...(registeredUser && { userId: registeredUser._id.toString() }),
        type: "one-time", // ✅ CRITICAL: Set 'type' for webhook compatibility
        packageType: "one-time", // ✅ Also set 'packageType' for consistency
        entriesCount: (membershipPackage.totalEntries || membershipPackage.entriesPerMonth || 0).toString(),
        price: Math.round(membershipPackage.price * 100).toString(), // Price in cents for webhook processing
        // ✅ ADD: Include user data for account creation in webhook (for new users)
        ...(!registeredUser && {
          firstName: validatedData.firstName,
          lastName: validatedData.lastName,
          mobile: validatedData.mobile || "",
          isNewUser: "true", // Flag to indicate this is a new user
          ...(validatedData.password && { password: validatedData.password }), // Only if provided
        }),
        // ✅ ADD: Store payment method ID for webhook to save after payment succeeds
        paymentMethodId: finalPaymentMethodId,
        ...(affiliateMetadataCode ? { affiliateCode: affiliateMetadataCode } : {}),
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

    let paymentIntent: Stripe.PaymentIntent;
    try {
      const resolved = await resolvePurchasePaymentIntent({
        customerId: customer.id,
        packageId: validatedData.packageId,
        suppliedPaymentIntentId: validatedData.paymentIntentId,
        createConfig: paymentIntentConfig,
        idempotencyKey,
        context: "create-one-time-purchase",
      });
      paymentIntent = resolved.paymentIntent;
      console.log(
        `💳 One-time charge ${resolved.outcome}: ${paymentIntent.id} (${paymentIntent.status})`
      );
    } catch (resolveError) {
      if (resolveError instanceof PaymentIntentNotAdoptableError) {
        return NextResponse.json(
          { error: resolveError.reason, details: resolveError.details },
          { status: 400 }
        );
      }
      throw resolveError;
    }

    console.log(`💳 Using payment intent: ${paymentIntent.id}`);
    console.log(`📋 PaymentIntent metadata:`, {
      id: paymentIntent.id,
      status: paymentIntent.status,
      customer: paymentIntent.customer,
      amount: paymentIntent.amount,
      metadata: paymentIntent.metadata,
    });

    let user;

    // Gate on the lowercased lookup (`registeredUser`). Emails are stored
    // lowercase (User schema `lowercase: true`), so a case-sensitive match would
    // miss a registered user who typed their email with any uppercase — wrongly
    // deferring account creation to the webhook and leaving them logged out after
    // a successful payment (and risking a duplicate account). `registeredUser`
    // matches in every case the old case-sensitive lookup did, plus those cases.
    if (registeredUser) {
      // User already exists (registered in step 1)
      // ✅ FIX: Only update Stripe customer ID, DON'T save payment method yet
      // Payment method will be saved by webhook after payment succeeds
      console.log(`🔄 Updating existing user with Stripe customer ID: ${customer.id}`);

      // Update existing user with Stripe customer ID ONLY
      // Payment method will be saved by webhook after successful payment
      user = await User.findByIdAndUpdate(
        registeredUser._id,
        {
          $set: {
            stripeCustomerId: customer.id,
          },
          // ✅ REMOVED: Don't save payment method here - webhook will handle it
        },
        { new: true }
      );

      if (!user) {
        throw new Error("Failed to update existing user");
      }

      console.log(`✅ Updated existing user: ${user._id} (payment method will be saved after payment succeeds)`);
    } else {
      // ✅ FIX: Don't create new user account here
      // Store user data in PaymentIntent metadata instead
      // Webhook will create the account after payment succeeds
      console.log(`⏳ Deferring account creation - will be created by webhook after payment succeeds`);
      
      // Store user data in metadata for webhook to create account
      // The webhook will create the account using this metadata
      // This prevents orphaned accounts if user cancels payment
      
      // Set user to null - webhook will create it
      user = null;
      
      // ✅ CRITICAL: Ensure PaymentIntent metadata has all user data needed for account creation
      // This is already done above when creating/updating PaymentIntent
      console.log(`📋 User data stored in PaymentIntent metadata for webhook processing`);
    }

    // ✅ Attach affiliate referral if provided and not already set
    if (normalizedAffiliateCode && user && (!user.affiliateReferral || !user.affiliateReferral.affiliateId)) {
      try {
        await trackAffiliateSignup({
          affiliateCode: normalizedAffiliateCode,
          userId: user._id.toString(),
          userEmail: user.email,
        });
        user = (await User.findById(user._id)) ?? user;
      } catch (affiliateError) {
        console.error("Affiliate tracking error during one-time purchase:", affiliateError);
      }
    }

    // ✅ REMOVED: Fallback processing to prevent duplicate Facebook tracking
    // Webhook is the single source of truth for payment processing
    // All benefits and Facebook tracking are handled by webhook handlers
    // This prevents duplicate tracking that causes inflated revenue in Facebook Ads
    if (validatedData.paymentIntentId && user) {
      console.log(`✅ Payment ${paymentIntent.id} will be processed by webhook`);
    }

    // ✅ OPTIMIZED: Trust Stripe's status - webhook handles verification
    // Payment status is accurate when returned - no delay or re-retrieve needed
    if (paymentIntent.status === "succeeded") {
      // ✅ OPTIMIZED: Save payment method as fire-and-forget (webhook handles as backup)
      // This prevents "No Payment Method" error when upsell modal opens
      // For existing users, save in background. For new users, webhook will save during account creation.
      if (user && finalPaymentMethodId) {
        executeBackgroundJob("Save payment method after purchase", async () => {
          try {
            const freshUser = await User.findById(user._id);
            if (freshUser) {
              console.log(`💳 [BACKGROUND] Saving payment method after payment success: ${finalPaymentMethodId}`);
              
              const saveResult = await savePaymentMethodToUser(freshUser, finalPaymentMethodId, {
                setAsDefault: !freshUser.savedPaymentMethods || freshUser.savedPaymentMethods.length === 0,
              });
              
              if (saveResult.success) {
                console.log(`✅ [BACKGROUND] Payment method saved successfully: ${finalPaymentMethodId}`);
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
      
      console.log(`✅ Payment succeeded - benefits will be processed by webhook`);
      console.log(`📋 PaymentIntent ID for webhook: ${paymentIntent.id}`);
      console.log(`👤 Customer ID for webhook lookup: ${paymentIntent.customer}`);
      console.log(`📧 User email for webhook lookup: ${paymentIntent.metadata.userEmail}`);
    } else if (paymentIntent.status === "requires_action" || paymentIntent.status === "processing") {
      console.log(`⏳ Payment requires action or is processing - webhook will handle when complete`);
      
      // Trust Stripe's status - webhook will handle when payment completes
      // For processing status, return success - webhook will handle completion
      // For requires_action, frontend will handle 3DS redirect
      
      if (paymentIntent.status === "processing") {
        // Processing status - return success, webhook will handle when complete
        console.log(`✅ Payment is processing - benefits will be processed by webhook when complete`);
        console.log(`📋 PaymentIntent ID for webhook: ${paymentIntent.id}`);
        console.log(`👤 Customer ID for webhook lookup: ${paymentIntent.customer}`);
        console.log(`📧 User email for webhook lookup: ${paymentIntent.metadata.userEmail}`);
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
      // Payment methods are only saved after payment succeeds (lines 726-755, 668-697)
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

    // ✅ Referral processing moved to webhook (after payment succeeds)
    // Referral code is stored in payment intent metadata and processed by webhook

    // ✅ FIX: Return response based on whether user exists
    // For new users, don't return user data - webhook will create account and handle login
    if (user) {
      // ✅ CRITICAL: Final refresh to ensure we have latest user data including saved payment methods
      const finalUser = await User.findById(user._id);
      if (!finalUser) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      
      // Existing user - return user data for auto-login
      return NextResponse.json({
        success: true,
        message: "One-time package purchase successful",
        data: {
          entriesAdded: membershipPackage.totalEntries || 0,
          totalEntries: finalUser.accumulatedEntries || 0,
          packageName: membershipPackage.name,
          source: "one-time-package",
          paymentVerified: true,
          paymentIntentId: paymentIntent.id,
          customerId: customer.id,
          userId: finalUser._id,
          clientSecret: paymentIntent.client_secret,
          status: paymentIntent.status,
          user: {
            id: finalUser._id,
            email: finalUser.email,
            firstName: finalUser.firstName,
            lastName: finalUser.lastName,
            role: finalUser.role,
            subscription: finalUser.subscription,
            entryWallet: finalUser.entryWallet,
            accumulatedEntries: finalUser.accumulatedEntries,
            rewardsPoints: finalUser.rewardsPoints,
            savedPaymentMethods: finalUser.savedPaymentMethods || [], // ✅ CRITICAL: Include saved payment methods
          },
          autoLogin: true, // Flag to indicate auto-login should be triggered
        },
      });
    } else {
      // New user - account will be created by webhook
      // Return success but indicate account creation is pending
      return NextResponse.json({
        success: true,
        message: "Payment successful. Account will be created shortly.",
        data: {
          entriesAdded: membershipPackage.totalEntries || 0,
          packageName: membershipPackage.name,
          source: "one-time-package",
          paymentVerified: true,
          paymentIntentId: paymentIntent.id,
          customerId: customer.id,
          status: paymentIntent.status,
          accountCreationPending: true, // Flag to indicate account creation is pending
          // Don't return user data - webhook will create account
        },
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }

    console.error("❌ Error creating one-time purchase:", error);
    
    // ✅ AUTO-LOG PAYMENT ERRORS: Automatically log payment failures
    // Extract error information
    let errorCode: string | undefined;
    let declineCode: string | undefined;
    let errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Check if it's a Stripe error
    if (error && typeof error === "object" && "type" in error) {
      const stripeError = error as { code?: string; decline_code?: string; message?: string };
      errorCode = stripeError.code;
      declineCode = stripeError.decline_code;
      errorMessage = stripeError.message || errorMessage;
    }
    
    // Use stored request body and context for error logging
    const errorContext = {
      packageId: typeof requestBody?.packageId === "string" ? requestBody.packageId : undefined,
      packageName: membershipPackage?.name,
      userEmail: typeof requestBody?.userEmail === "string" ? requestBody.userEmail : undefined,
      userId: user?._id?.toString(),
      customerId: customer?.id,
      paymentIntentId: paymentIntent?.id,
      amount: membershipPackage?.price ? Math.round(membershipPackage.price * 100) : undefined,
      errorCode,
      declineCode,
      errorMessage,
    };
    
    // Auto-log payment error (fire and forget - don't block response)
    autoLogPaymentErrorServer(error, request, errorContext).catch((logError) => {
      console.warn("Failed to auto-log payment error:", logError);
    });

    // Card declines: with confirm:true, stripe.paymentIntents.create THROWS a
    // StripeCardError instead of returning a failed intent, so they land here —
    // not in the last_payment_error branch above. Return the sibling 400
    // "Payment failed" shape (see create-subscription-existing-user) so the
    // client can show accurate decline guidance instead of a generic 500.
    if (isStripeCardError(error)) {
      const excessiveRetry = await analyzeStripePayErrorForExcessiveRetry(stripe, error);
      return NextResponse.json(
        {
          success: false,
          error: "Payment failed",
          details: errorMessage || "Unable to process payment",
          ...(errorCode && { code: errorCode }),
          ...(declineCode && { decline_code: declineCode }),
          ...(excessiveRetry.requiresDifferentPaymentMethod && {
            requiresDifferentPaymentMethod: true,
            ...(excessiveRetry.failureReason && { failureReason: excessiveRetry.failureReason }),
          }),
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: "Failed to create one-time purchase" }, { status: 500 });
  }
}
