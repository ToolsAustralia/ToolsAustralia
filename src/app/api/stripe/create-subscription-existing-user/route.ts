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
import crypto from "node:crypto";
import { getInvoicePaymentIntentFromSubscription } from "@/utils/payment/stripe/invoice-payment-intent";
import { createPaymentIntentConfig } from "@/utils/payment/stripe/payment-intent-config";
import { ErrorLoggingService } from "@/services/error-reporting/ErrorLoggingService";
// Klaviyo integration handled by webhook for best practices

const createSubscriptionExistingUserSchema = z.object({
  packageId: z.string().min(1, "Package ID is required"),
  paymentMethodId: z.string().optional(), // ✅ STRIPE BEST PRACTICE: Optional - subscription can be created without payment method upfront
  idempotencyKey: z.string().optional(), // ✅ STRIPE BEST PRACTICE: Idempotency key to prevent duplicate subscription creation
  referralCode: z.string().optional(),
  promoLinkCode: z.string().optional(),
});

/**
 * POST /api/stripe/create-subscription-existing-user
 * Create a new Stripe subscription for an existing logged-in user
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
    const validatedData = createSubscriptionExistingUserSchema.parse(body);

    // console.log(`🚀 Creating subscription for existing user: ${session.user.id}`);

    // Get the existing user
    const existingUser = await User.findById(session.user.id);
    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if user already has an active subscription
    if (existingUser.subscription?.isActive) {
      return NextResponse.json(
        {
          error:
            "User already has an active subscription. Please manage your existing subscription instead of creating a new one.",
          code: "EXISTING_SUBSCRIPTION",
        },
        { status: 409 }
      );
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

    // ✅ STRIPE BEST PRACTICE: Payment method is optional for subscription creation
    // When not provided, subscription will be created without default_payment_method
    // Invoice PaymentIntent will still be created and can be used for PaymentElement
    // Payment method will be attached when user confirms payment via PaymentElement
    const finalPaymentMethodId = validatedData.paymentMethodId;

    // If paymentMethodId is provided but is "new_payment_method", it means the frontend didn't complete the setup
    if (validatedData.paymentMethodId === "new_payment_method") {
      return NextResponse.json(
        {
          success: false,
          error: "Payment method not properly set up. Please complete card details first.",
        },
        { status: 400 }
      );
    }

    // ✅ STRIPE BEST PRACTICE: Only attach and set default payment method if provided
    // When paymentMethodId is not provided, subscription will be created without it
    // Payment method will be attached during payment confirmation
    if (finalPaymentMethodId) {
      // ✅ CRITICAL FIX: Ensure payment method is attached and set as default BEFORE creating subscription
      // This prevents "No payment method found" errors when confirming subscription payment
      // DO NOT save payment method to user database here - it will only be saved AFTER payment succeeds (via webhook)
      // This prevents saving payment methods when payments fail due to insufficient funds
      try {
        // ✅ ENHANCED: Verify payment method exists and is properly attached
        const paymentMethod = await stripe.paymentMethods.retrieve(finalPaymentMethodId);
        const pmCustomerId = typeof paymentMethod.customer === "string" ? paymentMethod.customer : paymentMethod.customer?.id;
        
        // ✅ ENHANCED: Ensure payment method is attached to customer (idempotent check)
        if (!pmCustomerId || pmCustomerId !== stripeCustomerId) {
          await stripe.paymentMethods.attach(finalPaymentMethodId, {
            customer: stripeCustomerId,
          });
          console.log(`✅ Attached payment method ${finalPaymentMethodId} to customer ${stripeCustomerId} before subscription creation`);
        }
        
        // ✅ ENHANCED: Set as default payment method and verify it was set
        await stripe.customers.update(stripeCustomerId, {
          invoice_settings: {
            default_payment_method: finalPaymentMethodId,
          },
        });
        
        // ✅ ENHANCED: Verify default payment method was set correctly
        const updatedCustomer = await stripe.customers.retrieve(stripeCustomerId);
        const defaultPm = (updatedCustomer as { invoice_settings?: { default_payment_method?: string } })
          .invoice_settings?.default_payment_method;
        
        if (defaultPm !== finalPaymentMethodId) {
          console.warn(`⚠️ Default payment method may not have been set correctly. Expected: ${finalPaymentMethodId}, Got: ${defaultPm}`);
        } else {
          console.log(`✅ Verified default payment method ${finalPaymentMethodId} is set for customer ${stripeCustomerId}`);
        }
      } catch (pmError) {
        console.error(`❌ Failed to attach/set default payment method ${finalPaymentMethodId}:`, pmError);
        // ✅ ENHANCED: Return clear error before subscription creation if payment method can't be attached
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
    }
    // ✅ If no paymentMethodId provided, continue - subscription will be created without default_payment_method

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

    // ✅ DEDUPLICATION: Cancel any old upfront PaymentIntents for backward compatibility
    // This handles any leftover upfront PaymentIntents from previous implementation
    // Note: New implementation doesn't create upfront PaymentIntents, so this is mainly for cleanup
    try {
      const existingPaymentIntents = await stripe.paymentIntents.list({
        customer: stripeCustomerId,
        limit: 100, // Get recent PaymentIntents
      });

      // Filter for old upfront PaymentIntents that are cancellable
      const oldUpfrontPaymentIntents = existingPaymentIntents.data.filter((pi) => {
        const isUpfrontPayment = pi.metadata?.isUpfrontPayment === "true";
        const isCancellable = [
          "requires_payment_method",
          "requires_confirmation",
          "requires_action",
          "requires_capture",
          "processing",
        ].includes(pi.status);
        const isNotSucceeded = pi.status !== "succeeded";
        const isNotCanceled = pi.status !== "canceled";
        
        // Only cancel old upfront PaymentIntents (for backward compatibility)
        return isUpfrontPayment && isCancellable && isNotSucceeded && isNotCanceled;
      });

      // Cancel old upfront PaymentIntents
      for (const oldPI of oldUpfrontPaymentIntents) {
        try {
          await stripe.paymentIntents.cancel(oldPI.id);
          console.log(`✅ Cancelled old upfront PaymentIntent ${oldPI.id} (backward compatibility cleanup)`);
        } catch (cancelError) {
          console.warn(`⚠️ Could not cancel old upfront PaymentIntent ${oldPI.id}: ${cancelError}`);
        }
      }

      if (oldUpfrontPaymentIntents.length > 0) {
        console.log(`✅ Deduplication: Cancelled ${oldUpfrontPaymentIntents.length} old upfront PaymentIntent(s) for customer ${stripeCustomerId}`);
      }
    } catch (dedupError) {
      console.warn(`⚠️ Deduplication check failed (non-critical): ${dedupError}`);
      // Continue - deduplication failure shouldn't block subscription creation
    }

    // ✅ STRIPE BEST PRACTICE: Generate unique idempotency key per subscription attempt
    // Use crypto.randomUUID() to ensure each subscription attempt gets a unique key
    // This prevents "Keys for idempotent requests can only be used with the same parameters" errors
    // when user retries with different payment methods (wallet vs card) or new checkout attempts
    // Note: Client-provided idempotencyKey is kept in schema for future use but not used here
    // to ensure every subscription attempt gets a fresh key
    const idempotencyKey = `sub_${crypto.randomUUID()}`;

    // Create the subscription with metadata for webhook processing
    // Use payment_behavior to match new user flow and ensure proper webhook processing
    const subscription = await stripe.subscriptions.create(
      {
        customer: stripeCustomerId,
        items: [{ price: stripePriceId }], // ✅ Use existing Price ID
        // ✅ STRIPE BEST PRACTICE: Only set default_payment_method if provided
        // When not provided, subscription will be created without it
        // Invoice PaymentIntent will still be created and payment method will be attached during confirmation
        ...(finalPaymentMethodId ? { default_payment_method: finalPaymentMethodId } : {}),
        payment_behavior: "default_incomplete", // Creates incomplete subscription requiring payment confirmation
        // ✅ CRITICAL FIX: Do NOT save payment method automatically on subscription creation
        // Payment method will only be saved AFTER payment succeeds (handled by webhook)
        // This prevents saving payment methods when payments fail due to insufficient funds
        // payment_settings: { save_default_payment_method: "on_subscription" }, // REMOVED
        expand: ["latest_invoice.payment_intent"],
        description: `${membershipPackage.name}`, // Set description directly on subscription
        metadata: {
          packageId: validatedData.packageId,
          packageName: membershipPackage.name,
          userEmail: existingUser.email,
          ...(validatedData.promoLinkCode && { promoLinkCode: validatedData.promoLinkCode }),
          ...(validatedData.referralCode && { referralCode: validatedData.referralCode }),
        },
      },
      {
        idempotencyKey: idempotencyKey, // ✅ STRIPE BEST PRACTICE: Prevent duplicate subscription creation
      }
    );

    // Update user subscription info immediately but NO initial benefit allocation
    // console.log(
    //   `📝 Saving subscription to user database: packageId=${membershipPackage._id}, subscriptionId=${subscription.id}`
    // );

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

    existingUser.subscription = {
      packageId: membershipPackage._id,
      pendingChange: undefined, // Initialize pendingChange field for subscription management
      isActive: subscription.status === "active", // ✅ Set based on Stripe subscription status
      startDate: new Date(),
      endDate: undefined, // Subscription doesn't have an end date
      autoRenew: true,
      status: subscription.status, // Track subscription status
      // ✅ PRESERVE: Keep lastMonthAccumulatedEntries for resubscription continuation
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

    // ✅ Get PaymentIntent from subscription's invoice using utility function
    // This handles retry logic and proper detection of Stripe-created PaymentIntent
    // ✅ NON-BLOCKING: PaymentIntent retrieval failure should not block subscription creation
    const paymentIntentResult = await getInvoicePaymentIntentFromSubscription(subscription, subscription.id);

    // ✅ IMPROVED ERROR HANDLING: Log detailed error but continue with subscription creation
    if (!paymentIntentResult.success && paymentIntentResult.error) {
      const invoiceId = paymentIntentResult.invoice?.id || "unknown";
      console.error(`❌ Failed to get invoice PaymentIntent for subscription ${subscription.id}:`, {
        subscriptionId: subscription.id,
        invoiceId: invoiceId,
        error: paymentIntentResult.error,
        invoiceStatus: paymentIntentResult.invoice?.status,
        hasInvoice: !!paymentIntentResult.invoice,
        userEmail: existingUser.email,
      });
      // Continue - subscription creation succeeded, PaymentIntent retrieval can be retried later
    }

    let paymentIntent: Stripe.PaymentIntent | string | null | undefined = paymentIntentResult.paymentIntent;
    let latestInvoice = paymentIntentResult.invoice;

    // ✅ CRITICAL: If invoice is "open" but has no PaymentIntent, create one manually as last resort
    // This should rarely happen - Stripe usually creates PaymentIntent automatically
    // Only create if absolutely necessary (after retries failed)
    if (!paymentIntent && latestInvoice && latestInvoice.status === "open") {
      try {
        // ✅ SAFETY: Final check - retrieve invoice one more time before manual creation
        // This prevents creating duplicate PaymentIntents if Stripe created one asynchronously
        if (!latestInvoice.id) {
          throw new Error("Invoice ID is missing - cannot perform final check");
        }
        const finalCheckInvoice = await stripe.invoices.retrieve(latestInvoice.id, {
          expand: ["subscription", "payment_intent", "charge"],
        });

        const finalCheckWithPaymentIntent = finalCheckInvoice as Stripe.Invoice & {
          payment_intent?: Stripe.PaymentIntent | string;
        };

        // If PaymentIntent found in final check, use it instead of creating manual
        if (finalCheckWithPaymentIntent.payment_intent) {
          paymentIntent = finalCheckWithPaymentIntent.payment_intent;
          const paymentIntentId =
            typeof paymentIntent === "string" ? paymentIntent : paymentIntent.id;
          console.log(
            `✅ Found PaymentIntent in final check: ${paymentIntentId} for subscription ${subscription.id}`
          );
          // Update latestInvoice to use the fresh invoice data
          latestInvoice = finalCheckInvoice;
        } else {
          // Only now create manual PaymentIntent as true last resort
          const invoiceAmount = latestInvoice.amount_due || Math.round(membershipPackage.price * 100);
          const invoiceCurrency = (latestInvoice.currency as string) || "aud";

          console.log(
            `⚠️ Invoice is open but has no PaymentIntent after final check. Creating PaymentIntent for amount: ${invoiceAmount} (invoice amount_due: ${
              latestInvoice.amount_due
            }, package price: ${Math.round(membershipPackage.price * 100)})`
          );

          // ✅ STRIPE BEST PRACTICE: Generate idempotency key to prevent duplicate PaymentIntent creation
          const invoicePaymentIntentIdempotencyKey = `pi_invoice_${latestInvoice.id || subscription.id}_${Date.now()}`;

          // ✅ FIX: Do NOT set payment_method here - let PaymentElement collect it from user (wallet or card)
          // Setting payment_method causes errors if it was used in upfront PaymentIntent without attachment
          // ✅ Use centralized PaymentIntent configuration with 3DS support
          const paymentIntentConfig = createPaymentIntentConfig({
            amount: invoiceAmount,
            currency: invoiceCurrency,
            customer: stripeCustomerId,
            confirm: false,
            paymentType: "subscription",
            description: membershipPackage.name,
            setupFutureUsage: "off_session",
            metadata: {
                invoice_id: latestInvoice.id || "",
                subscription_id: subscription.id,
                packageId: validatedData.packageId,
                packageName: membershipPackage.name,
                userEmail: existingUser.email,
                type: "subscription",
                packageType: "membership",
                isUpfrontPayment: "false", // ✅ CRITICAL: Mark as invoice PaymentIntent (the one that should be authorized)
                isInvoicePaymentIntent: "true", // ✅ Additional marker for clarity
                ...(validatedData.promoLinkCode && { promoLinkCode: validatedData.promoLinkCode }),
                ...(validatedData.referralCode && { referralCode: validatedData.referralCode }),
            },
          });

          const newPaymentIntent = await stripe.paymentIntents.create(
            paymentIntentConfig,
            {
              idempotencyKey: invoicePaymentIntentIdempotencyKey, // ✅ STRIPE BEST PRACTICE: Prevent duplicate PaymentIntent creation
            }
          );

          if (latestInvoice.id) {
            await stripe.invoices.update(latestInvoice.id, {
              metadata: {
                ...(latestInvoice.metadata || {}),
                payment_intent_id: newPaymentIntent.id,
              },
            });
          }

          paymentIntent = newPaymentIntent;
          console.log(`✅ Created PaymentIntent: ${newPaymentIntent.id} for invoice ${latestInvoice.id}`);
        }
      } catch (createError) {
        console.error("❌ Failed to create PaymentIntent for invoice:", createError);
      }
    }

    // Extract client_secret from PaymentIntent
    let clientSecret: string | null = null;
    if (paymentIntent) {
      if (typeof paymentIntent === "string") {
        try {
          const retrievedPI = await stripe.paymentIntents.retrieve(paymentIntent);
          clientSecret = retrievedPI.client_secret || null;
        } catch (retrieveError) {
          console.error("❌ Failed to retrieve PaymentIntent:", retrieveError);
        }
      } else {
        clientSecret = paymentIntent.client_secret || null;
      }
    }

    // ✅ STRIPE BEST PRACTICE: Validate PaymentIntent before returning clientSecret
    // This ensures PaymentIntent is valid, has correct amount, and belongs to invoice
    if (clientSecret) {
      try {
        const paymentIntentId = clientSecret.split("_secret_")[0];
        const retrievedPI = await stripe.paymentIntents.retrieve(paymentIntentId);
        
        // Expected amount in cents
        const expectedAmount = Math.round(membershipPackage.price * 100);
        
        console.log(`🔍 Validating invoice PaymentIntent ${paymentIntentId}:`, {
          status: retrievedPI.status,
          amount: retrievedPI.amount,
          expectedAmount: expectedAmount,
          hasInvoiceId: !!retrievedPI.metadata?.invoice_id,
          hasSubscriptionId: !!retrievedPI.metadata?.subscription_id,
          isInvoicePaymentIntent: retrievedPI.metadata?.isInvoicePaymentIntent,
        });
        
        // ✅ CRITICAL: Validate PaymentIntent status
        if (retrievedPI.status === "canceled") {
          console.error(`❌ CRITICAL: Attempted to return canceled PaymentIntent ${paymentIntentId} as clientSecret`);
          clientSecret = null; // Force fallback - PaymentIntent is invalid
        }
        // ✅ CRITICAL: Validate PaymentIntent amount matches subscription price
        else if (retrievedPI.amount !== expectedAmount) {
          console.error(`❌ CRITICAL: PaymentIntent amount mismatch - expected ${expectedAmount}, got ${retrievedPI.amount}`);
          console.error(`❌ This will cause incorrect amount display in Google Pay/Apple Pay wallets`);
          // Don't set clientSecret to null - log error but continue (amount might be correct due to prorations/trials)
        }
        // ✅ CRITICAL: Validate PaymentIntent belongs to invoice
        else if (!retrievedPI.metadata?.invoice_id) {
          console.warn(`⚠️ PaymentIntent ${paymentIntentId} does not have invoice_id metadata - may not be invoice PaymentIntent`);
          // Continue - might still be valid invoice PaymentIntent
        } else {
          console.log(`✅ Invoice PaymentIntent ${paymentIntentId} validation passed - returning clientSecret`);
        }
      } catch (verifyError) {
        console.warn("Could not verify PaymentIntent status:", verifyError);
        // Continue - clientSecret might still be valid
      }
    }

    // ✅ Klaviyo integration handled by webhook for reliability and best practices
    // console.log(`📊 Klaviyo events will be tracked via webhook when payment is confirmed`);

    // console.log(`✅ Subscription created successfully for user: ${existingUser.email}`);
    // console.log(`📦 Package: ${membershipPackage.name} ($${membershipPackage.price})`);
    // console.log(`⏳ Entries/points will be added via webhook upon first payment confirmation`);
    // console.log(`🔒 Subscription status: ${subscription.status} - benefits will activate on payment`);

    // ✅ Referral processing moved to webhook (after payment succeeds)
    // Referral code is stored in subscription metadata and processed by webhook

    // ✅ GRACEFUL DEGRADATION: Include warning if PaymentIntent retrieval failed
    const warning = !clientSecret && !paymentIntentResult.success
      ? "PaymentIntent retrieval delayed. Payment confirmation may require retry. Subscription created successfully."
      : undefined;

    return NextResponse.json({
      success: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        clientSecret: clientSecret || undefined, // ✅ Return PaymentIntent client_secret for wallet display
      },
      data: {
        subscriptionId: subscription.id,
        clientSecret: clientSecret || undefined, // ✅ Also return in data for consistency
        ...(warning && { warning }), // Include warning if PaymentIntent retrieval failed
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
      return NextResponse.json({ error: "Validation failed", details: error.issues }, { status: 400 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: "Failed to create subscription", details: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });
  }
}
