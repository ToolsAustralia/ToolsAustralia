import connectDB from "@/lib/mongodb";
import User, { IUser } from "@/models/User";
import Stripe from "stripe";
import bcrypt from "bcryptjs";
import { stripe } from "@/lib/stripe";

import { claimMobileForNewUser } from "@/utils/auth/claim-mobile";

/**
 * Account Manager
 * 
 * Utility functions for managing user account creation and linking with clear separation of concerns.
 * These functions handle account operations based on payment metadata, ensuring accounts
 * are only created after payment succeeds.
 */

/**
 * Determines if an account should be created from PaymentIntent metadata
 * 
 * @param paymentIntent - Stripe PaymentIntent with metadata
 * @returns True if account should be created from metadata
 */
export function shouldCreateAccountFromMetadata(
  paymentIntent: Stripe.PaymentIntent
): boolean {
  const metadata = paymentIntent.metadata;

  // Check if metadata has required user data
  const hasRequiredData =
    !!metadata.firstName &&
    !!metadata.lastName &&
    !!metadata.userEmail &&
    metadata.userEmail !== "guest";

  // Check if this is marked as a new user
  const isNewUser = metadata.isNewUser === "true";

  return hasRequiredData && isNewUser;
}

/**
 * Creates a user account from PaymentIntent metadata
 * 
 * This function is called by the webhook after payment succeeds to create
 * accounts for new users who didn't register before purchase.
 * 
 * @param paymentIntent - Stripe PaymentIntent with user data in metadata
 * @returns Created user document or null if creation failed
 */
export async function createUserFromPaymentMetadata(
  paymentIntent: Stripe.PaymentIntent
): Promise<IUser | null> {
  try {
    await connectDB();

    const metadata = paymentIntent.metadata;

    // Validate required fields
    if (!metadata.firstName || !metadata.lastName || !metadata.userEmail) {
      console.error("Missing required user data in PaymentIntent metadata");
      return null;
    }

    if (metadata.userEmail === "guest") {
      console.error("Cannot create account with guest email");
      return null;
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      email: metadata.userEmail.toLowerCase(),
    });

    if (existingUser) {
      console.log(`User already exists with email: ${metadata.userEmail}`);
      return existingUser;
    }

    // Get customer ID from payment intent
    const customerId =
      typeof paymentIntent.customer === "string"
        ? paymentIntent.customer
        : paymentIntent.customer?.id;

    if (!customerId) {
      console.error("PaymentIntent has no customer ID - cannot create account");
      return null;
    }

    // Hash password if provided
    const hashedPassword = metadata.password
      ? await bcrypt.hash(metadata.password, 12)
      : undefined;

    // Clean mobile number
    const cleanedMobile = metadata.mobile?.replace(/\s+/g, "") || "";

    // ✅ ENHANCED: Get payment method ID from multiple sources
    // Check in order: PaymentIntent.payment_method -> metadata.paymentMethodId -> charge.payment_method
    let paymentMethodId: string | undefined;
    let paymentMethodSource = "none";

    // 1. Try PaymentIntent.payment_method (most direct)
    if (paymentIntent.payment_method) {
      paymentMethodId = typeof paymentIntent.payment_method === "string"
        ? paymentIntent.payment_method
        : paymentIntent.payment_method.id;
      if (paymentMethodId) {
        paymentMethodSource = "paymentIntent";
      }
    }

    // 2. Try metadata.paymentMethodId (from one-time purchase API)
    if (!paymentMethodId && metadata.paymentMethodId) {
      paymentMethodId = metadata.paymentMethodId;
      paymentMethodSource = "metadata";
      console.log(`💳 Found payment method in metadata: ${paymentMethodId}`);
    }

    // 3. Try charge's payment method (some payment methods are on charges)
    if (!paymentMethodId && paymentIntent.latest_charge) {
      try {
        const chargeId = typeof paymentIntent.latest_charge === "string"
          ? paymentIntent.latest_charge
          : paymentIntent.latest_charge.id;
        const charge = await stripe.charges.retrieve(chargeId);
        
        if (charge.payment_method) {
          const pm = charge.payment_method;
          if (typeof pm === "string") {
            paymentMethodId = pm;
          } else if (pm && typeof pm === "object") {
            const pmObj = pm as { id?: string };
            paymentMethodId = pmObj.id || undefined;
          }
          if (paymentMethodId) {
            paymentMethodSource = "charge";
            console.log(`💳 Found payment method on charge: ${paymentMethodId}`);
          }
        }
      } catch (chargeError) {
        console.warn(`Failed to retrieve charge for payment method: ${chargeError}`);
      }
    }

    // Create payment method data if payment method exists
    const savedPaymentMethodData = paymentMethodId
      ? {
          paymentMethodId: paymentMethodId,
          isDefault: true, // First payment method is always default
          createdAt: new Date(),
          lastUsed: new Date(),
        }
      : undefined;

    if (paymentMethodId) {
      console.log(`💳 Using payment method from ${paymentMethodSource}: ${paymentMethodId}`);
    } else {
      console.warn(`⚠️ No payment method found for new user account creation`);
    }

    // Create new user account
    const newUser = new User({
      firstName: metadata.firstName.trim(),
      lastName: metadata.lastName.trim(),
      email: metadata.userEmail.toLowerCase().trim(),
      password: hashedPassword, // Will be undefined for passwordless users
      mobile: await claimMobileForNewUser(cleanedMobile, "account-manager"),
      role: "user",
      stripeCustomerId: customerId,
      subscription: {
        packageId: "",
        startDate: new Date(),
        isActive: false,
        autoRenew: true,
        status: "incomplete",
      },
      oneTimePackages: [],
      accumulatedEntries: 0,
      entryWallet: 0,
      rewardsPoints: 0,
      // Email verification is optional — users can verify via SendGrid in the setup modal
      isEmailVerified: false,
      isActive: true,
      savedPaymentMethods: savedPaymentMethodData ? [savedPaymentMethodData] : [],
      profileSetupCompleted: false,
      upsellPurchases: [],
      upsellHistory: [],
      miniDrawPackages: [],
    });

    await newUser.save();

    console.log(`✅ Created user account from PaymentIntent metadata: ${newUser._id}`);

    return newUser;
  } catch (error) {
    console.error("Error creating user from PaymentIntent metadata:", error);
    return null;
  }
}

/**
 * Links a Stripe customer to an existing user account
 * 
 * @param user - User document to link customer to
 * @param customerId - Stripe customer ID
 * @returns Success status and updated user
 */
export async function linkCustomerToUser(
  user: IUser,
  customerId: string
): Promise<{
  success: boolean;
  user: IUser;
  error?: string;
}> {
  try {
    // Check if user already has a different customer ID
    if (user.stripeCustomerId && user.stripeCustomerId !== customerId) {
      console.warn(
        `User ${user._id} already has customer ID ${user.stripeCustomerId}, attempting to link ${customerId}`
      );
      // In most cases, we should update to the new customer ID
      // This handles cases where customer was recreated
    }

    user.stripeCustomerId = customerId;
    await user.save();

    return {
      success: true,
      user,
    };
  } catch (error) {
    console.error("Error linking customer to user:", error);
    return {
      success: false,
      user,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

