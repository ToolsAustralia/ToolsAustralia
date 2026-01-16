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
// Klaviyo integration handled by webhook for best practices

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
  paymentMethodId: z.string().min(1, "Payment method is required"), // Payment method from PaymentIntent/SetupIntent (for saving)
  paymentIntentId: z.string().optional(), // ✅ NEW: Optional upfront PaymentIntent ID for wallet display (Google Pay/Apple Pay)
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

    // ✅ CRITICAL FIX: Cancel upfront PaymentIntent FIRST, before any other operations
    // This prevents it from being confirmed while we're processing
    if (validatedData.paymentIntentId) {
      try {
        const upfrontPaymentIntent = await stripe.paymentIntents.retrieve(validatedData.paymentIntentId);
        
        // Cancel if it's in ANY cancellable state
        if (
          upfrontPaymentIntent.status === "requires_payment_method" ||
          upfrontPaymentIntent.status === "requires_confirmation" ||
          upfrontPaymentIntent.status === "requires_action" ||
          upfrontPaymentIntent.status === "requires_capture" // Manual capture - can still cancel
        ) {
          await stripe.paymentIntents.cancel(upfrontPaymentIntent.id);
          console.log(`✅ Cancelled upfront PaymentIntent ${upfrontPaymentIntent.id} at start of subscription creation (status: ${upfrontPaymentIntent.status})`);
          // ✅ ADD: Log that frontend should use invoice PaymentIntent's clientSecret
          console.log(`ℹ️ Frontend should use invoice PaymentIntent's clientSecret, not upfront PaymentIntent ${upfrontPaymentIntent.id}`);
        } else if (upfrontPaymentIntent.status === "succeeded") {
          console.error(`❌ CRITICAL: Upfront PaymentIntent ${upfrontPaymentIntent.id} already succeeded - system attempted double charge`, {
            paymentIntentId: upfrontPaymentIntent.id,
            amount: upfrontPaymentIntent.amount,
            currency: upfrontPaymentIntent.currency,
            customer: upfrontPaymentIntent.customer,
            metadata: upfrontPaymentIntent.metadata,
            timestamp: new Date().toISOString(),
          });
          // Continue - invoice PaymentIntent will be used, but log error for investigation
        } else if (upfrontPaymentIntent.status === "canceled") {
          console.log(`ℹ️ Upfront PaymentIntent ${upfrontPaymentIntent.id} already cancelled`);
        } else {
          console.log(`ℹ️ Upfront PaymentIntent ${upfrontPaymentIntent.id} is ${upfrontPaymentIntent.status}, no action needed`);
        }
      } catch (cancelError) {
        console.error(`❌ Failed to cancel upfront PaymentIntent ${validatedData.paymentIntentId}: ${cancelError}`);
        // Continue - invoice PaymentIntent will be used anyway
      }
    }

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

    // Determine which customer to use
    let customer;
    let canUsePaymentMethod = true;

    // First, check if we have a registered user with an existing Stripe customer
    if (registeredUser && registeredUser.stripeCustomerId) {
      // console.log(`👤 Using existing Stripe customer: ${registeredUser.stripeCustomerId}`);
      customer = await stripe.customers.retrieve(registeredUser.stripeCustomerId);

      // ✅ FIX: Attach payment method to customer if not already attached
      // This handles cases where PaymentIntent was created without a customer
      try {
        const paymentMethod = await stripe.paymentMethods.retrieve(finalPaymentMethodId);
        if (!paymentMethod.customer || paymentMethod.customer !== customer.id) {
          await stripe.paymentMethods.attach(finalPaymentMethodId, {
            customer: customer.id,
          });
          // console.log(`✅ Attached payment method to existing customer: ${customer.id}`);
        }
      } catch (attachError: unknown) {
        // Check if error is due to payment method being "consumed" (used without attachment)
        const errorMessage = attachError instanceof Error ? attachError.message : String(attachError);
        const errorCode = attachError && typeof attachError === "object" && "code" in attachError ? String(attachError.code) : undefined;
        
        if (
          errorMessage.includes("previously used without being attached") ||
          errorMessage.includes("may not be used again")
        ) {
          console.warn("⚠️ Payment method from upfront PaymentIntent cannot be reused, will collect fresh payment method");
          canUsePaymentMethod = false;
        } else {
          // ✅ CRITICAL FIX: Return error instead of continuing if attachment fails
          // Payment method attachment is critical - subscription should not be created without it
          console.error("❌ Failed to attach payment method to customer:", attachError);
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'create-subscription.ts:184',message:'Payment method attachment failed for existing customer - RETURNING ERROR',data:{paymentMethodId:finalPaymentMethodId,customerId:customer.id,errorMessage,errorCode,errorStringified:JSON.stringify(attachError)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          
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
      }
    } else {
      // For guest users or new users, get the customer ID from the payment method
      // console.log("🔍 Retrieving payment method to get customer ID...");
      try {
        const paymentMethod = await stripe.paymentMethods.retrieve(finalPaymentMethodId);
        if (paymentMethod.customer) {
          // Payment method has a customer - use it
          // console.log(`👤 Payment method attached to customer: ${paymentMethod.customer}`);
          customer = await stripe.customers.retrieve(paymentMethod.customer as string);
          // console.log(`✅ Using customer from payment method: ${customer.id}`);

          // Update the customer with proper details if it's a temporary guest customer
          const customerWithMetadata = customer as Stripe.Customer;
          if (customerWithMetadata.metadata?.type === "guest" || customerWithMetadata.metadata?.temporary === "true") {
            // console.log("🔄 Updating temporary customer with proper details...");
            customer = await stripe.customers.update(customer.id, {
              email: validatedData.userEmail,
              name: `${validatedData.firstName} ${validatedData.lastName}`,
              phone: validatedData.mobile,
              metadata: {
                packageId: validatedData.packageId,
                packageName: membershipPackage.name,
                userId: registeredUser?._id?.toString() || "guest",
              },
            });
            // console.log(`✅ Updated customer details: ${customer.id}`);
          }
        } else {
          // ✅ FIX: Payment method has no customer - create one and attach it
          // This happens when PaymentIntent was created without a customer
          // console.log("🆕 Payment method has no customer - creating new customer...");

          customer = await stripe.customers.create({
            email: validatedData.userEmail,
            name: `${validatedData.firstName} ${validatedData.lastName}`,
            phone: validatedData.mobile,
            metadata: {
              packageId: validatedData.packageId,
              packageName: membershipPackage.name,
              userId: registeredUser?._id?.toString() || "guest",
            },
          });

          // Attach payment method to the newly created customer
          try {
            await stripe.paymentMethods.attach(finalPaymentMethodId, {
              customer: customer.id,
            });
            // console.log(`✅ Created customer ${customer.id} and attached payment method`);
          } catch (attachError: unknown) {
            // Check if error is due to payment method being "consumed" (used without attachment)
            const errorMessage = attachError instanceof Error ? attachError.message : String(attachError);
            if (
              errorMessage.includes("previously used without being attached") ||
              errorMessage.includes("may not be used again")
            ) {
              console.warn("⚠️ Payment method from upfront PaymentIntent cannot be reused, will collect fresh payment method");
              canUsePaymentMethod = false;
            } else {
              console.error("❌ Failed to attach payment method to customer:", attachError);
              throw attachError; // Re-throw unexpected errors
            }
          }

          // If registered user exists, update them with the customer ID
          if (registeredUser) {
            registeredUser.stripeCustomerId = customer.id;
            await registeredUser.save();
            // console.log(`✅ Linked customer ${customer.id} to registered user ${registeredUser._id}`);
          }
        }
      } catch (error) {
        console.error("❌ Failed to retrieve payment method:", error);
        throw new Error("Failed to retrieve payment method details");
      }
    }

    // ✅ CRITICAL FIX: Ensure payment method is attached and set as default BEFORE creating subscription
    // This prevents "No payment method found" errors when confirming subscription payment
    // DO NOT save payment method to user database here - it will only be saved AFTER payment succeeds (via webhook)
    // This prevents saving payment methods when payments fail due to insufficient funds
    if (canUsePaymentMethod && finalPaymentMethodId && finalPaymentMethodId !== "new_payment_method") {
      try {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'create-subscription.ts:271',message:'Payment method attachment - BEFORE retrieve',data:{paymentMethodId:finalPaymentMethodId,customerId:customer.id,canUsePaymentMethod},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        // ✅ ENHANCED: Verify payment method exists and is properly attached
        const paymentMethod = await stripe.paymentMethods.retrieve(finalPaymentMethodId);
        const pmCustomerId = typeof paymentMethod.customer === "string" ? paymentMethod.customer : paymentMethod.customer?.id;
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'create-subscription.ts:276',message:'Payment method retrieved - attachment check',data:{paymentMethodId:finalPaymentMethodId,pmCustomerId,expectedCustomerId:customer.id,isAttached:pmCustomerId===customer.id,paymentMethodType:paymentMethod.type},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        // ✅ ENHANCED: Ensure payment method is attached to customer (idempotent check)
        if (!pmCustomerId || pmCustomerId !== customer.id) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'create-subscription.ts:280',message:'Attaching payment method to customer',data:{paymentMethodId:finalPaymentMethodId,customerId:customer.id,currentPmCustomerId:pmCustomerId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          
          await stripe.paymentMethods.attach(finalPaymentMethodId, {
            customer: customer.id,
          });
          console.log(`✅ Attached payment method ${finalPaymentMethodId} to customer ${customer.id} before subscription creation`);
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'create-subscription.ts:285',message:'Payment method attached successfully',data:{paymentMethodId:finalPaymentMethodId,customerId:customer.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
        }
        
        // ✅ ENHANCED: Set as default payment method and verify it was set
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'create-subscription.ts:288',message:'Setting default payment method',data:{paymentMethodId:finalPaymentMethodId,customerId:customer.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        await stripe.customers.update(customer.id, {
          invoice_settings: {
            default_payment_method: finalPaymentMethodId,
          },
        });
        
        // ✅ ENHANCED: Verify default payment method was set correctly
        const updatedCustomer = await stripe.customers.retrieve(customer.id);
        const defaultPm = (updatedCustomer as { invoice_settings?: { default_payment_method?: string } })
          .invoice_settings?.default_payment_method;
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'create-subscription.ts:297',message:'Default payment method verification',data:{paymentMethodId:finalPaymentMethodId,defaultPm,isCorrect:defaultPm===finalPaymentMethodId,customerId:customer.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        if (defaultPm !== finalPaymentMethodId) {
          console.warn(`⚠️ Default payment method may not have been set correctly. Expected: ${finalPaymentMethodId}, Got: ${defaultPm}`);
        } else {
          console.log(`✅ Verified default payment method ${finalPaymentMethodId} is set for customer ${customer.id}`);
        }
      } catch (pmError) {
        // #region agent log
        const errorMessage = pmError instanceof Error ? pmError.message : String(pmError);
        const errorCode = pmError && typeof pmError === "object" && "code" in pmError ? String(pmError.code) : undefined;
        fetch('http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'create-subscription.ts:301',message:'Payment method attachment FAILED',data:{paymentMethodId:finalPaymentMethodId,customerId:customer.id,errorMessage,errorCode,errorType:typeof pmError,errorStringified:JSON.stringify(pmError)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
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
    } else if (!canUsePaymentMethod) {
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

    // ✅ CRITICAL: Get experiment assignment for A/B testing tracking
    // Store in subscription and payment metadata so webhook can use it directly (more reliable than lookup)
    // ✅ FIX: Extract anonymousId from request to find assignments created before user logged in
    const anonymousId = AnonymousIdService.extractAnonymousId(request);
    
    // ✅ Auto-merge anonymous assignments to userId when user registers/logs in
    if (registeredUser?._id && anonymousId) {
      try {
        const mergeResult = await VariantAssignmentService.mergeAnonymousToUser(anonymousId, registeredUser._id.toString());
        if (mergeResult.merged > 0) {
          console.log(`✅ [A/B Testing] Auto-merged ${mergeResult.merged} anonymous assignment(s) to user ${registeredUser._id}`);
        }
      } catch (error) {
        // Silently fail - merge should not block payment creation
        console.error("Error auto-merging anonymous assignments:", error);
      }
    }
    
    let experimentAssignment: { experimentId: string; variantId: string } | null = null;
    if (registeredUser?._id) {
      try {
        // ✅ Pass anonymousId to find assignments created before user logged in
        experimentAssignment = await getUserActiveExperimentAssignment(
          registeredUser._id.toString(),
          undefined, // slug
          anonymousId || undefined // anonymousId from cookies
        );
        
            // ✅ Fallback: Check cookies if database lookup failed
            if (!experimentAssignment) {
              // Check all assignment cookies (format: ta_ab_assignment_<experimentId>)
              // RequestCookies doesn't have entries(), so we need to check known experiment IDs
              // For now, we'll check if there's a cookie for the active experiment
              // This is a best-effort fallback
              try {
                const activeExperiments = await ExperimentRepository.findAll({
                  status: "active",
                  page: 1,
                  limit: 10,
                });
                
                for (const exp of activeExperiments.experiments) {
                  const experimentId = exp._id instanceof mongoose.Types.ObjectId 
                    ? exp._id.toString() 
                    : String(exp._id);
                  const cookieName = `ta_ab_assignment_${experimentId}`;
                  const cookieValue = request.cookies.get(cookieName)?.value;
                  
                  if (cookieValue) {
                    try {
                      const assignmentData = JSON.parse(cookieValue);
                      if (assignmentData.experimentId && assignmentData.variantId) {
                        experimentAssignment = {
                          experimentId: assignmentData.experimentId,
                          variantId: assignmentData.variantId,
                        };
                        console.log(`✅ [A/B Testing] Found assignment from cookie:`, experimentAssignment);
                        break;
                      }
                    } catch (error) {
                      // Invalid cookie data, skip
                      console.warn(`⚠️ [A/B Testing] Invalid assignment cookie: ${cookieName}`);
                    }
                  }
                }
              } catch (error) {
                // Silently fail - cookie fallback should not block payment creation
                console.warn("Error checking assignment cookies:", error);
              }
            }
        
        if (experimentAssignment) {
          console.log(`✅ [A/B Testing] Storing experiment assignment in subscription metadata:`, experimentAssignment);
        }
      } catch (error) {
        // Silently fail - experiment tracking should not block payment creation
        console.error("Error getting experiment assignment for subscription metadata:", error);
      }
    }

    // ✅ STRIPE BEST PRACTICE: Generate idempotency key to prevent duplicate subscription creation
    // This ensures that even if the API is called twice (e.g., double-click), only one subscription is created
    const idempotencyKey =
      validatedData.idempotencyKey || `sub_${validatedData.packageId}_${validatedData.userEmail}_${Date.now()}`;

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
          expand: ["latest_invoice.payment_intent"], // ✅ Get PaymentIntent from invoice
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

    // ✅ Get PaymentIntent from subscription's invoice (Stripe created it automatically with correct amount)
    // First, try to get PaymentIntent from expanded subscription
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

    if (!invoiceId) {
      console.error("❌ No invoice ID found in subscription");
      return NextResponse.json(
        {
          success: false,
          error: "Failed to create invoice. Please try again.",
        },
        { status: 500 }
      );
    }

    // Retrieve invoice with expansion if we don't have it yet
    if (!latestInvoice) {
      latestInvoice = await stripe.invoices.retrieve(invoiceId as string, {
        expand: ["payment_intent"],
      });
      paymentIntent = (latestInvoice as Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent | string })
        ?.payment_intent;
    }

    // ✅ CRITICAL: If invoice is draft, finalize it first
    // With payment_behavior: "default_incomplete", Stripe creates draft invoice
    if (latestInvoice.status === "draft") {
      try {
        latestInvoice = await stripe.invoices.finalizeInvoice(invoiceId as string, {
          expand: ["payment_intent"],
        });
        paymentIntent = (latestInvoice as Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent | string })
          ?.payment_intent;
        console.log(`✅ Invoice finalized: ${latestInvoice.id}, status: ${latestInvoice.status}`);
      } catch (finalizeError) {
        console.error("❌ Failed to finalize invoice:", finalizeError);
        return NextResponse.json(
          {
            success: false,
            error: "Failed to finalize invoice. Please try again.",
          },
          { status: 500 }
        );
      }
    }

    // ✅ NOTE: Upfront PaymentIntent cancellation moved BEFORE subscription creation (above)
    // This ensures it's cancelled before it can be confirmed, preventing double charging

    // ✅ CRITICAL: If invoice is "open" but has no PaymentIntent, create one manually
    // With payment_behavior: "default_incomplete", Stripe doesn't create PaymentIntent automatically
    // We need to create it for wallet payments (Google Pay/Apple Pay) to show correct amount
    if (!paymentIntent && latestInvoice.status === "open") {
      try {
        // ✅ FIX: Use invoice amount_due, but fallback to subscription price if amount_due is 0
        // This handles edge cases where invoice might have 0 amount due to prorations or trials
        const invoiceAmount = latestInvoice.amount_due || Math.round(membershipPackage.price * 100);
        const invoiceCurrency = (latestInvoice.currency as string) || "aud";

        console.log(
          `⚠️ Invoice is open but has no PaymentIntent. Creating PaymentIntent for amount: ${invoiceAmount} (invoice amount_due: ${
            latestInvoice.amount_due
          }, package price: ${Math.round(membershipPackage.price * 100)})`
        );

        // ✅ DEBUG: Verify amount is correct for wallet display
        if (invoiceAmount === 0) {
          console.warn(
            `⚠️ WARNING: PaymentIntent amount is 0! This will show $0.00 in Google Pay/Apple Pay. Using package price fallback: ${Math.round(
              membershipPackage.price * 100
            )}`
          );
        }

        // ✅ CRITICAL: Get experiment assignment for A/B testing tracking
        // Store in metadata so webhook can use it directly (more reliable than lookup)
        let experimentAssignment: { experimentId: string; variantId: string } | null = null;
        if (registeredUser?._id) {
          try {
            // ✅ Pass anonymousId to find assignments created before user logged in
            experimentAssignment = await getUserActiveExperimentAssignment(
              registeredUser._id.toString(),
              undefined, // slug
              anonymousId || undefined // anonymousId from cookies
            );
            
            // ✅ Fallback: Check cookies if database lookup failed
            if (!experimentAssignment) {
              // Check all assignment cookies (format: ta_ab_assignment_<experimentId>)
              try {
                const activeExperiments = await ExperimentRepository.findAll({
                  status: "active",
                  page: 1,
                  limit: 10,
                });
                
                for (const exp of activeExperiments.experiments) {
                  const experimentId = exp._id instanceof mongoose.Types.ObjectId 
                    ? exp._id.toString() 
                    : String(exp._id);
                  const cookieName = `ta_ab_assignment_${experimentId}`;
                  const cookieValue = request.cookies.get(cookieName)?.value;
                  
                  if (cookieValue) {
                    try {
                      const assignmentData = JSON.parse(cookieValue);
                      if (assignmentData.experimentId && assignmentData.variantId) {
                        experimentAssignment = {
                          experimentId: assignmentData.experimentId,
                          variantId: assignmentData.variantId,
                        };
                        console.log(`✅ [A/B Testing] Found assignment from cookie:`, experimentAssignment);
                        break;
                      }
                    } catch (error) {
                      // Invalid cookie data, skip
                      console.warn(`⚠️ [A/B Testing] Invalid assignment cookie: ${cookieName}`);
                    }
                  }
                }
              } catch (error) {
                // Silently fail - cookie fallback should not block payment creation
                console.warn("Error checking assignment cookies:", error);
              }
            }
            
            if (experimentAssignment) {
              console.log(`✅ [A/B Testing] Storing experiment assignment in payment metadata:`, experimentAssignment);
            }
          } catch (error) {
            // Silently fail - experiment tracking should not block payment creation
            console.error("Error getting experiment assignment for payment metadata:", error);
          }
        }

        // ✅ STRIPE BEST PRACTICE: Generate idempotency key to prevent duplicate PaymentIntent creation
        // This ensures that even if the API is called twice, only one PaymentIntent is created
        const invoicePaymentIntentIdempotencyKey = `pi_invoice_${latestInvoice.id || subscription.id}_${Date.now()}`;

        // ✅ CRITICAL: Create PaymentIntent with correct amount for wallet display
        // Don't confirm it - let PaymentElement handle confirmation
        // ✅ FIX: Do NOT set payment_method here - let PaymentElement collect it from user (wallet or card)
        // Setting payment_method causes errors if it was used in upfront PaymentIntent without attachment
        const newPaymentIntent = await stripe.paymentIntents.create(
          {
            amount: invoiceAmount,
            currency: invoiceCurrency,
            customer: customer.id,
            // ✅ REMOVED: payment_method - PaymentElement will collect it from user selection
            setup_future_usage: "off_session",
            confirm: false, // ✅ Don't auto-confirm - let PaymentElement handle it
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
              userEmail: validatedData.userEmail,
              type: "subscription", // ✅ Set 'type' for webhook compatibility
              packageType: "membership",
              // ✅ REMOVED: isUpfrontPayment - This is the invoice PaymentIntent, not the upfront one
              // The upfront PaymentIntent is the one created in create-payment-intent route and canceled at the start
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
            idempotencyKey: invoicePaymentIntentIdempotencyKey, // ✅ STRIPE BEST PRACTICE: Prevent duplicate PaymentIntent creation
          }
        );

        // Update invoice metadata to track PaymentIntent and request context (optional, but helps with tracking)
        if (latestInvoice.id) {
          await stripe.invoices.update(latestInvoice.id, {
            metadata: {
              ...(latestInvoice.metadata || {}),
              payment_intent_id: newPaymentIntent.id,
              // Store request context for Facebook CAPI (webhook will extract and use)
              ...(requestContext.client_ip_address ? { capi_client_ip: requestContext.client_ip_address } : {}),
              ...(requestContext.client_user_agent ? { capi_user_agent: requestContext.client_user_agent } : {}),
              ...(requestContext.fbc ? { capi_fbc: requestContext.fbc } : {}),
              ...(requestContext.fbp ? { capi_fbp: requestContext.fbp } : {}),
            },
          });
        }

        paymentIntent = newPaymentIntent;
        console.log(`✅ Created PaymentIntent: ${newPaymentIntent.id} for invoice ${latestInvoice.id}`, {
          hasClientSecret: !!newPaymentIntent.client_secret,
          status: newPaymentIntent.status,
          amount: newPaymentIntent.amount,
        });
      } catch (createError) {
        console.error("❌ Failed to create PaymentIntent for invoice:", createError);
        return NextResponse.json(
          {
            success: false,
            error: "Failed to create payment intent. Please try again.",
          },
          { status: 500 }
        );
      }
    }

    // ✅ Extract client_secret from PaymentIntent (for frontend PaymentElement)
    // PaymentElement will automatically show correct amount in wallets (Google Pay/Apple Pay)
    let clientSecret: string | null = null;

    if (paymentIntent) {
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
    if (!clientSecret && latestInvoice.id) {
      try {
        const expandedInvoice = await stripe.invoices.retrieve(latestInvoice.id, {
          expand: ["payment_intent"],
        });
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
      } catch (retrieveError) {
        console.error("❌ Failed to retrieve invoice with expansion:", retrieveError);
      }
    }

    // ✅ FIX: Validate that we're returning invoice PaymentIntent, not canceled upfront PaymentIntent
    if (clientSecret) {
      try {
        // Extract PaymentIntent ID from clientSecret to verify it's not canceled
        const paymentIntentId = clientSecret.split("_secret_")[0];
        const retrievedPI = await stripe.paymentIntents.retrieve(paymentIntentId);
        
        console.log(`🔍 Validating PaymentIntent ${paymentIntentId}:`, {
          status: retrievedPI.status,
          isUpfrontPayment: retrievedPI.metadata?.isUpfrontPayment,
          hasInvoiceId: !!retrievedPI.metadata?.invoice_id,
          hasSubscriptionId: !!retrievedPI.metadata?.subscription_id,
        });
        
        if (retrievedPI.status === "canceled") {
          console.error(`❌ CRITICAL: Attempted to return canceled PaymentIntent ${paymentIntentId} as clientSecret`);
          // This should never happen, but if it does, try to get invoice PaymentIntent again
          // Fallback logic already exists below (lines 557-588)
          clientSecret = null; // Force fallback
        } else if (retrievedPI.metadata?.isUpfrontPayment === "true") {
          console.error(`❌ CRITICAL: Attempted to return upfront PaymentIntent ${paymentIntentId} as clientSecret`);
          // Upfront PaymentIntent should not be returned - use invoice PaymentIntent instead
          clientSecret = null; // Force fallback
        } else {
          console.log(`✅ PaymentIntent ${paymentIntentId} validation passed - returning clientSecret`);
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
        invoiceId: latestInvoice.id,
        invoiceStatus: latestInvoice.status,
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

      try {
        await user.save();
        // console.log(`✅ Created user account: ${user._id}`);
        // console.log(`⏳ Entries/points will be added via webhook upon payment confirmation`);
        // console.log(`📦 Membership will activate: ${membershipPackage.name}`);

        // ✅ Klaviyo integration handled by webhook for reliability and best practices
        // console.log(`📊 Klaviyo events will be tracked via webhook when payment is confirmed`);
      } catch (dbError) {
        console.error("❌ Database save failed:", dbError);
        throw new Error(`Failed to save user account: ${dbError instanceof Error ? dbError.message : "Unknown error"}`);
      }
    }

    // ✅ Referral processing moved to webhook (after payment succeeds)
    // Referral code is stored in subscription metadata and processed by webhook

    return NextResponse.json({
      success: true,
      data: {
        subscriptionId: subscription.id,
        customerId: customer.id,
        userId: user._id,
        clientSecret: clientSecret,
        status: subscription.status,
        packageName: membershipPackage.name,
        entriesPerMonth: membershipPackage.entriesPerMonth || 0,
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
