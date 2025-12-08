import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import { stripe } from "@/lib/stripe";
import Stripe from "stripe";
import { recordReferralPurchase } from "@/lib/referral";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
// Klaviyo integration handled by webhook for best practices

const createSubscriptionExistingUserSchema = z.object({
  packageId: z.string().min(1, "Package ID is required"),
  paymentMethodId: z.string().min(1, "Payment method is required"),
  paymentIntentId: z.string().optional(), // ✅ NEW: Optional upfront PaymentIntent ID for wallet display
  referralCode: z.string().optional(),
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

    // If we have a valid payment method ID, attach it to the customer
    if (finalPaymentMethodId && finalPaymentMethodId !== "new_payment_method") {
      // Attach to customer
      await stripe.paymentMethods.attach(finalPaymentMethodId, {
        customer: stripeCustomerId,
      });
      // console.log(`💳 Attached payment method: ${finalPaymentMethodId}`);

      // Set as default payment method for the customer
      await stripe.customers.update(stripeCustomerId, {
        invoice_settings: {
          default_payment_method: finalPaymentMethodId,
        },
      });
      // console.log(`💳 Set ${finalPaymentMethodId} as default payment method for customer ${stripeCustomerId}`);
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

    // Create the subscription with metadata for webhook processing
    // Use payment_behavior to match new user flow and ensure proper webhook processing
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: stripePriceId }], // ✅ Use existing Price ID
      default_payment_method: finalPaymentMethodId,
      payment_behavior: "default_incomplete", // Creates incomplete subscription requiring payment confirmation
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
      description: `${membershipPackage.name}`, // Set description directly on subscription
      metadata: {
        packageId: validatedData.packageId,
        packageName: membershipPackage.name,
        userEmail: existingUser.email,
      },
    });

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

    // Ensure the save completes before responding (critical for webhook processing)
    await existingUser.save();
    // console.log(`✅ User subscription saved to database: packageId=${existingUser.subscription.packageId}`);

    // ✅ STRIPE BEST PRACTICE: Get PaymentIntent from subscription's invoice for wallet display
    // Similar logic to create-subscription route
    let paymentIntent: Stripe.PaymentIntent | string | null | undefined = null;
    let latestInvoice: Stripe.Invoice | null = null;

    // Check if PaymentIntent is already in the expanded subscription
    if (subscription.latest_invoice) {
      latestInvoice =
        typeof subscription.latest_invoice === "string"
          ? null // Will retrieve below
          : (subscription.latest_invoice as Stripe.Invoice);

      // If invoice is expanded, check for PaymentIntent
      if (latestInvoice) {
        paymentIntent = (latestInvoice as Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent | string })
          ?.payment_intent;
      }
    }

    // If we don't have the invoice yet, retrieve it
    const invoiceId =
      typeof subscription.latest_invoice === "string" ? subscription.latest_invoice : subscription.latest_invoice?.id;

    if (invoiceId && !latestInvoice) {
      latestInvoice = await stripe.invoices.retrieve(invoiceId as string, {
        expand: ["payment_intent"],
      });
      paymentIntent = (latestInvoice as Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent | string })
        ?.payment_intent;
    }

    // ✅ CRITICAL: If invoice is draft, finalize it first
    if (latestInvoice && latestInvoice.status === "draft") {
      try {
        latestInvoice = await stripe.invoices.finalizeInvoice(invoiceId as string, {
          expand: ["payment_intent"],
        });
        paymentIntent = (latestInvoice as Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent | string })
          ?.payment_intent;
        console.log(`✅ Invoice finalized: ${latestInvoice.id}, status: ${latestInvoice.status}`);
      } catch (finalizeError) {
        console.error("❌ Failed to finalize invoice:", finalizeError);
      }
    }

    // ✅ STRIPE BEST PRACTICE: Check if upfront PaymentIntent was provided (for wallet display)
    if (validatedData.paymentIntentId && !paymentIntent && latestInvoice && latestInvoice.status === "open") {
      try {
        const upfrontPaymentIntent = await stripe.paymentIntents.retrieve(validatedData.paymentIntentId);

        // Validate upfront PaymentIntent
        const expectedAmount = Math.round(membershipPackage.price * 100);
        if (
          upfrontPaymentIntent.status === "requires_payment_method" &&
          upfrontPaymentIntent.amount === expectedAmount &&
          upfrontPaymentIntent.currency === "aud"
        ) {
          // Update upfront PaymentIntent with invoice/subscription metadata and description
          await stripe.paymentIntents.update(upfrontPaymentIntent.id, {
            // ✅ STRIPE BEST PRACTICE: Update description to package name for better tracking
            description: membershipPackage.name,
            metadata: {
              ...upfrontPaymentIntent.metadata,
              invoice_id: latestInvoice.id || "",
              subscription_id: subscription.id,
              packageId: validatedData.packageId,
              packageName: membershipPackage.name,
              userEmail: existingUser.email,
              type: "subscription",
              packageType: "subscription",
              isUpfrontPayment: "true", // ✅ Mark so webhook skips it
            },
          });

          paymentIntent = upfrontPaymentIntent;
          console.log(`✅ Using upfront PaymentIntent: ${upfrontPaymentIntent.id} for subscription ${subscription.id}`);
        }
      } catch (retrieveError) {
        console.warn(`⚠️ Failed to retrieve upfront PaymentIntent: ${retrieveError}`);
      }
    }

    // ✅ CRITICAL: If invoice is "open" but has no PaymentIntent, create one manually
    if (!paymentIntent && latestInvoice && latestInvoice.status === "open") {
      try {
        const invoiceAmount = latestInvoice.amount_due || Math.round(membershipPackage.price * 100);
        const invoiceCurrency = (latestInvoice.currency as string) || "aud";

        const newPaymentIntent = await stripe.paymentIntents.create({
          amount: invoiceAmount,
          currency: invoiceCurrency,
          customer: stripeCustomerId,
          payment_method: finalPaymentMethodId,
          setup_future_usage: "off_session",
          confirm: false,
          automatic_payment_methods: {
            enabled: true,
            allow_redirects: "never",
          },
          // ✅ STRIPE BEST PRACTICE: Set description to package name for better tracking in Stripe dashboard
          description: membershipPackage.name,
          metadata: {
            invoice_id: latestInvoice.id || "",
            subscription_id: subscription.id,
            packageId: validatedData.packageId,
            packageName: membershipPackage.name,
            userEmail: existingUser.email,
            type: "subscription",
            packageType: "subscription",
            isUpfrontPayment: "true",
          },
        });

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

    // ✅ Klaviyo integration handled by webhook for reliability and best practices
    // console.log(`📊 Klaviyo events will be tracked via webhook when payment is confirmed`);

    // console.log(`✅ Subscription created successfully for user: ${existingUser.email}`);
    // console.log(`📦 Package: ${membershipPackage.name} ($${membershipPackage.price})`);
    // console.log(`⏳ Entries/points will be added via webhook upon first payment confirmation`);
    // console.log(`🔒 Subscription status: ${subscription.status} - benefits will activate on payment`);

    if (validatedData.referralCode) {
      try {
        await recordReferralPurchase({
          referralCode: validatedData.referralCode,
          inviteeUserId: existingUser._id.toString(),
          inviteeEmail: existingUser.email,
          inviteeName: `${existingUser.firstName} ${existingUser.lastName}`.trim(),
          qualifyingOrderId: subscription.id,
          qualifyingOrderType: "membership",
        });
      } catch (referralError) {
        console.error("Referral purchase capture failed:", referralError);
      }
    }

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

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: error.issues }, { status: 400 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: "Failed to create subscription", details: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });
  }
}
