import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import { stripe } from "@/lib/stripe";
import Stripe from "stripe";
// Referral processing moved to webhook - no longer needed here
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ErrorLoggingService } from "@/services/error-reporting/ErrorLoggingService";
import { getSubscriptionCreateParamsForAnchor } from "@/utils/billing/anchor-billing";
import { getSubscriptionPeriodEnd } from "@/utils/payment/stripe/subscription-period";
import { checkCanCreateSubscription } from "@/utils/payment/subscription-creation-guard";
import { createRateLimiter, getClientIdentifier } from "@/utils/security/rateLimiter";
import { extractRequestContext } from "@/utils/tracking/facebook-helpers";
// Klaviyo integration handled by webhook for best practices

const createSubscriptionExistingUserRateLimiter = createRateLimiter("create-subscription-existing-user", {
  windowMs: 60 * 1000,
  maxRequests: 20,
});

const createSubscriptionExistingUserSchema = z.object({
  packageId: z.string().min(1, "Package ID is required"),
  paymentMethodId: z.string().optional(), // Optional for Option A: first payment uses invoice PaymentIntent only
  subscriptionRequestId: z.string().uuid().optional(),
  idempotencyKey: z.string().optional(),
  cancelPreviousSubscriptionId: z.string().optional(), // When user switches package: cancel this incomplete subscription before creating new one
  referralCode: z.string().optional(),
  promoLinkCode: z.string().optional(),
});

/**
 * POST /api/stripe/create-subscription-existing-user
 * Create a new Stripe subscription for an existing logged-in user
 */
export async function POST(request: NextRequest) {
  let correlationId: string | undefined;

  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    correlationId =
      (body as { subscriptionRequestId?: string })?.subscriptionRequestId ??
      request.headers.get("x-correlation-id") ??
      undefined;

    // Rate limiting
    const clientIp = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? null;
    const identifier = getClientIdentifier(clientIp, request.headers.get("x-forwarded-for"));
    const rateLimitResult = createSubscriptionExistingUserRateLimiter.check(identifier);
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

    const validatedData = createSubscriptionExistingUserSchema.parse(body);

    // Extract request context for Facebook CAPI (IP, user agent, fbc, fbp)
    const requestContext = extractRequestContext(request);

    // console.log(`🚀 Creating subscription for existing user: ${session.user.id}`);

    // Get the existing user
    const existingUser = await User.findById(session.user.id);
    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const canCreate = checkCanCreateSubscription(existingUser);
    if (!canCreate.allowed) {
      return NextResponse.json(canCreate.body, { status: canCreate.status });
    }

    // Get the membership package
    const membershipPackage = getPackageById(validatedData.packageId);
    if (!membershipPackage || !membershipPackage.isActive) {
      return NextResponse.json({ error: "Invalid or inactive package" }, { status: 400 });
    }

    // Create or retrieve Stripe customer
    let stripeCustomerId = existingUser.stripeCustomerId;
    if (!stripeCustomerId) {
      // console.log("Creating new Stripe customer for existing user");
      const customer = await stripe.customers.create({
        email: existingUser.email,
        name: `${existingUser.firstName} ${existingUser.lastName}`,
        phone: existingUser.mobile || undefined,
      });
      stripeCustomerId = customer.id;

      // Update user with Stripe customer ID
      existingUser.stripeCustomerId = stripeCustomerId;
      await existingUser.save();
    }

    // Cancel previous incomplete subscription when user switched package (plan switch mid-checkout)
    if (validatedData.cancelPreviousSubscriptionId) {
      try {
        const prevSub = await stripe.subscriptions.retrieve(validatedData.cancelPreviousSubscriptionId);
        const status = prevSub.status;
        if (status === "incomplete" || status === "incomplete_expired") {
          const subCustomerId = typeof prevSub.customer === "string" ? prevSub.customer : prevSub.customer?.id;
          if (subCustomerId === stripeCustomerId) {
            await stripe.subscriptions.cancel(validatedData.cancelPreviousSubscriptionId);
            if (correlationId) {
              console.log("[create-subscription-existing-user] cancelled previous incomplete subscription (plan switch)", {
                correlationId,
                cancelledSubscriptionId: validatedData.cancelPreviousSubscriptionId,
              });
            }
          }
        }
      } catch (cancelErr) {
        if (correlationId) {
          console.warn("[create-subscription-existing-user] cancel previous subscription failed (non-fatal)", {
            correlationId,
            cancelPreviousSubscriptionId: validatedData.cancelPreviousSubscriptionId,
            error: cancelErr instanceof Error ? cancelErr.message : String(cancelErr),
          });
        }
      }
    }

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

    if (hasPaymentMethod && finalPaymentMethodId) {
      try {
        const paymentMethod = await stripe.paymentMethods.retrieve(finalPaymentMethodId);
        const pmCustomerId = typeof paymentMethod.customer === "string" ? paymentMethod.customer : paymentMethod.customer?.id;
        if (!pmCustomerId || pmCustomerId !== stripeCustomerId) {
          await stripe.paymentMethods.attach(finalPaymentMethodId, { customer: stripeCustomerId });
        }
        await stripe.customers.update(stripeCustomerId, {
          invoice_settings: { default_payment_method: finalPaymentMethodId },
        });
      } catch (pmError) {
        console.error(`❌ Failed to attach/set default payment method ${finalPaymentMethodId}:`, pmError);
        return NextResponse.json(
          {
            success: false,
            error: "Payment method setup failed",
            details: "Unable to attach payment method to customer. Please try again or use a different payment method.",
            ...(correlationId && { correlationId }),
          },
          { status: 400 }
        );
      }
    }

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

    // Idempotency: use subscriptionRequestId when provided (Option A)
    const idempotencyKey =
      validatedData.subscriptionRequestId ??
      validatedData.idempotencyKey ??
      `sub_${validatedData.packageId}_${stripeCustomerId}_${existingUser.email}`;

    const anchorParams = getSubscriptionCreateParamsForAnchor(new Date());
    const { metadata: anchorMetadata, ...restAnchorParams } = anchorParams;

    const userIdForMetadata = existingUser._id?.toString() ?? "";
    const baseMetadata = {
      packageId: validatedData.packageId,
      packageName: membershipPackage.name,
      userEmail: existingUser.email,
      ...(validatedData.subscriptionRequestId && { subscriptionRequestId: validatedData.subscriptionRequestId }),
      ...(userIdForMetadata && { userId: userIdForMetadata }),
      ...(validatedData.packageId && { planId: validatedData.packageId }),
      ...(validatedData.promoLinkCode && { promoLinkCode: validatedData.promoLinkCode }),
      ...(validatedData.referralCode && { referralCode: validatedData.referralCode }),
                                                                ...(requestContext.client_ip_address ? { capi_client_ip: requestContext.client_ip_address } : {}),
      ...(requestContext.client_user_agent ? { capi_user_agent: requestContext.client_user_agent } : {}),
      ...(requestContext.fbc ? { capi_fbc: requestContext.fbc } : {}),
      ...(requestContext.fbp ? { capi_fbp: requestContext.fbp } : {}),
      ...(typeof anchorMetadata === "object" && anchorMetadata !== null ? anchorMetadata : {}),
    };

    const createPayload: Stripe.SubscriptionCreateParams = {
      customer: stripeCustomerId,
      items: [{ price: stripePriceId }],
      ...(hasPaymentMethod && finalPaymentMethodId ? { default_payment_method: finalPaymentMethodId } : {}),
      payment_behavior: "default_incomplete",
      expand: ["latest_invoice.confirmation_secret"],
      description: `${membershipPackage.name}`,
      collection_method: "charge_automatically",
      metadata: baseMetadata as Stripe.MetadataParam,
      ...restAnchorParams,
    };

    if (createPayload.collection_method !== undefined && createPayload.collection_method !== "charge_automatically") {
      throw new Error("Anchor billing requires charge_automatically");
    }

    if (correlationId) {
      console.log("[create-subscription-existing-user] subscription create start", {
        correlationId,
        customerId: stripeCustomerId,
        packageId: validatedData.packageId,
      });
    }

    const subscription = await stripe.subscriptions.create(
      createPayload,
      { idempotencyKey }
    );

    if (correlationId) {
      console.log("[create-subscription-existing-user] subscription created", {
        correlationId,
        subscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
      });
    }

    // Update user subscription info immediately but NO initial benefit allocation
    // console.log(
    //   `📝 Saving subscription to user database: packageId=${membershipPackage._id}, subscriptionId=${subscription.id}`
    // );

    const subscriptionPeriodEnd = getSubscriptionPeriodEnd(subscription);
    const subscriptionEndDate =
      subscriptionPeriodEnd != null ? new Date(subscriptionPeriodEnd * 1000) : undefined;

    // ✅ CRITICAL: Preserve lastMonthAccumulatedEntries when resubscribing
    // Check if this is a resubscription (user had subscription before but it's not active)
    const isResubscribe =
      existingUser.subscription &&
      !existingUser.subscription.isActive &&
      existingUser.subscription.lastMonthAccumulatedEntries !== undefined;

    // Preserve lastMonthAccumulatedEntries if this is a resubscription
    const preservedLastMonthAccumulatedEntries = isResubscribe
      ? existingUser.subscription!.lastMonthAccumulatedEntries
      : undefined;

    // Omit pendingChange/previousSubscription – Mongoose rejects undefined for these subdocument paths
    existingUser.subscription = {
      packageId: membershipPackage._id,
      isActive: subscription.status === "active", // ✅ Set based on Stripe subscription status
      startDate: new Date(),
      endDate: subscriptionEndDate, // End of current billing period (next renewal) from Stripe
      autoRenew: true,
      status: subscription.status, // Track subscription status
      lastMonthAccumulatedEntries: preservedLastMonthAccumulatedEntries,
    };

    // Log resubscription detection
    if (isResubscribe) {
      console.log(
        `✅ [RESUBSCRIBE] Preserved lastMonthAccumulatedEntries: ${preservedLastMonthAccumulatedEntries} for user ${existingUser.email}`
      );
    }

    existingUser.stripeSubscriptionId = subscription.id;

    // ✅ OPTIMIZED: Make user save fire-and-forget (webhook handles final updates)
    // Subscription status updates are handled by webhook after payment succeeds
    existingUser.save().catch((error) => {
      console.warn("Non-critical user save failed (webhook will handle):", error);
    });
    // console.log(`✅ User subscription saved to database: packageId=${existingUser.subscription.packageId}`);

    const latestInvoice = subscription.latest_invoice;
    const latestInvoiceId =
      typeof latestInvoice === "string" ? latestInvoice : (latestInvoice as Stripe.Invoice | null)?.id ?? null;

    // When user pays with a saved payment method: pay the first invoice on the server so subscription becomes active
    if (hasPaymentMethod && finalPaymentMethodId && latestInvoiceId) {
      try {
        const paidInvoice = await stripe.invoices.pay(latestInvoiceId, {
          payment_method: finalPaymentMethodId,
        });

        if (correlationId) {
          console.log("[create-subscription-existing-user] invoice paid with saved PM", {
            correlationId,
            subscriptionId: subscription.id,
            invoiceId: paidInvoice.id,
          });
        }

        // Re-retrieve subscription to get updated status (active)
        const subscriptionUpdated = await stripe.subscriptions.retrieve(subscription.id);
        const periodEnd = getSubscriptionPeriodEnd(subscriptionUpdated);
        const endDate = periodEnd != null ? new Date(periodEnd * 1000) : undefined;

        const isActive = subscriptionUpdated.status === "active";
        const newStatus = subscriptionUpdated.status;

        // Update only the fields we need via $set – never touch previousSubscription/pendingChange so Mongoose never sees undefined
        const updatePayload: Record<string, unknown> = {
          "subscription.isActive": isActive,
          "subscription.status": newStatus,
        };
        if (endDate !== undefined) {
          updatePayload["subscription.endDate"] = endDate;
        }
        await User.updateOne({ _id: existingUser._id }, { $set: updatePayload }).catch((err) => {
          console.warn("Non-critical user update after invoice pay failed (webhook will handle):", err);
        });

        // Keep in-memory document in sync for the response (no full replace – only set updated fields)
        existingUser.subscription!.isActive = isActive;
        existingUser.subscription!.status = newStatus;
        if (endDate !== undefined) {
          existingUser.subscription!.endDate = endDate;
        }

        return NextResponse.json({
          success: true,
          subscription: {
            id: subscription.id,
            status: subscriptionUpdated.status,
            clientSecret: undefined,
            invoicePaymentIntentClientSecret: undefined,
          },
          data: {
            subscriptionId: subscription.id,
            customerId: stripeCustomerId,
            invoicePaymentIntentClientSecret: undefined,
            clientSecret: undefined,
          },
          user: {
            id: existingUser._id,
            email: existingUser.email,
            subscription: existingUser.subscription,
            oneTimePackages: existingUser.oneTimePackages,
            entryWallet: existingUser.entryWallet,
            accumulatedEntries: existingUser.accumulatedEntries,
            rewardsPoints: existingUser.rewardsPoints,
          },
        });
      } catch (payError) {
        const errorMessage = payError instanceof Error ? payError.message : String(payError);
        const stripeError = payError as { code?: string; type?: string; decline_code?: string };
        const errorCode = stripeError?.code;
        const declineCode = stripeError?.decline_code;
        const errorType = stripeError?.type;

        if (correlationId) {
          console.warn("[create-subscription-existing-user] invoice pay failed", {
            correlationId,
            subscriptionId: subscription.id,
            errorCode,
            errorMessage,
          });
        }

        // 3DS required: return client_secret for frontend confirmPayment
        if (errorCode === "invoice_payment_intent_requires_action") {
          try {
            const invoiceWithPaymentIntent = await stripe.invoices.retrieve(latestInvoiceId, {
              expand: ["payment_intent"],
            });
            const paymentIntent = (invoiceWithPaymentIntent as Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent })
              .payment_intent;

            if (paymentIntent && typeof paymentIntent === "object" && paymentIntent.client_secret) {
              return NextResponse.json({
                success: false,
                requiresPaymentConfirmation: true,
                message: "3D Secure authentication required. Please complete the authentication.",
                data: {
                  paymentIntent: {
                    id: paymentIntent.id,
                    clientSecret: paymentIntent.client_secret,
                    amount: paymentIntent.amount,
                    currency: paymentIntent.currency,
                    status: paymentIntent.status,
                  },
                  subscription: {
                    id: subscription.id,
                    status: subscription.status,
                  },
                  invoiceId: latestInvoiceId,
                },
              });
            }
          } catch (retrieveErr) {
            console.error("Failed to retrieve PaymentIntent for 3DS handling:", retrieveErr);
          }
        }

        return NextResponse.json(
          {
            success: false,
            error: "Payment failed",
            details: errorMessage || "Unable to process payment",
            ...(errorCode && { code: errorCode }),
            ...(declineCode && { decline_code: declineCode }),
            ...(errorType && { type: errorType }),
            ...(correlationId && { correlationId }),
          },
          { status: 400 }
        );
      }
    }

    // No saved payment method: return invoice confirmation_secret for Payment Element (e.g. "Pay with other card")
    const rawConfirmationSecret =
      typeof latestInvoice === "object" && latestInvoice !== null && "confirmation_secret" in latestInvoice
        ? (latestInvoice as Stripe.Invoice & { confirmation_secret?: string | { client_secret?: string; type?: string } | null }).confirmation_secret
        : undefined;

    console.log("[create-subscription-existing-user] latest_invoice.confirmation_secret (raw)", {
      subscriptionId: subscription.id,
      hasRaw: rawConfirmationSecret != null,
      rawType: typeof rawConfirmationSecret,
      rawKeys: typeof rawConfirmationSecret === "object" && rawConfirmationSecret !== null ? Object.keys(rawConfirmationSecret) : undefined,
    });

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
      });
      return NextResponse.json(
        {
          success: false,
          error: "Payment setup is still in progress. Please try again in a moment.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        clientSecret: clientSecret || undefined,
        invoicePaymentIntentClientSecret: clientSecret || undefined,
      },
      data: {
        subscriptionId: subscription.id,
        customerId: stripeCustomerId,
        invoicePaymentIntentClientSecret: clientSecret || undefined,
        clientSecret: clientSecret || undefined,
      },
      user: {
        id: existingUser._id,
        email: existingUser.email,
        subscription: existingUser.subscription,
        oneTimePackages: existingUser.oneTimePackages,
        entryWallet: existingUser.entryWallet,
        accumulatedEntries: existingUser.accumulatedEntries,
        rewardsPoints: existingUser.rewardsPoints,
      },
    });
  } catch (error) {
    console.error("❌ Subscription creation failed:", error);

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
            component: "create-subscription-existing-user",
            flow: "subscription-creation",
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
          component: "create-subscription-existing-user",
          flow: "subscription-creation",
        }, {
          isServerSide: true,
          request,
          skipRateLimit: true,
        }).catch(() => {
          // Silently fail
        });
      });

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues, ...(correlationId && { correlationId }) },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json(
        { error: "Failed to create subscription", details: error.message, ...(correlationId && { correlationId }) },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create subscription", ...(correlationId && { correlationId }) },
      { status: 500 }
    );
  }
}
