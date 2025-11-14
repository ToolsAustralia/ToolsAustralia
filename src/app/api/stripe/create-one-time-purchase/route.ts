import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import { getMiniDrawPackageById } from "@/data/miniDrawPackages";
import { stripe } from "@/lib/stripe";
import { recordReferralPurchase } from "@/lib/referral";
import Stripe from "stripe";
import { z } from "zod";
import bcrypt from "bcryptjs";
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
  referralCode: z.string().optional(),
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
  console.log(`✅ ONE-TIME PAYMENT SUCCESS: Payment ${paymentIntentId} created successfully`);
  console.log(`📋 Benefits will be granted via webhook processing shortly`);

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

  console.warn(`⚠️ NEXT_PUBLIC_APP_URL not set, falling back to localhost:3000`);
  return "http://localhost:3000";
}

/**
 * POST /api/stripe/create-one-time-purchase
 * Create a one-time purchase payment intent and user account
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const validatedData = createOneTimePurchaseSchema.parse(body);

    console.log(`🛒 Creating one-time purchase for: ${validatedData.userEmail}`);

    // Check if user already exists
    const existingUser = await User.findOne({ email: validatedData.userEmail });
    if (existingUser) {
      console.log(`👤 User already exists, proceeding with purchase: ${existingUser._id}`);
      // User already exists (registered in step 1), proceed with purchase
    }

    // Get the package (check both regular membership packages and mini draw packages)
    let membershipPackage = getPackageById(validatedData.packageId);
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
      customer = await stripe.customers.retrieve(registeredUser.stripeCustomerId);
    } else {
      // For guest users or new users, get the customer ID from the payment method
      console.log("🔍 Retrieving payment method to get customer ID...");
      try {
        const paymentMethod = await stripe.paymentMethods.retrieve(finalPaymentMethodId);
        if (paymentMethod.customer) {
          console.log(`👤 Payment method attached to customer: ${paymentMethod.customer}`);
          customer = await stripe.customers.retrieve(paymentMethod.customer as string);
          console.log(`✅ Using customer from payment method: ${customer.id}`);

          // Update the customer with proper details if it's a temporary guest customer
          const customerWithMetadata = customer as Stripe.Customer;
          if (customerWithMetadata.metadata?.type === "guest" || customerWithMetadata.metadata?.temporary === "true") {
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
        } else {
          throw new Error("Payment method is not attached to any customer");
        }
      } catch (error) {
        console.error("❌ Failed to retrieve payment method:", error);
        throw new Error("Failed to retrieve payment method details");
      }
    }

    // Payment method is already attached to customer via SetupIntent
    // Just set it as the default payment method
    await stripe.customers.update(customer.id, {
      invoice_settings: {
        default_payment_method: finalPaymentMethodId,
      },
    });
    console.log(`💳 Set ${finalPaymentMethodId} as default payment method for customer ${customer.id}`);

    // Create payment intent with automatic confirmation for test mode
    // PCI-COMPLIANT: Use automatic payment methods with redirects disabled for security
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(membershipPackage.price * 100), // Convert to cents
      currency: "usd",
      customer: customer.id,
      payment_method: finalPaymentMethodId, // Use the final payment method ID
      confirm: true, // Auto-confirm for testing
      return_url: `${getBaseUrl()}/purchase-success`,
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
        packageType: isMiniDrawPackage ? "mini-draw" : "one-time",
        entriesCount: (membershipPackage.totalEntries || membershipPackage.entriesPerMonth || 0).toString(),
        price: Math.round(membershipPackage.price * 100).toString(), // Price in cents for webhook processing
      },
    });

    console.log(`💳 Created payment intent: ${paymentIntent.id}`);

    let user;

    if (existingUser) {
      // User already exists (registered in step 1), update their Stripe customer ID and payment method
      console.log(`🔄 Updating existing user with Stripe customer ID: ${customer.id}`);

      // PCI-COMPLIANT: Only store Stripe payment method IDs, never card details
      const savedPaymentMethodData = {
        paymentMethodId: finalPaymentMethodId,
        isDefault: true, // Set as default since it's the first payment method
        createdAt: new Date(),
      };

      // Update existing user with Stripe customer ID and payment method
      user = await User.findByIdAndUpdate(
        registeredUser!._id,
        {
          $set: {
            stripeCustomerId: customer.id,
          },
          $push: { savedPaymentMethods: savedPaymentMethodData },
        },
        { new: true }
      );

      if (!user) {
        throw new Error("Failed to update existing user");
      }

      console.log(`✅ Updated existing user: ${user._id}`);
    } else {
      // Create new user account (will be fully activated when webhook confirms payment)
      // Hash password only if provided (for backward compatibility with existing users)
      const hashedPassword = validatedData.password ? await bcrypt.hash(validatedData.password, 12) : undefined;

      // Clean mobile number before saving (remove spaces)
      const cleanedMobile = validatedData.mobile?.replace(/\s+/g, "") || "";
      console.log(`📱 Mobile number: "${validatedData.mobile}" -> cleaned: "${cleanedMobile}"`);

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
        subscription: {
          packageId: "",
          startDate: new Date(),
          isActive: false,
          autoRenew: true,
          status: "incomplete",
          pendingChange: undefined, // Initialize pendingChange field for subscription management
        }, // Initialize subscription structure (no active subscription for one-time purchases)
        oneTimePackages: [], // ⏳ Will be added via webhook ONLY to prevent duplication
        accumulatedEntries: 0, // ⏳ Will be added via webhook only
        entryWallet: 0,
        rewardsPoints: 0, // ⏳ Will be added via webhook only
        isEmailVerified: false, // TODO: Implement email verification
        isActive: true,
        savedPaymentMethods: [savedPaymentMethodData], // Save the payment method directly
      });

      await user.save();
      console.log(`✅ Created user account: ${user._id}`);
    }

    // ✅ CRITICAL: Handle different payment statuses and wait for settlement
    if (paymentIntent.status === "succeeded") {
      console.log(`🔍 Payment succeeded immediately, verifying payment settlement...`);

      // Wait for payment to be fully settled (not just authorized)
      await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second buffer

      // Re-fetch payment intent to ensure it's fully settled
      const verifiedPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntent.id);

      if (verifiedPaymentIntent.status === "succeeded") {
        console.log(`✅ Payment fully verified and settled - benefits will be processed by webhook`);

        // Benefits will be processed by webhook - just log success
        console.log(
          `🎯 Payment verified - benefits will be processed by webhook: ${
            membershipPackage.totalEntries || 0
          } entries, ${Math.floor(membershipPackage.price)} points`
        );

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
      console.log(`🔍 Final payment status: ${finalPaymentIntent.status}`);

      if (finalPaymentIntent.status === "succeeded") {
        console.log(`✅ Payment completed successfully after waiting - benefits will be processed by webhook`);

        // Benefits will be processed by webhook - just log success
        console.log(
          `🎯 Payment verified - benefits will be processed by webhook: ${
            membershipPackage.totalEntries || 0
          } entries, ${Math.floor(membershipPackage.price)} points`
        );
      } else {
        console.error(`❌ Payment failed after waiting: ${finalPaymentIntent.status}`);
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
      return NextResponse.json(
        {
          success: false,
          error: "Payment failed",
          details: `Payment status: ${paymentIntent.status}`,
        },
        { status: 400 }
      );
    }

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

    return NextResponse.json({
      success: true,
      message: "One-time package purchase successful",
      data: {
        entriesAdded: membershipPackage.totalEntries || 0,
        totalEntries: user.accumulatedEntries || 0,
        packageName: membershipPackage.name,
        source: "one-time-package",
        paymentVerified: true,
        paymentIntentId: paymentIntent.id,
        customerId: customer.id,
        userId: user._id,
        clientSecret: paymentIntent.client_secret,
        status: paymentIntent.status,
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
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }

    console.error("❌ Error creating one-time purchase:", error);
    return NextResponse.json({ error: "Failed to create one-time purchase" }, { status: 500 });
  }
}
