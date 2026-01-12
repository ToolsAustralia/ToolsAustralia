import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import { getMiniDrawPackageById } from "@/data/miniDrawPackages";
import { stripe } from "@/lib/stripe";
import Stripe from "stripe";
import { recordReferralPurchase } from "@/lib/referral";
import { trackAffiliateSignup } from "@/lib/affiliate";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { processPaymentBenefits, isPaymentProcessed } from "@/utils/payment/payment-processing";
import Promo from "@/models/Promo";
import { savePaymentMethodToUser } from "@/utils/payment/payment-method-manager";
// Klaviyo integration handled by webhook for best practices
// Benefits are granted via webhook processing only

const createOneTimePurchaseExistingUserSchema = z.object({
  packageId: z.string().min(1, "Package ID is required"),
  paymentMethodId: z.string().min(1, "Payment method ID is required").optional(),
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

  console.warn(`⚠️ NEXT_PUBLIC_APP_URL not set, falling back to localhost:3000`);
  return "http://localhost:3000";
}

/**
 * POST /api/stripe/create-one-time-purchase-existing-user
 * Create a one-time purchase payment intent for an existing logged-in user
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    // Get the authenticated user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createOneTimePurchaseExistingUserSchema.parse(body);
    const normalizedAffiliateCode = validatedData.affiliateCode?.trim().toUpperCase();

    // console.log(`🛒 Creating one-time purchase for existing user: ${session.user.id}`);

    // Get the existing user
    let existingUser = await User.findById(session.user.id);
    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (normalizedAffiliateCode && (!existingUser.affiliateReferral || !existingUser.affiliateReferral.affiliateId)) {
      try {
        await trackAffiliateSignup({
          affiliateCode: normalizedAffiliateCode,
          userId: existingUser._id.toString(),
          userEmail: existingUser.email,
        });
        existingUser = (await User.findById(existingUser._id)) ?? existingUser;
      } catch (affiliateError) {
        console.error("Affiliate tracking error during existing-user one-time purchase:", affiliateError);
      }
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
        // console.log("🎲 Mini draw package detected:", miniDrawPackage.name);
      }
    }

    if (!membershipPackage || !membershipPackage.isActive) {
      return NextResponse.json({ error: "Invalid or inactive package" }, { status: 400 });
    }

    // Create or retrieve Stripe customer
    let stripeCustomerId = existingUser.stripeCustomerId;
    let customer: Stripe.Customer | Stripe.DeletedCustomer;

    if (!stripeCustomerId) {
      // console.log("Creating new Stripe customer for existing user");
      customer = await stripe.customers.create({
        email: existingUser.email,
        name: `${existingUser.firstName} ${existingUser.lastName}`,
        phone: existingUser.mobile || undefined,
      });
      stripeCustomerId = customer.id;

      // Update user with Stripe customer ID
      existingUser.stripeCustomerId = stripeCustomerId;
      await existingUser.save();
    } else {
      // ✅ SYNC: Retrieve customer and ensure email is in sync
      const retrievedCustomer = await stripe.customers.retrieve(stripeCustomerId);

      // Check if customer was deleted
      if (retrievedCustomer.deleted) {
        // Customer was deleted, create a new one
        customer = await stripe.customers.create({
          email: existingUser.email,
          name: `${existingUser.firstName} ${existingUser.lastName}`,
          phone: existingUser.mobile || undefined,
        });
        stripeCustomerId = customer.id;
        existingUser.stripeCustomerId = stripeCustomerId;
        await existingUser.save();
      } else {
        customer = retrievedCustomer as Stripe.Customer;
        const customerEmail = customer.email || "";

        // Update customer email if it differs from user's current email
        if (customerEmail.toLowerCase() !== existingUser.email.toLowerCase()) {
          console.log(`🔄 Syncing customer email: ${customerEmail} → ${existingUser.email}`);
          customer = await stripe.customers.update(stripeCustomerId, {
            email: existingUser.email,
            name: `${existingUser.firstName} ${existingUser.lastName}`,
            phone: existingUser.mobile || undefined,
          });
          console.log(`✅ Customer email synced: ${stripeCustomerId}`);
        }
      }
    }

    // Ensure customer is not deleted before using customer.id
    if ("deleted" in customer && customer.deleted) {
      throw new Error("Stripe customer was deleted");
    }

    let paymentMethodId = validatedData.paymentMethodId;

    if (!paymentMethodId) {
      const defaultMethod = existingUser.savedPaymentMethods?.find((pm: Record<string, unknown>) => pm.isDefault);
      if (defaultMethod && typeof defaultMethod.paymentMethodId === "string") {
        paymentMethodId = defaultMethod.paymentMethodId;
      } else if (existingUser.savedPaymentMethods?.length) {
        const fallbackMethod = existingUser.savedPaymentMethods[0];
        if (fallbackMethod && typeof fallbackMethod.paymentMethodId === "string") {
          paymentMethodId = fallbackMethod.paymentMethodId;
        }
      }

      if (!paymentMethodId) {
        return NextResponse.json(
          { success: false, error: "No saved payment method available. Please add a card first." },
          { status: 400 }
        );
      }
    }

    // Ensure payment method belongs to this customer
    const stripePaymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    if (!stripePaymentMethod) {
      return NextResponse.json({ success: false, error: "Payment method not found" }, { status: 404 });
    }

    if (stripePaymentMethod.customer !== customer.id) {
      try {
        await stripe.paymentMethods.attach(paymentMethodId, {
          customer: customer.id,
        });
      } catch (error) {
        console.error("❌ Failed to attach payment method to customer:", error);
        return NextResponse.json(
          { success: false, error: "Unable to attach payment method to customer" },
          { status: 400 }
        );
      }
    }

    // ✅ CRITICAL: Set payment method as default on customer (matches subscription pattern)
    // This ensures Stripe properly saves it and webhook can find it via customer default
    try {
      await stripe.customers.update(customer.id, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
      console.log(`✅ Set ${paymentMethodId} as default payment method for customer ${customer.id}`);
    } catch (error) {
      console.error("⚠️ Failed to set default payment method (non-critical):", error);
      // Continue - payment method is still attached, just not set as default
    }

    // console.log(`💳 Using payment method ${paymentMethodId} for one-time purchase`);

    // Create payment intent for one-time purchase
    // PCI-COMPLIANT: Use automatic payment methods with redirects disabled for security
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(membershipPackage.price * 100), // Convert to cents
      currency: "aud",
      customer: customer.id,
      payment_method: paymentMethodId,
      confirm: true,
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
            id: membershipPackage._id,
            name: membershipPackage.name,
            price: membershipPackage.price,
          },
        ]),
        packageId: membershipPackage._id,
        userId: existingUser._id.toString(),
        userEmail: existingUser.email, // ✅ CRITICAL: Add userEmail for webhook fallback lookup
        packageName: membershipPackage.name,
        type: isMiniDrawPackage ? "mini-draw" : "one-time", // ✅ CRITICAL: Set 'type' for webhook compatibility
        packageType: isMiniDrawPackage ? "mini-draw" : "one-time", // ✅ Also set 'packageType' for consistency
        entriesCount: (membershipPackage.totalEntries || membershipPackage.entriesPerMonth || 0).toString(),
        price: Math.round(membershipPackage.price * 100).toString(), // Price in cents for webhook processing
        // ✅ ADD: Store payment method ID for webhook to save after payment succeeds
        paymentMethodId: paymentMethodId,
        ...(normalizedAffiliateCode
          ? { affiliateCode: normalizedAffiliateCode }
          : existingUser.affiliateReferral?.affiliateCode
          ? { affiliateCode: existingUser.affiliateReferral.affiliateCode }
          : {}),
        ...(validatedData.promoLinkCode && { promoLinkCode: validatedData.promoLinkCode }),
        ...(validatedData.referralCode && { referralCode: validatedData.referralCode }),
      },
    });

    // console.log(`✅ Payment intent created: ${paymentIntent.id} with status: ${paymentIntent.status}`);

    // ✅ CRITICAL: Handle different payment statuses and wait for settlement
    if (paymentIntent.status === "succeeded") {
      // console.log(`🔍 Payment succeeded immediately, verifying payment settlement...`);

      // Wait for payment to be fully settled (not just authorized)
      await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second buffer

      // Re-fetch payment intent to ensure it's fully settled
      const verifiedPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntent.id);

      if (verifiedPaymentIntent.status === "succeeded") {
        // ✅ CRITICAL: Save payment method IMMEDIATELY after payment succeeds (PRIMARY METHOD)
        // This prevents "No Payment Method" error when upsell modal opens
        // Webhook will also try to save as backup, but this ensures it's saved synchronously
        try {
          const freshUser = await User.findById(existingUser._id);
          if (freshUser && paymentMethodId) {
            console.log(`💳 [SYNC] Saving payment method immediately after payment success: ${paymentMethodId}`);
            
            const saveResult = await savePaymentMethodToUser(freshUser, paymentMethodId, {
              setAsDefault: !freshUser.savedPaymentMethods || freshUser.savedPaymentMethods.length === 0,
            });
            
            if (saveResult.success) {
              console.log(`✅ [SYNC] Payment method saved successfully: ${paymentMethodId}`);
              // Refresh user from database to get updated payment methods
              const refreshedUser = await User.findById(existingUser._id);
              if (refreshedUser) {
                existingUser = refreshedUser;
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
        
        // console.log(`✅ Payment fully verified and settled - benefits will be processed by webhook`);
        // Benefits will be processed by webhook - just log success
        // console.log(`✅ Payment completed successfully for user: ${existingUser.email}`);
        // console.log(`📦 Package: ${membershipPackage.name} ($${membershipPackage.price})`);
        // console.log(`📋 Benefits will be processed via webhook shortly`);
        // ✅ Klaviyo integration handled by webhook for reliability and best practices
        // console.log(`📊 Klaviyo events will be tracked via webhook when payment is confirmed`);
      } else {
        console.error(`❌ Payment verification failed: ${verifiedPaymentIntent.status}`);
        return NextResponse.json(
          {
            success: false,
            error: "Payment verification failed",
            details: "Payment was not fully settled",
          },
          { status: 400 }
        );
      }
    } else if (paymentIntent.status === "requires_action" || paymentIntent.status === "processing") {
      // console.log(`⏳ Payment requires action or is processing, waiting for completion...`);

      // Wait longer for payment to complete
      await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 second buffer

      // Re-fetch payment intent to check final status
      const finalPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntent.id);
      // console.log(`🔍 Final payment status: ${finalPaymentIntent.status}`);

      if (finalPaymentIntent.status === "succeeded") {
        // ✅ CRITICAL: Save payment method IMMEDIATELY after payment succeeds (PRIMARY METHOD)
        // This prevents "No Payment Method" error when upsell modal opens
        // Webhook will also try to save as backup, but this ensures it's saved synchronously
        try {
          const freshUser = await User.findById(existingUser._id);
          if (freshUser && paymentMethodId) {
            console.log(`💳 [SYNC] Saving payment method immediately after payment success: ${paymentMethodId}`);
            
            const saveResult = await savePaymentMethodToUser(freshUser, paymentMethodId, {
              setAsDefault: !freshUser.savedPaymentMethods || freshUser.savedPaymentMethods.length === 0,
            });
            
            if (saveResult.success) {
              console.log(`✅ [SYNC] Payment method saved successfully: ${paymentMethodId}`);
              // Refresh user from database to get updated payment methods
              const refreshedUser = await User.findById(existingUser._id);
              if (refreshedUser) {
                existingUser = refreshedUser;
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
        
        // console.log(`✅ Payment completed successfully after waiting - benefits will be processed by webhook`);
        // Benefits will be processed by webhook - just log success
        // console.log(`✅ Payment completed successfully for user: ${existingUser.email}`);
        // console.log(`📦 Package: ${membershipPackage.name} ($${membershipPackage.price})`);
        // console.log(`📋 Benefits will be processed via webhook shortly`);
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

    // ✅ CRITICAL FIX: Race condition fallback - Check if webhook already processed this payment
    // If webhook fired before metadata was updated, it would have failed to find the user
    // We need to process it here as a fallback
    if (paymentIntent.status === "succeeded" || (paymentIntent.status === "processing" && existingUser)) {
      const alreadyProcessed = await isPaymentProcessed(paymentIntent.id);

      if (!alreadyProcessed) {
        console.log(
          `🔄 Webhook hasn't processed payment yet (race condition), processing as fallback: ${paymentIntent.id}`
        );

        // Get resolved promo multiplier for one-time packages (payment context)
        // Priority: Active Promo > Alternating Multiplier > null (use 1x)
        let promoMultiplier = 1;
        try {
          const { PromoMultiplierResolverService } = await import("@/services/admin/PromoMultiplierResolverService");
          const resolver = new PromoMultiplierResolverService();
          const packageTypeValue = isMiniDrawPackage ? "mini-draw" : "one-time";
          const resolved = await resolver.resolveMultiplierForPayment(packageTypeValue);
          promoMultiplier = resolved ?? 1; // Use 1x if no promo
        } catch (promoError) {
          console.error("Failed to fetch resolved promo multiplier:", promoError);
          // Default to 1 if promo fetch fails
        }

        const packageTypeValue = isMiniDrawPackage ? "mini-draw" : "one-time";

        // ✅ CRITICAL: Re-fetch PaymentIntent to get fresh metadata after any updates
        const freshPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntent.id);
        const entriesCountFromMetadata = parseInt(freshPaymentIntent.metadata.entriesCount || "0");

        // If metadata still doesn't have entriesCount, use package data directly
        const baseEntries =
          entriesCountFromMetadata > 0
            ? entriesCountFromMetadata
            : membershipPackage.totalEntries || membershipPackage.entriesPerMonth || 0;

        const finalEntriesCount = baseEntries * promoMultiplier;

        // Use price from fresh metadata or fallback to package price
        const priceFromMetadata = parseInt(freshPaymentIntent.metadata.price || "0");
        const finalPrice = priceFromMetadata > 0 ? priceFromMetadata / 100 : membershipPackage.price;

        console.log(`📊 Fallback processing details:`, {
          baseEntries,
          promoMultiplier,
          finalEntriesCount,
          finalPrice,
          entriesCountFromMetadata,
          priceFromMetadata,
        });

        // Extract request context from fresh metadata
        const requestContext = {
          client_ip_address: freshPaymentIntent.metadata.capi_client_ip,
          client_user_agent: freshPaymentIntent.metadata.capi_user_agent,
          fbc: freshPaymentIntent.metadata.capi_fbc,
          fbp: freshPaymentIntent.metadata.capi_fbp,
        };

        // Process benefits as fallback
        if (!existingUser) {
          console.error(`❌ User not found for fallback processing`);
          return NextResponse.json({ error: "User not found" }, { status: 404 });
        }
        const processResult = await processPaymentBenefits(
          paymentIntent.id,
          existingUser._id.toString(),
          {
            packageType: packageTypeValue,
            packageId: membershipPackage._id,
            packageName: membershipPackage.name,
            entries: finalEntriesCount,
            points: Math.floor(finalPrice),
            price: finalPrice,
          },
          "api", // Mark as processed by API (fallback)
          {
            created: Math.floor(paymentIntent.created * 1000), // Convert Stripe timestamp (seconds) to milliseconds
            type: packageTypeValue,
            packageType: packageTypeValue,
            affiliateCode: freshPaymentIntent.metadata.affiliateCode,
          },
          Object.keys(requestContext).length > 0 ? requestContext : undefined
        );

        if (processResult.success) {
          console.log(`✅ Fallback processing successful: ${finalEntriesCount} entries granted`);
          // Refresh user data to get updated entries
          if (existingUser) {
            existingUser = await User.findById(existingUser._id) ?? existingUser;
          }
        } else if (processResult.alreadyProcessed) {
          console.log(`ℹ️ Payment already processed by webhook (race condition resolved)`);
        } else {
          console.error(`❌ Fallback processing failed: ${processResult.error}`);
          // Don't throw - webhook will retry on next event
        }
      } else {
        console.log(`✅ Payment already processed by webhook: ${paymentIntent.id}`);
      }
    }

    if (validatedData.referralCode && existingUser) {
      try {
        await recordReferralPurchase({
          referralCode: validatedData.referralCode,
          inviteeUserId: existingUser._id.toString(),
          inviteeEmail: existingUser.email,
          inviteeName: `${existingUser.firstName} ${existingUser.lastName}`.trim(),
          qualifyingOrderId: paymentIntent.id,
          qualifyingOrderType: "one-time",
        });
      } catch (referralError) {
        console.error("Referral purchase capture failed:", referralError);
      }
    }

    // ✅ CRITICAL: Final refresh to ensure we have latest user data including saved payment methods
    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const finalUser = await User.findById(existingUser._id);
    if (!finalUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "One-time package purchase successful",
      data: {
        entriesAdded: membershipPackage.totalEntries,
        totalEntries: finalUser.accumulatedEntries || 0,
        packageName: membershipPackage.name,
        source: "one-time-package",
        paymentVerified: true,
      },
      paymentIntent: {
        id: paymentIntent.id,
        status: paymentIntent.status,
        clientSecret: paymentIntent.client_secret,
      },
      user: {
        id: finalUser._id,
        email: finalUser.email,
        subscription: finalUser.subscription,
        oneTimePackages: finalUser.oneTimePackages,
        entryWallet: finalUser.entryWallet,
        accumulatedEntries: finalUser.accumulatedEntries,
        rewardsPoints: finalUser.rewardsPoints,
        savedPaymentMethods: finalUser.savedPaymentMethods || [], // ✅ CRITICAL: Include saved payment methods
      },
    });
  } catch (error) {
    console.error("❌ One-time purchase creation failed:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: error.issues }, { status: 400 });
    }

    if (error instanceof Error) {
      return NextResponse.json(
        { error: "Failed to create one-time purchase", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: "Failed to create one-time purchase" }, { status: 500 });
  }
}

// REMOVED: addEntriesToMajorDraw function moved to webhook-only processing
