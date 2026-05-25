import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import { stripe } from "@/lib/stripe";
// Referral processing moved to webhook - no longer needed here
import { extractRequestContext } from "@/utils/tracking/facebook-helpers";
import { safeEventSourceUrl } from "@/utils/tracking/event-source-url";
import Stripe from "stripe";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { autoLogPaymentErrorServer } from "@/utils/error-reporting/auto-log-error-server";
import AnonymousIdService from "@/services/ab-testing/AnonymousIdService";
import {
  attachPaymentMethodToCustomer,
} from "@/utils/payment/stripe/payment-method-utils";
import { createSubscriptionWithIdempotencyRetry } from "@/utils/payment/stripe/createSubscriptionWithIdempotencyRetry";
import { ensureCustomerExists, updateCustomerPaymentMethod } from "@/utils/payment/stripe/customer-utils";
import { getExperimentAssignmentForSubscription } from "@/utils/ab-testing/subscription-assignment";
// Klaviyo integration handled by webhook for best practices
import { getSubscriptionCreateParamsForAnchor, getNextAnchorTimestamp } from "@/utils/billing/anchor-billing";
import { getSubscriptionPeriodEnd } from "@/utils/payment/stripe/subscription-period";
import {
  checkCanCreateSubscription,
  EXISTING_SUBSCRIPTION_CODE,
  EXISTING_SUBSCRIPTION_MESSAGE,
} from "@/utils/payment/subscription-creation-guard";
import { shouldWriteCanonicalStripeSubscriptionId, stripeCustomerHasManageableSubscription, cancelIncompleteSubscriptionAndVoidInvoice } from "@/services/subscription";
import { createRateLimiter, getClientIdentifier } from "@/utils/security/rateLimiter";
import { buildAttributionMetadata } from "@/utils/tracking/attribution-metadata";
import { attributionSchema } from "@/utils/tracking/attribution-schema";
import { enforceMajorDrawOpenForNewPurchasesOr403 } from "@/utils/draws/major-draw-gate-http";

// Rate limit: 20 create-subscription requests per minute per IP
const createSubscriptionRateLimiter = createRateLimiter("create-subscription", {
  windowMs: 60 * 1000,
  maxRequests: 20,
});

// Interface for Stripe errors
interface StripeError {
  type: string;
  message: string;
  code?: string;
}

const createSubscriptionSchema = z.object({
  userEmail: z.string().email("Invalid email address"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  mobile: z.string().optional(),
  packageId: z.string().min(1, "Package ID is required"),
  password: z.string().min(6, "Password must be at least 6 characters").optional(), // Made optional for passwordless users
  paymentMethodId: z.string().optional(), // Optional for Option A: when omitted, first payment uses invoice PaymentIntent only (no SetupIntent)
  subscriptionRequestId: z.string().uuid().optional(), // Idempotency/correlation: frontend sends UUID; used as Stripe idempotency key
  idempotencyKey: z.string().optional(), // Fallback idempotency key if subscriptionRequestId not provided
  cancelPreviousSubscriptionId: z.string().optional(), // When user switches package: cancel this incomplete subscription before creating new one (guest: must match request email)
  referralCode: z.string().optional(),
  promoLinkCode: z.string().optional(),
  campaignCode: z.string().optional(),
  attribution: attributionSchema,
});

/**
 * POST /api/stripe/create-subscription
 * Create a new Stripe subscription and user account (registration + subscription in one flow)
 */
export async function POST(request: NextRequest) {
  // Store request body and context for error logging
  let requestBody: Record<string, unknown> = {};
  let correlationId: string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let membershipPackage: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, prefer-const
  let user: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let customer: any = null;

  try {
    await connectDB();

    const body = await request.json();
    requestBody = body;

    correlationId =
      (body as { subscriptionRequestId?: string })?.subscriptionRequestId ??
      request.headers.get("x-correlation-id") ??
      undefined;

    // Rate limiting: throttle by IP to prevent abuse
    const clientIp = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? null;
    const identifier = getClientIdentifier(clientIp, request.headers.get("x-forwarded-for"));
    const rateLimitResult = createSubscriptionRateLimiter.check(identifier);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many requests",
          details: "Please try again later.",
          retryAfterSeconds: rateLimitResult.retryAfterSeconds,
          ...(correlationId && { correlationId }),
        },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfterSeconds) } }
      );
    }

    // Extract request context for Facebook CAPI (IP, user agent, fbc, fbp)
    const requestContext = extractRequestContext(request);
    const capiEventSourceUrl = safeEventSourceUrl(
      request.headers.get("referer") ??
      (process.env.NEXTAUTH_URL ? `${process.env.NEXTAUTH_URL}/shop` : undefined)
    );
    // console.log("📋 Request body received:", { ...body, password: "[HIDDEN]" });

    // console.log("✅ Validating request data...");
    const validatedData = createSubscriptionSchema.parse(body);
    // console.log("✅ Data validation successful");

    // console.log(`🚀 Creating subscription for: ${validatedData.userEmail}`);

    // Check if user already exists
    const existingUser = await User.findOne({ email: validatedData.userEmail });
    if (existingUser) {
      // console.log(`👤 User already exists, proceeding with subscription: ${existingUser._id}`);
      // User already exists (registered in step 1), proceed with subscription
    }

    // Cancel previous incomplete subscription when user switched package (plan switch mid-checkout)
    if (validatedData.cancelPreviousSubscriptionId) {
      try {
        const prevSub = await stripe.subscriptions.retrieve(validatedData.cancelPreviousSubscriptionId);
        const status = prevSub.status;
        if (status === "incomplete" || status === "incomplete_expired") {
          const custId = typeof prevSub.customer === "string" ? prevSub.customer : prevSub.customer?.id;
          if (custId) {
            const cust = await stripe.customers.retrieve(custId);
            const custEmail = cust && !cust.deleted && "email" in cust ? (cust.email ?? "").toLowerCase() : "";
            const requestEmail = validatedData.userEmail.toLowerCase();
            if (custEmail === requestEmail) {
              await stripe.subscriptions.cancel(validatedData.cancelPreviousSubscriptionId);
              if (existingUser?.subscription?.pendingStripeSubscriptionId === validatedData.cancelPreviousSubscriptionId) {
                existingUser.subscription.pendingStripeSubscriptionId = undefined;
                existingUser.subscription.pendingStripeSubscriptionRequestId = undefined;
                existingUser.subscription.pendingStripeSubscriptionCreatedAt = undefined;
                existingUser.markModified("subscription");
                await existingUser.save();
              }
              if (correlationId) {
                console.log("[create-subscription] cancelled previous incomplete subscription (plan switch)", {
                  correlationId,
                  cancelledSubscriptionId: validatedData.cancelPreviousSubscriptionId,
                });
              }
            }
          }
        }
      } catch (cancelErr) {
        // Don't block: subscription may already be cancelled or invalid
        if (correlationId) {
          console.warn("[create-subscription] cancel previous subscription failed (non-fatal)", {
            correlationId,
            cancelPreviousSubscriptionId: validatedData.cancelPreviousSubscriptionId,
            error: cancelErr instanceof Error ? cancelErr.message : String(cancelErr),
          });
        }
      }
    }

    // Get membership package
    membershipPackage = getPackageById(validatedData.packageId);
    if (!membershipPackage) {
      return NextResponse.json(
        {
          success: false,
          error: "Membership package not found",
        },
        { status: 404 }
      );
    }

    if (membershipPackage.type !== "subscription") {
      return NextResponse.json(
        {
          success: false,
          error: "Package must be a subscription type",
        },
        { status: 400 }
      );
    }

    const gateResponse = await enforceMajorDrawOpenForNewPurchasesOr403();
    if (gateResponse) return gateResponse;

    // Check if user already exists (from registration)
    // console.log("👤 Checking if user already exists...");
    const registeredUser = await User.findOne({ email: validatedData.userEmail.toLowerCase() });

    const canCreate = checkCanCreateSubscription(registeredUser ?? null);
    if (!canCreate.allowed) {
      return NextResponse.json(
        { success: false, ...canCreate.body },
        { status: canCreate.status }
      );
    }

    // Option A (no paymentMethodId): first payment uses invoice PaymentIntent only; no SetupIntent.
    // When paymentMethodId is provided (legacy path): attach and set default before creating subscription.
    const finalPaymentMethodId = validatedData.paymentMethodId ?? undefined;
    const hasPaymentMethod = Boolean(
      finalPaymentMethodId && finalPaymentMethodId !== "new_payment_method"
    );

    if (finalPaymentMethodId === "new_payment_method") {
      return NextResponse.json(
        {
          success: false,
          error: "Payment method not properly set up. Please complete card details first.",
          ...(correlationId && { correlationId }),
        },
        { status: 400 }
      );
    }

    // ✅ OPTIMIZED: Use utility functions for customer operations (single customer variable – see top of try)
    let canUsePaymentMethod = hasPaymentMethod;

    // Extract anonymousId for A/B testing (before customer operations for parallel execution)
    const anonymousId = AnonymousIdService.extractAnonymousId(request);

    // ✅ OPTIMIZED: Parallelize customer operations and A/B testing lookup
    const [customerResult, experimentAssignmentResult] = await Promise.allSettled([
      // Customer operations
      (async () => {
        // First, check if we have a registered user with an existing Stripe customer
        if (registeredUser && registeredUser.stripeCustomerId) {
          try {
            const existingCustomer = await stripe.customers.retrieve(registeredUser.stripeCustomerId);
            if ("deleted" in existingCustomer && existingCustomer.deleted) {
              throw new Error("Customer has been deleted");
            }
            // Option A: no payment method – use customer as-is for invoice PaymentIntent flow
            if (!hasPaymentMethod) {
              return existingCustomer as Stripe.Customer;
            }
            try {
              await attachPaymentMethodToCustomer(finalPaymentMethodId!, existingCustomer.id);
              return existingCustomer as Stripe.Customer;
            } catch (attachError: unknown) {
              const errorMessage = attachError instanceof Error ? attachError.message : String(attachError);
              if (
                errorMessage.includes("previously used without being attached") ||
                errorMessage.includes("may not be used again") ||
                errorMessage.includes("cannot be reused")
              ) {
                console.warn("⚠️ Payment method from upfront PaymentIntent cannot be reused");
                canUsePaymentMethod = false;
                return existingCustomer as Stripe.Customer;
              }
              throw attachError;
            }
          } catch (error) {
            console.warn(`⚠️ Failed to retrieve existing customer, will create new one:`, error);
          }
        }

        // For guest users or new users, ensure customer exists
        const customerMetadata = {
          packageId: validatedData.packageId,
          packageName: membershipPackage.name,
          userId: registeredUser?._id?.toString() || "guest",
        };

        // ✅ OPTIMIZED: Use utility function to ensure customer exists
        const newOrExistingCustomer = await ensureCustomerExists(validatedData.userEmail, customerMetadata);

        if (hasPaymentMethod && finalPaymentMethodId) {
          try {
            const paymentMethod = await stripe.paymentMethods.retrieve(finalPaymentMethodId);
            if (paymentMethod.customer) {
              const pmCustomerId = typeof paymentMethod.customer === "string" ? paymentMethod.customer : paymentMethod.customer.id;
              if (pmCustomerId === newOrExistingCustomer.id) {
                const customerWithMetadata = newOrExistingCustomer as Stripe.Customer;
                if (customerWithMetadata.metadata?.type === "guest" || customerWithMetadata.metadata?.temporary === "true") {
                  await stripe.customers.update(newOrExistingCustomer.id, {
                    email: validatedData.userEmail,
                    name: `${validatedData.firstName} ${validatedData.lastName}`,
                    phone: validatedData.mobile,
                    metadata: customerMetadata,
                  });
                }
                return newOrExistingCustomer;
              }
            }
          } catch (pmError) {
            console.warn(`⚠️ Failed to check payment method customer:`, pmError);
          }
          try {
            await attachPaymentMethodToCustomer(finalPaymentMethodId, newOrExistingCustomer.id);
          } catch (attachError: unknown) {
            const errorMessage = attachError instanceof Error ? attachError.message : String(attachError);
            if (
              errorMessage.includes("previously used without being attached") ||
              errorMessage.includes("may not be used again") ||
              errorMessage.includes("cannot be reused")
            ) {
              console.warn("⚠️ Payment method from upfront PaymentIntent cannot be reused");
              canUsePaymentMethod = false;
            } else {
              throw attachError;
            }
          }
        }

        // If registered user exists, update them with the customer ID
        if (registeredUser && !registeredUser.stripeCustomerId) {
          registeredUser.stripeCustomerId = newOrExistingCustomer.id;
          await registeredUser.save();
        }

        return newOrExistingCustomer;
      })(),

      // ✅ OPTIMIZED: A/B testing lookup in parallel (non-blocking)
      getExperimentAssignmentForSubscription(registeredUser?._id?.toString() || null, anonymousId || null),
    ]);

    // Extract customer from result
    if (customerResult.status === "fulfilled") {
      customer = customerResult.value as Stripe.Customer;
    } else {
      const errorMessage = customerResult.reason instanceof Error ? customerResult.reason.message : String(customerResult.reason);
      console.error("❌ Failed to get/create customer:", customerResult.reason);
      
      // Check if it's a payment method attachment error that should return error response
      if (errorMessage.includes("Failed to attach payment method")) {
        const errorCode = customerResult.reason && typeof customerResult.reason === "object" && "code" in customerResult.reason ? String(customerResult.reason.code) : undefined;
        return NextResponse.json(
          {
            success: false,
            error: "Payment method setup failed",
            details: errorMessage || "Unable to attach payment method to customer",
            code: errorCode,
            suggestion: "Please try again or use a different payment method.",
          },
          { status: 400 }
        );
      }
      
      throw new Error(`Failed to get/create customer: ${errorMessage}`);
    }

    // Extract experiment assignment from result (optional, non-blocking)
    let experimentAssignment: { experimentId: string; variantId: string } | null = null;
    if (experimentAssignmentResult.status === "fulfilled") {
      experimentAssignment = experimentAssignmentResult.value;
      if (experimentAssignment) {
        console.log(`✅ [A/B Testing] Storing experiment assignment in subscription metadata:`, experimentAssignment);
      }
    }

    // ✅ OPTIMIZED: Ensure payment method is attached and set as default using utility (parallelizes operations)
    // This prevents "No payment method found" errors when confirming subscription payment
    // DO NOT save payment method to user database here - it will only be saved AFTER payment succeeds (via webhook)
    if (canUsePaymentMethod && finalPaymentMethodId && finalPaymentMethodId !== "new_payment_method") {
      try {
        // ✅ OPTIMIZED: Use utility function that parallelizes attach + update
        await updateCustomerPaymentMethod(customer.id, finalPaymentMethodId);
      } catch (pmError) {
        const _errorMessage = pmError instanceof Error ? pmError.message : String(pmError);
        const _errorCode = pmError && typeof pmError === "object" && "code" in pmError ? String(pmError.code) : undefined;
        
        console.error(`❌ Failed to attach/set default payment method ${finalPaymentMethodId}:`, pmError);
        
        return NextResponse.json(
          {
            success: false,
            error: "Payment method setup failed",
            details: "Unable to attach payment method to customer. Please try again or use a different payment method.",
            suggestion: "Please refresh the page and try again, or contact support if the issue persists.",
          },
          { status: 400 }
        );
      }
    } else if (hasPaymentMethod && !canUsePaymentMethod) {
      // Only when client sent a payment method that we couldn't use (e.g. already consumed by a previous PaymentIntent)
      return NextResponse.json(
        {
          success: false,
          error: "Payment method cannot be reused",
          details: "The payment method was already used and cannot be reused. Please enter a new payment method.",
          suggestion: "Please enter your payment details again using the payment form.",
          ...(correlationId && { correlationId }),
        },
        { status: 400 }
      );
    }

    // ✅ STRIPE BEST PRACTICE: Let Stripe create PaymentIntent automatically
    // We don't create upfront PaymentIntent - Stripe will create it when we create the subscription
    // The PaymentIntent will have the correct amount and can be used for wallet payments (Google Pay/Apple Pay)

    // ✅ STRIPE BEST PRACTICE: Use existing Product/Price IDs from membership package
    // This prevents creating duplicate products in Stripe dashboard
    // console.log(`✅ Using existing Stripe Price ID for ${membershipPackage.name}`);

    if (!membershipPackage.stripePriceId) {
      console.error(`❌ No Stripe Price ID configured for package: ${membershipPackage.name}`);
      return NextResponse.json(
        {
          success: false,
          error: `Stripe configuration missing for ${membershipPackage.name}. Please contact support.`,
        },
        { status: 500 }
      );
    }

    const stripePriceId = membershipPackage.stripePriceId;
    // console.log(`💰 Using Stripe Price: ${stripePriceId} ($${membershipPackage.price}/month)`);

    // ✅ OPTIMIZED: Experiment assignment already retrieved in parallel above (non-blocking)
    // The assignment is stored in experimentAssignment variable from Promise.allSettled

    // ✅ OPTIMIZED: Deduplication will be handled after subscription creation (non-blocking)

    // ✅ STRIPE BEST PRACTICE: Use subscriptionRequestId as idempotency key when provided (Option A)
    const idempotencyKey =
      validatedData.subscriptionRequestId ??
      validatedData.idempotencyKey ??
      `sub_${validatedData.packageId}_${customer.id}_${validatedData.userEmail}`;

    // Observability: log before subscription create
    if (correlationId) {
      console.log("[create-subscription] subscription create start", {
        correlationId,
        customerId: customer.id,
        packageId: validatedData.packageId,
      });
    }

    const anchorParams = getSubscriptionCreateParamsForAnchor(new Date());
    const { metadata: anchorMetadata, ...restAnchorParams } = anchorParams;
    const hasAnchor = Object.keys(anchorParams).length > 0;
    const next24Date = hasAnchor ? new Date(getNextAnchorTimestamp(new Date()) * 1000) : null;

    // Traceability: subscriptionRequestId, userId, planId for webhooks and debugging
    const userIdForMetadata = registeredUser?._id?.toString() ?? "new";
    const baseMetadata = {
      packageId: validatedData.packageId,
      packageName: membershipPackage.name,
      userEmail: validatedData.userEmail,
      ...(validatedData.subscriptionRequestId && { subscriptionRequestId: validatedData.subscriptionRequestId }),
      ...(userIdForMetadata && { userId: userIdForMetadata }),
      ...(validatedData.packageId && { planId: validatedData.packageId }),
      ...(validatedData.promoLinkCode && { promoLinkCode: validatedData.promoLinkCode }),
      ...(validatedData.referralCode && { referralCode: validatedData.referralCode }),
      ...(validatedData.campaignCode && { campaignCode: validatedData.campaignCode }),
      ...(experimentAssignment && {
        experimentId: experimentAssignment.experimentId,
        variantId: experimentAssignment.variantId,
      }),
      ...(requestContext.client_ip_address ? { capi_client_ip: requestContext.client_ip_address } : {}),
      ...(requestContext.client_user_agent ? { capi_user_agent: requestContext.client_user_agent } : {}),
      ...(requestContext.fbc ? { capi_fbc: requestContext.fbc } : {}),
      ...(requestContext.fbp ? { capi_fbp: requestContext.fbp } : {}),
      ...(capiEventSourceUrl ? { capi_event_source_url: capiEventSourceUrl } : {}),
      ...buildAttributionMetadata(validatedData.attribution),
      ...(typeof anchorMetadata === "object" && anchorMetadata !== null ? anchorMetadata : {}),
    };

    const createPayload: Stripe.SubscriptionCreateParams = {
      customer: customer.id,
      items: [{ price: stripePriceId }],
      ...(hasPaymentMethod && finalPaymentMethodId
        ? { default_payment_method: finalPaymentMethodId }
        : {}),
      payment_behavior: "default_incomplete",
      expand: ["latest_invoice.confirmation_secret"],
      description: `${membershipPackage.name}`,
      collection_method: "charge_automatically",
      metadata: baseMetadata as Stripe.MetadataParam,
      ...restAnchorParams,
      ...(hasAnchor &&
        membershipPackage &&
        next24Date &&
        membershipPackage.stripeProductId && {
          add_invoice_items: [
            {
              price_data: {
                currency: "aud",
                unit_amount: Math.round(membershipPackage.price * 100),
                product: membershipPackage.stripeProductId,
              },
              quantity: 1,
            },
          ],
        }),
    };

    if (createPayload.collection_method !== undefined && createPayload.collection_method !== "charge_automatically") {
      throw new Error("Anchor billing requires charge_automatically");
    }

    const hasLiveStripeSubscription = await stripeCustomerHasManageableSubscription(customer.id);
    if (hasLiveStripeSubscription) {
      return NextResponse.json(
        {
          success: false,
          error: EXISTING_SUBSCRIPTION_MESSAGE,
          code: EXISTING_SUBSCRIPTION_CODE,
          ...(correlationId && { correlationId }),
        },
        { status: 409 }
      );
    }

    // Hygiene: retire the registered user's stale pending incomplete sub before
    // creating a new one (guest flow only has a user when registeredUser exists).
    const stalePendingId = registeredUser?.subscription?.pendingStripeSubscriptionId;
    if (stalePendingId && stalePendingId !== validatedData.cancelPreviousSubscriptionId) {
      try {
        const reconciled = await cancelIncompleteSubscriptionAndVoidInvoice(stalePendingId);
        if (correlationId) {
          console.log("[create-subscription] retired stale pending incomplete", {
            correlationId,
            ...reconciled,
          });
        }
      } catch (reconcileErr) {
        // console.error (not warn) so this survives production builds (removeConsole).
        console.error(
          "[create-subscription] retire stale pending failed (non-fatal):",
          reconcileErr instanceof Error ? reconcileErr.message : String(reconcileErr)
        );
      }
    }

    let subscription;
    try {
      subscription = await createSubscriptionWithIdempotencyRetry({
        stripe,
        payload: createPayload,
        idempotencyKey,
        customerId: customer.id,
        packageId: validatedData.packageId,
        correlationId,
      });

      if (correlationId) {
        console.log("[create-subscription] subscription created", {
          correlationId,
          subscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
        });
      }
    } catch (stripeError) {
      console.error("❌ Stripe subscription creation failed:", stripeError, correlationId ? { correlationId } : {});
      throw new Error(
        `Failed to create Stripe subscription: ${stripeError instanceof Error ? stripeError.message : "Unknown error"}`
      );
    }

    // Stripe: use subscription.latest_invoice.confirmation_secret (expand: ["latest_invoice.confirmation_secret"])
    const latestInvoice = subscription.latest_invoice;
    const rawConfirmationSecret =
      typeof latestInvoice === "object" && latestInvoice !== null && "confirmation_secret" in latestInvoice
        ? (latestInvoice as Stripe.Invoice & { confirmation_secret?: string | { client_secret?: string; type?: string } | null }).confirmation_secret
        : undefined;

    // Log what we got from the invoice (for debugging)
    console.log("[create-subscription] latest_invoice.confirmation_secret (raw)", {
      subscriptionId: subscription.id,
      hasRaw: rawConfirmationSecret != null,
      rawType: typeof rawConfirmationSecret,
      rawKeys: typeof rawConfirmationSecret === "object" && rawConfirmationSecret !== null ? Object.keys(rawConfirmationSecret) : undefined,
    });

    // Stripe may return confirmation_secret as a string or as { client_secret, type }; always return a string for Elements
    let clientSecret: string | null = null;
    if (typeof rawConfirmationSecret === "string") {
      clientSecret = rawConfirmationSecret;
    } else if (rawConfirmationSecret && typeof rawConfirmationSecret === "object" && "client_secret" in rawConfirmationSecret) {
      const cs = (rawConfirmationSecret as { client_secret?: string }).client_secret;
      clientSecret = typeof cs === "string" ? cs : null;
    }

    if (!clientSecret) {
      console.error("❌ No confirmation_secret (string or client_secret) on subscription latest_invoice", {
        subscriptionId: subscription.id,
        hasLatestInvoice: !!latestInvoice,
        latestInvoiceType: typeof latestInvoice,
      });
      return NextResponse.json(
        {
          success: false,
          error: "Payment setup is still in progress. Please try again in a moment.",
        },
        { status: 503 }
      );
    }

    const subscriptionPeriodEnd = getSubscriptionPeriodEnd(subscription);
    const subscriptionEndDate =
      subscriptionPeriodEnd != null ? new Date(subscriptionPeriodEnd * 1000) : undefined;

    let user;

    if (registeredUser) {
      // User already exists (registered in step 1), update their Stripe customer ID and subscription ID
      // ✅ CRITICAL FIX: Do NOT save payment method to user database here
      // Payment method will only be saved AFTER payment succeeds (handled by webhook)
      // This prevents saving payment methods when payments fail due to insufficient funds
      // console.log(
      //   `🔄 Updating existing user with Stripe customer ID: ${customer.id} and subscription ID: ${subscription.id}`
      // );

      // Update existing user with Stripe customer ID; canonical subscription ID only when manageable (not incomplete)
      const registeredUserSet: Record<string, unknown> = {
        stripeCustomerId: customer.id,
        subscription: {
          packageId: String(membershipPackage._id), // Force string conversion
          startDate: new Date(),
          endDate: subscriptionEndDate, // End of current billing period (next renewal) from Stripe
          isActive: subscription.status === "active" || subscription.status === "trialing", // trialing = paid, access until trial_end
          autoRenew: true,
          status: subscription.status, // Track subscription status
          pendingStripeSubscriptionId: subscription.id,
          pendingStripeSubscriptionRequestId: validatedData.subscriptionRequestId ?? idempotencyKey,
          pendingStripeSubscriptionCreatedAt: new Date(subscription.created * 1000),
        },
      };
      if (shouldWriteCanonicalStripeSubscriptionId(subscription.status)) {
        registeredUserSet.stripeSubscriptionId = subscription.id;
      }

      user = await User.findByIdAndUpdate(
        registeredUser._id,
        {
          $set: registeredUserSet,
          // ✅ REMOVED: $push: { savedPaymentMethods: savedPaymentMethodData }
          // Payment method will be saved by webhook after payment succeeds
        },
        { new: true }
      );

      if (!user) {
        throw new Error("Failed to update existing user");
      }

      // console.log(`✅ Updated existing user: ${user._id}`);
      // console.log(`⏳ Entries/points will be added via webhook upon payment confirmation`);
      // console.log(`📦 Membership will activate: ${membershipPackage.name}`);

      // ✅ Klaviyo integration handled by webhook for reliability and best practices
      // console.log(`📊 Klaviyo events will be tracked via webhook when payment is confirmed`);
    } else {
      // Create new user account but DON'T activate benefits until payment is confirmed
      // Hash password only if provided (for backward compatibility with existing users)
      const hashedPassword = validatedData.password ? await bcrypt.hash(validatedData.password, 12) : undefined;

      // Clean mobile number before saving (remove spaces)
      const cleanedMobile = validatedData.mobile?.replace(/\s+/g, "") || "";
      // console.log(`📱 Mobile number: "${validatedData.mobile}" -> cleaned: "${cleanedMobile}"`);

      // console.log("👤 Creating user account...");

      // ✅ CRITICAL FIX: Do NOT save payment method to user database here
      // Payment method will only be saved AFTER payment succeeds (handled by webhook)
      // This prevents saving payment methods when payments fail due to insufficient funds

      user = new User({
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        email: validatedData.userEmail,
        password: hashedPassword, // Will be undefined for passwordless users
        mobile: cleanedMobile,
        role: "user",
        stripeCustomerId: customer.id,
        stripeSubscriptionId: shouldWriteCanonicalStripeSubscriptionId(subscription.status)
          ? subscription.id
          : undefined,
        subscription: {
          packageId: String(membershipPackage._id), // Force string conversion
          startDate: new Date(),
          endDate: subscriptionEndDate, // End of current billing period (next renewal) from Stripe
          isActive: subscription.status === "active" || subscription.status === "trialing", // trialing = paid, access until trial_end
          autoRenew: true,
          status: subscription.status, // Track subscription status
          pendingStripeSubscriptionId: subscription.id,
          pendingStripeSubscriptionRequestId: validatedData.subscriptionRequestId ?? idempotencyKey,
          pendingStripeSubscriptionCreatedAt: new Date(subscription.created * 1000),
          lastDowngradeDate: undefined, // Initialize lastDowngradeDate field for security
        },
        oneTimePackages: [], // Initialize empty array
        accumulatedEntries: 0, // ⏳ Will be added via webhook only
        entryWallet: 0, // Deprecated
        rewardsPoints: 0, // ⏳ Will be added via webhook only
        isEmailVerified: false, // TODO: Implement email verification
        isActive: true, // User account is active
        savedPaymentMethods: [], // ✅ REMOVED: Do NOT save payment method until payment succeeds
        // Payment method will be saved by webhook after payment succeeds
      });

      // Await user save for new user so response includes persisted user id
      await user.save();
      // console.log(`✅ Created user account: ${user._id}`);
      // console.log(`⏳ Entries/points will be added via webhook upon payment confirmation`);
      // console.log(`📦 Membership will activate: ${membershipPackage.name}`);

      // ✅ Klaviyo integration handled by webhook for reliability and best practices
      // console.log(`📊 Klaviyo events will be tracked via webhook when payment is confirmed`);
    }

    // ✅ Referral processing moved to webhook (after payment succeeds)
    // Referral code is stored in subscription metadata and processed by webhook

    return NextResponse.json({
      success: true,
      data: {
        subscriptionId: subscription.id,
        customerId: customer.id,
        userId: user._id,
        invoicePaymentIntentClientSecret: clientSecret,
        clientSecret, // backward compatibility
        status: subscription.status,
        packageName: membershipPackage.name,
        entriesPerMonth: membershipPackage.entriesPerMonth || 0,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          subscription: user.subscription,
          entryWallet: user.entryWallet,
          accumulatedEntries: user.accumulatedEntries,
          rewardsPoints: user.rewardsPoints,
        },
        autoLogin: true, // Flag to indicate auto-login should be triggered
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("❌ Validation error:", error.issues);
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: error.issues,
          ...(correlationId && { correlationId }),
        },
        { status: 400 }
      );
    }

    // Handle Stripe-specific errors
    if (error && typeof error === "object" && "type" in error) {
      const stripeError = error as StripeError;
      console.error("❌ Stripe error:", error, correlationId ? { correlationId } : {});
      console.error("❌ Stripe error details (VERCEL LOGS):", {
        type: stripeError.type,
        code: stripeError.code,
        message: stripeError.message,
        packageId: typeof requestBody?.packageId === "string" ? requestBody.packageId : undefined,
        userEmail: typeof requestBody?.userEmail === "string" ? requestBody.userEmail : undefined,
        customerId: customer?.id,
        userId: user?._id?.toString(),
        fullError: JSON.stringify(error),
      });
      
      // ✅ CRITICAL FIX: Check for account-level errors that would affect all payments
      const accountLevelErrors = ['account_invalid', 'api_key_expired', 'rate_limit', 'invalid_api_key'];
      if (stripeError.code && accountLevelErrors.includes(stripeError.code)) {
        console.error("❌ CRITICAL: Account-level Stripe error detected - this would affect ALL payments:", stripeError.code);
        return NextResponse.json(
          {
            success: false,
            error: "Payment system error",
            details: "There is a system issue preventing payment processing. Please contact support.",
            code: stripeError.code,
            type: stripeError.type,
            ...(correlationId && { correlationId }),
          },
          { status: 500 }
        );
      }

      // ✅ AUTO-LOG PAYMENT ERRORS: Automatically log Stripe payment failures
      // NOTE: We intentionally do NOT include paymentIntentId here because:
      // 1. The upfront PaymentIntent is cancelled intentionally (expected behavior)
      // 2. The invoice PaymentIntent (actual subscription payment) is handled by confirm-subscription-payment
      // 3. Subscription payment failures are logged via invoice.payment_failed webhook event
      // Use stored request body and context for error logging
      const paymentContext = {
        packageId: typeof requestBody?.packageId === "string" ? requestBody.packageId : undefined,
        packageName: membershipPackage?.name,
        userEmail: typeof requestBody?.userEmail === "string" ? requestBody.userEmail : undefined,
        userId: user?._id?.toString(),
        customerId: customer?.id,
        errorCode: stripeError.code,
        errorMessage: stripeError.message,
        // ✅ CRITICAL: Do NOT include paymentIntentId - cancelled upfront PaymentIntent should not be logged as failure
      };
      
      // Auto-log payment error (fire and forget - don't block response)
      autoLogPaymentErrorServer(error, request, paymentContext).catch((logError) => {
        console.warn("Failed to auto-log payment error:", logError);
      });
      
      // ✅ CRITICAL FIX: Ensure consistent error response format
      return NextResponse.json(
        {
          success: false,
          error: "Payment processing error",
          details: stripeError.message || "Stripe API error",
          code: stripeError.code,
          type: stripeError.type,
          ...(correlationId && { correlationId }),
        },
        { status: 400 }
      );
    }

    console.error("❌ Error creating subscription:", error, correlationId ? { correlationId } : {});
    console.error("❌ Error stack:", error instanceof Error ? error.stack : "No stack trace");
    console.error("❌ Error type:", typeof error);
    console.error("❌ Error message:", error instanceof Error ? error.message : "No message");

    // ✅ AUTO-LOG CRITICAL ERRORS: Automatically log server errors
    // NOTE: We intentionally do NOT include paymentIntentId here because:
    // 1. The upfront PaymentIntent is cancelled intentionally (expected behavior, not a failure)
    // 2. Subscription payment failures are handled separately via confirm-subscription-payment and invoice.payment_failed webhook
    // Use stored request body and context for error logging
    const errorContext = {
      packageId: typeof requestBody?.packageId === "string" ? requestBody.packageId : undefined,
      packageName: membershipPackage?.name,
      userEmail: typeof requestBody?.userEmail === "string" ? requestBody.userEmail : undefined,
      userId: user?._id?.toString(),
      customerId: customer?.id,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      // ✅ CRITICAL: Do NOT include paymentIntentId - cancelled upfront PaymentIntent should not be logged as failure
    };
    
    // Auto-log server error (fire and forget - don't block response)
    autoLogPaymentErrorServer(error, request, errorContext).catch((logError) => {
      console.warn("Failed to auto-log server error:", logError);
    });

    return NextResponse.json(
      {
        success: false,
        error: "Failed to create subscription",
        details: error instanceof Error ? error.message : "Unknown error",
        ...(correlationId && { correlationId }),
      },
      { status: 500 }
    );
  }
}
