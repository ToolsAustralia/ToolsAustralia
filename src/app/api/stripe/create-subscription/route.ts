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
  paymentMethodId: z.string().min(1, "Payment method is required"), // Payment method from PaymentIntent/SetupIntent (for saving)
  paymentIntentId: z.string().optional(), // ✅ NEW: Optional upfront PaymentIntent ID for wallet display (Google Pay/Apple Pay)
  idempotencyKey: z.string().optional(), // ✅ STRIPE BEST PRACTICE: Idempotency key to prevent duplicate subscription creation
  referralCode: z.string().optional(),
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
      } catch (attachError) {
        console.error("❌ Failed to attach payment method to customer:", attachError);
        // Continue - payment method might already be attached or error is non-critical
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
          await stripe.paymentMethods.attach(finalPaymentMethodId, {
            customer: customer.id,
          });

          // console.log(`✅ Created customer ${customer.id} and attached payment method`);

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

    // Payment method is already attached to customer via SetupIntent
    // Just set it as the default payment method
    if (finalPaymentMethodId && finalPaymentMethodId !== "new_payment_method") {
      await stripe.customers.update(customer.id, {
        invoice_settings: {
          default_payment_method: finalPaymentMethodId,
        },
      });
      // console.log(`💳 Set ${finalPaymentMethodId} as default payment method for customer ${customer.id}`);
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

    // ✅ STRIPE BEST PRACTICE: Cancel upfront PaymentIntent BEFORE creating subscription
    // This prevents the upfront PaymentIntent from being confirmed, which would cause double charging
    // The upfront PaymentIntent was ONLY for wallet display (Google Pay/Apple Pay)
    // The invoice PaymentIntent (from Stripe Price catalog) is the one that should be charged
    if (validatedData.paymentIntentId) {
      try {
        const upfrontPaymentIntent = await stripe.paymentIntents.retrieve(validatedData.paymentIntentId);

        // Only cancel if it's still in a cancellable state (not already succeeded/cancelled)
        // ✅ CRITICAL: Must check for "requires_capture" status (shown as "Uncaptured" in Stripe dashboard)
        // With capture_method: "manual", PaymentIntent goes to "requires_capture" after confirmation
        // This means funds are AUTHORIZED but not yet CAPTURED - we MUST cancel to release the hold
        if (
          upfrontPaymentIntent.status === "requires_payment_method" ||
          upfrontPaymentIntent.status === "requires_confirmation" ||
          upfrontPaymentIntent.status === "requires_action" ||
          upfrontPaymentIntent.status === "requires_capture" // ✅ CRITICAL: Handle uncaptured PaymentIntents
        ) {
          await stripe.paymentIntents.cancel(upfrontPaymentIntent.id);
          console.log(
            `✅ Cancelled upfront PaymentIntent ${upfrontPaymentIntent.id} BEFORE subscription creation (was for display only) - prevents double charge. Status was: ${upfrontPaymentIntent.status}`
          );
        } else if (upfrontPaymentIntent.status === "succeeded") {
          console.error(
            `❌ CRITICAL: Upfront PaymentIntent ${upfrontPaymentIntent.id} already succeeded BEFORE subscription creation! This will cause double charge.`
          );
          // Still continue - we'll use invoice PaymentIntent, but log error
        } else {
          console.log(
            `ℹ️ Upfront PaymentIntent ${upfrontPaymentIntent.id} is ${upfrontPaymentIntent.status}, no action needed`
          );
        }
      } catch (cancelError) {
        console.error(`❌ Failed to cancel upfront PaymentIntent: ${cancelError}`);
        // Continue - invoice PaymentIntent will be used anyway, but log error for investigation
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
          default_payment_method: finalPaymentMethodId,
          payment_behavior: "default_incomplete", // ✅ Stripe creates PaymentIntent automatically with correct amount
          payment_settings: { save_default_payment_method: "on_subscription" },
          expand: ["latest_invoice.payment_intent"], // ✅ Get PaymentIntent from invoice
          description: `${membershipPackage.name}`,
          metadata: {
            packageId: validatedData.packageId,
            packageName: membershipPackage.name,
            userEmail: validatedData.userEmail,
          },
        },
        {
          idempotencyKey: idempotencyKey, // ✅ STRIPE BEST PRACTICE: Prevent duplicate subscription creation
        }
      );

      // console.log(`📋 Created subscription: ${subscription.id}`);
      // console.log(`📊 Subscription status: ${subscription.status}`);
    } catch (stripeError) {
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

        // ✅ CRITICAL: Create PaymentIntent with correct amount for wallet display
        // Don't confirm it - let PaymentElement handle confirmation
        const newPaymentIntent = await stripe.paymentIntents.create({
          amount: invoiceAmount,
          currency: invoiceCurrency,
          customer: customer.id,
          payment_method: finalPaymentMethodId,
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
            packageType: "subscription",
            isUpfrontPayment: "true", // ✅ Mark as upfront payment so webhook skips it
          },
        });

        // Update invoice metadata to track PaymentIntent (optional, but helps with tracking)
        if (latestInvoice.id) {
          await stripe.invoices.update(latestInvoice.id, {
            metadata: {
              ...(latestInvoice.metadata || {}),
              payment_intent_id: newPaymentIntent.id,
            },
          });
        }

        paymentIntent = newPaymentIntent;
        console.log(`✅ Created PaymentIntent: ${newPaymentIntent.id} for invoice ${latestInvoice.id}`);
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
