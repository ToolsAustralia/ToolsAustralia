import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import { getMiniDrawPackageById } from "@/data/miniDrawPackages";
import { stripe } from "@/lib/stripe";
import { recordReferralPurchase } from "@/lib/referral";
import { trackAffiliateSignup } from "@/lib/affiliate";
import Stripe from "stripe";
import { z } from "zod";
import { extractRequestContext } from "@/utils/tracking/facebook-helpers";
// ✅ REMOVED: processPaymentBenefits and isPaymentProcessed imports
// Fallback processing removed to prevent duplicate Facebook tracking
// Webhook is now the single source of truth for payment processing
import Promo from "@/models/Promo";
import { savePaymentMethodToUser } from "@/utils/payment/payment-method-manager";
import { autoLogPaymentErrorServer } from "@/utils/error-reporting/auto-log-error-server";
// Klaviyo integration handled by webhook for best practices
// Benefits are granted via webhook processing only

const createOneTimePurchaseSchema = z.object({
  userEmail: z.string().email("Invalid email address"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  mobile: z.string().optional(),
  packageId: z.string().min(1, "Package ID is required"),
  password: z.string().min(6, "Password must be at least 6 characters").optional(), // Made optional for passwordless users
  paymentMethodId: z.string().min(1, "Payment method is required"),
  paymentIntentId: z.string().optional(), // Optional PaymentIntent ID if already confirmed upfront
  idempotencyKey: z.string().optional(), // ✅ STRIPE BEST PRACTICE: Idempotency key to prevent duplicate PaymentIntent creation
  referralCode: z.string().optional(),
  affiliateCode: z.string().optional(),
  promoLinkCode: z.string().optional(),
});

/**
 * Note: Benefits are granted via webhook processing only
 * This function is kept for API response structure but no longer processes benefits
 */
type MinimalUser = { _id: string };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleOneTimePaymentSuccess(
  user: MinimalUser,
  membershipPackage: {
    _id: string;
    name: string;
    price: number;
    totalEntries: number;
  },
  paymentIntentId: string
) {
  // console.log(`✅ ONE-TIME PAYMENT SUCCESS: Payment ${paymentIntentId} created successfully`);
  // console.log(`📋 Benefits will be granted via webhook processing shortly`);

  // No benefit processing here - webhook will handle it
  return {
    success: true,
    message: "Payment successful. Benefits will be processed shortly.",
    paymentIntentId,
    packageName: membershipPackage.name,
    entriesCount: membershipPackage.totalEntries,
  };
}

// ✅ REMOVED: addEntriesToMajorDrawImmediately function - now handled by processPaymentBenefits utility

/**
 * Get the base URL for API requests
 * Prioritizes NEXT_PUBLIC_APP_URL environment variable
 * Validates production environment requires the URL to be set
 */
function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_APP_URL must be set in production environment");
  }

  // console.warn(`⚠️ NEXT_PUBLIC_APP_URL not set, falling back to localhost:3000`);
  return "http://localhost:3000";
}

/**
 * POST /api/stripe/create-one-time-purchase
 * Create a one-time purchase payment intent and user account
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, prefer-const
  let paymentIntent: any = null;
  
  try {
    await connectDB();

    // Extract request context for Facebook CAPI (IP, user agent, fbc, fbp)
    // Store in payment metadata so webhook can use it for improved match quality
    const requestContext = extractRequestContext(request);

    const body = await request.json();
    requestBody = body; // Store for error logging
    const validatedData = createOneTimePurchaseSchema.parse(body);
    const normalizedAffiliateCode = validatedData.affiliateCode?.trim().toUpperCase();

    console.log(`🛒 Creating one-time purchase for: ${validatedData.userEmail}`);

    // Check if user already exists
    const existingUser = await User.findOne({ email: validatedData.userEmail });
    if (existingUser) {
      console.log(`👤 User already exists, proceeding with purchase: ${existingUser._id}`);
      // User already exists (registered in step 1), proceed with purchase
    }

    // Get the package (check both regular membership packages and mini draw packages)
    membershipPackage = getPackageById(validatedData.packageId);
    let isMiniDrawPackage = false;

    // If not found in regular packages, check mini draw packages
    if (!membershipPackage) {
      const miniDrawPackage = getMiniDrawPackageById(validatedData.packageId);
      if (miniDrawPackage && miniDrawPackage.isActive) {
        // Convert mini draw package to membership package format for compatibility
        membershipPackage = {
          _id: miniDrawPackage._id,
          name: miniDrawPackage.name,
          price: miniDrawPackage.price,
          totalEntries: miniDrawPackage.entries,
          isActive: miniDrawPackage.isActive,
          type: "one-time" as const,
          description: miniDrawPackage.description,
          features: [
            `${miniDrawPackage.entries} Free Entries`,
            `${miniDrawPackage.partnerDiscountDays} Days Partner Discounts`,
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        isMiniDrawPackage = true;
        console.log("🎲 Mini draw package detected for new user:", miniDrawPackage.name);
      }
    }

    if (!membershipPackage) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    }

    if (membershipPackage.type !== "one-time") {
      return NextResponse.json({ error: "Package must be a one-time type" }, { status: 400 });
    }

    // Check if user already exists (from registration)
    console.log("👤 Checking if user already exists...");
    const registeredUser = await User.findOne({ email: validatedData.userEmail.toLowerCase() });
    const existingAffiliateCode = registeredUser?.affiliateReferral?.affiliateCode;
    const affiliateMetadataCode = normalizedAffiliateCode || existingAffiliateCode;

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

    // First, check if we have a registered user with an existing Stripe customer
    if (registeredUser && registeredUser.stripeCustomerId) {
      console.log(`👤 Using existing Stripe customer: ${registeredUser.stripeCustomerId}`);
      const retrievedCustomer = await stripe.customers.retrieve(registeredUser.stripeCustomerId);

      // ✅ FIX: Check if customer was deleted
      if ("deleted" in retrievedCustomer && retrievedCustomer.deleted) {
        // Customer was deleted, create a new one
        console.log("⚠️ Existing customer was deleted, creating new customer...");
        customer = await stripe.customers.create({
          email: validatedData.userEmail,
          name: `${validatedData.firstName} ${validatedData.lastName}`,
          phone: validatedData.mobile,
          metadata: {
            packageId: validatedData.packageId,
            packageName: membershipPackage.name,
            userId: registeredUser._id.toString(),
          },
        });
        registeredUser.stripeCustomerId = customer.id;
        await registeredUser.save();
        console.log(`✅ Created new customer ${customer.id} to replace deleted one`);
      } else {
        customer = retrievedCustomer as Stripe.Customer;
      }

      // ✅ FIX: Attach payment method to customer if not already attached
      // This handles cases where PaymentIntent was created without a customer
      try {
        const paymentMethod = await stripe.paymentMethods.retrieve(finalPaymentMethodId);
        if (!paymentMethod.customer || paymentMethod.customer !== customer.id) {
          await stripe.paymentMethods.attach(finalPaymentMethodId, {
            customer: customer.id,
          });
          console.log(`✅ Attached payment method to existing customer: ${customer.id}`);
        }
      } catch (attachError) {
        console.error("❌ Failed to attach payment method to customer:", attachError);
        // Continue - payment method might already be attached or error is non-critical
      }
    } else {
      // For guest users or new users, get the customer ID from the payment method
      console.log("🔍 Retrieving payment method to get customer ID...");
      try {
        const paymentMethod = await stripe.paymentMethods.retrieve(finalPaymentMethodId);
        if (paymentMethod.customer) {
          // Payment method has a customer - use it
          console.log(`👤 Payment method attached to customer: ${paymentMethod.customer}`);
          const retrievedCustomer = await stripe.customers.retrieve(paymentMethod.customer as string);

          // ✅ FIX: Check if customer was deleted
          if ("deleted" in retrievedCustomer && retrievedCustomer.deleted) {
            // Customer was deleted, create a new one
            console.log("⚠️ Customer from payment method was deleted, creating new customer...");
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
            // Attach payment method to new customer
            await stripe.paymentMethods.attach(finalPaymentMethodId, {
              customer: customer.id,
            });
            console.log(`✅ Created new customer ${customer.id} and attached payment method`);
          } else {
            customer = retrievedCustomer as Stripe.Customer;
            console.log(`✅ Using customer from payment method: ${customer.id}`);

            // Update the customer with proper details if it's a temporary guest customer
            if (customer.metadata?.type === "guest" || customer.metadata?.temporary === "true") {
              console.log("🔄 Updating temporary customer with proper details...");
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
              console.log(`✅ Updated customer details: ${customer.id}`);
            }
          }
        } else {
          // ✅ FIX: Payment method has no customer - create one and attach it
          // This happens when PaymentIntent was created without a customer
          console.log("🆕 Payment method has no customer - creating new customer...");

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
          await stripe.paymentMethods.attach(finalPaymentMethodId, {
            customer: customer.id,
          });

          console.log(`✅ Created customer ${customer.id} and attached payment method`);

          // If registered user exists, update them with the customer ID
          if (registeredUser) {
            registeredUser.stripeCustomerId = customer.id;
            await registeredUser.save();
            console.log(`✅ Linked customer ${customer.id} to registered user ${registeredUser._id}`);
          }
        }
      } catch (error) {
        console.error("❌ Failed to retrieve payment method:", error);
        throw new Error("Failed to retrieve payment method details");
      }
    }

    // Payment method is already attached to customer via SetupIntent
    // Just set it as the default payment method
    // ✅ SYNC: Also update customer email if it differs from form email
    // ✅ FIX: Ensure customer is not deleted before accessing email
    if ("deleted" in customer && customer.deleted) {
      throw new Error("Stripe customer was deleted - cannot proceed with purchase");
    }

    const customerEmail = customer.email || "";
    const needsEmailUpdate = customerEmail.toLowerCase() !== validatedData.userEmail.toLowerCase();

    if (needsEmailUpdate) {
      console.log(`🔄 Syncing customer email: ${customerEmail} → ${validatedData.userEmail}`);
      await stripe.customers.update(customer.id, {
        email: validatedData.userEmail,
        invoice_settings: {
          default_payment_method: finalPaymentMethodId,
        },
      });
      console.log(`✅ Customer email synced: ${customer.id}`);
    } else {
      await stripe.customers.update(customer.id, {
        invoice_settings: {
          default_payment_method: finalPaymentMethodId,
        },
      });
    }
    console.log(`💳 Set ${finalPaymentMethodId} as default payment method for customer ${customer.id}`);

    // ✅ SINGLE SOURCE OF TRUTH: Reuse confirmed PaymentIntent if provided, otherwise create new one
    let paymentIntent: Stripe.PaymentIntent;

    if (validatedData.paymentIntentId) {
      // Validate the existing PaymentIntent
      const existingPaymentIntent = await stripe.paymentIntents.retrieve(validatedData.paymentIntentId);

      // Validate PaymentIntent status
      // ✅ FIX: Accept "succeeded" OR "processing" status (wallet payments may be processing)
      if (existingPaymentIntent.status !== "succeeded" && existingPaymentIntent.status !== "processing") {
        return NextResponse.json(
          {
            error: "PaymentIntent must be succeeded or processing to reuse",
            details: `Current status: ${existingPaymentIntent.status}`,
          },
          { status: 400 }
        );
      }

      // Validate amount matches
      const expectedAmount = Math.round(membershipPackage.price * 100);
      if (existingPaymentIntent.amount !== expectedAmount) {
        return NextResponse.json({ error: "PaymentIntent amount mismatch" }, { status: 400 });
      }

      // ✅ FIX: Validate customer matches only if PaymentIntent has a customer
      // PaymentIntents created without a customer (our new flow) will have customer as null
      // In that case, we skip validation since we're creating/attaching the customer now
      const customerId =
        typeof existingPaymentIntent.customer === "string"
          ? existingPaymentIntent.customer
          : existingPaymentIntent.customer?.id;

      if (customerId && customerId !== customer.id) {
        return NextResponse.json({ error: "PaymentIntent customer mismatch" }, { status: 400 });
      }

      // Use existing PaymentIntent - DON'T CREATE NEW ONE
      paymentIntent = existingPaymentIntent;

      // ✅ FIX: Update PaymentIntent with customer and metadata
      // This ensures webhook can find the user by customer ID
      const packageTypeValue = isMiniDrawPackage ? "mini-draw" : "one-time";
      console.log(`🔄 Updating PaymentIntent ${existingPaymentIntent.id} with metadata for webhook processing...`);
      console.log(`📋 Original metadata:`, existingPaymentIntent.metadata);

      const updatedMetadata = {
        ...existingPaymentIntent.metadata,
        packageId: validatedData.packageId,
        userEmail: validatedData.userEmail,
        // ✅ FIX: Add userId for registered users so webhook can find them
        // This fixes the issue where userId remains "guest" even for registered users
        ...(registeredUser && { userId: registeredUser._id.toString() }),
        type: packageTypeValue, // ✅ CRITICAL: Set 'type' for webhook compatibility
        packageType: packageTypeValue, // ✅ Also set 'packageType' for consistency
        entriesCount: (membershipPackage.totalEntries || membershipPackage.entriesPerMonth || 0).toString(),
        price: Math.round(membershipPackage.price * 100).toString(),
        // ✅ ADD: Include user data for account creation in webhook (for new users)
        ...(!registeredUser && {
          firstName: validatedData.firstName,
          lastName: validatedData.lastName,
          mobile: validatedData.mobile || "",
          isNewUser: "true", // Flag to indicate this is a new user
          ...(validatedData.password && { password: validatedData.password }), // Only if provided
        }),
        // ✅ ADD: Store payment method ID for webhook to save after payment succeeds
        paymentMethodId: finalPaymentMethodId,
        ...(affiliateMetadataCode ? { affiliateCode: affiliateMetadataCode } : {}),
        ...(validatedData.promoLinkCode && { promoLinkCode: validatedData.promoLinkCode }),
        ...(validatedData.referralCode && { referralCode: validatedData.referralCode }),
        // Store request context for Facebook CAPI (webhook will extract and use)
        ...(requestContext.client_ip_address ? { capi_client_ip: requestContext.client_ip_address } : {}),
        ...(requestContext.client_user_agent ? { capi_user_agent: requestContext.client_user_agent } : {}),
        ...(requestContext.fbc ? { capi_fbc: requestContext.fbc } : {}),
        ...(requestContext.fbp ? { capi_fbp: requestContext.fbp } : {}),
      };

      console.log(`📋 Updated metadata:`, updatedMetadata);

      await stripe.paymentIntents.update(existingPaymentIntent.id, {
        customer: customer.id, // ✅ Update customer field so webhook can find user
        // ✅ STRIPE BEST PRACTICE: Update description to package name for better tracking
        description: membershipPackage.name,
        metadata: updatedMetadata,
      });

      // ✅ SYNC: Ensure customer email matches form email (in case user changed email in form)
      // ✅ FIX: Ensure customer is not deleted before accessing email
      if ("deleted" in customer && customer.deleted) {
        throw new Error("Stripe customer was deleted - cannot proceed with purchase");
      }

      const customerEmail = customer.email || "";
      if (customerEmail.toLowerCase() !== validatedData.userEmail.toLowerCase()) {
        console.log(
          `🔄 Syncing customer email after PaymentIntent update: ${customerEmail} → ${validatedData.userEmail}`
        );
        customer = await stripe.customers.update(customer.id, {
          email: validatedData.userEmail,
        });
        console.log(`✅ Customer email synced: ${customer.id}`);
      }

      console.log(`✅ PaymentIntent ${existingPaymentIntent.id} updated with customer ${customer.id} and metadata`);

      // ✅ CRITICAL: Re-fetch PaymentIntent to get fresh metadata after update
      // This ensures fallback processing uses the correct metadata with entriesCount
      paymentIntent = await stripe.paymentIntents.retrieve(existingPaymentIntent.id);
      console.log(`🔄 Re-fetched PaymentIntent with updated metadata:`, {
        id: paymentIntent.id,
        entriesCount: paymentIntent.metadata.entriesCount,
        price: paymentIntent.metadata.price,
        userEmail: paymentIntent.metadata.userEmail,
      });
    } else {
      // Fallback: Create new PaymentIntent (for non-wallet payments)
      // ✅ STRIPE BEST PRACTICE: Generate idempotency key to prevent duplicate PaymentIntent creation
      // This ensures that even if the API is called twice (e.g., double-click), only one PaymentIntent is created
      const idempotencyKey =
        validatedData.idempotencyKey || 
        `pi_${validatedData.packageId}_${validatedData.userEmail}_${Date.now()}`;

      // PCI-COMPLIANT: Use automatic payment methods with redirects disabled for security
      paymentIntent = await stripe.paymentIntents.create(
        {
          amount: Math.round(membershipPackage.price * 100), // Convert to cents
        currency: "aud",
        customer: customer.id,
        payment_method: finalPaymentMethodId, // Use the final payment method ID
        confirm: true, // Auto-confirm for testing
        return_url: `${getBaseUrl()}/purchase-success`,
        setup_future_usage: "off_session", // ✅ Save payment method for future use (required for production/staging)
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: "never", // PCI-COMPLIANT: Disable redirects for security
        },
        description: `${membershipPackage.name}`, // Add meaningful description
        metadata: {
          items: JSON.stringify([
            {
              type: isMiniDrawPackage ? "mini-draw" : "membership",
              id: validatedData.packageId,
              name: membershipPackage.name,
              price: membershipPackage.price,
            },
          ]),
          packageId: validatedData.packageId,
          userEmail: validatedData.userEmail,
          // ✅ FIX: Add userId for registered users so webhook can find them
          // This fixes the issue where userId remains "guest" even for registered users
          ...(registeredUser && { userId: registeredUser._id.toString() }),
          type: isMiniDrawPackage ? "mini-draw" : "one-time", // ✅ CRITICAL: Set 'type' for webhook compatibility
          packageType: isMiniDrawPackage ? "mini-draw" : "one-time", // ✅ Also set 'packageType' for consistency
          entriesCount: (membershipPackage.totalEntries || membershipPackage.entriesPerMonth || 0).toString(),
          price: Math.round(membershipPackage.price * 100).toString(), // Price in cents for webhook processing
          // ✅ ADD: Include user data for account creation in webhook (for new users)
          ...(!registeredUser && {
            firstName: validatedData.firstName,
            lastName: validatedData.lastName,
            mobile: validatedData.mobile || "",
            isNewUser: "true", // Flag to indicate this is a new user
            ...(validatedData.password && { password: validatedData.password }), // Only if provided
          }),
          // ✅ ADD: Store payment method ID for webhook to save after payment succeeds
          paymentMethodId: finalPaymentMethodId,
          ...(affiliateMetadataCode ? { affiliateCode: affiliateMetadataCode } : {}),
          ...(validatedData.promoLinkCode && { promoLinkCode: validatedData.promoLinkCode }),
          ...(validatedData.referralCode && { referralCode: validatedData.referralCode }),
          // Store request context for Facebook CAPI (webhook will extract and use)
          ...(requestContext.client_ip_address ? { capi_client_ip: requestContext.client_ip_address } : {}),
          ...(requestContext.client_user_agent ? { capi_user_agent: requestContext.client_user_agent } : {}),
          ...(requestContext.fbc ? { capi_fbc: requestContext.fbc } : {}),
          ...(requestContext.fbp ? { capi_fbp: requestContext.fbp } : {}),
        },
      },
      {
        idempotencyKey: idempotencyKey, // ✅ STRIPE BEST PRACTICE: Prevent duplicate PaymentIntent creation
      }
      );
    }

    console.log(`💳 Using payment intent: ${paymentIntent.id}`);
    console.log(`📋 PaymentIntent metadata:`, {
      id: paymentIntent.id,
      status: paymentIntent.status,
      customer: paymentIntent.customer,
      amount: paymentIntent.amount,
      metadata: paymentIntent.metadata,
    });

    let user;

    if (existingUser) {
      // User already exists (registered in step 1)
      // ✅ FIX: Only update Stripe customer ID, DON'T save payment method yet
      // Payment method will be saved by webhook after payment succeeds
      console.log(`🔄 Updating existing user with Stripe customer ID: ${customer.id}`);

      // Update existing user with Stripe customer ID ONLY
      // Payment method will be saved by webhook after successful payment
      user = await User.findByIdAndUpdate(
        registeredUser!._id,
        {
          $set: {
            stripeCustomerId: customer.id,
          },
          // ✅ REMOVED: Don't save payment method here - webhook will handle it
        },
        { new: true }
      );

      if (!user) {
        throw new Error("Failed to update existing user");
      }

      console.log(`✅ Updated existing user: ${user._id} (payment method will be saved after payment succeeds)`);
    } else {
      // ✅ FIX: Don't create new user account here
      // Store user data in PaymentIntent metadata instead
      // Webhook will create the account after payment succeeds
      console.log(`⏳ Deferring account creation - will be created by webhook after payment succeeds`);
      
      // Store user data in metadata for webhook to create account
      // The webhook will create the account using this metadata
      // This prevents orphaned accounts if user cancels payment
      
      // Set user to null - webhook will create it
      user = null;
      
      // ✅ CRITICAL: Ensure PaymentIntent metadata has all user data needed for account creation
      // This is already done above when creating/updating PaymentIntent
      console.log(`📋 User data stored in PaymentIntent metadata for webhook processing`);
    }

    // ✅ Attach affiliate referral if provided and not already set
    if (normalizedAffiliateCode && user && (!user.affiliateReferral || !user.affiliateReferral.affiliateId)) {
      try {
        await trackAffiliateSignup({
          affiliateCode: normalizedAffiliateCode,
          userId: user._id.toString(),
          userEmail: user.email,
        });
        user = (await User.findById(user._id)) ?? user;
      } catch (affiliateError) {
        console.error("Affiliate tracking error during one-time purchase:", affiliateError);
      }
    }

    // ✅ REMOVED: Fallback processing to prevent duplicate Facebook tracking
    // Webhook is the single source of truth for payment processing
    // All benefits and Facebook tracking are handled by webhook handlers
    // This prevents duplicate tracking that causes inflated revenue in Facebook Ads
    if (validatedData.paymentIntentId && user) {
      console.log(`✅ Payment ${paymentIntent.id} will be processed by webhook`);
    }

    // ✅ CRITICAL: Handle different payment statuses and wait for settlement
    if (paymentIntent.status === "succeeded") {
      console.log(`🔍 Payment succeeded immediately, verifying payment settlement...`);

      // Wait for payment to be fully settled (not just authorized)
      await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second buffer

      // Re-fetch payment intent to ensure it's fully settled
      const verifiedPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntent.id);
      console.log(
        `🔍 Verified PaymentIntent status: ${verifiedPaymentIntent.status}, metadata:`,
        verifiedPaymentIntent.metadata
      );

      if (verifiedPaymentIntent.status === "succeeded") {
        // ✅ CRITICAL: Save payment method IMMEDIATELY after payment succeeds (PRIMARY METHOD)
        // This prevents "No Payment Method" error when upsell modal opens
        // For existing users, save synchronously. For new users, webhook will save during account creation.
        if (user && finalPaymentMethodId) {
          try {
            const freshUser = await User.findById(user._id);
            if (freshUser) {
              console.log(`💳 [SYNC] Saving payment method immediately after payment success: ${finalPaymentMethodId}`);
              
              const saveResult = await savePaymentMethodToUser(freshUser, finalPaymentMethodId, {
                setAsDefault: !freshUser.savedPaymentMethods || freshUser.savedPaymentMethods.length === 0,
              });
              
              if (saveResult.success) {
                console.log(`✅ [SYNC] Payment method saved successfully: ${finalPaymentMethodId}`);
                // Refresh user from database to get updated payment methods
                const refreshedUser = await User.findById(user._id);
                if (refreshedUser) {
                  user = refreshedUser;
                }
              } else {
                console.error(`❌ [SYNC] Failed to save payment method: ${saveResult.error}`);
                // Continue - webhook will try as backup
              }
            }
          } catch (pmError) {
            console.error(`❌ [SYNC] Error saving payment method: ${pmError}`);
            // Continue - webhook will try as backup
          }
        }
        
        console.log(`✅ Payment fully verified and settled - benefits will be processed by webhook`);
        // Benefits will be processed by webhook - just log success
        console.log(
          `🎯 Payment verified - benefits will be processed by webhook: ${
            membershipPackage.totalEntries || 0
          } entries, ${Math.floor(membershipPackage.price)} points`
        );
        console.log(`📋 PaymentIntent ID for webhook: ${verifiedPaymentIntent.id}`);
        console.log(`👤 Customer ID for webhook lookup: ${verifiedPaymentIntent.customer}`);
        console.log(`📧 User email for webhook lookup: ${verifiedPaymentIntent.metadata.userEmail}`);
        // ✅ Klaviyo integration handled by webhook for reliability and best practices
        console.log(`📊 Klaviyo events will be tracked via webhook when payment is confirmed`);
      } else {
        console.error(`❌ Payment verification failed: ${verifiedPaymentIntent.status}`);
        // Still return success but log the verification failure
      }
    } else if (paymentIntent.status === "requires_action" || paymentIntent.status === "processing") {
      console.log(`⏳ Payment requires action or is processing, waiting for completion...`);

      // Wait longer for payment to complete
      await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 second buffer

      // Re-fetch payment intent to check final status
      const finalPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntent.id);
      console.log(`🔍 Final payment status: ${finalPaymentIntent.status}, metadata:`, finalPaymentIntent.metadata);

      if (finalPaymentIntent.status === "succeeded") {
        // ✅ CRITICAL: Save payment method IMMEDIATELY after payment succeeds (PRIMARY METHOD)
        // This prevents "No Payment Method" error when upsell modal opens
        // For existing users, save synchronously. For new users, webhook will save during account creation.
        if (user && finalPaymentMethodId) {
          try {
            const freshUser = await User.findById(user._id);
            if (freshUser) {
              console.log(`💳 [SYNC] Saving payment method immediately after payment success: ${finalPaymentMethodId}`);
              
              const saveResult = await savePaymentMethodToUser(freshUser, finalPaymentMethodId, {
                setAsDefault: !freshUser.savedPaymentMethods || freshUser.savedPaymentMethods.length === 0,
              });
              
              if (saveResult.success) {
                console.log(`✅ [SYNC] Payment method saved successfully: ${finalPaymentMethodId}`);
                // Refresh user from database to get updated payment methods
                const refreshedUser = await User.findById(user._id);
                if (refreshedUser) {
                  user = refreshedUser;
                }
              } else {
                console.error(`❌ [SYNC] Failed to save payment method: ${saveResult.error}`);
                // Continue - webhook will try as backup
              }
            }
          } catch (pmError) {
            console.error(`❌ [SYNC] Error saving payment method: ${pmError}`);
            // Continue - webhook will try as backup
          }
        }
        
        console.log(`✅ Payment completed successfully after waiting - benefits will be processed by webhook`);
        // Benefits will be processed by webhook - just log success
        console.log(
          `🎯 Payment verified - benefits will be processed by webhook: ${
            membershipPackage.totalEntries || 0
          } entries, ${Math.floor(membershipPackage.price)} points`
        );
        console.log(`📋 PaymentIntent ID for webhook: ${finalPaymentIntent.id}`);
        console.log(`👤 Customer ID for webhook lookup: ${finalPaymentIntent.customer}`);
        console.log(`📧 User email for webhook lookup: ${finalPaymentIntent.metadata.userEmail}`);
      } else {
        console.error(`❌ Payment failed after waiting: ${finalPaymentIntent.status}`);
        
        // ✅ CRITICAL FIX: Payment method is NOT saved to user database when payment fails
        // Payment methods are only saved after payment succeeds (lines 726-755, 668-697)
        // This ensures failed payment methods (e.g., insufficient funds) are not saved
        
        return NextResponse.json(
          {
            success: false,
            error: "Payment failed",
            details: `Payment status: ${finalPaymentIntent.status}`,
          },
          { status: 400 }
        );
      }
    } else {
      console.error(`❌ Payment intent status: ${paymentIntent.status} for package: ${membershipPackage._id}`);
      
      // ✅ CRITICAL FIX: Payment method is NOT saved to user database when payment fails
      // Payment methods are only saved after payment succeeds (lines 726-755, 668-697)
      // This ensures failed payment methods (e.g., insufficient funds) are not saved
      
      return NextResponse.json(
        {
          success: false,
          error: "Payment failed",
          details: `Payment status: ${paymentIntent.status}`,
        },
        { status: 400 }
      );
    }

    // ✅ FIX: Only record referral for existing users
    // New users will have referral recorded by webhook
    if (validatedData.referralCode && user?._id) {
      try {
        await recordReferralPurchase({
          referralCode: validatedData.referralCode,
          inviteeUserId: user._id.toString(),
          inviteeEmail: user.email,
          inviteeName: `${user.firstName} ${user.lastName}`.trim(),
          qualifyingOrderId: paymentIntent.id,
          qualifyingOrderType: "one-time",
        });
      } catch (referralError) {
        console.error("Referral purchase capture failed:", referralError);
      }
    }

    // ✅ FIX: Return response based on whether user exists
    // For new users, don't return user data - webhook will create account and handle login
    if (user) {
      // ✅ CRITICAL: Final refresh to ensure we have latest user data including saved payment methods
      const finalUser = await User.findById(user._id);
      if (!finalUser) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      
      // Existing user - return user data for auto-login
      return NextResponse.json({
        success: true,
        message: "One-time package purchase successful",
        data: {
          entriesAdded: membershipPackage.totalEntries || 0,
          totalEntries: finalUser.accumulatedEntries || 0,
          packageName: membershipPackage.name,
          source: "one-time-package",
          paymentVerified: true,
          paymentIntentId: paymentIntent.id,
          customerId: customer.id,
          userId: finalUser._id,
          clientSecret: paymentIntent.client_secret,
          status: paymentIntent.status,
          user: {
            id: finalUser._id,
            email: finalUser.email,
            firstName: finalUser.firstName,
            lastName: finalUser.lastName,
            role: finalUser.role,
            subscription: finalUser.subscription,
            entryWallet: finalUser.entryWallet,
            accumulatedEntries: finalUser.accumulatedEntries,
            rewardsPoints: finalUser.rewardsPoints,
            savedPaymentMethods: finalUser.savedPaymentMethods || [], // ✅ CRITICAL: Include saved payment methods
          },
          autoLogin: true, // Flag to indicate auto-login should be triggered
        },
      });
    } else {
      // New user - account will be created by webhook
      // Return success but indicate account creation is pending
      return NextResponse.json({
        success: true,
        message: "Payment successful. Account will be created shortly.",
        data: {
          entriesAdded: membershipPackage.totalEntries || 0,
          packageName: membershipPackage.name,
          source: "one-time-package",
          paymentVerified: true,
          paymentIntentId: paymentIntent.id,
          customerId: customer.id,
          status: paymentIntent.status,
          accountCreationPending: true, // Flag to indicate account creation is pending
          // Don't return user data - webhook will create account
        },
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }

    console.error("❌ Error creating one-time purchase:", error);
    
    // ✅ AUTO-LOG PAYMENT ERRORS: Automatically log payment failures
    // Extract error information
    let errorCode: string | undefined;
    let declineCode: string | undefined;
    let errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Check if it's a Stripe error
    if (error && typeof error === "object" && "type" in error) {
      const stripeError = error as { code?: string; decline_code?: string; message?: string };
      errorCode = stripeError.code;
      declineCode = stripeError.decline_code;
      errorMessage = stripeError.message || errorMessage;
    }
    
    // Use stored request body and context for error logging
    const errorContext = {
      packageId: typeof requestBody?.packageId === "string" ? requestBody.packageId : undefined,
      packageName: membershipPackage?.name,
      userEmail: typeof requestBody?.userEmail === "string" ? requestBody.userEmail : undefined,
      userId: user?._id?.toString(),
      customerId: customer?.id,
      paymentIntentId: paymentIntent?.id,
      amount: membershipPackage?.price ? Math.round(membershipPackage.price * 100) : undefined,
      errorCode,
      declineCode,
      errorMessage,
    };
    
    // Auto-log payment error (fire and forget - don't block response)
    autoLogPaymentErrorServer(error, request, errorContext).catch((logError) => {
      console.warn("Failed to auto-log payment error:", logError);
    });
    
    return NextResponse.json({ error: "Failed to create one-time purchase" }, { status: 500 });
  }
}
