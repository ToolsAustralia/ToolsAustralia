import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import { stripe } from "@/lib/stripe";
// Referral processing moved to webhook - no longer needed here
import { extractRequestContext } from "@/utils/tracking/facebook-helpers";
import Stripe from "stripe";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { autoLogPaymentErrorServer } from "@/utils/error-reporting/auto-log-error-server";
import { getUserActiveExperimentAssignment } from "@/utils/ab-testing/get-user-experiment-assignment";
import AnonymousIdService from "@/services/ab-testing/AnonymousIdService";
import VariantAssignmentService from "@/services/ab-testing/VariantAssignmentService";
import ExperimentRepository from "@/repositories/ab-testing/ExperimentRepository";
import mongoose from "mongoose";
import { getInvoicePaymentIntentFromSubscription } from "@/utils/payment/stripe/invoice-payment-intent";
import { getSubscriptionPaymentIntent, cancelDuplicatePaymentIntents } from "@/utils/payment/stripe/subscription-utils";
import {
  attachPaymentMethodToCustomer,
  setDefaultPaymentMethod,
  verifyPaymentMethodAttachment,
} from "@/utils/payment/stripe/payment-method-utils";
import { ensureCustomerExists, updateCustomerPaymentMethod } from "@/utils/payment/stripe/customer-utils";
import { getExperimentAssignmentForSubscription } from "@/utils/ab-testing/subscription-assignment";
import { createOrUpdateSubscriptionUser } from "@/utils/payment/user-subscription-utils";
// Klaviyo integration handled by webhook for best practices
import { createPaymentIntentConfig } from "@/utils/payment/stripe/payment-intent-config";

// Interface for Stripe errors
interface StripeError {
  type: string;
  message: string;
  code?: string;
}

const createSubscriptionSchema = z.object({
  userEmail: z.string().email("Invalid email address"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  mobile: z.string().optional(),
  packageId: z.string().min(1, "Package ID is required"),
  password: z.string().min(6, "Password must be at least 6 characters").optional(), // Made optional for passwordless users
  paymentMethodId: z.string().optional(), // ✅ STRIPE BEST PRACTICE: Optional - subscription can be created without payment method upfront
  idempotencyKey: z.string().optional(), // ✅ STRIPE BEST PRACTICE: Idempotency key to prevent duplicate subscription creation
  referralCode: z.string().optional(),
  promoLinkCode: z.string().optional(),
});

/**
 * POST /api/stripe/create-subscription
 * Create a new Stripe subscription and user account (registration + subscription in one flow)
 */
export async function POST(request: NextRequest) {
  // Store request body and context for error logging
  let requestBody: Record<string, unknown> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let membershipPackage: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, prefer-const
  let user: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, prefer-const
  let customer: any = null;
  
  try {
    // console.log("🔌 Connecting to database...");
    await connectDB();
    // console.log("✅ Database connected successfully");

    // Extract request context for Facebook CAPI (IP, user agent, fbc, fbp)
    // Store in payment metadata so webhook can use it for improved match quality
    const requestContext = extractRequestContext(request);

    // console.log("📥 Parsing request body...");
    const body = await request.json();
    requestBody = body; // Store for error logging
    // console.log("📋 Request body received:", { ...body, password: "[HIDDEN]" });

    // console.log("✅ Validating request data...");
    const validatedData = createSubscriptionSchema.parse(body);
    // console.log("✅ Data validation successful");

    // console.log(`🚀 Creating subscription for: ${validatedData.userEmail}`);

    // Check if user already exists
    const existingUser = await User.findOne({ email: validatedData.userEmail });
    if (existingUser) {
      // console.log(`👤 User already exists, proceeding with subscription: ${existingUser._id}`);
      // User already exists (registered in step 1), proceed with subscription
    }

    // Get membership package
    membershipPackage = getPackageById(validatedData.packageId);
    if (!membershipPackage) {
      return NextResponse.json(
        {
          success: false,
          error: "Membership package not found",
        },
        { status: 404 }
      );
    }

    if (membershipPackage.type !== "subscription") {
      return NextResponse.json(
        {
          success: false,
          error: "Package must be a subscription type",
        },
        { status: 400 }
      );
    }

    // Check if user already exists (from registration)
    // console.log("👤 Checking if user already exists...");
    const registeredUser = await User.findOne({ email: validatedData.userEmail.toLowerCase() });

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

    // ✅ OPTIMIZED: Use utility functions for customer operations
    let customer: Stripe.Customer;
    let canUsePaymentMethod = true;

    // Extract anonymousId for A/B testing (before customer operations for parallel execution)
    const anonymousId = AnonymousIdService.extractAnonymousId(request);

    // ✅ OPTIMIZED: Parallelize customer operations and A/B testing lookup
    const [customerResult, experimentAssignmentResult] = await Promise.allSettled([
      // Customer operations
      (async () => {
        // First, check if we have a registered user with an existing Stripe customer
        if (registeredUser && registeredUser.stripeCustomerId) {
          try {
            const existingCustomer = await stripe.customers.retrieve(registeredUser.stripeCustomerId);
            
            // Check if customer is deleted
            if ("deleted" in existingCustomer && existingCustomer.deleted) {
              throw new Error("Customer has been deleted");
            }

            // ✅ STRIPE BEST PRACTICE: Only attach payment method if provided
            if (finalPaymentMethodId) {
              // ✅ OPTIMIZED: Use utility to attach payment method
              try {
                await attachPaymentMethodToCustomer(finalPaymentMethodId, existingCustomer.id);
              } catch (attachError: unknown) {
                // Check if error is due to payment method being "consumed"
                const errorMessage = attachError instanceof Error ? attachError.message : String(attachError);
                
                if (
                  errorMessage.includes("previously used without being attached") ||
                  errorMessage.includes("may not be used again") ||
                  errorMessage.includes("cannot be reused")
                ) {
                  console.warn("⚠️ Payment method from upfront PaymentIntent cannot be reused");
                  canUsePaymentMethod = false;
                  // Continue with customer even if payment method can't be reused
                } else {
                  // Re-throw critical errors
                  throw attachError;
                }
              }
            }
            return existingCustomer as Stripe.Customer;
          } catch (error) {
            console.warn(`⚠️ Failed to retrieve existing customer, will create new one:`, error);
            // Fall through to create new customer
          }
        }

        // For guest users or new users, ensure customer exists
        const customerMetadata = {
          packageId: validatedData.packageId,
          packageName: membershipPackage.name,
          userId: registeredUser?._id?.toString() || "guest",
        };

        // ✅ OPTIMIZED: Use utility function to ensure customer exists
        const newOrExistingCustomer = await ensureCustomerExists(validatedData.userEmail, customerMetadata);

        // ✅ STRIPE BEST PRACTICE: Only process payment method if provided
        if (finalPaymentMethodId) {
          // If payment method has a customer, check if it matches
          try {
            const paymentMethod = await stripe.paymentMethods.retrieve(finalPaymentMethodId);
            if (paymentMethod.customer) {
              const pmCustomerId = typeof paymentMethod.customer === "string" ? paymentMethod.customer : paymentMethod.customer.id;
              if (pmCustomerId === newOrExistingCustomer.id) {
                // Customer matches, update details if needed
                const customerWithMetadata = newOrExistingCustomer as Stripe.Customer;
                if (customerWithMetadata.metadata?.type === "guest" || customerWithMetadata.metadata?.temporary === "true") {
                  await stripe.customers.update(newOrExistingCustomer.id, {
                    email: validatedData.userEmail,
                    name: `${validatedData.firstName} ${validatedData.lastName}`,
                    phone: validatedData.mobile,
                    metadata: customerMetadata,
                  });
                }
                return newOrExistingCustomer;
              }
            }
          } catch (pmError) {
            console.warn(`⚠️ Failed to check payment method customer:`, pmError);
          }

          // ✅ OPTIMIZED: Attach payment method using utility
          try {
            await attachPaymentMethodToCustomer(finalPaymentMethodId, newOrExistingCustomer.id);
          } catch (attachError: unknown) {
            const errorMessage = attachError instanceof Error ? attachError.message : String(attachError);
            if (
              errorMessage.includes("previously used without being attached") ||
              errorMessage.includes("may not be used again") ||
              errorMessage.includes("cannot be reused")
            ) {
              console.warn("⚠️ Payment method from upfront PaymentIntent cannot be reused");
              canUsePaymentMethod = false;
            } else {
              throw attachError;
            }
          }
        }

        // If registered user exists, update them with the customer ID
        if (registeredUser && !registeredUser.stripeCustomerId) {
          registeredUser.stripeCustomerId = newOrExistingCustomer.id;
          await registeredUser.save();
        }

        return newOrExistingCustomer;
      })(),

      // ✅ OPTIMIZED: A/B testing lookup in parallel (non-blocking)
      getExperimentAssignmentForSubscription(registeredUser?._id?.toString() || null, anonymousId || null),
    ]);

    // Extract customer from result
    if (customerResult.status === "fulfilled") {
      customer = customerResult.value;
    } else {
      const errorMessage = customerResult.reason instanceof Error ? customerResult.reason.message : String(customerResult.reason);
      console.error("❌ Failed to get/create customer:", customerResult.reason);
      
      // Check if it's a payment method attachment error that should return error response
      if (errorMessage.includes("Failed to attach payment method")) {
        const errorCode = customerResult.reason && typeof customerResult.reason === "object" && "code" in customerResult.reason ? String(customerResult.reason.code) : undefined;
        return NextResponse.json(
          {
            success: false,
            error: "Payment method setup failed",
            details: errorMessage || "Unable to attach payment method to customer",
            code: errorCode,
            suggestion: "Please try again or use a different payment method.",
          },
          { status: 400 }
        );
      }
      
      throw new Error(`Failed to get/create customer: ${errorMessage}`);
    }

    // Extract experiment assignment from result (optional, non-blocking)
    let experimentAssignment: { experimentId: string; variantId: string } | null = null;
    if (experimentAssignmentResult.status === "fulfilled") {
      experimentAssignment = experimentAssignmentResult.value;
      if (experimentAssignment) {
        console.log(`✅ [A/B Testing] Storing experiment assignment in subscription metadata:`, experimentAssignment);
      }
    }

    // ✅ STRIPE BEST PRACTICE: Only set default payment method if provided and can be used
    // When paymentMethodId is not provided, subscription will be created without default_payment_method
    // Invoice PaymentIntent will still be created and payment method will be attached during confirmation
    // DO NOT save payment method to user database here - it will only be saved AFTER payment succeeds (via webhook)
    if (finalPaymentMethodId && canUsePaymentMethod && finalPaymentMethodId !== "new_payment_method") {
      try {
        // ✅ OPTIMIZED: Use utility function that parallelizes attach + update
        await updateCustomerPaymentMethod(customer.id, finalPaymentMethodId);
      } catch (pmError) {
        const errorMessage = pmError instanceof Error ? pmError.message : String(pmError);
        const errorCode = pmError && typeof pmError === "object" && "code" in pmError ? String(pmError.code) : undefined;
        
        console.error(`❌ Failed to attach/set default payment method ${finalPaymentMethodId}:`, pmError);
        
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
    } else if (finalPaymentMethodId && !canUsePaymentMethod) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'create-subscription.ts:313',message:'Payment method cannot be reused',data:{paymentMethodId:finalPaymentMethodId,customerId:customer.id,canUsePaymentMethod},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      // ✅ ENHANCED: Return clear error if payment method cannot be used
      return NextResponse.json(
        {
          success: false,
          error: "Payment method cannot be reused",
          details: "The payment method was already used and cannot be reused. Please enter a new payment method.",
          suggestion: "Please enter your payment details again using the payment form.",
        },
        { status: 400 }
      );
    }
    // ✅ If no paymentMethodId provided, continue - subscription will be created without default_payment_method

    // ✅ STRIPE BEST PRACTICE: Let Stripe create PaymentIntent automatically
    // We don't create upfront PaymentIntent - Stripe will create it when we create the subscription
    // The PaymentIntent will have the correct amount and can be used for wallet payments (Google Pay/Apple Pay)

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

    // ✅ OPTIMIZED: Experiment assignment already retrieved in parallel above (non-blocking)
    // The assignment is stored in experimentAssignment variable from Promise.allSettled

    // ✅ OPTIMIZED: Deduplication will be handled after subscription creation (non-blocking)

    // ✅ STRIPE BEST PRACTICE: Generate idempotency key to prevent duplicate subscription creation
    // Use customer ID + package ID for stable idempotency (not Date.now())
    const idempotencyKey =
      validatedData.idempotencyKey || `sub_${validatedData.packageId}_${customer.id}_${validatedData.userEmail}`;

    // ✅ STRIPE BEST PRACTICE: Create subscription first, let Stripe create PaymentIntent automatically
    // Stripe will create Invoice + PaymentIntent with correct amount for wallet payments
    // We include default_payment_method so Stripe creates PaymentIntent immediately
    // The PaymentIntent will be confirmed via PaymentElement (not auto-paid)
    // console.log("📋 Creating Stripe subscription...");
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'create-subscription.ts:358',message:'BEFORE subscription creation',data:{customerId:customer.id,stripePriceId,hasDefaultPaymentMethod:!!(canUsePaymentMethod && finalPaymentMethodId && finalPaymentMethodId !== "new_payment_method"),defaultPaymentMethodId:canUsePaymentMethod && finalPaymentMethodId && finalPaymentMethodId !== "new_payment_method" ? finalPaymentMethodId : null,packageId:validatedData.packageId,userEmail:validatedData.userEmail},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    
    let subscription;
    try {
      subscription = await stripe.subscriptions.create(
        {
          customer: customer.id,
          items: [
            {
              price: stripePriceId, // ✅ Use existing Price ID
            },
          ],
          // ✅ Include default_payment_method so Stripe creates PaymentIntent immediately
          // Payment will still be collected via PaymentElement (not auto-paid)
          // Only set default_payment_method if we can use the payment method (not consumed)
          ...(canUsePaymentMethod && finalPaymentMethodId && finalPaymentMethodId !== "new_payment_method"
            ? { default_payment_method: finalPaymentMethodId }
            : {}),
          payment_behavior: "default_incomplete", // ✅ Stripe creates PaymentIntent automatically with correct amount
          // ✅ CRITICAL FIX: Do NOT save payment method automatically on subscription creation
          // Payment method will only be saved AFTER payment succeeds (handled by webhook)
          // This prevents saving payment methods when payments fail due to insufficient funds
          // payment_settings: { save_default_payment_method: "on_subscription" }, // REMOVED
          expand: ["latest_invoice.payment_intent", "latest_invoice.confirmation_secret"], // ✅ Get PaymentIntent and confirmation_secret from invoice
          description: `${membershipPackage.name}`,
          metadata: {
            packageId: validatedData.packageId,
            packageName: membershipPackage.name,
            userEmail: validatedData.userEmail,
            ...(validatedData.promoLinkCode && { promoLinkCode: validatedData.promoLinkCode }),
            ...(validatedData.referralCode && { referralCode: validatedData.referralCode }),
            // ✅ A/B Testing: Store experiment assignment in metadata for accurate tracking
            ...(experimentAssignment && {
              experimentId: experimentAssignment.experimentId,
              variantId: experimentAssignment.variantId,
            }),
            // Store request context for Facebook CAPI (webhook will extract and use)
            ...(requestContext.client_ip_address ? { capi_client_ip: requestContext.client_ip_address } : {}),
            ...(requestContext.client_user_agent ? { capi_user_agent: requestContext.client_user_agent } : {}),
            ...(requestContext.fbc ? { capi_fbc: requestContext.fbc } : {}),
            ...(requestContext.fbp ? { capi_fbp: requestContext.fbp } : {}),
          },
        },
        {
          idempotencyKey: idempotencyKey, // ✅ STRIPE BEST PRACTICE: Prevent duplicate subscription creation
        }
      );

      // #region agent log
      const latestInvoiceId = subscription.latest_invoice ? (typeof subscription.latest_invoice === "string" ? subscription.latest_invoice : subscription.latest_invoice.id) : null;
      const latestInvoiceWithPaymentIntent = subscription.latest_invoice && typeof subscription.latest_invoice !== "string" ? (subscription.latest_invoice as Stripe.Invoice & { payment_intent?: string | Stripe.PaymentIntent }) : null;
      const paymentIntentId = latestInvoiceWithPaymentIntent?.payment_intent ? (typeof latestInvoiceWithPaymentIntent.payment_intent === "string" ? latestInvoiceWithPaymentIntent.payment_intent : latestInvoiceWithPaymentIntent.payment_intent.id) : null;
      fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'create-subscription.ts:400',message:'Subscription created successfully',data:{subscriptionId:subscription.id,subscriptionStatus:subscription.status,latestInvoiceId,paymentIntentId,hasPaymentIntent:!!paymentIntentId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion

      // console.log(`📋 Created subscription: ${subscription.id}`);
      // console.log(`📊 Subscription status: ${subscription.status}`);
    } catch (stripeError) {
      // #region agent log
      const errorMessage = stripeError instanceof Error ? stripeError.message : String(stripeError);
      const errorCode = stripeError && typeof stripeError === "object" && "code" in stripeError ? String(stripeError.code) : undefined;
      const errorType = stripeError && typeof stripeError === "object" && "type" in stripeError ? String(stripeError.type) : undefined;
      fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'create-subscription.ts:402',message:'Subscription creation FAILED',data:{customerId:customer.id,stripePriceId,errorMessage,errorCode,errorType,errorStringified:JSON.stringify(stripeError)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      
      console.error("❌ Stripe subscription creation failed:", stripeError);
      throw new Error(
        `Failed to create Stripe subscription: ${stripeError instanceof Error ? stripeError.message : "Unknown error"}`
      );
    }

    // ✅ NEW APPROACH: Try to get client_secret directly from confirmation_secret first
    // This is the simplest and most direct way according to Stripe docs
    // confirmation_secret contains the PaymentIntent client_secret after invoice finalization
    // Reference: https://docs.stripe.com/api/invoices - confirmation_secret field
    let clientSecret: string | null = null;
    let paymentIntent: Stripe.PaymentIntent | string | null | undefined = null;
    let latestInvoice: Stripe.Invoice | null = null;
    
    // ✅ PREFERRED METHOD: Get client_secret from confirmation_secret (most direct)
    if (subscription.latest_invoice && typeof subscription.latest_invoice !== "string") {
      const latestInvoiceExpanded = subscription.latest_invoice as Stripe.Invoice & {
        confirmation_secret?: {
          client_secret?: string;
        } | null;
        payment_intent?: string | Stripe.PaymentIntent;
      };
      
      latestInvoice = latestInvoiceExpanded;
      
      if (latestInvoiceExpanded.confirmation_secret?.client_secret) {
        clientSecret = latestInvoiceExpanded.confirmation_secret.client_secret;
        console.log(`✅ Found PaymentIntent client_secret via confirmation_secret for subscription ${subscription.id}`);
        
        // Extract PaymentIntent ID from client_secret for reference
        if (clientSecret) {
          const paymentIntentId = clientSecret.split("_secret_")[0];
          paymentIntent = paymentIntentId;
        }
      } else if (latestInvoiceExpanded.payment_intent) {
        // Fallback: Use payment_intent if confirmation_secret is not available
        paymentIntent = latestInvoiceExpanded.payment_intent;
        console.log(`⚠️ confirmation_secret not available, using payment_intent for subscription ${subscription.id}`);
      }
    }

    // ✅ FALLBACK: Get PaymentIntent from subscription's invoice using utility function
    // This handles retry logic and proper detection of Stripe-created PaymentIntent
    // ✅ NON-BLOCKING: PaymentIntent retrieval failure should not block subscription creation
    // Only use this if confirmation_secret didn't work
    if (!clientSecret && !paymentIntent) {
      console.log(`⏳ confirmation_secret not available immediately, using utility function with retry logic for subscription ${subscription.id}`);
      
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
        });
        // Continue - subscription creation succeeded, PaymentIntent retrieval can be retried later
      }

      paymentIntent = paymentIntentResult.paymentIntent;
      latestInvoice = paymentIntentResult.invoice;
    }

    // ✅ REMOVED: Manual PaymentIntent creation is no longer needed
    // Stripe automatically creates PaymentIntent when subscription is created with payment_behavior: "default_incomplete"
    // We now use confirmation_secret to get the client_secret directly, which is the Stripe-recommended approach
    // If PaymentIntent is not available via confirmation_secret, it means Stripe hasn't created it yet
    // In that case, we should wait for Stripe to create it (via webhook) rather than creating manually

    // ✅ Extract client_secret from PaymentIntent if not already obtained from confirmation_secret
    // PaymentElement will automatically show correct amount in wallets (Google Pay/Apple Pay)
    if (!clientSecret && paymentIntent) {
      if (typeof paymentIntent === "string") {
        // If it's a string ID, retrieve the PaymentIntent to get client_secret
        try {
          const retrievedPI = await stripe.paymentIntents.retrieve(paymentIntent);
          clientSecret = retrievedPI.client_secret || null;
          console.log(
            `✅ Retrieved PaymentIntent: ${retrievedPI.id}, status: ${retrievedPI.status}, amount: ${
              retrievedPI.amount
            }, has client_secret: ${!!clientSecret}`
          );

          // ✅ DEBUG: Verify amount matches subscription price
          const expectedAmount = Math.round(membershipPackage.price * 100);
          if (retrievedPI.amount !== expectedAmount) {
            console.warn(`⚠️ PaymentIntent amount mismatch: expected ${expectedAmount}, got ${retrievedPI.amount}`);
          }
        } catch (retrieveError) {
          console.error("❌ Failed to retrieve PaymentIntent:", retrieveError);
        }
      } else {
        // If it's already expanded, use it directly
        clientSecret = paymentIntent.client_secret || null;
        console.log(
          `✅ Using expanded PaymentIntent: ${paymentIntent.id}, status: ${paymentIntent.status}, amount: ${
            paymentIntent.amount
          }, has client_secret: ${!!clientSecret}`
        );

        // ✅ DEBUG: Verify amount matches subscription price
        const expectedAmount = Math.round(membershipPackage.price * 100);
        if (paymentIntent.amount !== expectedAmount) {
          console.warn(`⚠️ PaymentIntent amount mismatch: expected ${expectedAmount}, got ${paymentIntent.amount}`);
        }
      }
    }

    // ✅ Fallback: If PaymentIntent still not found, try retrieving invoice again with expansion
    // Also try to get confirmation_secret if not already obtained
    if (!clientSecret && latestInvoice?.id) {
      try {
        const expandedInvoice = await stripe.invoices.retrieve(latestInvoice.id, {
          expand: ["payment_intent", "confirmation_secret"],
        });
        
        // ✅ Try confirmation_secret first
        const invoiceWithConfirmationSecret = expandedInvoice as Stripe.Invoice & {
          confirmation_secret?: {
            client_secret?: string;
          } | null;
        };
        
        if (invoiceWithConfirmationSecret.confirmation_secret?.client_secret) {
          clientSecret = invoiceWithConfirmationSecret.confirmation_secret.client_secret;
          console.log(
            `✅ Found client_secret from confirmation_secret in retrieved invoice for subscription ${subscription.id}`
          );
          
          // Extract PaymentIntent ID from client_secret for reference
          if (clientSecret) {
            const paymentIntentId = clientSecret.split("_secret_")[0];
            paymentIntent = paymentIntentId;
          }
        } else {
          // Fallback: Try payment_intent if confirmation_secret not available
          const expandedPaymentIntent = (
            expandedInvoice as Stripe.Invoice & {
              payment_intent?: Stripe.PaymentIntent | string;
            }
          )?.payment_intent;

          if (expandedPaymentIntent) {
            if (typeof expandedPaymentIntent === "string") {
              const retrievedPI = await stripe.paymentIntents.retrieve(expandedPaymentIntent);
              clientSecret = retrievedPI.client_secret || null;
              console.log(
                `✅ Fallback: Retrieved PaymentIntent: ${retrievedPI.id}, has client_secret: ${!!clientSecret}`
              );
            } else {
              clientSecret = expandedPaymentIntent.client_secret || null;
              console.log(
                `✅ Fallback: Using expanded PaymentIntent: ${
                  expandedPaymentIntent.id
                }, has client_secret: ${!!clientSecret}`
              );
            }
          }
        }
      } catch (retrieveError) {
        console.error("❌ Failed to retrieve invoice with expansion:", retrieveError);
      }
    }

    // ✅ STRIPE BEST PRACTICE: Validate PaymentIntent before returning clientSecret
    // This ensures PaymentIntent is valid, has correct amount, and belongs to invoice
    if (clientSecret && latestInvoice) {
      try {
        // Extract PaymentIntent ID from clientSecret
        const paymentIntentId = clientSecret.split("_secret_")[0];
        const retrievedPI = await stripe.paymentIntents.retrieve(paymentIntentId);
        
        // Expected amount in cents
        const expectedAmount = Math.round(membershipPackage.price * 100);
        
        // ✅ VALIDATION: Check if PaymentIntent belongs to invoice by checking invoice's payment_intent field
        // This is more reliable than checking metadata (which may not exist for PaymentIntents from confirmation_secret)
        const invoiceWithPaymentIntent = latestInvoice as Stripe.Invoice & {
          payment_intent?: string | Stripe.PaymentIntent;
        };
        const invoicePaymentIntentId = invoiceWithPaymentIntent.payment_intent
          ? (typeof invoiceWithPaymentIntent.payment_intent === "string" ? invoiceWithPaymentIntent.payment_intent : invoiceWithPaymentIntent.payment_intent.id)
          : null;
        
        const belongsToInvoice = invoicePaymentIntentId === paymentIntentId;
        
        console.log(`🔍 Validating invoice PaymentIntent ${paymentIntentId}:`, {
          status: retrievedPI.status,
          amount: retrievedPI.amount,
          expectedAmount: expectedAmount,
          invoicePaymentIntentId: invoicePaymentIntentId,
          belongsToInvoice: belongsToInvoice,
          hasInvoiceIdMetadata: !!retrievedPI.metadata?.invoice_id,
          hasSubscriptionIdMetadata: !!retrievedPI.metadata?.subscription_id,
        });
        
        // ✅ CRITICAL: Validate PaymentIntent status
        if (retrievedPI.status === "canceled") {
          console.error(`❌ CRITICAL: Attempted to return canceled PaymentIntent ${paymentIntentId} as clientSecret`);
          clientSecret = null; // Force fallback - PaymentIntent is invalid
        }
        // ✅ CRITICAL: Validate PaymentIntent belongs to invoice
        else if (!belongsToInvoice) {
          console.warn(`⚠️ PaymentIntent ${paymentIntentId} may not belong to invoice ${latestInvoice.id} (invoice payment_intent: ${invoicePaymentIntentId})`);
          // Continue - PaymentIntent might still be valid (Stripe may not have updated invoice yet)
          // The validation in confirm-subscription-payment will catch this if it's truly wrong
        }
        // ✅ CRITICAL: Validate PaymentIntent amount matches subscription price
        else if (retrievedPI.amount !== expectedAmount) {
          console.warn(`⚠️ PaymentIntent amount mismatch - expected ${expectedAmount}, got ${retrievedPI.amount}`);
          console.warn(`⚠️ This may cause incorrect amount display in Google Pay/Apple Pay wallets`);
          // Don't set clientSecret to null - log warning but continue (amount might be correct due to prorations/trials)
        } else {
          console.log(`✅ Invoice PaymentIntent ${paymentIntentId} validation passed - returning clientSecret`);
        }
      } catch (verifyError) {
        console.warn("Could not verify PaymentIntent status:", verifyError);
        // Continue - clientSecret might still be valid
      }
    }

    if (!clientSecret) {
      console.error("❌ No PaymentIntent client_secret found in subscription invoice");
      console.error("Debug details:", {
        subscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        invoiceId: latestInvoice?.id || "unknown",
        invoiceStatus: latestInvoice?.status || "unknown",
        hasPaymentIntent: !!paymentIntent,
        paymentIntentType: paymentIntent ? (typeof paymentIntent === "string" ? "string" : "object") : "null",
        paymentIntentId: paymentIntent
          ? typeof paymentIntent === "string"
            ? paymentIntent
            : paymentIntent.id
          : "null",
        paymentIntentStatus: paymentIntent && typeof paymentIntent === "object" ? paymentIntent.status : "N/A",
      });
      return NextResponse.json(
        {
          success: false,
          error: "Failed to get payment intent. Please try again.",
        },
        { status: 500 }
      );
    }

    let user;

    if (registeredUser) {
      // User already exists (registered in step 1), update their Stripe customer ID and subscription ID
      // ✅ CRITICAL FIX: Do NOT save payment method to user database here
      // Payment method will only be saved AFTER payment succeeds (handled by webhook)
      // This prevents saving payment methods when payments fail due to insufficient funds
      // console.log(
      //   `🔄 Updating existing user with Stripe customer ID: ${customer.id} and subscription ID: ${subscription.id}`
      // );

      // Update existing user with Stripe customer ID and subscription ID (NO payment method saved yet)
      user = await User.findByIdAndUpdate(
        registeredUser._id,
        {
          $set: {
            stripeCustomerId: customer.id,
            stripeSubscriptionId: subscription.id,
            subscription: {
              packageId: String(membershipPackage._id), // Force string conversion
              startDate: new Date(),
              endDate: undefined, // Subscriptions don't have end dates
              isActive: subscription.status === "active", // ✅ Set based on Stripe subscription status
              autoRenew: true,
              status: subscription.status, // Track subscription status
            },
          },
          // ✅ REMOVED: $push: { savedPaymentMethods: savedPaymentMethodData }
          // Payment method will be saved by webhook after payment succeeds
        },
        { new: true }
      );

      if (!user) {
        throw new Error("Failed to update existing user");
      }

      // console.log(`✅ Updated existing user: ${user._id}`);
      // console.log(`⏳ Entries/points will be added via webhook upon payment confirmation`);
      // console.log(`📦 Membership will activate: ${membershipPackage.name}`);

      // ✅ Klaviyo integration handled by webhook for reliability and best practices
      // console.log(`📊 Klaviyo events will be tracked via webhook when payment is confirmed`);
    } else {
      // Create new user account but DON'T activate benefits until payment is confirmed
      // Hash password only if provided (for backward compatibility with existing users)
      const hashedPassword = validatedData.password ? await bcrypt.hash(validatedData.password, 12) : undefined;

      // Clean mobile number before saving (remove spaces)
      const cleanedMobile = validatedData.mobile?.replace(/\s+/g, "") || "";
      // console.log(`📱 Mobile number: "${validatedData.mobile}" -> cleaned: "${cleanedMobile}"`);

      // console.log("👤 Creating user account...");

      // ✅ CRITICAL FIX: Do NOT save payment method to user database here
      // Payment method will only be saved AFTER payment succeeds (handled by webhook)
      // This prevents saving payment methods when payments fail due to insufficient funds

      user = new User({
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        email: validatedData.userEmail,
        password: hashedPassword, // Will be undefined for passwordless users
        mobile: cleanedMobile,
        role: "user",
        stripeCustomerId: customer.id,
        stripeSubscriptionId: subscription.id,
        subscription: {
          packageId: String(membershipPackage._id), // Force string conversion
          startDate: new Date(),
          endDate: undefined, // Subscriptions don't have end dates
          isActive: subscription.status === "active", // ✅ Set based on Stripe subscription status
          autoRenew: true,
          status: subscription.status, // Track subscription status
          pendingChange: undefined, // Initialize pendingChange field for subscription management
          lastDowngradeDate: undefined, // Initialize lastDowngradeDate field for security
        },
        oneTimePackages: [], // Initialize empty array
        accumulatedEntries: 0, // ⏳ Will be added via webhook only
        entryWallet: 0, // Deprecated
        rewardsPoints: 0, // ⏳ Will be added via webhook only
        isEmailVerified: false, // TODO: Implement email verification
        isActive: true, // User account is active
        savedPaymentMethods: [], // ✅ REMOVED: Do NOT save payment method until payment succeeds
        // Payment method will be saved by webhook after payment succeeds
      });

      // ✅ OPTIMIZED: Make user save fire-and-forget (webhook handles final updates)
      // MongoDB generates _id immediately when creating User() instance, so it's available for response
      // Subscription status updates are handled by webhook after payment succeeds
      user.save().catch((error) => {
        console.warn("Non-critical user save failed (webhook will handle):", error);
      });
      // console.log(`✅ Created user account: ${user._id}`);
      // console.log(`⏳ Entries/points will be added via webhook upon payment confirmation`);
      // console.log(`📦 Membership will activate: ${membershipPackage.name}`);

      // ✅ Klaviyo integration handled by webhook for reliability and best practices
      // console.log(`📊 Klaviyo events will be tracked via webhook when payment is confirmed`);
    }

    // ✅ Referral processing moved to webhook (after payment succeeds)
    // Referral code is stored in subscription metadata and processed by webhook

    // ✅ GRACEFUL DEGRADATION: Include warning if PaymentIntent retrieval failed
    // Note: We check !paymentIntent instead of paymentIntentResult.success since we're using confirmation_secret approach
    const warning = !clientSecret && !paymentIntent
      ? "PaymentIntent retrieval delayed. Payment confirmation may require retry. Subscription created successfully."
      : undefined;

    return NextResponse.json({
      success: true,
      data: {
        subscriptionId: subscription.id,
        customerId: customer.id,
        userId: user._id,
        clientSecret: clientSecret || null, // Explicitly set to null if not available
        status: subscription.status,
        packageName: membershipPackage.name,
        entriesPerMonth: membershipPackage.entriesPerMonth || 0,
        ...(warning && { warning }), // Include warning if PaymentIntent retrieval failed
        // Include user data for auto-login
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          subscription: user.subscription,
          entryWallet: user.entryWallet,
          accumulatedEntries: user.accumulatedEntries,
          rewardsPoints: user.rewardsPoints,
        },
        autoLogin: true, // Flag to indicate auto-login should be triggered
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("❌ Validation error:", error.issues);
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    // Handle Stripe-specific errors
    if (error && typeof error === "object" && "type" in error) {
      // #region agent log
      const stripeError = error as StripeError;
      fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'create-subscription.ts:857',message:'Stripe error caught in catch block',data:{errorType:stripeError.type,errorCode:stripeError.code,errorMessage:stripeError.message,packageId:typeof requestBody?.packageId === "string" ? requestBody.packageId : undefined,userEmail:typeof requestBody?.userEmail === "string" ? requestBody.userEmail : undefined,userId:user?._id?.toString(),customerId:customer?.id,errorStringified:JSON.stringify(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      
      console.error("❌ Stripe error:", error);
      console.error("❌ Stripe error details (VERCEL LOGS):", {
        type: stripeError.type,
        code: stripeError.code,
        message: stripeError.message,
        packageId: typeof requestBody?.packageId === "string" ? requestBody.packageId : undefined,
        userEmail: typeof requestBody?.userEmail === "string" ? requestBody.userEmail : undefined,
        customerId: customer?.id,
        userId: user?._id?.toString(),
        fullError: JSON.stringify(error),
      });
      
      // ✅ CRITICAL FIX: Check for account-level errors that would affect all payments
      const accountLevelErrors = ['account_invalid', 'api_key_expired', 'rate_limit', 'invalid_api_key'];
      if (stripeError.code && accountLevelErrors.includes(stripeError.code)) {
        console.error("❌ CRITICAL: Account-level Stripe error detected - this would affect ALL payments:", stripeError.code);
        return NextResponse.json(
          {
            success: false,
            error: "Payment system error",
            details: "There is a system issue preventing payment processing. Please contact support.",
            code: stripeError.code,
            type: stripeError.type,
          },
          { status: 500 }
        );
      }
      
      // ✅ AUTO-LOG PAYMENT ERRORS: Automatically log Stripe payment failures
      // NOTE: We intentionally do NOT include paymentIntentId here because:
      // 1. The upfront PaymentIntent is cancelled intentionally (expected behavior)
      // 2. The invoice PaymentIntent (actual subscription payment) is handled by confirm-subscription-payment
      // 3. Subscription payment failures are logged via invoice.payment_failed webhook event
      // Use stored request body and context for error logging
      const paymentContext = {
        packageId: typeof requestBody?.packageId === "string" ? requestBody.packageId : undefined,
        packageName: membershipPackage?.name,
        userEmail: typeof requestBody?.userEmail === "string" ? requestBody.userEmail : undefined,
        userId: user?._id?.toString(),
        customerId: customer?.id,
        errorCode: stripeError.code,
        errorMessage: stripeError.message,
        // ✅ CRITICAL: Do NOT include paymentIntentId - cancelled upfront PaymentIntent should not be logged as failure
      };
      
      // Auto-log payment error (fire and forget - don't block response)
      autoLogPaymentErrorServer(error, request, paymentContext).catch((logError) => {
        console.warn("Failed to auto-log payment error:", logError);
      });
      
      // ✅ CRITICAL FIX: Ensure consistent error response format
      return NextResponse.json(
        {
          success: false,
          error: "Payment processing error",
          details: stripeError.message || "Stripe API error",
          code: stripeError.code,
          type: stripeError.type,
        },
        { status: 400 }
      );
    }

    // #region agent log
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? (error.stack || "No stack trace") : "No stack trace";
    fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'create-subscription.ts:889',message:'General error in catch block',data:{errorMessage,errorType:typeof error,packageId:typeof requestBody?.packageId === "string" ? requestBody.packageId : undefined,userEmail:typeof requestBody?.userEmail === "string" ? requestBody.userEmail : undefined,userId:user?._id?.toString(),customerId:customer?.id,errorStack:errorStack.substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    
    console.error("❌ Error creating subscription:", error);
    console.error("❌ Error stack:", error instanceof Error ? error.stack : "No stack trace");
    console.error("❌ Error type:", typeof error);
    console.error("❌ Error message:", error instanceof Error ? error.message : "No message");

    // ✅ AUTO-LOG CRITICAL ERRORS: Automatically log server errors
    // NOTE: We intentionally do NOT include paymentIntentId here because:
    // 1. The upfront PaymentIntent is cancelled intentionally (expected behavior, not a failure)
    // 2. Subscription payment failures are handled separately via confirm-subscription-payment and invoice.payment_failed webhook
    // Use stored request body and context for error logging
    const errorContext = {
      packageId: typeof requestBody?.packageId === "string" ? requestBody.packageId : undefined,
      packageName: membershipPackage?.name,
      userEmail: typeof requestBody?.userEmail === "string" ? requestBody.userEmail : undefined,
      userId: user?._id?.toString(),
      customerId: customer?.id,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      // ✅ CRITICAL: Do NOT include paymentIntentId - cancelled upfront PaymentIntent should not be logged as failure
    };
    
    // Auto-log server error (fire and forget - don't block response)
    autoLogPaymentErrorServer(error, request, errorContext).catch((logError) => {
      console.warn("Failed to auto-log server error:", logError);
    });

    return NextResponse.json(
      {
        success: false,
        error: "Failed to create subscription",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
