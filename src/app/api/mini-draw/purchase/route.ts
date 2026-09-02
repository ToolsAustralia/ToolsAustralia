import { NextRequest, NextResponse } from "next/server";
import { isEmployeeAccount } from "@/utils/giveaway-eligibility";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import MiniDraw from "@/models/MiniDraw";
import { getMiniDrawPackageById } from "@/data/miniDrawPackages";
import { stripe } from "@/lib/stripe";
import { extractRequestContext } from "@/utils/tracking/facebook-helpers";
import { extractTikTokContext } from "@/utils/tracking/tiktok-helpers";
import { safeEventSourceUrl } from "@/utils/tracking/event-source-url";
// Benefits are now granted via webhook processing only
import { createPaymentIntentConfig } from "@/utils/payment/stripe/payment-intent-config";
import { buildAttributionMetadata } from "@/utils/tracking/attribution-metadata";
import { attributionSchema } from "@/utils/tracking/attribution-schema";
import { resolveAttributionAtEdge } from "@/services/attribution/resolveAtEdge";
import { ErrorLoggingService } from "@/services/error-reporting/ErrorLoggingService";
import { isExpectedPaymentDeclineError } from "@/utils/error-reporting/error-severity-classifier";

const miniDrawPurchaseSchema = z.object({
  packageId: z.string().min(1, "Package ID is required"),
  miniDrawId: z.string().min(1, "Mini Draw ID is required"),
  useDefaultPayment: z.boolean().default(false),
  paymentMethodId: z.string().optional(),
  attribution: attributionSchema,
});

/**
 * ✅ WEBHOOK-ONLY ENTRY GRANTING
 *
 * This API route ONLY creates payment intents and returns payment status.
 * NO entries are granted here - all entry granting happens via webhook.
 *
 * Flow:
 * 1. This API creates payment intent with metadata (including miniDrawId)
 * 2. Stripe sends payment_intent.succeeded webhook when payment succeeds
 * 3. Webhook handler (src/app/api/stripe/webhook/route.ts) calls handleMiniDrawWebhook
 * 4. handleMiniDrawWebhook calls processPaymentBenefits → grantBenefits → addToMiniDraw
 * 5. addToMiniDraw is the ONLY function that grants entries to MiniDraw model
 *
 * This ensures:
 * - Single source of truth (webhook)
 * - Idempotency (PaymentEvent prevents duplicates)
 * - Reliability (webhook retries on failure)
 * - No race conditions (atomic database operations)
 */

/**
 * POST /api/mini-draw/purchase
 * Handle mini draw package purchases
 */
export async function POST(request: NextRequest) {
  try {
    // console.log("🎯 Mini draw purchase request received");

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

    // Parse and validate request body
    const body = await request.json();
    const validatedData = miniDrawPurchaseSchema.parse(body);

    // console.log("✅ Request validation successful:", validatedData);

    // Get user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication required",
        },
        { status: 401 }
      );
    }

    // Connect to database
    await connectDB();

    // Get user
    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "User not found",
        },
        { status: 404 }
      );
    }

    // ✅ AUTHENTICATION-ONLY for CUSTOMERS: no membership required, any logged-in customer may buy.
    //
    // Internal accounts are the one exception. Terms §5.5 (Employee Exclusion) makes Tools
    // Australia employees ineligible to WIN, so letting a staff session be charged for entries
    // takes money for something that can never pay out.
    //
    // This gate is the one that actually holds. Staff used to be kept off `/mini-draws` entirely
    // by the middleware block-list, which prevented the purchase as a side effect; that block was
    // lifted on 2026-08-20 so staff could open the public draw page the admin UI links to, and
    // the side effect went with it. Hiding the buy widget in the UI is cosmetic — the endpoint is
    // reachable directly.
    // Read from the User doc just loaded above, NOT `session.user.userType`: the session is a
    // JWT that still says "customer" until it refreshes, so a freshly-promoted staff account
    // would slip through a claim-based check.
    if (isEmployeeAccount(user.userType)) {
      return NextResponse.json(
        {
          success: false,
          error: "Tools Australia staff accounts are not eligible to enter draws (Terms §5.5).",
        },
        { status: 403 }
      );
    }

    // Create or retrieve Stripe customer ID
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      // console.log("👤 Creating new Stripe customer for mini draw purchase");
      try {
        const customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          phone: user.mobile || undefined,
          metadata: {
            userId: user._id.toString(),
            source: "mini-draw-purchase",
          },
        });
        stripeCustomerId = customer.id;

        // Update user with Stripe customer ID
        user.stripeCustomerId = stripeCustomerId;
        // ✅ OPTIMIZED: Make user save fire-and-forget (webhook handles final updates)
        user.save().catch((error) => {
          console.warn("Non-critical user save failed (webhook will handle):", error);
        });
        // console.log(`✅ Created and saved Stripe customer: ${stripeCustomerId}`);
      } catch (stripeError) {
        console.error("❌ Stripe customer creation failed:", stripeError);
        return NextResponse.json(
          {
            success: false,
            error: "Failed to create Stripe customer",
            details: stripeError instanceof Error ? stripeError.message : "Unknown error",
          },
          { status: 500 }
        );
      }
    } else {
      // console.log(`👤 Using existing Stripe customer: ${stripeCustomerId}`);
    }

    // Validate MiniDraw exists and is accepting entries
    const miniDraw = await MiniDraw.findById(validatedData.miniDrawId);
    if (!miniDraw) {
      return NextResponse.json(
        {
          success: false,
          error: "Mini draw not found",
        },
        { status: 404 }
      );
    }

    // Validate MiniDraw is in a valid state to accept entries
    if (miniDraw.status === "completed" || miniDraw.status === "cancelled") {
      return NextResponse.json(
        {
          success: false,
          error: `Mini draw "${miniDraw.name}" is ${miniDraw.status} and cannot accept new entries`,
        },
        { status: 400 }
      );
    }

    // Validate draw is active or queued
    if (miniDraw.status !== "active") {
      return NextResponse.json(
        {
          success: false,
          error: `Mini draw "${miniDraw.name}" is in ${miniDraw.status} status and cannot accept entries`,
        },
        { status: 400 }
      );
    }

    // Check if minimum entries has been reached
    if (miniDraw.totalEntries >= miniDraw.minimumEntries) {
      return NextResponse.json(
        {
          success: false,
          error: `Mini draw "${miniDraw.name}" has reached its minimum entries limit (${miniDraw.minimumEntries}) and is now closed`,
        },
        { status: 400 }
      );
    }

    // Get mini draw package
    const miniDrawPackage = getMiniDrawPackageById(validatedData.packageId);
    if (!miniDrawPackage) {
      return NextResponse.json(
        {
          success: false,
          error: "Mini draw package not found",
        },
        { status: 404 }
      );
    }

    const remainingEntries = Math.max(miniDraw.minimumEntries - miniDraw.totalEntries, 0);
    if (miniDrawPackage.entries > remainingEntries) {
      return NextResponse.json(
        {
          success: false,
          error: `Mini draw "${miniDraw.name}" only has ${remainingEntries} entries remaining`,
        },
        { status: 400 }
      );
    }

    // console.log("📦 Processing mini draw package:", miniDrawPackage.name);
    // console.log("🎲 For MiniDraw:", miniDraw.name, `(${validatedData.miniDrawId})`);
    // console.log("🔍 User details:", {
    //   userId: user._id,
    //   stripeCustomerId: user.stripeCustomerId,
    //   hasStripeCustomerId: !!user.stripeCustomerId,
    // });
    // console.log("🔍 Payment details:", {
    //   useDefaultPayment: validatedData.useDefaultPayment,
    //   paymentMethodId: validatedData.paymentMethodId,
    // });

    const { metadata: resolvedAttr } = resolveAttributionAtEdge(request);

    // Handle payment method and create payment intent
    if (validatedData.useDefaultPayment && validatedData.paymentMethodId) {
      if (!user.stripeCustomerId) {
        throw new Error("No Stripe customer ID found for user");
      }
      // console.log("🚀 Calling handleOneClickPurchase");
      return await handleOneClickPurchase(
        user as unknown as Parameters<typeof handleOneClickPurchase>[0],
        miniDrawPackage,
        validatedData.miniDrawId,
        validatedData.paymentMethodId,
        requestContext,
        capiEventSourceUrl,
        validatedData.attribution,
        resolvedAttr
      );
    } else {
      if (!user.stripeCustomerId) {
        throw new Error("No Stripe customer ID found for user");
      }
      // console.log("🚀 Calling handlePaymentIntentCreation");
      return await handlePaymentIntentCreation(
        user,
        miniDrawPackage,
        validatedData.miniDrawId,
        validatedData.paymentMethodId,
        requestContext,
        request, // ✅ Pass request for error logging
        capiEventSourceUrl,
        validatedData.attribution,
        resolvedAttr
      );
    }
  } catch (error) {
    console.error("❌ Mini draw purchase failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Mini draw purchase failed",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle one-click purchase using default payment method
 */
async function handleOneClickPurchase(
  user: {
    _id: string;
    stripeCustomerId?: string;
    entryWallet?: number;
    accumulatedEntries?: number;
    oneTimePackages?: Array<{
      packageId: string;
      packageName: string;
      packageType: string;
      price: number;
      entries: number;
      partnerDiscountHours: number;
      partnerDiscountDays: number;
      purchaseDate: Date;
      isActive: boolean;
      stripePaymentIntentId: string;
    }>;
    totalSpent?: number;
    save: () => Promise<void>;
  },
  miniDrawPackage: {
    _id: string;
    name: string;
    price: number;
    entries: number;
    partnerDiscountHours: number;
    partnerDiscountDays: number;
  },
  miniDrawId: string,
  paymentMethodId: string,
  requestContext:
    | { client_ip_address?: string; client_user_agent?: string; fbc?: string; fbp?: string; ttclid?: string; ttp?: string }
    | undefined,
  capiEventSourceUrl?: string,
  attribution?: Parameters<typeof buildAttributionMetadata>[0],
  resolvedAttrMetadata?: Record<string, string>
) {
  try {
    // console.log("🎯 handleOneClickPurchase called with:", {
    //   userId: user._id,
    //   packageName: miniDrawPackage.name,
    //   packagePrice: miniDrawPackage.price,
    //   paymentMethodId,
    // });

    if (!paymentMethodId) {
      // console.log("❌ No payment method ID provided");
      return NextResponse.json(
        {
          success: false,
          error: "Payment method ID is required",
        },
        { status: 400 }
      );
    }

    // Handle payment method creation/attachment (same pattern as upsell API)
    let finalPaymentMethodId = paymentMethodId;

    // For development OR reuse prevention - create new payment method
    if (paymentMethodId === "pm_card_visa" || !paymentMethodId.startsWith("pm_")) {
      // console.log(`🔄 Creating fresh payment method for mini draw (reuse pattern)`);

      try {
        // Create a new test/card payment method for this customer
        const newPaymentMethod = await stripe.paymentMethods.create({
          type: "card",
          card: {
            token: "tok_visa", // Use Stripe's test token (works in test mode)
          },
        });

        // Attach to customer immediately
        await stripe.paymentMethods.attach(newPaymentMethod.id, {
          customer: user.stripeCustomerId!,
        });

        // Verify attachment
        const verifiedPaymentMethod = await stripe.paymentMethods.retrieve(newPaymentMethod.id);
        if (verifiedPaymentMethod.customer !== user.stripeCustomerId) {
          throw new Error("Payment method attachment verification failed");
        }

        finalPaymentMethodId = newPaymentMethod.id;
        // console.log(`✅ Created and attached NEW payment method: ${finalPaymentMethodId}`);
      } catch (error) {
        console.error(`❌ Failed to create payment method:`, error);
        return NextResponse.json(
          {
            success: false,
            error: "Payment method creation failed",
            details: error instanceof Error ? error.message : "Unknown error",
          },
          { status: 500 }
        );
      }
    } else {
      // For existing payment methods, try reuse but with better checks
      try {
        const existingPaymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

        // If not attached to our customer, attach it
        if (!existingPaymentMethod.customer) {
          await stripe.paymentMethods.attach(paymentMethodId, {
            customer: user.stripeCustomerId!,
          });
          // console.log(`✅ Reusing payment method attached to customer: ${paymentMethodId}`);
        } else if (existingPaymentMethod.customer === user.stripeCustomerId) {
          // console.log(`✅ Payment method already attached to our customer: ${paymentMethodId}`);
        } else {
          // Payment method belongs to someone else - create new one instead of failing
          // console.log(`🔄 Payment method belongs to another customer. Creating new one...`);

          const newPaymentMethod = await stripe.paymentMethods.create({
            type: "card",
            card: { token: "tok_visa" },
          });

          await stripe.paymentMethods.attach(newPaymentMethod.id, {
            customer: user.stripeCustomerId!,
          });

          finalPaymentMethodId = newPaymentMethod.id;
          // console.log(`✅ Created replacement payment method: ${finalPaymentMethodId}`);
        }
      } catch (stripeError: unknown) {
        console.error(`❌ Cannot reuse payment method, creating new one:`, stripeError);

        // Fallback: Create fresh payment method
        try {
          const fallbackPaymentMethod = await stripe.paymentMethods.create({
            type: "card",
            card: { token: "tok_visa" },
          });

          await stripe.paymentMethods.attach(fallbackPaymentMethod.id, {
            customer: user.stripeCustomerId!,
          });

          finalPaymentMethodId = fallbackPaymentMethod.id;
          // console.log(`✅ Created fallback payment method: ${finalPaymentMethodId}`);
        } catch (fallbackError) {
          console.error(`❌ Fallback payment method creation failed:`, fallbackError);
          return NextResponse.json(
            {
              success: false,
              error: "Payment method setup failed",
              details: fallbackError instanceof Error ? fallbackError.message : "Unknown error",
            },
            { status: 500 }
          );
        }
      }
    }

    // Create payment intent with automatic confirmation
    let paymentIntent;
    try {
      // console.log("💳 Creating payment intent with:", {
      //   amount: Math.round(miniDrawPackage.price * 100),
      //   currency: "aud",
      //   customer: user.stripeCustomerId,
      //   payment_method: finalPaymentMethodId,
      // });

      // ✅ Use centralized PaymentIntent configuration with 3DS support
      const paymentIntentConfig = createPaymentIntentConfig({
        amount: Math.round(miniDrawPackage.price * 100), // Convert to cents
        currency: "aud",
        customer: user.stripeCustomerId!,
        paymentMethod: finalPaymentMethodId,
        confirm: true,
        paymentType: "mini-draw",
        description: miniDrawPackage.name,
        metadata: {
          type: "mini-draw",
          packageId: miniDrawPackage._id,
          miniDrawId: miniDrawId, // Link to specific MiniDraw
          userId: user._id.toString(),
          entriesCount: miniDrawPackage.entries.toString(),
          packageName: miniDrawPackage.name,
          price: Math.round(miniDrawPackage.price * 100).toString(), // Price in cents
          // Store request context for Facebook CAPI (webhook will extract and use)
          ...(requestContext?.client_ip_address ? { capi_client_ip: requestContext.client_ip_address } : {}),
          ...(requestContext?.client_user_agent ? { capi_user_agent: requestContext.client_user_agent } : {}),
          ...(requestContext?.fbc ? { capi_fbc: requestContext.fbc } : {}),
          ...(requestContext?.fbp ? { capi_fbp: requestContext.fbp } : {}),
          ...(requestContext?.ttclid ? { capi_ttclid: requestContext.ttclid } : {}),
          ...(requestContext?.ttp ? { capi_ttp: requestContext.ttp } : {}),
          ...(capiEventSourceUrl ? { capi_event_source_url: capiEventSourceUrl } : {}),
          ...buildAttributionMetadata(attribution),
          ...(resolvedAttrMetadata ?? {}),
        },
      });

      paymentIntent = await stripe.paymentIntents.create(paymentIntentConfig);

      // console.log("✅ Payment intent created successfully:", {
      //   id: paymentIntent.id,
      //   status: paymentIntent.status,
      // });
    } catch (stripeError) {
      // An issuer decline is an expected outcome, not a fault — `warn` (stripped in
      // production) keeps it out of the error stream. Anything else still logs as an error.
      if (isExpectedPaymentDeclineError(stripeError)) {
        console.warn("Stripe payment intent declined (mini-draw):", stripeError);
      } else {
        console.error("❌ Stripe payment intent creation failed:", stripeError);
      }
      return NextResponse.json(
        {
          success: false,
          error: "Payment processing failed",
          details: stripeError instanceof Error ? stripeError.message : "Unknown payment error",
        },
        { status: 400 }
      );
    }

    // ✅ OPTIMIZED: Trust Stripe's status - webhook handles verification
    // Payment status is accurate when returned - no delay or re-retrieve needed
    if (paymentIntent.status === "succeeded") {
      // ✅ CRITICAL: Don't call handleMiniDrawPaymentSuccess - webhook handles all benefit processing
      // This ensures single source of truth and prevents duplicate processing

      // Return success with payment intent info - frontend will wait for webhook confirmation
      return NextResponse.json({
        success: true,
        message: "Mini draw purchase successful",
        data: {
          entriesAdded: miniDrawPackage.entries,
          packageName: miniDrawPackage.name,
          source: "mini-draw",
          paymentIntentId: paymentIntent.id,
          processingStatus: "pending", // Benefits will be processed via webhook
        },
        paymentIntent: {
          id: paymentIntent.id,
          status: paymentIntent.status,
          clientSecret: paymentIntent.client_secret,
        },
      });
    } else if (paymentIntent.status === "requires_action") {
      // ✅ 3DS authentication required - return client_secret for frontend to complete redirect
      // With allow_redirects: "always", the frontend will handle the 3DS redirect flow
      console.log(`⏳ Payment requires 3DS authentication - returning client_secret for frontend redirect`);
      
      return NextResponse.json({
        success: false,
        requiresAction: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        message: "3D Secure authentication required. Please complete the authentication.",
        data: {
          packageId: miniDrawPackage._id,
          amount: miniDrawPackage.price,
          entriesCount: miniDrawPackage.entries,
          paymentIntentId: paymentIntent.id,
          processingStatus: "pending",
        },
      });
    } else if (paymentIntent.status === "processing") {
      // Payment is processing (async payment methods like bank transfers)
      // Trust Stripe's status - webhook will handle when payment completes
      return NextResponse.json({
        success: true,
        message: "Mini draw purchase processing",
        data: {
          entriesAdded: miniDrawPackage.entries,
          packageName: miniDrawPackage.name,
          source: "mini-draw",
          paymentIntentId: paymentIntent.id,
          processingStatus: "processing", // Payment is still processing - webhook will handle when complete
        },
        paymentIntent: {
          id: paymentIntent.id,
          status: paymentIntent.status,
          clientSecret: paymentIntent.client_secret,
        },
      });
    } else if (paymentIntent.status === "requires_payment_method") {
      // Payment method was invalid or not properly attached
      // console.error(`❌ Payment requires payment method - payment method may not be valid or attached`);
      return NextResponse.json(
        {
          success: false,
          error: "Payment method invalid",
          details: "The payment method could not be used. Please try again or use a different payment method.",
        },
        { status: 400 }
      );
    } else {
      // Any other status is a failure
      console.error(`❌ Payment intent status: ${paymentIntent.status} for mini draw package: ${miniDrawPackage._id}`);
      return NextResponse.json(
        {
          success: false,
          error: "Payment failed",
          details: `Payment status: ${paymentIntent.status}. Please try again or contact support.`,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("❌ One-click purchase error:", error);
    // console.error("❌ Error details:", {
    //   message: error instanceof Error ? error.message : "Unknown error",
    //   stack: error instanceof Error ? error.stack : undefined,
    // });
    return NextResponse.json(
      {
        success: false,
        error: "One-click purchase failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle payment intent creation for manual confirmation
 */
async function handlePaymentIntentCreation(
  user: { _id: string; stripeCustomerId?: string },
  miniDrawPackage: { _id: string; name: string; price: number; entries: number },
  miniDrawId: string,
  paymentMethodId: string | undefined,
  requestContext:
    | { client_ip_address?: string; client_user_agent?: string; fbc?: string; fbp?: string; ttclid?: string; ttp?: string }
    | undefined,
  request?: NextRequest, // ✅ Pass request for error logging
  capiEventSourceUrl?: string,
  attribution?: Parameters<typeof buildAttributionMetadata>[0],
  resolvedAttrMetadata?: Record<string, string>
) {
  try {
    const shouldConfirm = !!paymentMethodId;

    const eventSourceUrl = safeEventSourceUrl(
      capiEventSourceUrl ??
      (request
        ? request.headers.get("referer") ??
          (process.env.NEXTAUTH_URL ? `${process.env.NEXTAUTH_URL}/shop` : undefined)
        : undefined)
    );

    // ✅ Use centralized PaymentIntent configuration with 3DS support
    const paymentIntentConfig = createPaymentIntentConfig({
      amount: Math.round(miniDrawPackage.price * 100), // Convert to cents
      currency: "aud",
      customer: user.stripeCustomerId!,
      paymentMethod: paymentMethodId,
      confirm: shouldConfirm,
      paymentType: "mini-draw",
      description: miniDrawPackage.name,
      metadata: {
        type: "mini-draw",
        packageId: miniDrawPackage._id,
        miniDrawId: miniDrawId, // Link to specific MiniDraw
        userId: user._id.toString(),
        entriesCount: miniDrawPackage.entries.toString(),
        packageName: miniDrawPackage.name,
        price: Math.round(miniDrawPackage.price * 100).toString(), // Price in cents
        // Store request context for Facebook CAPI (webhook will extract and use)
        ...(requestContext?.client_ip_address ? { capi_client_ip: requestContext.client_ip_address } : {}),
        ...(requestContext?.client_user_agent ? { capi_user_agent: requestContext.client_user_agent } : {}),
        ...(requestContext?.fbc ? { capi_fbc: requestContext.fbc } : {}),
        ...(requestContext?.fbp ? { capi_fbp: requestContext.fbp } : {}),
        ...(requestContext?.ttclid ? { capi_ttclid: requestContext.ttclid } : {}),
        ...(requestContext?.ttp ? { capi_ttp: requestContext.ttp } : {}),
        ...(eventSourceUrl ? { capi_event_source_url: eventSourceUrl } : {}),
        ...buildAttributionMetadata(attribution),
        ...(resolvedAttrMetadata ?? {}),
      },
    });

    // ✅ STRIPE BEST PRACTICE: Generate idempotency key to prevent duplicate PaymentIntent creation
    const idempotencyKey = `pi_minidraw_${miniDrawId}_${user._id.toString()}_${Date.now()}`;

    const paymentIntent = await stripe.paymentIntents.create(
      paymentIntentConfig,
      {
        idempotencyKey: idempotencyKey, // ✅ STRIPE BEST PRACTICE: Prevent duplicate PaymentIntent creation
      }
    );

    return NextResponse.json({
      success: true,
      requiresPayment: !paymentMethodId,
      clientSecret: paymentIntent.client_secret,
      data: {
        packageId: miniDrawPackage._id,
        amount: miniDrawPackage.price,
        entriesCount: miniDrawPackage.entries,
        paymentIntentId: paymentIntent.id,
        processingStatus: "pending",
      },
    });
  } catch (error) {
    console.error("Payment intent creation error:", error);
    
    // ✅ OPTIMIZED: Auto-log error for monitoring (fire-and-forget, non-blocking)
    // Don't await - let it run in background without blocking error response
    if (request) {
      getServerSession(authOptions)
        .then((session) => {
          return request.json().catch(() => ({})).then((requestBody) => {
            ErrorLoggingService.logError(error, {
              userId: session?.user?.id,
              userEmail: session?.user?.email || undefined, // Convert null to undefined
              guestEmail: (requestBody as { userEmail?: string })?.userEmail, // Guest email from request
              endpoint: request.url,
              requestMethod: "POST",
              requestBody,
              component: "mini-draw-purchase",
              flow: "mini-draw-purchase",
              packageId: (requestBody as { packageId?: string })?.packageId,
              miniDrawId: (requestBody as { miniDrawId?: string })?.miniDrawId,
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
            component: "mini-draw-purchase",
            flow: "mini-draw-purchase",
          }, {
            isServerSide: true,
            request,
            skipRateLimit: true,
          }).catch(() => {
            // Silently fail
          });
        });
    }
    
    throw error; // Re-throw to be handled by caller
  }
}
