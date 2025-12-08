import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
// Klaviyo integration handled by webhook for best practices
// Benefits are now granted via webhook processing only

// Interface for user data returned in auto-login response
interface UserData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  subscription?: {
    packageId: string;
    startDate: Date;
    endDate?: Date;
    isActive: boolean;
    autoRenew?: boolean;
    status?: string;
  };
  entryWallet: number;
  rewardsPoints: number;
}

const confirmPaymentSchema = z.object({
  subscriptionId: z.string().min(1, "Subscription ID is required"),
  clientSecret: z.string().optional().nullable(),
  userId: z.string().optional(), // For new user registration flow
  paymentIntentId: z.string().optional(), // If PaymentIntent was already confirmed upfront, use it instead of confirming subscription's PaymentIntent
});

/**
 * POST /api/stripe/confirm-subscription-payment
 * Confirm payment for an existing subscription
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { subscriptionId, clientSecret, userId, paymentIntentId } = confirmPaymentSchema.parse(body);

    // console.log(`💳 Confirming payment for subscription: ${subscriptionId}`);
    // console.log(`💳 Request body:`, { subscriptionId, clientSecret: clientSecret ? "provided" : "null", userId });

    let user;

    // Handle two cases: new user registration (with userId) or existing user (with session)
    if (userId) {
      // New user registration flow - find user by provided userId
      // console.log(`🆕 New user registration flow - userId: ${userId}`);
      user = await User.findById(userId);
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
    } else {
      // Existing user flow - use session authentication
      // console.log(`👤 Existing user flow - checking session`);
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }

      user = await User.findById(session.user.id);
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      // Verify the subscription belongs to this user (only for existing users)
      if (user.stripeSubscriptionId !== subscriptionId) {
        return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
      }
    }

    // Retrieve the subscription from Stripe
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["latest_invoice.payment_intent"],
    });

    if (!subscription) {
      return NextResponse.json({ error: "Subscription not found in Stripe" }, { status: 404 });
    }

    // ✅ CRITICAL: Prevent double charging
    // If PaymentIntent was already confirmed upfront (for wallet payments), use it instead of confirming subscription's PaymentIntent
    let existingPaymentIntent = null;
    if (paymentIntentId) {
      try {
        existingPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        // Verify it belongs to this customer and has succeeded
        if (existingPaymentIntent.customer !== subscription.customer) {
          return NextResponse.json(
            {
              success: false,
              error: "PaymentIntent does not belong to this subscription's customer",
            },
            { status: 400 }
          );
        }

        if (existingPaymentIntent.status !== "succeeded") {
          return NextResponse.json(
            {
              success: false,
              error: `PaymentIntent status is ${existingPaymentIntent.status}, expected succeeded`,
            },
            { status: 400 }
          );
        }

        console.log(`✅ Found existing PaymentIntent: ${paymentIntentId} (already charged)`);
      } catch (error) {
        console.error("❌ Failed to retrieve existing PaymentIntent:", error);
        return NextResponse.json(
          {
            success: false,
            error: "Failed to retrieve existing PaymentIntent",
            details: error instanceof Error ? error.message : "Unknown error",
          },
          { status: 400 }
        );
      }
    }

    // Check if there's a payment intent that needs confirmation
    const latestInvoice = subscription.latest_invoice as {
      payment_intent?: { status: string; id: string };
      amount_due?: number;
      currency?: string;
      id?: string;
    } | null;
    let paymentIntent = latestInvoice?.payment_intent;

    // If we have an existing PaymentIntent that was already confirmed, use it instead
    if (existingPaymentIntent && latestInvoice) {
      // Verify the amounts match
      const invoiceAmount = latestInvoice.amount_due || 0;
      if (existingPaymentIntent.amount === invoiceAmount && existingPaymentIntent.currency === latestInvoice.currency) {
        console.log(`✅ Using existing PaymentIntent for subscription invoice (amounts match)`);

        // Pay the invoice using the payment method from the existing PaymentIntent
        // This prevents double charging since the PaymentIntent was already confirmed
        try {
          // Get the payment method from the existing PaymentIntent
          const paymentMethodId =
            typeof existingPaymentIntent.payment_method === "string"
              ? existingPaymentIntent.payment_method
              : existingPaymentIntent.payment_method?.id;

          if (paymentMethodId && latestInvoice.id) {
            // Pay the invoice using the payment method from the already-confirmed PaymentIntent
            await stripe.invoices.pay(latestInvoice.id, {
              payment_method: paymentMethodId,
            });

            console.log(`✅ Invoice paid using existing PaymentIntent's payment method`);

            // Update the paymentIntent reference to use the existing one
            paymentIntent = {
              id: existingPaymentIntent.id,
              status: "succeeded",
            } as { status: string; id: string };
          } else {
            console.warn(
              "⚠️ Could not extract payment method from existing PaymentIntent, falling back to normal flow"
            );
            // Fall through to normal flow
          }
        } catch (error) {
          console.error("❌ Failed to pay invoice with existing PaymentIntent:", error);
          // Fall through to normal flow
        }
      } else {
        console.warn(
          `⚠️ PaymentIntent amount mismatch: PaymentIntent=${existingPaymentIntent.amount}, Invoice=${invoiceAmount}. Using subscription's PaymentIntent.`
        );
        // Fall through to normal flow - use subscription's PaymentIntent
      }
    }

    // If no payment intent exists for incomplete subscription, pay the invoice directly
    if (!paymentIntent && subscription.status === "incomplete") {
      // console.log("🔧 No payment intent found for incomplete subscription, paying invoice directly...");
      try {
        // Get the customer's default payment method
        const customer = await stripe.customers.retrieve(subscription.customer as string);
        const defaultPaymentMethod = (customer as { invoice_settings?: { default_payment_method?: string } })
          .invoice_settings?.default_payment_method;

        if (!defaultPaymentMethod) {
          console.error("❌ No default payment method found for customer");
          return NextResponse.json(
            {
              success: false,
              error: "No payment method found",
              details: "Customer does not have a default payment method",
            },
            { status: 400 }
          );
        }

        // console.log(`💳 Using default payment method: ${defaultPaymentMethod}`);

        // Pay the invoice directly - this will create a PaymentIntent and trigger webhook
        const paidInvoice = await stripe.invoices.pay(latestInvoice?.id || "", {
          payment_method: defaultPaymentMethod,
        });

        // console.log(`💳 Paid invoice: ${paidInvoice.id}, status: ${paidInvoice.status}`);

        // Get the payment intent from the paid invoice
        const invoice = paidInvoice as { payment_intent?: string | { id: string; status: string } };
        if (invoice.payment_intent) {
          paymentIntent =
            typeof invoice.payment_intent === "string"
              ? await stripe.paymentIntents.retrieve(invoice.payment_intent)
              : invoice.payment_intent;
          // console.log(`💳 Invoice payment intent: ${paymentIntent?.id}, status: ${paymentIntent?.status}`);
        } else {
          // console.log("⚠️ No payment intent found in paid invoice - webhook will process benefits");

          // ✅ CRITICAL: Don't manually update subscription status here
          // Let the webhook handle ALL subscription processing to prevent duplicates

          // For new user registration, return user data for auto-login
          const responseData: {
            subscriptionId: string;
            status: string;
            paymentMethod: string;
            invoiceId: string;
            user?: UserData;
            autoLogin?: boolean;
          } = {
            subscriptionId: subscription.id,
            status: "active",
            paymentMethod: "invoice_payment",
            invoiceId: paidInvoice.id || "",
          };

          // If this is a new user registration (userId provided), include user data for auto-login
          if (userId) {
            responseData.user = {
              id: user._id,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
              role: user.role,
              subscription: user.subscription || undefined,
              entryWallet: user.entryWallet,
              rewardsPoints: user.rewardsPoints,
            };
            responseData.autoLogin = true;
          }

          // Return success - subscription should be active and webhook will process benefits
          return NextResponse.json({
            success: true,
            message: "Invoice paid successfully - subscription activated",
            data: responseData,
          });
        }
      } catch (error) {
        console.error("❌ Failed to create payment intent:", error);
        return NextResponse.json(
          {
            success: false,
            error: "Failed to create payment intent",
            details: error instanceof Error ? error.message : "Unknown error",
          },
          { status: 500 }
        );
      }
    }

    if (paymentIntent && (paymentIntent.status === "requires_payment_method" || paymentIntent.status === "succeeded")) {
      // Check if payment is already succeeded (when we created and confirmed it in one step)
      if (paymentIntent.status === "succeeded") {
        // console.log("✅ Payment already succeeded - activating subscription");

        // Update user subscription status
        if (user.subscription) {
          user.subscription.isActive = true;
          user.subscription.status = "active";
        }

        // Verify payment is fully settled before proceeding
        // console.log(`🔍 Payment succeeded, verifying payment settlement...`);
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second buffer

        // Re-fetch payment intent to ensure it's fully settled
        const verifiedPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntent.id);

        if (verifiedPaymentIntent.status === "succeeded") {
          // console.log(`✅ Payment fully verified and settled`);

          // Get the membership package for logging
          const packageId = user.subscription?.packageId?.toString() || subscription.metadata?.packageId;
          const membershipPackage = getPackageById(packageId);

          if (membershipPackage) {
            // Payment successful - benefits will be granted via webhook
            // console.log(`✅ SUBSCRIPTION PAYMENT SUCCESS: Payment ${paymentIntent.id} confirmed successfully`);
            // console.log(`📋 Benefits will be granted via webhook processing shortly`);
          } else {
            console.error(`❌ Membership package not found for packageId: ${packageId}`);
          }
        } else {
          console.error(`❌ Payment verification failed: ${verifiedPaymentIntent.status}`);
        }

        await user.save();

        // For new user registration, return user data for auto-login
        const responseData: {
          subscriptionId: string;
          status: string;
          paymentIntentStatus: string;
          user?: UserData;
          autoLogin?: boolean;
        } = {
          subscriptionId: subscription.id,
          status: "active",
          paymentIntentStatus: paymentIntent.status,
        };

        // If this is a new user registration (userId provided), include user data for auto-login
        if (userId) {
          responseData.user = {
            id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            subscription: user.subscription || undefined,
            entryWallet: user.entryWallet,
            rewardsPoints: user.rewardsPoints,
          };
          responseData.autoLogin = true;
        }

        return NextResponse.json({
          success: true,
          message: "Payment confirmed successfully",
          data: responseData,
        });
      }

      // If we have a client secret, try to confirm the payment
      if (clientSecret) {
        try {
          const confirmedPaymentIntent = await stripe.paymentIntents.confirm(clientSecret);

          if (confirmedPaymentIntent.status === "succeeded") {
            // console.log("✅ Payment confirmed successfully");

            // Update Stripe subscription status to active
            try {
              const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
                metadata: {
                  ...subscription.metadata,
                  payment_confirmed: "true",
                },
              });
              // console.log(`✅ Stripe subscription updated to status: ${updatedSubscription.status}`);
            } catch (stripeUpdateError) {
              console.error("❌ Failed to update Stripe subscription:", stripeUpdateError);
              // Continue with local update even if Stripe update fails
            }

            // Update user subscription status
            if (user.subscription) {
              user.subscription.isActive = true;
              user.subscription.status = "active";
            }

            // Set subscription status - benefits will be added via webhook to avoid duplication
            if (!user.subscription?.packageId && subscription?.metadata?.packageId) {
              if (!user.subscription) {
                user.subscription = {
                  packageId: subscription.metadata.packageId,
                  startDate: new Date(),
                  isActive: true,
                  status: "active",
                  autoRenew: true,
                  pendingChange: undefined, // Initialize pendingChange field for subscription management
                };
              } else {
                user.subscription.packageId = subscription.metadata.packageId;
                user.subscription.isActive = true;
                user.subscription.status = "active";
              }
              // console.log(`📦 Set subscription packageId from metadata: ${subscription.metadata.packageId}`);
            }

            // Verify payment is fully settled before proceeding
            // console.log(`🔍 Payment confirmed, verifying payment settlement...`);
            await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second buffer

            // Re-fetch payment intent to ensure it's fully settled
            const verifiedPaymentIntent = await stripe.paymentIntents.retrieve(confirmedPaymentIntent.id);

            if (verifiedPaymentIntent.status === "succeeded") {
              // console.log(`✅ Payment fully verified and settled`);

              // Get the membership package for logging
              const membershipPackage = getPackageById(
                user.subscription?.packageId || subscription.metadata?.packageId
              );

              if (membershipPackage) {
                // Payment successful - benefits will be granted via webhook
                // console.log(
                //   `✅ SUBSCRIPTION PAYMENT SUCCESS: Payment ${confirmedPaymentIntent.id} confirmed successfully`
                // );
                // console.log(`📋 Benefits will be granted via webhook processing shortly`);
                // ✅ Klaviyo integration handled by webhook for reliability and best practices
                // console.log(`📊 Klaviyo events will be tracked via webhook when payment is confirmed`);
              } else {
                console.error(`❌ Membership package not found for immediate processing`);
              }
            } else {
              console.error(`❌ Payment verification failed: ${verifiedPaymentIntent.status}`);
            }

            await user.save();

            // For new user registration, return user data for auto-login
            const responseData: {
              subscriptionId: string;
              status: string;
              paymentIntentStatus: string;
              user?: UserData;
              autoLogin?: boolean;
            } = {
              subscriptionId: subscription.id,
              status: subscription.status,
              paymentIntentStatus: confirmedPaymentIntent.status,
            };

            // If this is a new user registration (userId provided), include user data for auto-login
            if (userId) {
              responseData.user = {
                id: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                subscription: user.subscription || undefined,
                entryWallet: user.entryWallet,
                rewardsPoints: user.rewardsPoints,
              };
              responseData.autoLogin = true;
            }

            return NextResponse.json({
              success: true,
              message: "Payment confirmed successfully",
              data: responseData,
            });
          } else {
            return NextResponse.json(
              {
                success: false,
                error: "Payment confirmation failed",
                details: `Payment intent status: ${confirmedPaymentIntent.status}`,
              },
              { status: 400 }
            );
          }
        } catch (stripeError) {
          console.error("❌ Stripe payment confirmation failed:", stripeError);
          return NextResponse.json(
            {
              success: false,
              error: "Payment confirmation failed",
              details: stripeError instanceof Error ? stripeError.message : "Unknown error",
            },
            { status: 400 }
          );
        }
      } else {
        // No client secret provided, but payment is required
        return NextResponse.json(
          {
            success: false,
            error: "Payment method required",
            details: "This subscription requires payment confirmation",
          },
          { status: 400 }
        );
      }
    } else if (subscription.status === "incomplete") {
      // Subscription is incomplete - this is expected for new subscriptions
      // console.log("⏳ Subscription is incomplete - this is normal for new subscriptions");

      // For incomplete subscriptions, we need to confirm the payment intent
      if (paymentIntent && paymentIntent.status === "requires_payment_method") {
        if (clientSecret) {
          try {
            // console.log("💳 Confirming payment intent for incomplete subscription");
            const confirmedPaymentIntent = await stripe.paymentIntents.confirm(clientSecret);

            if (confirmedPaymentIntent.status === "succeeded") {
              // console.log("✅ Payment confirmed successfully for incomplete subscription");

              // Note: Stripe will automatically update subscription status to active via webhook
              // when invoice.payment_succeeded event is processed
              // console.log(`✅ Payment confirmed - subscription will be activated via webhook`);

              // Update user subscription status
              if (user.subscription) {
                user.subscription.isActive = true;
                user.subscription.status = "active";
              }

              // Verify payment is fully settled before proceeding
              // console.log(`🔍 Payment confirmed, verifying payment settlement...`);
              await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second buffer

              // Re-fetch payment intent to ensure it's fully settled
              const verifiedPaymentIntent = await stripe.paymentIntents.retrieve(confirmedPaymentIntent.id);

              if (verifiedPaymentIntent.status === "succeeded") {
                // console.log(`✅ Payment fully verified and settled`);

                // Get the membership package for logging
                const membershipPackage = getPackageById(
                  user.subscription?.packageId || subscription.metadata?.packageId
                );

                if (membershipPackage) {
                  // Payment successful - benefits will be granted via webhook
                  // console.log(
                  //   `✅ SUBSCRIPTION PAYMENT SUCCESS: Payment ${confirmedPaymentIntent.id} confirmed successfully`
                  // );
                  // console.log(`📋 Benefits will be granted via webhook processing shortly`);
                } else {
                  console.error(`❌ Membership package not found for immediate processing`);
                }
              } else {
                console.error(`❌ Payment verification failed: ${verifiedPaymentIntent.status}`);
              }

              await user.save();

              return NextResponse.json({
                success: true,
                message: "Payment confirmed successfully",
                data: {
                  subscriptionId: subscription.id,
                  status: "active",
                  paymentIntentStatus: confirmedPaymentIntent.status,
                },
              });
            } else {
              return NextResponse.json(
                {
                  success: false,
                  error: "Payment confirmation failed",
                  details: `Payment intent status: ${confirmedPaymentIntent.status}`,
                },
                { status: 400 }
              );
            }
          } catch (stripeError) {
            console.error("❌ Stripe payment confirmation failed:", stripeError);
            return NextResponse.json(
              {
                success: false,
                error: "Payment confirmation failed",
                details: stripeError instanceof Error ? stripeError.message : "Unknown error",
              },
              { status: 400 }
            );
          }
        } else {
          // No client secret provided - try to create one using the existing payment intent
          // console.log("🔑 No client secret provided, using existing payment intent");
          try {
            const confirmedPaymentIntent = await stripe.paymentIntents.confirm(paymentIntent.id);

            if (confirmedPaymentIntent.status === "succeeded") {
              // console.log("✅ Payment confirmed successfully using existing payment intent");

              // Note: Stripe will automatically update subscription status to active via webhook
              // when invoice.payment_succeeded event is processed
              // console.log(`✅ Payment confirmed - subscription will be activated via webhook`);

              // Update user subscription status
              if (user.subscription) {
                user.subscription.isActive = true;
                user.subscription.status = "active";
              }

              // Verify payment is fully settled before proceeding
              // console.log(`🔍 Payment confirmed, verifying payment settlement...`);
              await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second buffer

              // Re-fetch payment intent to ensure it's fully settled
              const verifiedPaymentIntent = await stripe.paymentIntents.retrieve(confirmedPaymentIntent.id);

              if (verifiedPaymentIntent.status === "succeeded") {
                // console.log(`✅ Payment fully verified and settled`);

                // Get the membership package for logging
                const membershipPackage = getPackageById(
                  user.subscription?.packageId || subscription.metadata?.packageId
                );

                if (membershipPackage) {
                  // Payment successful - benefits will be granted via webhook
                  // console.log(
                  //   `✅ SUBSCRIPTION PAYMENT SUCCESS: Payment ${confirmedPaymentIntent.id} confirmed successfully`
                  // );
                  // console.log(`📋 Benefits will be granted via webhook processing shortly`);
                } else {
                  console.error(`❌ Membership package not found for immediate processing`);
                }
              } else {
                console.error(`❌ Payment verification failed: ${verifiedPaymentIntent.status}`);
              }

              await user.save();

              // For new user registration, return user data for auto-login
              const responseData: {
                subscriptionId: string;
                status: string;
                paymentIntentStatus: string;
                user?: UserData;
                autoLogin?: boolean;
              } = {
                subscriptionId: subscription.id,
                status: "active",
                paymentIntentStatus: confirmedPaymentIntent.status,
              };

              // If this is a new user registration (userId provided), include user data for auto-login
              if (userId) {
                responseData.user = {
                  id: user._id,
                  email: user.email,
                  firstName: user.firstName,
                  lastName: user.lastName,
                  role: user.role,
                  subscription: user.subscription || undefined,
                  entryWallet: user.entryWallet,
                  rewardsPoints: user.rewardsPoints,
                };
                responseData.autoLogin = true;
              }

              return NextResponse.json({
                success: true,
                message: "Payment confirmed successfully",
                data: responseData,
              });
            } else {
              return NextResponse.json(
                {
                  success: false,
                  error: "Payment confirmation failed",
                  details: `Payment intent status: ${confirmedPaymentIntent.status}`,
                },
                { status: 400 }
              );
            }
          } catch (stripeError) {
            console.error("❌ Stripe payment confirmation failed:", stripeError);
            return NextResponse.json(
              {
                success: false,
                error: "Payment confirmation failed",
                details: stripeError instanceof Error ? stripeError.message : "Unknown error",
              },
              { status: 400 }
            );
          }
        }
      } else {
        // Payment intent not found or in wrong state
        // console.log(
        //   `⚠️ Payment intent not found or wrong state. Found: ${paymentIntent ? paymentIntent.status : "null"}`
        // );
        return NextResponse.json(
          {
            success: false,
            error: "Payment intent not found",
            details: `Unable to process payment for this subscription. Payment intent status: ${
              paymentIntent ? paymentIntent.status : "not found"
            }`,
          },
          { status: 400 }
        );
      }
    } else if (subscription.status === "active") {
      // Subscription is already active
      // console.log("✅ Subscription is already active");

      return NextResponse.json({
        success: true,
        message: "Subscription is already active",
        data: {
          subscriptionId: subscription.id,
          status: subscription.status,
        },
      });
    } else {
      // Subscription is in an unexpected state
      // console.log(`⚠️ Unexpected subscription status: ${subscription.status}`);
      return NextResponse.json(
        {
          success: false,
          error: "Invalid subscription state",
          details: `Subscription status: ${subscription.status}. Expected: incomplete or active`,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("❌ Error confirming subscription payment:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to confirm payment. Please try again or contact support.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// ✅ Webhook now handles all benefits (entries/points/major draw) processing in one place
