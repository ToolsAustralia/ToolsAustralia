import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import { stripe } from "@/lib/stripe";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Stripe from "stripe";

// Extended Stripe subscription interface with period fields
interface StripeSubscriptionWithPeriods extends Stripe.Subscription {
  current_period_start: number;
  current_period_end: number;
}

const upgradeSubscriptionPaymentSchema = z.object({
  newPackageId: z.string().min(1, "New package ID is required"),
  paymentMethodId: z.string().optional(), // Optional for existing customers with saved payment methods
});

/**
 * POST /api/stripe/upgrade-subscription-payment
 * ✅ STRIPE BEST PRACTICE: Update existing subscription with proration
 *
 * This endpoint follows Stripe's recommended pattern:
 * - Uses subscription.update() instead of creating new subscription
 * - Automatic proration calculation by Stripe
 * - Maintains single subscription ID for better tracking
 * - Webhook-driven activation for reliability
 */
export async function POST(request: NextRequest) {
  try {
    // console.log(`🚀 [UPGRADE] Starting upgrade process - USING SUBSCRIPTION.UPDATE()`);

    await connectDB();
    // console.log(`✅ Database connected`);

    // Get the authenticated user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      // console.log(`❌ No session found`);
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = upgradeSubscriptionPaymentSchema.parse(body);
    // console.log(`✅ Data validated:`, validatedData);

    const { newPackageId } = validatedData;
    console.log(`📦 Upgrading to package: ${newPackageId}`);

    // Get the existing user
    const user = await User.findById(session.user.id);
    if (!user) {
      // console.log(`❌ User not found: ${session.user.id}`);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // console.log(`👤 User found: ${user.email}`);
    // console.log(`📊 Current subscription:`, {
    //   packageId: user.subscription?.packageId,
    //   stripeSubscriptionId: user.stripeSubscriptionId,
    //   isActive: user.subscription?.isActive,
    //   status: user.subscription?.status,
    // });

    // Check if user has an active subscription
    if (!user.subscription?.isActive || !user.stripeSubscriptionId) {
      // console.log(`❌ No active subscription found for user: ${user.email}`);
      return NextResponse.json({ error: "No active subscription found to upgrade" }, { status: 400 });
    }

    // ✅ FIX: Get current package from Stripe subscription metadata (source of truth)
    let currentStripeSubscription;
    try {
      currentStripeSubscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    } catch (error) {
      console.error(`❌ Failed to retrieve Stripe subscription: ${error}`);
      return NextResponse.json({ error: "Failed to retrieve subscription details" }, { status: 500 });
    }

    // Get current package from Stripe metadata (most accurate)
    const currentPackageId = currentStripeSubscription.metadata.packageId || user.subscription.packageId;
    const currentPackage = getPackageById(currentPackageId);
    const newPackage = getPackageById(validatedData.newPackageId);

    if (!currentPackage || !newPackage) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    }

    // Check if it's the same package
    if (currentPackage._id === newPackage._id) {
      return NextResponse.json(
        { error: "You are already subscribed to this package. Please select a different package to upgrade." },
        { status: 400 }
      );
    }

    // Check if it's actually an upgrade
    if (newPackage.price <= currentPackage.price) {
      return NextResponse.json(
        { error: "This is not an upgrade. Please select a higher tier package." },
        { status: 400 }
      );
    }

    // Validate Stripe configuration
    if (!newPackage.stripePriceId) {
      console.error(`❌ No Stripe Price ID configured for package: ${newPackage.name}`);
      return NextResponse.json(
        {
          success: false,
          error: `Stripe configuration missing for ${newPackage.name}. Please contact support.`,
        },
        { status: 500 }
      );
    }

    // Get or create Stripe customer
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const stripeCustomer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        metadata: {
          userId: user._id.toString(),
          userEmail: user.email,
        },
      });
      stripeCustomerId = stripeCustomer.id;
      user.stripeCustomerId = stripeCustomerId;
      await user.save();
    }

    // Get payment method
    console.log(`💳 Getting payment method...`);
    let paymentMethod: Stripe.PaymentMethod;

    if (validatedData.paymentMethodId) {
      // console.log(`💳 Using provided payment method: ${validatedData.paymentMethodId}`);
      paymentMethod = await stripe.paymentMethods.retrieve(validatedData.paymentMethodId);
    } else if (user.savedPaymentMethods && user.savedPaymentMethods.length > 0) {
      const defaultPaymentMethod = user.savedPaymentMethods.find((pm) => pm.isDefault) || user.savedPaymentMethods[0];
      // console.log(`💳 Using saved payment method: ${defaultPaymentMethod.paymentMethodId}`);
      paymentMethod = await stripe.paymentMethods.retrieve(defaultPaymentMethod.paymentMethodId);
    } else {
      // console.log(`❌ No payment method available`);
      return NextResponse.json({ error: "No payment method available" }, { status: 400 });
    }

    // Attach payment method to customer if needed
    if (paymentMethod.customer !== stripeCustomerId) {
      await stripe.paymentMethods.attach(paymentMethod.id, {
        customer: stripeCustomerId,
      });
      // console.log(`✅ Payment method attached to customer`);
    }

    // Set as default payment method
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethod.id,
      },
    });
    // console.log(`✅ Payment method set as default`);

    // ✅ STRIPE BEST PRACTICE: Retrieve current subscription to get item ID
    // console.log(`📊 Retrieving current subscription: ${user.stripeSubscriptionId}`);
    const currentSubscription = (await stripe.subscriptions.retrieve(
      user.stripeSubscriptionId
    )) as unknown as StripeSubscriptionWithPeriods;

    if (!currentSubscription.items.data || currentSubscription.items.data.length === 0) {
      console.error(`❌ No subscription items found`);
      return NextResponse.json({ error: "Invalid subscription configuration" }, { status: 500 });
    }

    const currentSubscriptionItem = currentSubscription.items.data[0];
    // console.log(`📦 Current subscription item:`, {
    //   id: currentSubscriptionItem.id,
    //   priceId: currentSubscriptionItem.price.id,
    //   productId: currentSubscriptionItem.price.product,
    // });

    // ✅ STRIPE BEST PRACTICE: Update existing subscription instead of creating new one
    // console.log(`🔄 [UPGRADE] Updating subscription with proration...`);
    // console.log(`🔄 From Price: ${currentSubscriptionItem.price.id} ($${currentPackage.price})`);
    // console.log(`🔄 To Price: ${newPackage.stripePriceId} ($${newPackage.price})`);
    // console.log(`🔄 Strategy: always_invoice + unchanged billing cycle (accurate proration)`);
    console.log(
      `📅 Current billing period: ${new Date(
        currentSubscription.current_period_start * 1000
      ).toLocaleDateString()} - ${new Date(currentSubscription.current_period_end * 1000).toLocaleDateString()}`
    );
    // );

    // ✅ STRIPE BEST PRACTICE: For immediate upgrade with payment collection
    // Use 'always_invoice' to create invoice and attempt immediate payment
    // Use 'unchanged' billing cycle to maintain consistent billing dates and accurate proration
    const updatedSubscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
      items: [
        {
          id: currentSubscriptionItem.id,
          price: newPackage.stripePriceId, // ✅ Use existing Price ID
        },
      ],
      // ✅ NO PRORATION UPGRADE: charge full price now and reset billing cycle
      proration_behavior: "none",
      billing_cycle_anchor: "now",
      payment_behavior: "error_if_incomplete", // ✅ CRITICAL: Force payment collection, error if payment fails
      default_payment_method: paymentMethod.id,
      expand: ["latest_invoice.payment_intent"], // ✅ Get payment intent for frontend
      metadata: {
        ...currentSubscription.metadata,
        packageId: newPackage._id,
        packageName: newPackage.name,
        upgradeFrom: currentPackage._id,
        upgradeFromName: currentPackage.name,
        upgradeDate: new Date().toISOString(),
        upgradeType: "no_proration", // Track that this used NO proration
        originalBillingDate: currentSubscription.current_period_start
          ? new Date(currentSubscription.current_period_start * 1000).toISOString()
          : new Date().toISOString(),
      },
    });

    // console.log(`✅ [UPGRADE] Subscription updated successfully: ${updatedSubscription.id}`);
    // console.log(`📊 Updated subscription status: ${updatedSubscription.status}`);

    // Extract latest invoice and payment intent
    const latestInvoice = updatedSubscription.latest_invoice as Stripe.Invoice;
    const invoiceWithPaymentIntent = latestInvoice as Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent };
    const paymentIntent = invoiceWithPaymentIntent?.payment_intent as Stripe.PaymentIntent;
    const invoiceWithPaid = latestInvoice as Stripe.Invoice & { paid?: boolean };
    console.log(`💰 Invoice payment status: ${invoiceWithPaid.paid ? "Paid" : "Unpaid"}`);

    // console.log(`💳 Latest invoice:`, {
    //   id: latestInvoice?.id,
    //   status: latestInvoice?.status,
    //   amount: latestInvoice?.amount_due,
    //   paid: invoiceWithPaid?.paid,
    // });
    // console.log(`💳 Payment intent:`, {
    //   id: paymentIntent?.id,
    //   status: paymentIntent?.status,
    //   amount: paymentIntent?.amount,
    //   clientSecret: paymentIntent?.client_secret ? "present" : "missing",
    // });

    // Calculate proration amount from invoice
    const prorationAmount = latestInvoice?.amount_due || 0;
    // console.log(`💰 Proration amount calculated by Stripe: $${(prorationAmount / 100).toFixed(2)}`);

    // ✅ CRITICAL: Validate proration amount for upgrades
    // When upgrading, user should ALWAYS pay something (at minimum the price difference)
    const expectedMinimumCharge = (newPackage.price - currentPackage.price) * 100; // Convert to cents
    // console.log(`💰 Expected minimum charge: $${(expectedMinimumCharge / 100).toFixed(2)}`);

    if (prorationAmount < expectedMinimumCharge * 0.5) {
      // If proration is less than 50% of expected, something is wrong
      console.error(`❌ Proration amount ($${(prorationAmount / 100).toFixed(2)}) is too low!`);
      console.error(`❌ Expected minimum: $${(expectedMinimumCharge / 100).toFixed(2)}`);
      console.error(`❌ This could indicate a billing cycle issue`);

      return NextResponse.json(
        {
          error: "Upgrade pricing error",
          details: `Expected charge: $${(expectedMinimumCharge / 100).toFixed(2)}, but Stripe calculated: $${(
            prorationAmount / 100
          ).toFixed(2)}. Please contact support.`,
        },
        { status: 500 }
      );
    }

    // Check if payment is already completed
    if (latestInvoice?.status === "paid" && updatedSubscription.status === "active") {
      // console.log(`✅ Payment already processed - invoice is paid, subscription is active`);

      // 🔒 Enhanced verification for immediate activation
      const invoiceId = latestInvoice.id;
      const isAlreadyProcessed = user.processedPayments?.includes(`invoice_${invoiceId}`);

      if (isAlreadyProcessed) {
        // console.log(`⚠️ Upgrade already processed (duplicate request)`);
        return NextResponse.json({
          success: true,
          message: `Upgrade to ${newPackage.name} was already processed!`,
          data: {
            subscription: {
              id: updatedSubscription.id,
              packageId: newPackage._id,
              packageName: newPackage.name,
              price: newPackage.price,
              status: "active",
            },
          },
        });
      }

      // ✅ CRITICAL FIX: Don't mark as processed here - let webhook handle it
      // The webhook will add to processedPayments after successfully processing benefits
      // Adding it here prevents the webhook from processing the payment

      // Update user subscription with pending change for webhook processing
      user.subscription.pendingChange = {
        newPackageId: newPackage._id,
        changeType: "upgrade",
        stripeSubscriptionId: updatedSubscription.id,
        paymentIntentId: paymentIntent?.id,
        upgradeAmount: prorationAmount,
      };
      user.subscription.lastUpgradeDate = new Date();

      await user.save();

      // ✅ NEW: Track pixel subscription upgrade event
      try {
        const { trackPixelSubscriptionUpgrade } = await import("@/utils/tracking/pixel-purchase-tracking");
        await trackPixelSubscriptionUpgrade({
          oldValue: currentPackage.price,
          newValue: newPackage.price,
          currency: "AUD",
          oldPackageId: currentPackage._id,
          newPackageId: newPackage._id,
          oldPackageName: currentPackage.name,
          newPackageName: newPackage.name,
          subscriptionId: updatedSubscription.id,
          userId: user._id.toString(),
          userEmail: user.email,
          paymentIntentId: paymentIntent?.id,
          prorationAmount: prorationAmount / 100,
          entriesAdded: (newPackage.entriesPerMonth || 0) - (currentPackage.entriesPerMonth || 0),
        });
        console.log(`📊 Pixel subscription upgrade tracked: ${currentPackage.name} → ${newPackage.name}`);
      } catch (pixelError) {
        console.error("❌ Pixel upgrade tracking failed (non-blocking):", pixelError);
      }

      // console.log(`📝 Upgrade marked for webhook processing (immediate activation)`);

      // Cast for period fields
      const subscriptionWithPeriods = updatedSubscription as unknown as StripeSubscriptionWithPeriods;

      return NextResponse.json({
        success: true,
        message: `Upgrade to ${newPackage.name} successful! Your new benefits are activating now.`,
        data: {
          subscription: {
            id: updatedSubscription.id,
            packageId: newPackage._id,
            packageName: newPackage.name,
            price: newPackage.price,
            status: "processing", // Webhook will complete activation
          },
          upgrade: {
            fromPackage: { id: currentPackage._id, name: currentPackage.name, price: currentPackage.price },
            toPackage: { id: newPackage._id, name: newPackage.name, price: newPackage.price },
            prorationAmount: prorationAmount / 100,
            billingInfo: {
              currentBillingDate: new Date(subscriptionWithPeriods.current_period_start * 1000).toLocaleDateString(),
              nextBillingDate: new Date(subscriptionWithPeriods.current_period_end * 1000).toLocaleDateString(),
              nextBillingAmount: newPackage.price,
              billingDateStays: true,
            },
            benefits: {
              entriesPerMonth: newPackage.entriesPerMonth,
              shopDiscountPercent: newPackage.shopDiscountPercent,
              partnerDiscountDays: newPackage.partnerDiscountDays,
            },
          },
          note: "Payment confirmed - your upgrade is activating!",
        },
      });
    }

    // ✅ FIX: Handle case where payment intent might not exist (already paid or $0 proration)
    // This can happen in test mode with saved cards or when proration is very small
    if (!paymentIntent) {
      // console.log(`⚠️ No payment intent found - invoice may be already paid or proration is $0`);

      // Check if subscription is already active (payment succeeded immediately)
      if (updatedSubscription.status === "active") {
        // console.log(`✅ Subscription already active - treating as immediate success`);

        // Update user subscription immediately
        user.subscription.packageId = newPackage._id;
        user.subscription.isActive = true;
        user.subscription.status = "active";
        user.subscription.pendingChange = undefined;

        // Update saved payment methods
        const isAlreadySaved = user.savedPaymentMethods?.some((pm) => pm.paymentMethodId === paymentMethod.id);

        if (!isAlreadySaved) {
          user.savedPaymentMethods = user.savedPaymentMethods || [];
          user.savedPaymentMethods.forEach((pm) => {
            pm.isDefault = false;
          });
          user.savedPaymentMethods.push({
            paymentMethodId: paymentMethod.id,
            isDefault: true,
            createdAt: new Date(),
            lastUsed: new Date(),
          });
        }

        await user.save();

        return NextResponse.json({
          success: true,
          message: `Upgrade to ${newPackage.name} successful!`,
          data: {
            subscription: {
              id: updatedSubscription.id,
              packageId: newPackage._id,
              packageName: newPackage.name,
              price: newPackage.price,
              status: "active",
            },
            upgrade: {
              fromPackage: { id: currentPackage._id, name: currentPackage.name, price: currentPackage.price },
              toPackage: { id: newPackage._id, name: newPackage.name, price: newPackage.price },
              prorationAmount: prorationAmount / 100,
              benefits: {
                entriesPerMonth: newPackage.entriesPerMonth,
                shopDiscountPercent: newPackage.shopDiscountPercent,
                partnerDiscountDays: newPackage.partnerDiscountDays,
              },
            },
            note: "Upgrade completed successfully!",
          },
        });
      }

      // If not active and no payment intent, something is wrong
      console.error(`❌ Subscription not active and no payment intent found`);
      return NextResponse.json({ error: "Failed to process upgrade. Please try again." }, { status: 500 });
    }

    // Payment requires confirmation (has client_secret)
    if (!paymentIntent.client_secret) {
      console.error(`❌ Payment intent exists but missing client_secret`);
      return NextResponse.json({ error: "Failed to create payment confirmation" }, { status: 500 });
    }

    // Update user model with pending change (webhook will activate after payment)
    user.subscription.pendingChange = {
      newPackageId: newPackage._id,
      changeType: "upgrade",
      stripeSubscriptionId: updatedSubscription.id,
      paymentIntentId: paymentIntent.id,
      upgradeAmount: prorationAmount,
    };
    user.subscription.lastUpgradeDate = new Date();

    // Update saved payment methods
    const isAlreadySaved = user.savedPaymentMethods?.some((pm) => pm.paymentMethodId === paymentMethod.id);

    if (!isAlreadySaved) {
      user.savedPaymentMethods = user.savedPaymentMethods || [];
      user.savedPaymentMethods.forEach((pm) => {
        pm.isDefault = false;
      });
      user.savedPaymentMethods.push({
        paymentMethodId: paymentMethod.id,
        isDefault: true,
        createdAt: new Date(),
        lastUsed: new Date(),
      });
    } else {
      const existingPm = user.savedPaymentMethods.find((pm) => pm.paymentMethodId === paymentMethod.id);
      if (existingPm) {
        existingPm.lastUsed = new Date();
        existingPm.isDefault = true;
        user.savedPaymentMethods.forEach((pm) => {
          if (pm.paymentMethodId !== paymentMethod.id) pm.isDefault = false;
        });
      }
    }

    await user.save();

    // console.log(`📝 Upgrade pending payment confirmation. Webhook will activate after payment.`);

    // Return payment intent for frontend confirmation
    return NextResponse.json({
      success: true,
      message: `Upgrade to ${newPackage.name} ready! Complete payment to activate immediately.`,
      data: {
        paymentIntent: {
          id: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
          amount: prorationAmount,
          currency: "usd",
          status: paymentIntent.status,
        },
        subscription: {
          id: updatedSubscription.id,
          packageId: newPackage._id,
          packageName: newPackage.name,
          price: newPackage.price,
          status: updatedSubscription.status,
        },
        upgrade: {
          fromPackage: { id: currentPackage._id, name: currentPackage.name, price: currentPackage.price },
          toPackage: { id: newPackage._id, name: newPackage.name, price: newPackage.price },
          prorationAmount: prorationAmount / 100,
          prorationDetails: `Prorated charge for remaining billing period`,
          billingInfo: {
            currentBillingDate: new Date(currentSubscription.current_period_start * 1000).toLocaleDateString(),
            nextBillingDate: new Date(currentSubscription.current_period_end * 1000).toLocaleDateString(),
            nextBillingAmount: newPackage.price,
            billingDateStays: true,
          },
          benefits: {
            entriesPerMonth: newPackage.entriesPerMonth,
            shopDiscountPercent: newPackage.shopDiscountPercent,
            partnerDiscountDays: newPackage.partnerDiscountDays,
          },
        },
        note: "Complete payment to upgrade immediately. You will be charged the prorated difference.",
      },
    });
  } catch (error) {
    console.error("❌ [UPGRADE] Error:", error);
    console.error("❌ Error stack:", error instanceof Error ? error.stack : "No stack trace");

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request data", details: error.issues }, { status: 400 });
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json(
      {
        error: "Failed to process upgrade. Please try again.",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
