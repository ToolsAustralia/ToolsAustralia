import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { cancelDuplicatePaymentIntents } from "@/utils/payment/stripe/subscription-utils";
import {
  findAvailablePaymentMethod,
  verifyPaymentMethodAttachment,
  attachPaymentMethodToCustomer,
  setDefaultPaymentMethod,
} from "@/utils/payment/stripe/payment-method-utils";
import { getCustomerWithDefaultPaymentMethod } from "@/utils/payment/stripe/customer-utils";
import { analyzeStripePayErrorForExcessiveRetry } from "@/utils/payment/stripe/stripe-excessive-retry";
import { executeBackgroundJob } from "@/utils/webhook/background-jobs";
import { ErrorLoggingService } from "@/services/error-reporting/ErrorLoggingService";
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
    packageId: string | null;
    startDate: Date;
    endDate?: Date;
    cancelledAt?: Date;
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
  paymentMethodId: z.string().optional(), // Payment method from SetupIntent (for new cards)
});

/**
 * POST /api/stripe/confirm-subscription-payment
 * Confirm payment for an existing subscription
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { subscriptionId, clientSecret, userId, paymentMethodId } = confirmPaymentSchema.parse(body);

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
        // ✅ FALLBACK: If session is missing but subscription exists, try to find user from subscription
        // This handles retry scenarios where session might be lost but subscription is valid
        if (subscriptionId) {
          try {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            if (subscription.customer) {
              const customerId = typeof subscription.customer === "string" 
                ? subscription.customer 
                : subscription.customer.id;
              const fallbackUser = await User.findOne({ stripeCustomerId: customerId });
              if (fallbackUser) {
                // Found user via subscription - verify subscription belongs to this user
                if (fallbackUser.stripeSubscriptionId !== subscriptionId) {
                  return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
                }
                // Use found user instead of session user
                user = fallbackUser;
                console.log("✅ Fallback: Found user from subscription:", fallbackUser._id);
              }
            }
          } catch (fallbackError) {
            // Fallback failed - will return authentication error below
            console.warn("⚠️ Session missing and fallback user lookup failed:", fallbackError);
          }
        }
        
        // If fallback also failed or no subscriptionId provided, return authentication error
        if (!user) {
          return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }
      } else {
        // Session exists - use normal flow
        user = await User.findById(session.user.id);
        if (!user) {
          return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Verify the subscription belongs to this user (only for existing users)
        if (user.stripeSubscriptionId !== subscriptionId) {
          return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
        }
      }
    }

    // Retrieve the subscription from Stripe with expanded payment intent
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["latest_invoice.payment_intent"],
    });

    if (!subscription) {
      return NextResponse.json({ error: "Subscription not found in Stripe" }, { status: 404 });
    }

    // ✅ HARD RULE (Option A): Do not confirm first subscription charge on the backend.
    // First charge must be confirmed client-side via stripe.confirmPayment() with the invoice PaymentIntent.
    if ((subscription.status as string) === "incomplete") {
      return NextResponse.json(
        {
          success: false,
          error: "Use client-side confirmPayment for first subscription payment.",
          details: "The first subscription payment must be completed in the browser. Do not call this endpoint for the initial charge.",
          code: "FIRST_CHARGE_CLIENT_ONLY",
        },
        { status: 400 }
      );
    }

    // ✅ OPTIMIZED: Use already-expanded PaymentIntent from subscription if available
    // Check if PaymentIntent is already expanded from subscription retrieval
    let alreadyExpandedPaymentIntent: Stripe.PaymentIntent | null = null;
    if (subscription.latest_invoice) {
      const invoice = subscription.latest_invoice;
      if (typeof invoice === "object" && "payment_intent" in invoice) {
        const paymentIntent = (invoice as { payment_intent?: Stripe.PaymentIntent | string }).payment_intent;
        if (paymentIntent && typeof paymentIntent === "object" && "id" in paymentIntent) {
          alreadyExpandedPaymentIntent = paymentIntent as Stripe.PaymentIntent;
        }
      }
    }

    // ✅ AUTHORIZATION GUARD: If clientSecret is provided, validate it's the invoice PaymentIntent, not upfront
    if (clientSecret) {
      try {
        // Extract PaymentIntent ID from clientSecret
        const paymentIntentId = clientSecret.split("_secret_")[0];
        
        // ✅ OPTIMIZED: Use already-expanded PaymentIntent if it matches, otherwise retrieve
        let providedPaymentIntent: Stripe.PaymentIntent;
        if (alreadyExpandedPaymentIntent && alreadyExpandedPaymentIntent.id === paymentIntentId) {
          providedPaymentIntent = alreadyExpandedPaymentIntent;
        } else {
          providedPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        }
        
        // ✅ VALIDATION: Ensure PaymentIntent belongs to this subscription's invoice
        const expectedInvoiceId = subscription.latest_invoice 
          ? (typeof subscription.latest_invoice === "string" ? subscription.latest_invoice : subscription.latest_invoice.id)
          : null;
        
        if (expectedInvoiceId && providedPaymentIntent.metadata?.invoice_id !== expectedInvoiceId) {
          console.error(`❌ CRITICAL: PaymentIntent ${paymentIntentId} does not belong to subscription ${subscriptionId} invoice ${expectedInvoiceId}`, {
            paymentIntentId,
            subscriptionId,
            expectedInvoiceId,
            actualInvoiceId: providedPaymentIntent.metadata?.invoice_id,
            userId: user?._id?.toString(),
          });
          
          return NextResponse.json(
            {
              success: false,
              error: "Invalid PaymentIntent",
              details: "PaymentIntent does not belong to this subscription's invoice.",
              code: "PAYMENT_INTENT_MISMATCH",
            },
            { status: 400 }
          );
        }
        
        // ✅ VALIDATION: Ensure PaymentIntent is marked as invoice PaymentIntent
        if (providedPaymentIntent.metadata?.isInvoicePaymentIntent !== "true") {
          console.warn(`⚠️ PaymentIntent ${paymentIntentId} is not marked as invoice PaymentIntent`, {
            paymentIntentId,
            subscriptionId,
            metadata: providedPaymentIntent.metadata,
          });
          // Don't reject, but log warning - might be legacy PaymentIntent
        }
        
        console.log(`✅ PaymentIntent validation passed: ${paymentIntentId} is valid for subscription ${subscriptionId}`);
      } catch (validationError) {
        console.error(`❌ Failed to validate PaymentIntent: ${validationError}`);
        // Continue - validation failure shouldn't block if PaymentIntent is valid
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

    // If no payment intent exists for incomplete subscription, pay the invoice directly
    // Stripe returns status "incomplete" for subscriptions with unpaid first invoice; SDK types may omit it
    if (!paymentIntent && (subscription.status as string) === "incomplete") {
      // console.log("🔧 No payment intent found for incomplete subscription, paying invoice directly...");
      try {
        // ✅ OPTIMIZED: Use already-expanded PaymentIntent if available, otherwise retrieve
        if (alreadyExpandedPaymentIntent) {
          paymentIntent = alreadyExpandedPaymentIntent;
          console.log(`✅ Using already-expanded PaymentIntent: ${paymentIntent.id}`);
        } else if (latestInvoice?.payment_intent) {
          const pi = latestInvoice.payment_intent;
          if (typeof pi === "string") {
            // PaymentIntent is a string ID - retrieve it
            try {
              const retrievedPI = await stripe.paymentIntents.retrieve(pi);
              if (retrievedPI) {
                paymentIntent = retrievedPI;
                console.log(`✅ Found PaymentIntent by retrieving ID: ${retrievedPI.id}`);
              }
            } catch (retrieveError) {
              console.warn(`⚠️ Failed to retrieve PaymentIntent ${pi}: ${retrieveError}`);
            }
          } else if (pi && typeof pi === "object" && "id" in pi) {
            // PaymentIntent is already an object - use it directly
            paymentIntent = pi as Stripe.PaymentIntent;
            console.log(`✅ Found PaymentIntent in invoice: ${pi.id}`);
          }
        }

        // ✅ OPTIMIZED: Use utility function for payment method discovery (parallelizes fallback strategies)
        if (!paymentIntent) {
          // Get customer (with safety check)
          const customer = await getCustomerWithDefaultPaymentMethod(subscription.customer as string);
          
          // ✅ SAFETY: Check if customer is deleted
          if ("deleted" in customer && customer.deleted) {
            return NextResponse.json(
              {
                success: false,
                error: "Customer not found",
                details: "Stripe customer has been deleted",
                suggestion: "Please contact support to resolve this issue.",
              },
              { status: 404 }
            );
          }

          // ✅ CRITICAL: Use provided paymentMethodId if available (from new SetupIntent), otherwise find default
          // This ensures new payment methods are used instead of old failed ones
          let defaultPaymentMethod: string | undefined;
          if (paymentMethodId) {
            // Use the new payment method from SetupIntent
            console.log("✅ Using provided payment method from SetupIntent:", paymentMethodId);
            defaultPaymentMethod = paymentMethodId;
          } else {
            // Fallback to finding default payment method (for existing users with saved cards)
            console.log("⚠️ No paymentMethodId provided, finding default payment method...");
            const foundPaymentMethod = await findAvailablePaymentMethod(customer, user);
            defaultPaymentMethod = foundPaymentMethod || undefined;
          }

          if (!defaultPaymentMethod) {
            console.error("❌ No payment method found for customer after all fallback strategies", {
              customerId: customer.id,
              hasSavedPaymentMethods: !!(user?.savedPaymentMethods && user.savedPaymentMethods.length > 0),
              subscriptionId: subscription.id,
              subscriptionStatus: subscription.status,
              invoiceId: latestInvoice?.id,
            });

            // ✅ ENHANCED: Provide actionable error message based on context
            const errorMessage =
              (subscription.status as string) === "incomplete"
                ? "Your subscription was created but no payment method was found to complete the payment. This usually happens when the payment method wasn't properly saved during checkout."
                : "No payment method found to complete this subscription payment.";

            const suggestion =
              user?.savedPaymentMethods && user.savedPaymentMethods.length > 0
                ? "Please try again, or go to your account settings to add a new payment method."
                : "Please go to your account settings to add a payment method, then try completing your subscription again.";

            return NextResponse.json(
              {
                success: false,
                error: "No payment method found",
                details: errorMessage,
                suggestion: suggestion,
                recoverySteps: ["Go to your account settings", "Add or verify your payment method", "Return here to complete your subscription"],
              },
              { status: 400 }
            );
          }

          // ✅ OPTIMIZED: Verify and attach payment method using utility (if needed)
          const isAttached = await verifyPaymentMethodAttachment(defaultPaymentMethod, customer.id);
          if (!isAttached) {
            try {
              await attachPaymentMethodToCustomer(defaultPaymentMethod, customer.id);
              await setDefaultPaymentMethod(customer.id, defaultPaymentMethod);
            } catch (attachError) {
              const errorMessage = attachError instanceof Error ? attachError.message : String(attachError);
              const errorCode = attachError && typeof attachError === "object" && "code" in attachError ? String(attachError.code) : undefined;
              const declineCode = attachError && typeof attachError === "object" && "decline_code" in attachError ? String(attachError.decline_code) : undefined;

              console.error(`❌ Failed to verify/attach payment method ${defaultPaymentMethod}:`, attachError);

              return NextResponse.json(
                {
                  success: false,
                  error: "Payment method verification failed",
                  details: errorMessage || "The payment method could not be verified or attached to your account.",
                  code: errorCode,
                  decline_code: declineCode,
                  suggestion: "Please try again with a different payment method or contact support if the issue persists.",
                },
                { status: 400 }
              );
            }
          }

          // Pay the invoice directly - this will create a PaymentIntent and trigger webhook
          // ✅ CRITICAL: Use provided paymentMethodId if available (from new SetupIntent), otherwise use defaultPaymentMethod
          // This ensures new payment methods are used instead of old failed ones
          const paymentMethodToUse = paymentMethodId || defaultPaymentMethod;
          console.log("💳 Paying invoice with payment method:", paymentMethodToUse, {
            isNewPaymentMethod: !!paymentMethodId,
            isDefaultPaymentMethod: !paymentMethodId,
          });
          
          let paidInvoice;
          try {
            paidInvoice = await stripe.invoices.pay(latestInvoice?.id || "", {
              payment_method: paymentMethodToUse,
            });
          } catch (payError) {
            const errorMessage = payError instanceof Error ? payError.message : String(payError);
            const errorCode = payError && typeof payError === "object" && "code" in payError ? String(payError.code) : undefined;
            const errorType = payError && typeof payError === "object" && "type" in payError ? String(payError.type) : undefined;
            const declineCode = payError && typeof payError === "object" && "decline_code" in payError ? String(payError.decline_code) : undefined;
            
            console.error("❌ Failed to pay invoice:", payError);
            console.error("❌ Invoice payment error details (VERCEL LOGS):", {
              invoiceId: latestInvoice?.id,
              paymentMethodId: defaultPaymentMethod,
              customerId: customer.id,
              subscriptionId: subscription.id,
              errorType,
              errorCode,
              declineCode,
              errorMessage,
              fullError: JSON.stringify(payError),
            });
            
            // ✅ CRITICAL: Handle 3DS authentication requirement
            // When PaymentIntent requires 3DS, return client_secret for frontend handling
            if (errorCode === "invoice_payment_intent_requires_action") {
              console.log("⏳ Payment requires 3DS authentication - retrieving PaymentIntent for frontend handling");
              
              try {
                // Retrieve the invoice with expanded PaymentIntent
                const invoiceWithPaymentIntent = await stripe.invoices.retrieve(latestInvoice?.id || "", {
                  expand: ["payment_intent"],
                });

                const paymentIntent = (invoiceWithPaymentIntent as Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent }).payment_intent;
                
                if (paymentIntent && typeof paymentIntent === "object" && "client_secret" in paymentIntent) {
                  const paymentIntentObj = paymentIntent as Stripe.PaymentIntent;
                  
                  if (paymentIntentObj.client_secret) {
                    console.log("✅ Returning PaymentIntent client_secret for 3DS handling");
                    
                    return NextResponse.json({
                      success: false,
                      requiresPaymentConfirmation: true,
                      message: "3D Secure authentication required. Please complete the authentication.",
                      data: {
                        paymentIntent: {
                          id: paymentIntentObj.id,
                          clientSecret: paymentIntentObj.client_secret,
                          amount: paymentIntentObj.amount,
                          currency: paymentIntentObj.currency,
                          status: paymentIntentObj.status,
                        },
                        subscription: {
                          id: subscription.id,
                          status: subscription.status,
                        },
                        invoiceId: latestInvoice?.id,
                      },
                    });
                  }
                }
              } catch (retrieveError) {
                console.error("❌ Failed to retrieve PaymentIntent for 3DS handling:", retrieveError);
                // Fall through to return generic error
              }
            }
            
            const excessiveRetry = await analyzeStripePayErrorForExcessiveRetry(stripe, payError);

            // ✅ CRITICAL FIX: Return properly formatted error response instead of throwing
            // This ensures frontend can extract the actual Stripe error
            return NextResponse.json(
              {
                success: false,
                error: "Payment failed",
                details: errorMessage || "Unable to process payment",
                code: errorCode,
                decline_code: declineCode,
                type: errorType,
                ...(excessiveRetry.requiresDifferentPaymentMethod && {
                  requiresDifferentPaymentMethod: true,
                  ...(excessiveRetry.failureReason && { failureReason: excessiveRetry.failureReason }),
                }),
              },
              { status: 400 }
            );
          }

          // console.log(`💳 Paid invoice: ${paidInvoice.id}, status: ${paidInvoice.status}`);

          // ✅ OPTIMIZED: Get payment intent from paid invoice (already available from invoice.payment_intent)
          const invoice = paidInvoice as { payment_intent?: string | Stripe.PaymentIntent };
          if (invoice.payment_intent) {
            if (typeof invoice.payment_intent === "string") {
              // Only retrieve if it's a string ID
              paymentIntent = await stripe.paymentIntents.retrieve(invoice.payment_intent);
            } else {
              // Already an object - use directly
              paymentIntent = invoice.payment_intent;
            }
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
      // ✅ OPTIMIZED: Use utility function for deduplication (non-blocking, fire-and-forget)
      const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      const invoicePaymentIntentId = typeof paymentIntent === "string" ? paymentIntent : paymentIntent.id;
      cancelDuplicatePaymentIntents(subscriptionId, customerId, invoicePaymentIntentId);

      // Check if payment is already succeeded (when we created and confirmed it in one step)
      if (paymentIntent.status === "succeeded") {
        // console.log("✅ Payment already succeeded - activating subscription");

        // Update user subscription status (webhook handles final updates)
        if (user.subscription) {
          user.subscription.isActive = true;
          user.subscription.status = "active";
        }

        // ✅ OPTIMIZED: Webhook handles payment verification and user updates
        // PaymentIntent status is already known after retrieval
        // No need to verify again - webhook will handle verification and updates

        // ✅ OPTIMIZED: Make user save fire-and-forget (webhook handles final updates)
        user.save().catch((error) => {
          console.warn("Non-critical user save failed (webhook will handle):", error);
        });

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
          // ✅ CRITICAL: If new paymentMethodId is provided and PaymentIntent requires payment method,
          // update the PaymentIntent to use the new payment method before confirming
          // This ensures retry attempts use the new card instead of the old failed one
          if (paymentMethodId && paymentIntent.status === "requires_payment_method") {
            console.log("✅ Updating PaymentIntent with new payment method before confirmation:", paymentMethodId);
            try {
              const paymentIntentId = typeof paymentIntent === "string" ? paymentIntent : paymentIntent.id;
              await stripe.paymentIntents.update(paymentIntentId, {
                payment_method: paymentMethodId,
              });
              console.log("✅ PaymentIntent updated with new payment method");
            } catch (updateError) {
              console.error("❌ Failed to update PaymentIntent with new payment method:", updateError);
              // Continue with confirmation - might still work if payment method is already attached
            }
          }
          
          const confirmedPaymentIntent = await stripe.paymentIntents.confirm(clientSecret);

          if (confirmedPaymentIntent.status === "succeeded") {
            // console.log("✅ Payment confirmed successfully");

            // ✅ OPTIMIZED: Update Stripe subscription metadata as fire-and-forget (non-critical)
            executeBackgroundJob("Update subscription metadata", async () => {
              try {
                await stripe.subscriptions.update(subscriptionId, {
                  metadata: {
                    ...subscription.metadata,
                    payment_confirmed: "true",
                  },
                });
                // console.log(`✅ Stripe subscription updated to status: active`);
              } catch (stripeUpdateError) {
                console.error("❌ Failed to update Stripe subscription:", stripeUpdateError);
                // Continue - metadata update is non-critical
              }
            });

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
                };
              } else {
                user.subscription.packageId = subscription.metadata.packageId;
                user.subscription.isActive = true;
                user.subscription.status = "active";
              }
              // console.log(`📦 Set subscription packageId from metadata: ${subscription.metadata.packageId}`);
            }

            // ✅ OPTIMIZED: Webhook handles payment verification and user updates
            // PaymentIntent status is already known after confirmation
            // No need to verify again - webhook will handle verification and updates

            // ✅ OPTIMIZED: Make user save fire-and-forget (webhook handles final updates)
            user.save().catch((error) => {
              console.warn("Non-critical user save failed (webhook will handle):", error);
            });

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
      } else if ((subscription.status as string) === "incomplete") {
      // Subscription is incomplete - this is expected for new subscriptions
      // console.log("⏳ Subscription is incomplete - this is normal for new subscriptions");

      // ✅ OPTIMIZED: Use utility function for deduplication (non-blocking, fire-and-forget)
      if (paymentIntent) {
        const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
        const invoicePaymentIntentId = typeof paymentIntent === "string" ? paymentIntent : paymentIntent.id;
        cancelDuplicatePaymentIntents(subscriptionId, customerId, invoicePaymentIntentId);
      }

      // For incomplete subscriptions, we need to confirm the payment intent
      if (paymentIntent && paymentIntent.status === "requires_payment_method") {
        if (clientSecret) {
          try {
            // ✅ CRITICAL: If new paymentMethodId is provided, update the PaymentIntent to use it
            // This ensures retry attempts use the new card instead of the old failed one
            if (paymentMethodId) {
              console.log("✅ Updating PaymentIntent with new payment method for incomplete subscription:", paymentMethodId);
              try {
                const paymentIntentId = typeof paymentIntent === "string" ? paymentIntent : paymentIntent.id;
                await stripe.paymentIntents.update(paymentIntentId, {
                  payment_method: paymentMethodId,
                });
                console.log("✅ PaymentIntent updated with new payment method");
              } catch (updateError) {
                console.error("❌ Failed to update PaymentIntent with new payment method:", updateError);
                // Continue with confirmation - might still work if payment method is already attached
              }
            }
            
            // console.log("💳 Confirming payment intent for incomplete subscription");
            const confirmedPaymentIntent = await stripe.paymentIntents.confirm(clientSecret);

            if (confirmedPaymentIntent.status === "succeeded") {
              // console.log("✅ Payment confirmed successfully for incomplete subscription");

              // Note: Stripe will automatically update subscription status to active via webhook
              // when invoice.payment_succeeded event is processed
              // console.log(`✅ Payment confirmed - subscription will be activated via webhook`);

              // Update user subscription status (webhook handles final updates)
              if (user.subscription) {
                user.subscription.isActive = true;
                user.subscription.status = "active";
              }

              // ✅ OPTIMIZED: Webhook handles payment verification and user updates
              // PaymentIntent status is already known after confirmation
              // No need to verify again - webhook will handle verification and updates

              // ✅ OPTIMIZED: Make user save fire-and-forget (webhook handles final updates)
              user.save().catch((error) => {
                console.warn("Non-critical user save failed (webhook will handle):", error);
              });

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
            // ✅ CRITICAL: If new paymentMethodId is provided, update the PaymentIntent to use it
            // This ensures retry attempts use the new card instead of the old failed one
            if (paymentMethodId && paymentIntent.status === "requires_payment_method") {
              console.log("✅ Updating PaymentIntent with new payment method (no clientSecret path):", paymentMethodId);
              try {
                await stripe.paymentIntents.update(paymentIntent.id, {
                  payment_method: paymentMethodId,
                });
                console.log("✅ PaymentIntent updated with new payment method");
              } catch (updateError) {
                console.error("❌ Failed to update PaymentIntent with new payment method:", updateError);
                // Continue with confirmation - might still work if payment method is already attached
              }
            }
            
            const confirmedPaymentIntent = await stripe.paymentIntents.confirm(paymentIntent.id);

            if (confirmedPaymentIntent.status === "succeeded") {
              // console.log("✅ Payment confirmed successfully using existing payment intent");

              // Note: Stripe will automatically update subscription status to active via webhook
              // when invoice.payment_succeeded event is processed
              // console.log(`✅ Payment confirmed - subscription will be activated via webhook`);

              // Update user subscription status (webhook handles final updates)
              if (user.subscription) {
                user.subscription.isActive = true;
                user.subscription.status = "active";
              }

              // ✅ OPTIMIZED: Webhook handles payment verification and user updates
              // PaymentIntent status is already known after confirmation
              // No need to verify again - webhook will handle verification and updates

              // ✅ OPTIMIZED: Make user save fire-and-forget (webhook handles final updates)
              user.save().catch((error) => {
                console.warn("Non-critical user save failed (webhook will handle):", error);
              });

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

    // ✅ OPTIMIZED: Auto-log error for monitoring (fire-and-forget, non-blocking)
    // Don't await - let it run in background without blocking error response
    getServerSession(authOptions)
      .then((session) => {
        return request.json().catch(() => ({})).then((requestBody) => {
          // Try to get user from session or request body
          let userId: string | undefined;
          let userEmail: string | undefined;
          if (session?.user?.id) {
            userId = session.user.id;
            userEmail = session.user.email || undefined;
          } else if ((requestBody as { userId?: string })?.userId) {
            userId = (requestBody as { userId?: string }).userId;
          }
          
          // ✅ FIXED: Properly capture guestEmail from request body
          const requestBodyEmail = (requestBody as { userEmail?: string; guestEmail?: string });
          const finalUserEmail = userEmail || (userId ? requestBodyEmail.userEmail : undefined);
          const finalGuestEmail = !userId ? (requestBodyEmail.guestEmail || requestBodyEmail.userEmail) : undefined;
          
          ErrorLoggingService.logError(error, {
            userId,
            userEmail: finalUserEmail,
            guestEmail: finalGuestEmail,
            endpoint: request.url,
            requestMethod: "POST",
            requestBody,
            component: "confirm-subscription-payment",
            flow: "subscription-payment-confirmation",
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
        // Still try to log with minimal context
        ErrorLoggingService.logError(error, {
          endpoint: request.url,
          requestMethod: "POST",
          component: "confirm-subscription-payment",
          flow: "subscription-payment-confirmation",
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
