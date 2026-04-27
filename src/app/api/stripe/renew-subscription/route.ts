import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import { stripe } from "@/lib/stripe";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Stripe from "stripe";
import { getValidPaymentMethod } from "@/utils/payment/stripe/stripe-helpers";
import { getSubscriptionCreateParamsForAnchor, getNextAnchorTimestamp } from "@/utils/billing/anchor-billing";
import { getSubscriptionPeriodEnd } from "@/utils/payment/stripe/subscription-period";
import {
  analyzePaymentIntentForExcessiveRetry,
  analyzeStripePayErrorForExcessiveRetry,
} from "@/utils/payment/stripe/stripe-excessive-retry";
import { resumeAfterSuccessfulRenewalPayment } from "@/services/subscription/SubscriptionCollectionPauseService";

const renewSubscriptionSchema = z.object({
  packageId: z.string().optional(), // Optional: renew with same or different package
  paymentMethodId: z.string().optional(), // Optional: use saved or provide new payment method
  createSetupIntent: z.boolean().optional().default(false), // Create setup intent if no payment method available
});

/**
 * POST /api/stripe/renew-subscription
 * ✅ STRIPE BEST PRACTICE: Handle subscription renewal scenarios
 *
 * Use Cases:
 * 1. Failed payment recovery (past_due status)
 * 2. Reactivate canceled subscription within grace period
 * 3. Renew expired subscription
 * 4. Complete incomplete subscriptions
 *
 * Strategy:
 * - If subscription exists and is recoverable → Retry payment or reactivate
 * - If subscription is fully expired → Create new subscription
 */
export async function POST(request: NextRequest) {
  try {
    // console.log(`🔄 [RENEWAL] Starting subscription renewal process`);

    await connectDB();

    // Get the authenticated user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = renewSubscriptionSchema.parse(body);

    // Get the user
    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // console.log(`👤 User found: ${user.email}`);
    // console.log(`📊 Current subscription state:`, {
    //   hasSubscription: !!user.subscription,
    //   isActive: user.subscription?.isActive,
    //   status: user.subscription?.status,
    //   stripeSubscriptionId: user.stripeSubscriptionId,
    //   packageId: user.subscription?.packageId,
    // });
    // console.log(
    //   `💳 Saved payment methods:`,
    //   user.savedPaymentMethods?.map((pm) => ({
    //     id: pm.paymentMethodId,
    //     isDefault: pm.isDefault,
    //     createdAt: pm.createdAt,
    //   }))
    // );

    // Determine target package (use provided or current package)
    const targetPackageId = validatedData.packageId || user.subscription?.packageId;
    if (!targetPackageId) {
      return NextResponse.json({ error: "No package specified for renewal" }, { status: 400 });
    }

    const targetPackage = getPackageById(targetPackageId);
    if (!targetPackage || !targetPackage.isActive) {
      return NextResponse.json({ error: "Invalid or inactive package" }, { status: 400 });
    }

    if (!targetPackage.stripePriceId) {
      console.error(`❌ No Stripe Price ID configured for package: ${targetPackage.name}`);
      return NextResponse.json(
        { error: `Stripe configuration missing for ${targetPackage.name}. Please contact support.` },
        { status: 500 }
      );
    }

    // console.log(`📦 Target package: ${targetPackage.name} ($${targetPackage.price})`);

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
      // console.log(`✅ Created new Stripe customer: ${stripeCustomerId}`);
    }

    // ✅ BEST PRACTICE: Use helper function to get valid payment method
    // This handles test environment edge cases and cleanup automatically
    const { paymentMethod, requiresSetupIntent, setupIntent } = await getValidPaymentMethod(
      user,
      validatedData.paymentMethodId
    );

    if (requiresSetupIntent) {
      if (validatedData.createSetupIntent && setupIntent) {
        return NextResponse.json({
          success: false,
          requiresSetupIntent: true,
          message: "Please add a payment method to continue with subscription renewal.",
          data: { setupIntent },
        });
      } else {
        return NextResponse.json(
          {
            error: "No valid payment method available. Please add a new payment method.",
            requiresSetupIntent: true,
          },
          { status: 400 }
        );
      }
    }

    if (!paymentMethod) {
      return NextResponse.json({ error: "No valid payment method found." }, { status: 400 });
    }

    // Set as default payment method
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethod.id,
      },
    });

    // ====================================
    // RENEWAL STRATEGY SELECTION
    // ====================================

    let renewalStrategy: "retry_payment" | "reactivate" | "create_new" = "create_new";
    let existingSubscription: Stripe.Subscription | null = null;

    // Check if there's an existing subscription in Stripe
    if (user.stripeSubscriptionId) {
      try {
        existingSubscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        // console.log(`📊 Existing subscription found:`, {
        //   id: existingSubscription.id,
        //   status: existingSubscription.status,
        //   cancelAt: existingSubscription.cancel_at,
        //   cancelAtPeriodEnd: existingSubscription.cancel_at_period_end,
        // });

        // Determine renewal strategy based on subscription status
        if (existingSubscription.status === "past_due" || existingSubscription.status === "unpaid") {
          renewalStrategy = "retry_payment";
          // console.log(`🔄 Strategy: RETRY PAYMENT (status: ${existingSubscription.status})`);
        } else if (
          (existingSubscription.status === "canceled" || existingSubscription.cancel_at_period_end) &&
          existingSubscription.cancel_at &&
          Date.now() < existingSubscription.cancel_at * 1000 + 30 * 24 * 60 * 60 * 1000 // Within 30 days grace period
        ) {
          renewalStrategy = "reactivate";
          // console.log(`🔄 Strategy: REACTIVATE (canceled but within grace period)`);
        } else if (existingSubscription.status === "incomplete") {
          renewalStrategy = "retry_payment";
          // console.log(`🔄 Strategy: RETRY PAYMENT (incomplete subscription)`);
        } else if (existingSubscription.status === "active") {
          // Subscription is already active
          // console.log(`✅ Subscription is already active`);
          return NextResponse.json({
            success: true,
            message: `Your ${targetPackage.name} subscription is already active!`,
            data: {
              grantEntryRewardToast: false,
              subscription: {
                id: existingSubscription.id,
                packageId: targetPackage._id,
                packageName: targetPackage.name,
                status: "active",
              },
            },
          });
        }
      } catch {
        // console.log(`⚠️ Could not retrieve existing subscription: ${_error}`);
        // console.log(`🔄 Will create new subscription`);
        renewalStrategy = "create_new";
      }
    }

    // ====================================
    // EXECUTE RENEWAL STRATEGY
    // ====================================

    if (renewalStrategy === "retry_payment" && existingSubscription) {
      // console.log(`💳 [RETRY_PAYMENT] Retrying payment for existing subscription`);

      // Get the latest invoice
      const latestInvoice = existingSubscription.latest_invoice as Stripe.Invoice | string;
      let invoiceId: string;

      if (typeof latestInvoice === "string") {
        invoiceId = latestInvoice;
      } else if (latestInvoice?.id) {
        invoiceId = latestInvoice.id;
      } else {
        console.error(`❌ No invoice found for subscription`);
        return NextResponse.json({ error: "No invoice found for payment retry" }, { status: 500 });
      }

      // console.log(`💳 Retrying payment for invoice: ${invoiceId}`);

      // Update subscription with new payment method
      await stripe.subscriptions.update(existingSubscription.id, {
        default_payment_method: paymentMethod.id,
      });

      // Retry the invoice payment
      try {
        const paidInvoice = await stripe.invoices.pay(invoiceId, {
          payment_method: paymentMethod.id,
        });

        if (paidInvoice.status === "paid") {
          try {
            await resumeAfterSuccessfulRenewalPayment(existingSubscription.id);
          } catch (resumeErr) {
            console.error(
              `[renew-subscription] Invoice paid but could not clear pause_collection for ${existingSubscription.id}:`,
              resumeErr
            );
          }
        }

        // console.log(`✅ Payment successful:`, {
        //   invoiceId: paidInvoice.id,
        //   status: paidInvoice.status,
        //   amountPaid: paidInvoice.amount_paid,
        // });

        // Update user subscription status
        if (user.subscription) {
          user.subscription.isActive = true;
          user.subscription.status = "active";
          user.subscription.autoRenew = true;
          user.subscription.cancelledAt = undefined; // Clear cancellation timestamp when reactivated
        }

        await user.save();

        return NextResponse.json({
          success: true,
          message: `Payment successful! Your ${targetPackage.name} subscription is now active.`,
          data: {
            /** Invoice paid — webhook grants cycle entries; client may celebrate approximate monthly grant */
            grantEntryRewardToast: true,
            subscription: {
              id: existingSubscription.id,
              packageId: targetPackage._id,
              packageName: targetPackage.name,
              price: targetPackage.price,
              status: "active",
            },
            payment: {
              invoiceId: paidInvoice.id,
              amount: paidInvoice.amount_paid! / 100,
              status: "paid",
            },
          },
        });
      } catch (paymentError) {
        console.error(`❌ Payment retry failed:`, paymentError);

        // Return payment intent if payment requires confirmation
        const invoice = await stripe.invoices.retrieve(invoiceId, {
          expand: ["payment_intent"],
        });

        const paymentIntent = (invoice as Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent }).payment_intent;

        if (paymentIntent && paymentIntent.client_secret) {
          const excessiveRetry = await analyzePaymentIntentForExcessiveRetry(stripe, paymentIntent.id);
          if (excessiveRetry.requiresDifferentPaymentMethod) {
            return NextResponse.json(
              {
                success: false,
                error: "Payment failed",
                details:
                  "This card cannot be charged right now due to repeated declines. Please use a different payment method.",
                requiresDifferentPaymentMethod: true,
                ...(excessiveRetry.failureReason && { failureReason: excessiveRetry.failureReason }),
              },
              { status: 400 }
            );
          }

          return NextResponse.json({
            success: false,
            requiresPaymentConfirmation: true,
            message: "Payment requires confirmation",
            data: {
              grantEntryRewardToast: false,
              paymentIntent: {
                id: paymentIntent.id,
                clientSecret: paymentIntent.client_secret,
                amount: paymentIntent.amount,
                status: paymentIntent.status,
              },
              subscription: {
                id: existingSubscription.id,
                packageId: targetPackage._id,
                packageName: targetPackage.name,
              },
            },
          });
        }

        const payErrRetry = await analyzeStripePayErrorForExcessiveRetry(stripe, paymentError);
        if (payErrRetry.requiresDifferentPaymentMethod) {
          return NextResponse.json(
            {
              success: false,
              error: "Payment failed",
              details:
                "This card cannot be charged right now due to repeated declines. Please use a different payment method.",
              requiresDifferentPaymentMethod: true,
              ...(payErrRetry.failureReason && { failureReason: payErrRetry.failureReason }),
            },
            { status: 400 }
          );
        }

        throw paymentError;
      }
    }

    if (renewalStrategy === "reactivate" && existingSubscription) {
      // console.log(`🔄 [REACTIVATE] Reactivating canceled subscription`);

      // Reactivate by removing cancel_at_period_end and updating payment method
      // ✅ FIX: Only set cancel_at_period_end: false (don't set cancel_at: null)
      const reactivatedSubscription = await stripe.subscriptions.update(existingSubscription.id, {
        cancel_at_period_end: false,
        default_payment_method: paymentMethod.id,
        // If user wants to change package, update the items
        ...(validatedData.packageId &&
          validatedData.packageId !== user.subscription?.packageId && {
            items: [
              {
                id: existingSubscription.items.data[0].id,
                price: targetPackage.stripePriceId,
              },
            ],
            proration_behavior: "create_prorations",
          }),
      });

      // console.log(`✅ Subscription reactivated:`, {
      //   id: reactivatedSubscription.id,
      //   status: reactivatedSubscription.status,
      //   cancelAtPeriodEnd: reactivatedSubscription.cancel_at_period_end,
      // });

      // Update user subscription (sync endDate from Stripe so UI shows correct next renewal)
      const reactivatePeriodEnd = getSubscriptionPeriodEnd(reactivatedSubscription);
      const reactivateEndDate =
        reactivatePeriodEnd != null ? new Date(reactivatePeriodEnd * 1000) : undefined;

      if (user.subscription) {
        user.subscription.isActive = true;
        user.subscription.status = "active";
        user.subscription.autoRenew = true;
        user.subscription.packageId = targetPackage._id;
        user.subscription.endDate = reactivateEndDate; // End of current billing period from Stripe
        user.subscription.cancelledAt = undefined; // Clear cancellation timestamp when reactivated
      }

      await user.save();

      return NextResponse.json({
        success: true,
        message: `Subscription reactivated! Your ${targetPackage.name} membership is now active.`,
        data: {
          /** Uncancel only — same billing period, no new charge, no new entry grant from this action */
          grantEntryRewardToast: false,
          subscription: {
            id: reactivatedSubscription.id,
            packageId: targetPackage._id,
            packageName: targetPackage.name,
            price: targetPackage.price,
            status: "active",
          },
        },
      });
    }

    // ====================================
    // CREATE NEW SUBSCRIPTION
    // ====================================

    // Use original join date when available so users who joined 25–27 keep 24th anchor when they renew
    const joinDateForAnchor = user.subscription?.startDate
      ? new Date(user.subscription.startDate)
      : new Date();
    const anchorParams = getSubscriptionCreateParamsForAnchor(joinDateForAnchor);
    const { metadata: anchorMetadata, ...restAnchorParams } = anchorParams;
    const hasAnchor = Object.keys(anchorParams).length > 0;
    const next24Date = hasAnchor ? new Date(getNextAnchorTimestamp(new Date()) * 1000) : null;

    const baseMetadata = {
      packageId: targetPackage._id,
      packageName: targetPackage.name,
      userEmail: user.email,
      userId: user._id.toString(),
      renewalType: "new_subscription",
      ...(typeof anchorMetadata === "object" && anchorMetadata !== null ? anchorMetadata : {}),
    };

    const createPayload: Stripe.SubscriptionCreateParams = {
      customer: stripeCustomerId,
      items: [{ price: targetPackage.stripePriceId }],
      default_payment_method: paymentMethod.id,
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
      collection_method: "charge_automatically",
      metadata: baseMetadata as Stripe.MetadataParam,
      ...restAnchorParams,
      ...(hasAnchor &&
        targetPackage &&
        next24Date &&
        targetPackage.stripeProductId && {
          add_invoice_items: [
            {
              price_data: {
                currency: "aud",
                unit_amount: Math.round(targetPackage.price * 100),
                product: targetPackage.stripeProductId,
              },
              quantity: 1,
            },
          ],
        }),
    };

    if (createPayload.collection_method !== undefined && createPayload.collection_method !== "charge_automatically") {
      throw new Error("Anchor billing requires charge_automatically");
    }

    const newSubscription = await stripe.subscriptions.create(createPayload);

    // console.log(`✅ New subscription created:`, {
    //   id: newSubscription.id,
    //   status: newSubscription.status,
    // });

    // Extract payment intent
    const latestInvoice = newSubscription.latest_invoice as Stripe.Invoice;
    const paymentIntent = (latestInvoice as Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent })?.payment_intent;

    const newSubscriptionPeriodEnd = getSubscriptionPeriodEnd(newSubscription);
    const newSubscriptionEndDate =
      newSubscriptionPeriodEnd != null ? new Date(newSubscriptionPeriodEnd * 1000) : undefined;

    // Check if payment completed immediately
    if (
      latestInvoice?.status === "paid" &&
      (newSubscription.status === "active" || newSubscription.status === "trialing")
    ) {
      // console.log(`✅ Payment completed immediately`);

      // Update user subscription (sync endDate from Stripe so UI shows correct next renewal)
      // trialing = paid first invoice (e.g. anchor 25-27 flow); grant access until trial_end
      user.subscription = {
        packageId: targetPackage._id,
        startDate: new Date(),
        endDate: newSubscriptionEndDate, // End of current billing period from Stripe
        isActive: true, // active or trialing both have access
        autoRenew: true,
        status: "active",
      };
      user.stripeSubscriptionId = newSubscription.id;

      // Add to processed payments atomically to prevent duplicates
      // Use invoice_ prefix for consistency with webhook processing
      await User.updateOne({ _id: user._id }, { $addToSet: { processedPayments: `invoice_${latestInvoice.id}` } });

      return NextResponse.json({
        success: true,
        message: `Welcome back! Your ${targetPackage.name} subscription is now active.`,
        data: {
          /** New subscription first invoice paid — entries granted via webhook */
          grantEntryRewardToast: true,
          subscription: {
            id: newSubscription.id,
            packageId: targetPackage._id,
            packageName: targetPackage.name,
            price: targetPackage.price,
            status: "active",
          },
        },
      });
    }

    // Payment requires confirmation
    if (!paymentIntent || !paymentIntent.client_secret) {
      console.error(`❌ No payment intent found`);
      return NextResponse.json({ error: "Failed to create payment intent" }, { status: 500 });
    }

    // Update user with new subscription (pending activation); set endDate so UI shows next renewal when payment completes
    user.subscription = {
      packageId: targetPackage._id,
      startDate: new Date(),
      endDate: newSubscriptionEndDate, // End of current billing period from Stripe
      isActive: false,
      autoRenew: true,
      status: newSubscription.status,
    };
    user.stripeSubscriptionId = newSubscription.id;

    await user.save();

    // console.log(`💳 Payment confirmation required`);

    return NextResponse.json({
      success: true,
      requiresPaymentConfirmation: true,
      message: "Complete payment to renew your subscription",
      data: {
        grantEntryRewardToast: false,
        paymentIntent: {
          id: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
          amount: paymentIntent.amount,
          currency: "aud",
          status: paymentIntent.status,
        },
        subscription: {
          id: newSubscription.id,
          packageId: targetPackage._id,
          packageName: targetPackage.name,
          price: targetPackage.price,
          status: newSubscription.status,
        },
      },
    });
  } catch (error) {
    console.error("❌ [RENEWAL] Error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request data", details: error.issues }, { status: 400 });
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json(
      {
        error: "Failed to renew subscription. Please try again.",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
