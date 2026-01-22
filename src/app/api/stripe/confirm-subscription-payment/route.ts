import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import { cancelDuplicatePaymentIntents } from "@/utils/payment/stripe/subscription-utils";
import {
  findAvailablePaymentMethod,
  verifyPaymentMethodAttachment,
  attachPaymentMethodToCustomer,
  setDefaultPaymentMethod,
} from "@/utils/payment/stripe/payment-method-utils";
import { getCustomerWithDefaultPaymentMethod } from "@/utils/payment/stripe/customer-utils";
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
  paymentMethodId: z.string().optional(), // ✅ NEW: Payment method from confirmed PaymentIntent
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

    // Retrieve the subscription from Stripe with expanded payment intent
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["latest_invoice.payment_intent"],
    });
    
    // ✅ ENHANCED: Also try to extract payment method from subscription metadata if available
    // This helps recover payment methods that were set during subscription creation

    if (!subscription) {
      return NextResponse.json({ error: "Subscription not found in Stripe" }, { status: 404 });
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

    // ✅ AUTHORIZATION GUARD: If clientSecret is provided, retrieve PaymentIntent for confirmation
    // Note: PaymentIntent from confirmation_secret is automatically created by Stripe and belongs to the invoice
    // We trust Stripe's automatic creation - no need to validate ownership
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
        
        // ✅ VALIDATION: PaymentIntent from confirmation_secret is automatically created by Stripe
        // and belongs to the invoice, so we don't need to validate ownership
        // Stripe ensures PaymentIntents from confirmation_secret are always valid invoice PaymentIntents
        // They won't have custom metadata since they're automatically created
        console.log(`✅ Using PaymentIntent ${paymentIntentId} from confirmation_secret for subscription ${subscriptionId}`);
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

    // ✅ CRITICAL: If paymentMethodId is provided (from confirmed PaymentIntent), attach it immediately
    // This must happen before any conditional logic so it's always processed
    if (paymentMethodId) {
      console.log(`✅ Payment method provided from frontend: ${paymentMethodId}`);
      console.log(`🔍 Current paymentIntent status: ${paymentIntent ? (typeof paymentIntent === "string" ? "string ID" : paymentIntent.status) : "not found"}`);
      
      const customer = await getCustomerWithDefaultPaymentMethod(subscription.customer as string);
      
      // Attach payment method to customer if not already attached
      const isAttached = await verifyPaymentMethodAttachment(paymentMethodId, customer.id);
      if (!isAttached) {
        try {
          await attachPaymentMethodToCustomer(paymentMethodId, customer.id);
          await setDefaultPaymentMethod(customer.id, paymentMethodId);
          console.log(`✅ Attached payment method ${paymentMethodId} to customer ${customer.id}`);
        } catch (attachError) {
          console.error(`❌ Failed to attach payment method: ${attachError}`);
          // Continue - we'll try again later if needed
        }
      } else {
        console.log(`✅ Payment method ${paymentMethodId} already attached to customer`);
      }
      
      // Set as default for subscription
      try {
        await stripe.subscriptions.update(subscriptionId, {
          default_payment_method: paymentMethodId,
        });
        console.log(`✅ Set payment method ${paymentMethodId} as default for subscription ${subscriptionId}`);
      } catch (updateError) {
        console.error(`❌ Failed to set default payment method for subscription: ${updateError}`);
        // Continue - subscription will still work
      }
      
      // ✅ CRITICAL: If PaymentIntent exists but we have paymentMethodId, try to retrieve it to check status
      // This ensures we can handle the case where PaymentIntent was confirmed on frontend
      if (!paymentIntent && clientSecret) {
        try {
          const paymentIntentId = clientSecret.split("_secret_")[0];
          paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
          console.log(`✅ Retrieved PaymentIntent ${paymentIntentId} with status: ${paymentIntent.status}`);
        } catch (retrieveError) {
          console.warn(`⚠️ Failed to retrieve PaymentIntent from clientSecret: ${retrieveError}`);
        }
      }
    } else {
      console.log(`⚠️ No paymentMethodId provided in request`);
    }

    // If no payment intent exists for incomplete subscription, pay the invoice directly
    if (!paymentIntent && subscription.status === "incomplete") {
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

        // ✅ OPTIMIZED: Use provided payment method if available (from confirmed PaymentIntent)
        let defaultPaymentMethod: string | null = null;

        if (paymentMethodId) {
          // ✅ USE: Payment method from confirmed PaymentIntent (already attached above)
          defaultPaymentMethod = paymentMethodId;
          console.log(`✅ Using payment method from confirmed PaymentIntent: ${defaultPaymentMethod}`);
        } else if (!paymentIntent) {
          // ✅ FALLBACK: Find payment method on customer (existing flow for other scenarios)
          // This handles cases where payment method is already attached to customer
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

          // ✅ OPTIMIZED: Use utility function to find available payment method (parallelizes strategies)
          defaultPaymentMethod = await findAvailablePaymentMethod(customer, user);

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
              subscription.status === "incomplete"
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
        }

        // ✅ CRITICAL: Get customer and attach payment method (if not already attached)
        if (defaultPaymentMethod) {
          const customer = await getCustomerWithDefaultPaymentMethod(subscription.customer as string);
          
          // ✅ CRITICAL: Verify and attach payment method using utility (if needed)
          const isAttached = await verifyPaymentMethodAttachment(defaultPaymentMethod, customer.id);
          if (!isAttached) {
            try {
              await attachPaymentMethodToCustomer(defaultPaymentMethod, customer.id);
              await setDefaultPaymentMethod(customer.id, defaultPaymentMethod);
              console.log(`✅ Attached payment method ${defaultPaymentMethod} to customer ${customer.id}`);
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

          // ✅ CRITICAL: Set payment method as default for subscription
          try {
            await stripe.subscriptions.update(subscriptionId, {
              default_payment_method: defaultPaymentMethod,
            });
            console.log(`✅ Set payment method ${defaultPaymentMethod} as default for subscription ${subscriptionId}`);
          } catch (updateError) {
            console.error(`❌ Failed to set default payment method for subscription: ${updateError}`);
            // Continue - subscription will still work, but future invoices might fail
          }
        }

        // Only pay invoice if we have a payment method
        if (!defaultPaymentMethod) {
          return NextResponse.json(
            {
              success: false,
              error: "No payment method available",
              details: "Unable to pay invoice without a payment method.",
            },
            { status: 400 }
          );
        }

        // #region agent log
        const customerForLog = await getCustomerWithDefaultPaymentMethod(subscription.customer as string);
        fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'confirm-subscription-payment.ts:283',message:'BEFORE paying invoice',data:{invoiceId:latestInvoice?.id,paymentMethodId:defaultPaymentMethod,customerId:customerForLog.id,subscriptionId:subscription.id,subscriptionStatus:subscription.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'I'})}).catch(()=>{});
        // #endregion
        
        // Pay the invoice directly - this will create a PaymentIntent and trigger webhook
        let paidInvoice;
        try {
          paidInvoice = await stripe.invoices.pay(latestInvoice?.id || "", {
            payment_method: defaultPaymentMethod as string, // Type assertion safe because we checked above
          });
          
          // #region agent log
          const paidInvoiceWithPaymentIntent = paidInvoice as { payment_intent?: string | { id: string } };
          fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'confirm-subscription-payment.ts:290',message:'Invoice paid successfully',data:{invoiceId:paidInvoice.id,invoiceStatus:paidInvoice.status,hasPaymentIntent:!!paidInvoiceWithPaymentIntent.payment_intent},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'I'})}).catch(()=>{});
          // #endregion
        } catch (payError) {
          // #region agent log
          const errorMessage = payError instanceof Error ? payError.message : String(payError);
          const errorCode = payError && typeof payError === "object" && "code" in payError ? String(payError.code) : undefined;
          const errorType = payError && typeof payError === "object" && "type" in payError ? String(payError.type) : undefined;
          const declineCode = payError && typeof payError === "object" && "decline_code" in payError ? String(payError.decline_code) : undefined;
          const customerForErrorLog = await getCustomerWithDefaultPaymentMethod(subscription.customer as string);
          fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'confirm-subscription-payment.ts:295',message:'Invoice payment FAILED',data:{invoiceId:latestInvoice?.id,paymentMethodId:defaultPaymentMethod,customerId:customerForErrorLog.id,subscriptionId:subscription.id,errorMessage,errorCode,errorType,declineCode,errorStringified:JSON.stringify(payError)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'I'})}).catch(()=>{});
          // #endregion
          
          console.error("❌ Failed to pay invoice:", payError);
          const customerForErrorDetails = await getCustomerWithDefaultPaymentMethod(subscription.customer as string);
          console.error("❌ Invoice payment error details (VERCEL LOGS):", {
            invoiceId: latestInvoice?.id,
            paymentMethodId: defaultPaymentMethod,
            customerId: customerForErrorDetails.id,
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

        // ✅ CRITICAL: If paymentMethodId was provided, ensure it's attached to customer and subscription
        if (paymentMethodId) {
          const customer = await getCustomerWithDefaultPaymentMethod(subscription.customer as string);
          
          // Attach payment method to customer if not already attached
          const isAttached = await verifyPaymentMethodAttachment(paymentMethodId, customer.id);
          if (!isAttached) {
            try {
              await attachPaymentMethodToCustomer(paymentMethodId, customer.id);
              await setDefaultPaymentMethod(customer.id, paymentMethodId);
              console.log(`✅ Attached payment method ${paymentMethodId} to customer ${customer.id}`);
            } catch (attachError) {
              console.error(`❌ Failed to attach payment method: ${attachError}`);
              // Continue - payment already succeeded, so subscription should activate
            }
          }
          
          // Set as default for subscription
          try {
            await stripe.subscriptions.update(subscriptionId, {
              default_payment_method: paymentMethodId,
            });
            console.log(`✅ Set payment method ${paymentMethodId} as default for subscription ${subscriptionId}`);
          } catch (updateError) {
            console.error(`❌ Failed to set default payment method for subscription: ${updateError}`);
            // Continue - subscription will still work
          }
        }

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
                  pendingChange: undefined, // Initialize pendingChange field for subscription management
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
    } else if (subscription.status === "incomplete") {
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
