import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import { stripe } from "@/lib/stripe";
import { recordReferralPurchase } from "@/lib/referral";
import Stripe from "stripe";
import { z } from "zod";
import bcrypt from "bcryptjs";
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
  paymentMethodId: z.string().min(1, "Payment method is required").optional(), // Optional when createOnly is true
  referralCode: z.string().optional(),
  createOnly: z.boolean().optional(), // Create subscription PaymentIntent early without processing payment
});

/**
 * POST /api/stripe/create-subscription
 * Create a new Stripe subscription and user account (registration + subscription in one flow)
 */
export async function POST(request: NextRequest) {
  try {
    // console.log("🔌 Connecting to database...");
    await connectDB();
    // console.log("✅ Database connected successfully");

    // console.log("📥 Parsing request body...");
    const body = await request.json();
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
    const membershipPackage = getPackageById(validatedData.packageId);
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
    const createOnly = validatedData.createOnly === true; // Create subscription PaymentIntent early without processing payment

    // For wallet payments (createOnly=true), we don't need paymentMethodId upfront
    // PaymentIntent will be created without payment_method and confirmed later
    if (createOnly && !finalPaymentMethodId) {
      // This is fine - we'll create subscription without payment_method for wallet payments
    } else if (!createOnly && !finalPaymentMethodId) {
      // For non-wallet payments, paymentMethodId is required
      return NextResponse.json(
        {
          success: false,
          error: "Payment method is required for this payment type.",
        },
        { status: 400 }
      );
    }

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
      // console.log(`👤 Using existing Stripe customer: ${registeredUser.stripeCustomerId}`);
      customer = await stripe.customers.retrieve(registeredUser.stripeCustomerId);
    } else if (finalPaymentMethodId) {
      // For guest users or new users, get the customer ID from the payment method
      // console.log("🔍 Retrieving payment method to get customer ID...");
      try {
        const paymentMethod = await stripe.paymentMethods.retrieve(finalPaymentMethodId);

        if (paymentMethod.customer) {
          // Payment method is already attached to a customer
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
          // Payment method exists but is not attached to any customer
          // This can happen with Google Pay/Apple Pay - attach it to a customer
          // console.log("⚠️ Payment method not attached to customer, creating/retrieving customer and attaching...");

          // Create or retrieve customer
          if (registeredUser && registeredUser.stripeCustomerId) {
            customer = await stripe.customers.retrieve(registeredUser.stripeCustomerId);
          } else {
            // Check if customer exists by email
            const existingCustomers = await stripe.customers.list({
              email: validatedData.userEmail.toLowerCase(),
              limit: 1,
            });

            if (existingCustomers.data.length > 0) {
              customer = existingCustomers.data[0];
              // console.log(`✅ Found existing customer by email: ${customer.id}`);
            } else {
              // Create new customer
              customer = await stripe.customers.create({
                email: validatedData.userEmail,
                name: `${validatedData.firstName} ${validatedData.lastName}`,
                phone: validatedData.mobile,
                metadata: {
                  packageId: validatedData.packageId,
                  packageName: membershipPackage.name,
                  userId: registeredUser?._id?.toString() || "guest",
                  type: "wallet_payment",
                },
              });
              // console.log(`✅ Created new customer: ${customer.id}`);
            }
          }

          // Attach payment method to customer
          await stripe.paymentMethods.attach(finalPaymentMethodId, {
            customer: customer.id,
          });
          // console.log(`✅ Attached payment method ${finalPaymentMethodId} to customer ${customer.id}`);
        }
      } catch (error) {
        console.error("❌ Failed to retrieve/attach payment method:", error);
        // Provide more specific error message
        if (error instanceof Error) {
          throw new Error(`Failed to retrieve payment method details: ${error.message}`);
        }
        throw new Error("Failed to retrieve payment method details");
      }
    } else {
      // For wallet payments without payment method (createOnly=true), create a new customer
      // console.log("👤 Creating new customer for wallet payment...");
      customer = await stripe.customers.create({
        email: validatedData.userEmail,
        name: `${validatedData.firstName} ${validatedData.lastName}`,
        phone: validatedData.mobile,
        metadata: {
          packageId: validatedData.packageId,
          packageName: membershipPackage.name,
          userId: registeredUser?._id?.toString() || "guest",
          type: "wallet_payment",
        },
      });
      // console.log(`✅ Created new customer: ${customer.id}`);
    }

    // Set payment method as default if provided
    if (finalPaymentMethodId && finalPaymentMethodId !== "new_payment_method") {
      await stripe.customers.update(customer.id, {
        invoice_settings: {
          default_payment_method: finalPaymentMethodId,
        },
      });
      // console.log(`💳 Set ${finalPaymentMethodId} as default payment method for customer ${customer.id}`);
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

    // Create subscription with payment method
    // ✅ STRIPE BEST PRACTICE: Enable automatic_payment_methods for Google Pay/Apple Pay support
    // console.log("📋 Creating Stripe subscription...");
    let subscription;
    try {
      subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [
          {
            price: stripePriceId, // ✅ Use existing Price ID
          },
        ],
        payment_behavior: "default_incomplete",
        payment_settings: { save_default_payment_method: "on_subscription" },
        expand: ["latest_invoice.payment_intent"],
        description: `${membershipPackage.name}`, // Set description directly on subscription
        metadata: {
          packageId: validatedData.packageId,
          packageName: membershipPackage.name,
          userEmail: validatedData.userEmail,
        },
      });

      // console.log(`📋 Created subscription: ${subscription.id}`);
      // console.log(`📊 Subscription status: ${subscription.status}`);
    } catch (stripeError) {
      console.error("❌ Stripe subscription creation failed:", stripeError);
      throw new Error(
        `Failed to create Stripe subscription: ${stripeError instanceof Error ? stripeError.message : "Unknown error"}`
      );
    }

    // Get the payment intent for confirmation
    // ✅ STRIPE BEST PRACTICE: PaymentElement automatically handles wallet payments (Google Pay/Apple Pay)
    // for subscriptions when using the clientSecret from the subscription's invoice
    // The invoice is expanded with payment_intent, so we can access it directly
    const latestInvoice = subscription.latest_invoice as { payment_intent?: Stripe.PaymentIntent | string } | null;
    let paymentIntent: Stripe.PaymentIntent | null = null;

    // Extract PaymentIntent from invoice
    if (latestInvoice?.payment_intent) {
      if (typeof latestInvoice.payment_intent === "object") {
        paymentIntent = latestInvoice.payment_intent;
      } else if (typeof latestInvoice.payment_intent === "string") {
        // If payment_intent is just an ID string, retrieve it
        paymentIntent = await stripe.paymentIntents.retrieve(latestInvoice.payment_intent);
      }
    }

    // console.log(`📄 Latest invoice:`, latestInvoice ? "Found" : "Not found");
    // console.log(`💳 Payment intent:`, paymentIntent ? "Found" : "Not found");

    // For incomplete subscriptions, we might not have a payment intent yet
    // This is normal - the payment intent will be created when the customer confirms payment
    // PaymentElement will automatically enable wallet payments when using this clientSecret
    let clientSecret = null;
    if (paymentIntent && paymentIntent.client_secret) {
      clientSecret = paymentIntent.client_secret;
      // console.log(`💳 Payment intent status: ${paymentIntent.status}`);
    } else {
      // console.log(`⏳ No payment intent yet - will be created when customer confirms payment`);
    }

    // If createOnly is true, skip user creation/update and return only clientSecret
    if (createOnly) {
      return NextResponse.json({
        success: true,
        data: {
          subscriptionId: subscription.id,
          customerId: customer.id,
          clientSecret: clientSecret,
          status: subscription.status,
          packageName: membershipPackage.name,
        },
      });
    }

    let user;

    if (registeredUser) {
      // User already exists (registered in step 1), update their Stripe customer ID, subscription ID and payment method
      // console.log(
      //   `🔄 Updating existing user with Stripe customer ID: ${customer.id} and subscription ID: ${subscription.id}`
      // );

      // PCI-COMPLIANT: Only store Stripe payment method IDs, never card details
      const savedPaymentMethodData = {
        paymentMethodId: finalPaymentMethodId,
        isDefault: true, // Set as default since it's the first payment method
        createdAt: new Date(),
      };

      // Update existing user with Stripe customer ID, subscription ID and payment method
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
          $push: { savedPaymentMethods: savedPaymentMethodData },
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

      // PCI-COMPLIANT: Only store Stripe payment method IDs, never card details
      const savedPaymentMethodData = {
        paymentMethodId: finalPaymentMethodId,
        isDefault: true, // Set as default since it's the first payment method
        createdAt: new Date(),
      };

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
        savedPaymentMethods: [savedPaymentMethodData], // Save the payment method directly
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

    if (validatedData.referralCode && user?._id) {
      try {
        await recordReferralPurchase({
          referralCode: validatedData.referralCode,
          inviteeUserId: user._id.toString(),
          inviteeEmail: user.email,
          inviteeName: `${user.firstName} ${user.lastName}`.trim(),
          qualifyingOrderId: subscription.id,
          qualifyingOrderType: "membership",
        });
      } catch (referralError) {
        console.error("Referral purchase capture failed:", referralError);
      }
    }

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
      console.error("❌ Stripe error:", error);
      const stripeError = error as StripeError;
      return NextResponse.json(
        {
          success: false,
          error: "Payment processing error",
          details: stripeError.message || "Stripe API error",
          stripeCode: stripeError.code,
        },
        { status: 400 }
      );
    }

    console.error("❌ Error creating subscription:", error);
    console.error("❌ Error stack:", error instanceof Error ? error.stack : "No stack trace");
    console.error("❌ Error type:", typeof error);
    console.error("❌ Error message:", error instanceof Error ? error.message : "No message");

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
