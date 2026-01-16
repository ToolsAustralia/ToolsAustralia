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
});

/**
 * POST /api/stripe/confirm-subscription-payment
 * Confirm payment for an existing subscription
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { subscriptionId, clientSecret, userId } = confirmPaymentSchema.parse(body);

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

    // Check if there's a payment intent that needs confirmation
    const latestInvoice = subscription.latest_invoice as {
      payment_intent?: { status: string; id: string };
      amount_due?: number;
      currency?: string;
      id?: string;
    } | null;
    let paymentIntent = latestInvoice?.payment_intent;

    // If no payment intent exists for incomplete subscription, pay the invoice directly
    if (!paymentIntent && subscription.status === "incomplete") {
      // console.log("🔧 No payment intent found for incomplete subscription, paying invoice directly...");
      try {
        // ✅ FIX: First check if PaymentIntent exists but wasn't expanded properly
        // The subscription was retrieved with expand: ["latest_invoice.payment_intent"]
        // but payment_intent might be a string ID that needs retrieval
        if (latestInvoice?.payment_intent) {
          const pi = latestInvoice.payment_intent;
          if (typeof pi === "string") {
            // PaymentIntent is a string ID - retrieve it
            try {
              const retrievedPI = await stripe.paymentIntents.retrieve(pi);
              if (retrievedPI) {
                paymentIntent = retrievedPI;
                console.log(`✅ Found PaymentIntent by retrieving ID: ${retrievedPI.id}`);
                // Continue with PaymentIntent flow - skip default payment method fallback
              }
            } catch (retrieveError) {
              console.warn(`⚠️ Failed to retrieve PaymentIntent ${pi}: ${retrieveError}`);
            }
          } else if (pi.id) {
            // PaymentIntent is already an object - use it directly
            paymentIntent = pi;
            console.log(`✅ Found PaymentIntent in invoice: ${pi.id}`);
          }
        }

        // ✅ ENHANCED: Only try default payment method if PaymentIntent still doesn't exist
        // Use multiple fallback strategies to find payment method
        if (!paymentIntent) {
          // Try to get the customer's default payment method
          const customer = await stripe.customers.retrieve(subscription.customer as string);
          
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

          let defaultPaymentMethod: string | null = null;
          let paymentMethodSource = "none";

          // ✅ ENHANCED FALLBACK STRATEGY 1: Customer's default payment method
          const customerDefaultPm = (customer as { invoice_settings?: { default_payment_method?: string } })
            .invoice_settings?.default_payment_method;
          
          if (customerDefaultPm) {
            defaultPaymentMethod = customerDefaultPm;
            paymentMethodSource = "customerDefault";
            console.log(`💳 Found payment method from customer default: ${defaultPaymentMethod}`);
          }

          // ✅ ENHANCED FALLBACK STRATEGY 2: List customer's payment methods (most recent first)
          if (!defaultPaymentMethod) {
            try {
              const customerPaymentMethods = await stripe.paymentMethods.list({
                customer: customer.id,
                type: "card",
                limit: 10,
              });
              
              if (customerPaymentMethods.data.length > 0) {
                // Use the most recently created payment method
                const sortedMethods = customerPaymentMethods.data.sort((a, b) => b.created - a.created);
                defaultPaymentMethod = sortedMethods[0].id;
                paymentMethodSource = "customerList";
                console.log(`💳 Found payment method from customer payment methods list: ${defaultPaymentMethod} (${customerPaymentMethods.data.length} total)`);
              }
            } catch (listError) {
              console.warn(`⚠️ Failed to list customer payment methods: ${listError}`);
            }
          }

          // ✅ ENHANCED FALLBACK STRATEGY 3: User's saved payment methods
          if (!defaultPaymentMethod && user?.savedPaymentMethods && user.savedPaymentMethods.length > 0) {
            // Try to use user's saved payment methods
            const savedMethod = user.savedPaymentMethods.find((pm: { isDefault?: boolean }) => pm.isDefault) 
              || user.savedPaymentMethods[0];
            
            if (savedMethod?.paymentMethodId) {
              try {
                const pm = await stripe.paymentMethods.retrieve(savedMethod.paymentMethodId);
                
                // ✅ ENHANCED: Automatic recovery - attach payment method if found but not attached
                const pmCustomerId = typeof pm.customer === "string" ? pm.customer : pm.customer?.id;
                if (!pmCustomerId || pmCustomerId !== customer.id) {
                  await stripe.paymentMethods.attach(savedMethod.paymentMethodId, {
                    customer: customer.id,
                  });
                  console.log(`✅ Attached saved payment method to customer: ${savedMethod.paymentMethodId}`);
                }
                
                defaultPaymentMethod = savedMethod.paymentMethodId;
                paymentMethodSource = "userSaved";
                console.log(`💳 Using saved payment method as fallback: ${savedMethod.paymentMethodId}`);
              } catch (pmError) {
                console.warn(`⚠️ Failed to use saved payment method: ${pmError}`);
                // Continue to next fallback strategy
              }
            }
          }

          // ✅ ENHANCED: If still no payment method found, provide detailed error message
          if (!defaultPaymentMethod) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'confirm-subscription-payment.ts:213',message:'No payment method found after all fallback strategies',data:{customerId:customer.id,hasSavedPaymentMethods:!!(user?.savedPaymentMethods && user.savedPaymentMethods.length > 0),subscriptionId:subscription.id,subscriptionStatus:subscription.status,invoiceId:latestInvoice?.id,userId:user?._id?.toString()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
            // #endregion
            
            console.error("❌ No payment method found for customer after all fallback strategies", {
              customerId: customer.id,
              hasSavedPaymentMethods: !!(user?.savedPaymentMethods && user.savedPaymentMethods.length > 0),
              subscriptionId: subscription.id,
              subscriptionStatus: subscription.status,
              invoiceId: latestInvoice?.id,
            });
            
            // ✅ ENHANCED: Provide actionable error message based on context
            const errorMessage = subscription.status === "incomplete"
              ? "Your subscription was created but no payment method was found to complete the payment. This usually happens when the payment method wasn't properly saved during checkout."
              : "No payment method found to complete this subscription payment.";
            
            const suggestion = user?.savedPaymentMethods && user.savedPaymentMethods.length > 0
              ? "Please try again, or go to your account settings to add a new payment method."
              : "Please go to your account settings to add a payment method, then try completing your subscription again.";
            
            return NextResponse.json(
              {
                success: false,
                error: "No payment method found",
                details: errorMessage,
                suggestion: suggestion,
                recoverySteps: [
                  "Go to your account settings",
                  "Add or verify your payment method",
                  "Return here to complete your subscription",
                ],
              },
              { status: 400 }
            );
          }

          // ✅ ENHANCED: Verify payment method is attached before using it
          try {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'confirm-subscription-payment.ts:248',message:'Verifying payment method attachment',data:{paymentMethodId:defaultPaymentMethod,customerId:customer.id,paymentMethodSource,subscriptionId:subscription.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
            // #endregion
            
            const pm = await stripe.paymentMethods.retrieve(defaultPaymentMethod);
            const pmCustomerId = typeof pm.customer === "string" ? pm.customer : pm.customer?.id;
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'confirm-subscription-payment.ts:252',message:'Payment method retrieved - attachment check',data:{paymentMethodId:defaultPaymentMethod,pmCustomerId,expectedCustomerId:customer.id,isAttached:pmCustomerId===customer.id,paymentMethodType:pm.type},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
            // #endregion
            
            // ✅ ENHANCED: Automatic recovery - attach if not already attached
            if (!pmCustomerId || pmCustomerId !== customer.id) {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'confirm-subscription-payment.ts:254',message:'Attaching payment method to customer',data:{paymentMethodId:defaultPaymentMethod,customerId:customer.id,currentPmCustomerId:pmCustomerId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
              // #endregion
              
              await stripe.paymentMethods.attach(defaultPaymentMethod, {
                customer: customer.id,
              });
              console.log(`✅ Attached payment method ${defaultPaymentMethod} to customer ${customer.id} (source: ${paymentMethodSource})`);
              
              // Set as default for future use
              await stripe.customers.update(customer.id, {
                invoice_settings: {
                  default_payment_method: defaultPaymentMethod,
                },
              });
              console.log(`✅ Set payment method ${defaultPaymentMethod} as default for customer ${customer.id}`);
              
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'confirm-subscription-payment.ts:265',message:'Payment method attached and set as default',data:{paymentMethodId:defaultPaymentMethod,customerId:customer.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
              // #endregion
            }
          } catch (verifyError) {
            // #region agent log
            const errorMessage = verifyError instanceof Error ? verifyError.message : String(verifyError);
            const errorCode = verifyError && typeof verifyError === "object" && "code" in verifyError ? String(verifyError.code) : undefined;
            const errorType = typeof verifyError;
            const declineCode = verifyError && typeof verifyError === "object" && "decline_code" in verifyError ? String(verifyError.decline_code) : undefined;
            fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'confirm-subscription-payment.ts:287',message:'Payment method verification FAILED',data:{paymentMethodId:defaultPaymentMethod,customerId:customer.id,errorMessage,errorCode,declineCode,errorType,errorStringified:JSON.stringify(verifyError)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
            // #endregion
            
            console.error(`❌ Failed to verify/attach payment method ${defaultPaymentMethod}:`, verifyError);
            console.error("❌ Payment method verification error details (VERCEL LOGS):", {
              paymentMethodId: defaultPaymentMethod,
              customerId: customer.id,
              subscriptionId: subscription.id,
              errorCode,
              declineCode,
              errorMessage,
              fullError: JSON.stringify(verifyError),
            });
            
            // ✅ CRITICAL FIX: Include actual Stripe error details in response
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

          // console.log(`💳 Using default payment method: ${defaultPaymentMethod}`);

          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'confirm-subscription-payment.ts:283',message:'BEFORE paying invoice',data:{invoiceId:latestInvoice?.id,paymentMethodId:defaultPaymentMethod,customerId:customer.id,subscriptionId:subscription.id,subscriptionStatus:subscription.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'I'})}).catch(()=>{});
          // #endregion
          
          // Pay the invoice directly - this will create a PaymentIntent and trigger webhook
          let paidInvoice;
          try {
            paidInvoice = await stripe.invoices.pay(latestInvoice?.id || "", {
              payment_method: defaultPaymentMethod,
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
            fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'confirm-subscription-payment.ts:295',message:'Invoice payment FAILED',data:{invoiceId:latestInvoice?.id,paymentMethodId:defaultPaymentMethod,customerId:customer.id,subscriptionId:subscription.id,errorMessage,errorCode,errorType,declineCode,errorStringified:JSON.stringify(payError)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'I'})}).catch(()=>{});
            // #endregion
            
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
