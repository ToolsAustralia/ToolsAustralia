import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import MiniDraw from "@/models/MiniDraw";
import { stripe } from "@/lib/stripe";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUpsellPackageById, type StaticUpsellPackage } from "@/data/upsellPackages";
import { extractRequestContext } from "@/utils/tracking/facebook-helpers";
import { safeEventSourceUrl } from "@/utils/tracking/event-source-url";
import {
  calculateUpsellEntriesFromContext,
  getPackageBaseEntries,
} from "@/utils/payment/upsell-entries-calculator";
import { getEffectivePromoType } from "@/utils/promo/get-effective-promo-type";
import { createPaymentIntentConfig } from "@/utils/payment/stripe/payment-intent-config";
import { buildAttributionMetadata } from "@/utils/tracking/attribution-metadata";
import { attributionSchema } from "@/utils/tracking/attribution-schema";
import { ErrorLoggingService } from "@/services/error-reporting/ErrorLoggingService";
import { enforceMajorDrawOpenForNewPurchasesOr403 } from "@/utils/draws/major-draw-gate-http";

/**
 * Get resolved promo multiplier for a package type (payment context)
 * Priority: Active Promo > Alternating Multiplier > Default (1x)
 * Uses PromoMultiplierResolverService for centralized resolution
 */
async function getActivePromoMultiplier(packageType: "membership" | "one-time" | "mini-draw"): Promise<number> {
  try {
    const { PromoMultiplierResolverService } = await import("@/services/admin/PromoMultiplierResolverService");
    const resolver = new PromoMultiplierResolverService();
    // Use payment context (returns null if no active/alternating, use 1x)
    const resolved = await resolver.resolveMultiplierForPayment(packageType);
    return resolved ?? 1; // Use 1x if no promo
  } catch (error) {
    console.error(`Error fetching resolved promo multiplier for ${packageType}: ${error}`);
    return 1; // Default to no multiplier on error
  }
}
// Benefits are now granted via webhook processing only

const upsellPurchaseSchema = z.object({
  offerId: z.string().min(1, "Offer ID is required"),
  useDefaultPayment: z.boolean().optional().default(false),
  paymentMethodId: z.string().optional(),
  idempotencyKey: z.string().optional(),
      originalPurchaseContext: z
        .object({
          paymentIntentId: z.string().optional(),
          packageId: z.string().optional(),
          packageName: z.string().optional(),
          packageType: z.enum(["membership", "one-time", "mini-draw"]).optional(),
          price: z.number().optional(),
          entries: z.number().optional(),
          baseEntries: z.number().optional(),
          promoMultiplier: z.number().optional(), // ✅ NEW: Promo multiplier that was applied during original purchase
          miniDrawId: z.string().optional(),
          miniDrawName: z.string().optional(),
        })
        .optional(),
  attribution: attributionSchema,
});

/**
 * Note: Benefits are now granted via webhook processing only
 * This function is kept for API response structure but no longer processes benefits
 */
type MinimalUser = { _id: string };

async function handleUpsellPaymentSuccess(
  user: MinimalUser,
  upsellPackage: {
    id: string;
    name: string;
    price: number;
    entriesCount: number;
  },
  paymentIntentId: string
) {
  // console.log(`✅ UPSELL PAYMENT SUCCESS: Payment ${paymentIntentId} created successfully`);
  // console.log(`📋 Benefits will be granted via webhook processing shortly`);

  // No benefit processing here - webhook will handle it
  return {
    success: true,
    message: "Payment successful. Benefits will be processed shortly.",
    paymentIntentId,
    packageName: upsellPackage.name,
    entriesCount: upsellPackage.entriesCount,
  };
}

// ✅ REMOVED: addEntriesToMajorDrawImmediately function - now handled by processPaymentBenefits utility

// ✅ REMOVED: getBaseUrl() function - now using centralized utility from @/utils/url/get-base-url

/**
 * Get miniDrawId for upsell purchase
 * First checks originalPurchaseContext, then looks up from user's most recent matching mini-draw package purchase
 */
async function getMiniDrawIdForUpsell(
  user: { miniDrawPackages?: Array<{ packageId: string; miniDrawId?: unknown; purchaseDate: Date }> },
  offerId: string,
  originalPurchaseContext?: { miniDrawId?: string; miniDrawName?: string }
): Promise<{ miniDrawId?: string; miniDrawName?: string }> {
  // Primary: Check originalPurchaseContext if provided
  if (originalPurchaseContext?.miniDrawId) {
    // console.log(`📧 Found miniDrawId in originalPurchaseContext: ${originalPurchaseContext.miniDrawId}`);
    return {
      miniDrawId: originalPurchaseContext.miniDrawId,
      miniDrawName: originalPurchaseContext.miniDrawName,
    };
  }

  // Fallback: Resolve the triggering package id from the static upsell catalog,
  // then look up the user's most recent purchase of that package.
  // Legacy: "mini-pack-1-upgrade" -> "mini-pack-1" (old IDs); new IDs use triggersOnPackageIds.
  const upsellRecord = getUpsellPackageById(offerId);
  const basePackageId =
    upsellRecord?.triggersOnPackageIds?.[0] ?? offerId.replace(/-upgrade$/, "");

  if (!basePackageId.startsWith("mini-pack-") && !basePackageId.startsWith("additional-") ) {
    // Not a mini-draw upsell
    return {};
  }

  // Find most recent matching mini-draw package purchase
  if (user.miniDrawPackages && user.miniDrawPackages.length > 0) {
    // Sort by purchaseDate descending (most recent first)
    const sortedPackages = [...user.miniDrawPackages].sort((a, b) => {
      const dateA = a.purchaseDate instanceof Date ? a.purchaseDate : new Date(a.purchaseDate);
      const dateB = b.purchaseDate instanceof Date ? b.purchaseDate : new Date(b.purchaseDate);
      return dateB.getTime() - dateA.getTime();
    });

    // Find matching package and convert miniDrawId to string if it exists
    const matchingPackage = sortedPackages.find((pkg) => pkg.packageId === basePackageId && pkg.miniDrawId);

    if (matchingPackage?.miniDrawId) {
      // Convert ObjectId to string if needed
      const miniDrawIdStr =
        typeof matchingPackage.miniDrawId === "string"
          ? matchingPackage.miniDrawId
          : matchingPackage.miniDrawId?.toString();

      if (miniDrawIdStr) {
        // console.log(`📧 Found miniDrawId from user's purchase history: ${miniDrawIdStr}`);
        return {
          miniDrawId: miniDrawIdStr,
        };
      }
    }
  }

  // console.log(`⚠️ Could not find miniDrawId for upsell ${offerId}`);
  return {};
}

/**
 * POST /api/upsell/purchase
 * Handle upsell purchases for authenticated users
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    // Extract request context for Facebook CAPI (IP, user agent, fbc, fbp)
    // Store in payment metadata so webhook can use it for improved match quality
    const requestContext = extractRequestContext(request);
    const capiEventSourceUrl = safeEventSourceUrl(
      request.headers.get("referer") ??
      (process.env.NEXTAUTH_URL ? `${process.env.NEXTAUTH_URL}/shop` : undefined)
    );

    // Get the authenticated user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = upsellPurchaseSchema.parse(body);

    // console.log(`🛒 Processing upsell purchase for user: ${session.user.id}, offer: ${validatedData.offerId}`);

    // Get the user
    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Find the upsell offer from static data
    const offer = getUpsellPackageById(validatedData.offerId);
    if (!offer) {
      return NextResponse.json({ error: "Upsell offer not found" }, { status: 404 });
    }

    // Check if offer is still valid
    if (!offer.isActive || (offer.validUntil && new Date() > new Date(offer.validUntil))) {
      return NextResponse.json({ error: "Upsell offer has expired" }, { status: 400 });
    }

    // One purchase per appearance: block duplicate for same trigger (original purchase that showed this upsell)
    const triggerId = validatedData.originalPurchaseContext?.paymentIntentId;
    type UpsellWithTrigger = { offerId: string; triggeringPaymentIntentId?: string };
    if (triggerId) {
      const alreadyPurchasedForTrigger = (user.upsellPurchases as UpsellWithTrigger[] | undefined)?.some(
        (p) => p.offerId === offer.id && p.triggeringPaymentIntentId === triggerId
      );
      if (alreadyPurchasedForTrigger) {
        return NextResponse.json(
          { error: "You have already purchased this upsell for this order." },
          { status: 409 }
        );
      }
    } else {
      const alreadyPurchasedForOffer = user.upsellPurchases?.some((p) => p.offerId === offer.id);
      if (alreadyPurchasedForOffer) {
        return NextResponse.json(
          { error: "You have already purchased this upsell." },
          { status: 409 }
        );
      }
    }

    // Ensure user has a Stripe customer ID
    if (!user.stripeCustomerId) {
      return NextResponse.json({ error: "User does not have a Stripe customer ID" }, { status: 400 });
    }

    // Get miniDrawId for upsell (if it's a mini-draw upsell)
    const miniDrawInfo = await getMiniDrawIdForUpsell(
      user,
      validatedData.offerId,
      validatedData.originalPurchaseContext
    );

    if (!miniDrawInfo.miniDrawId) {
      const gateResponse = await enforceMajorDrawOpenForNewPurchasesOr403();
      if (gateResponse) return gateResponse;
    }

    // ✅ Calculate dynamic upsell entries based on original package and active promo
    let calculatedEntriesCount = offer.entriesCount; // Fallback to static value
    
    // Log originalPurchaseContext for debugging
    if (validatedData.originalPurchaseContext) {
      console.log(`📦 OriginalPurchaseContext received:`, {
        packageId: validatedData.originalPurchaseContext.packageId,
        packageType: validatedData.originalPurchaseContext.packageType,
        baseEntries: validatedData.originalPurchaseContext.baseEntries,
        promoMultiplier: validatedData.originalPurchaseContext.promoMultiplier,
        hasPackageType: !!validatedData.originalPurchaseContext.packageType,
        hasPromoMultiplier: !!validatedData.originalPurchaseContext.promoMultiplier,
      });
    } else {
      console.log(`⚠️ No originalPurchaseContext provided for upsell purchase`);
    }
    
    // Determine package type and get base entries
    let inferredPackageType: "membership" | "one-time" | "mini-draw" | undefined;
    let triggeringPackageId: string | undefined;
    
    if (validatedData.originalPurchaseContext?.packageId && validatedData.originalPurchaseContext?.packageType) {
      // Use originalPurchaseContext if available (most reliable)
      triggeringPackageId = validatedData.originalPurchaseContext.packageId;
      inferredPackageType = validatedData.originalPurchaseContext.packageType;
      // Older clients sent mini-pack purchases as "one-time", which skips miniDrawPackages lookup and falls back to static entriesCount.
      if (triggeringPackageId.startsWith("mini-pack-") && inferredPackageType === "one-time") {
        inferredPackageType = "mini-draw";
      }
    } else {
      // ✅ FIX: Infer package type from upsell category when context is missing
      // This matches the logic used for image selection
      if (offer.upsellCategory === "membership") {
        // Membership upsells are triggered by membership purchases
        inferredPackageType = "membership";
        // Try to get triggering package ID from offer configuration
        triggeringPackageId = offer.triggersOnPackageIds?.[0];
        console.log(
          `ℹ️ Inferred package type from upsell category: ${inferredPackageType}, triggeringPackageId: ${triggeringPackageId}`
        );
      } else if (offer.upsellCategory === "mini") {
        // Mini upsells resolve entries from miniDrawPackages.
        const triggerCandidate =
          validatedData.originalPurchaseContext?.packageId ?? offer.triggersOnPackageIds?.[0];
        inferredPackageType = "mini-draw";
        triggeringPackageId = triggerCandidate ?? offer.triggersOnPackageIds?.[0];
        console.log(
          `ℹ️ Inferred package type from upsell category: ${inferredPackageType}, triggeringPackageId: ${triggeringPackageId}`
        );
      } else if (offer.upsellCategory === "one-time" || offer.upsellCategory === "additional") {
        // One-time / additional upsells resolve entries from one-time packages.
        const triggerCandidate =
          validatedData.originalPurchaseContext?.packageId ?? offer.triggersOnPackageIds?.[0];
        inferredPackageType = "one-time";
        triggeringPackageId = triggerCandidate ?? offer.triggersOnPackageIds?.[0];
        console.log(
          `ℹ️ Inferred package type from upsell category: ${inferredPackageType}, triggeringPackageId: ${triggeringPackageId}`
        );
      } else {
        console.log(
          `⚠️ Could not infer package type from upsell category, using static entriesCount: ${offer.entriesCount}`
        );
      }
    }
    
    // Calculate entries if we have package type
    if (inferredPackageType) {
      try {
        // Get base entries from context or look up from package
        let baseEntries: number;
        if (validatedData.originalPurchaseContext?.baseEntries) {
          baseEntries = validatedData.originalPurchaseContext.baseEntries;
        } else if (triggeringPackageId) {
          baseEntries = getPackageBaseEntries({
            packageId: triggeringPackageId,
            packageType: inferredPackageType,
          });
        } else {
          console.warn(
            `⚠️ Could not determine base entries: no packageId available, using static value: ${offer.entriesCount}`
          );
          baseEntries = 0;
        }

        if (baseEntries > 0) {
          // ✅ FIX: Use stored multiplier from original purchase if available, otherwise query current active promo
          // This ensures the multiplier used matches the original purchase, even if promo expired/changed
          let promoMultiplier: number;
          if (validatedData.originalPurchaseContext?.promoMultiplier && validatedData.originalPurchaseContext.promoMultiplier > 1) {
            promoMultiplier = validatedData.originalPurchaseContext.promoMultiplier;
            console.log(
              `✅ Using stored promo multiplier from original purchase: ${promoMultiplier}x`
            );
          } else {
            // Fall back: resolve payment channel like checkout (membership vs one-time vs mini)
            const isMember = Boolean(user.subscription?.isActive);
            let paymentMultiplierKey: "membership" | "one-time" | "mini-draw";
            if (inferredPackageType === "membership") {
              paymentMultiplierKey = "membership";
            } else if (inferredPackageType === "mini-draw") {
              paymentMultiplierKey = "mini-draw";
            } else if (inferredPackageType === "one-time" && triggeringPackageId) {
              const channel = getEffectivePromoType(triggeringPackageId, "one-time", isMember);
              paymentMultiplierKey = channel === "membership-packages" ? "membership" : "one-time";
            } else {
              paymentMultiplierKey = "one-time";
            }
            promoMultiplier = await getActivePromoMultiplier(paymentMultiplierKey);
            console.log(
              `ℹ️ No stored multiplier found, using current active promo for ${paymentMultiplierKey} (triggeringPackage: ${triggeringPackageId}, isMember: ${isMember}): ${promoMultiplier}x`
            );
          }

          // Calculate: categoryMultiplier × baseEntries (promo does not stack)
          if (triggeringPackageId) {
            calculatedEntriesCount = await calculateUpsellEntriesFromContext(
              {
                packageId: triggeringPackageId,
                packageType: inferredPackageType,
                baseEntries,
              },
              promoMultiplier
            );
          } else {
            // Fallback: use the offer id directly when no triggering package id is known
            const { calculateUpsellEntriesForOffer } = await import("@/utils/payment/upsell-entries-calculator");
            calculatedEntriesCount = await calculateUpsellEntriesForOffer(offer.id);
          }

          console.log(
            `🎯 Calculated upsell entries: ${calculatedEntriesCount} (categoryMultiplier × base, promo not stacked; fallback: ${offer.entriesCount})`
          );
        } else {
          console.warn(
            `⚠️ Could not determine base entries for package ${triggeringPackageId || "unknown"}, using static value: ${offer.entriesCount}`
          );
        }
      } catch (error) {
        console.error(`❌ Error calculating dynamic upsell entries:`, error);
        // Fall back to static value on error
        calculatedEntriesCount = offer.entriesCount;
      }
    } else {
      console.log(
        `ℹ️ Could not determine package type, using static entriesCount: ${offer.entriesCount}`
      );
    }

    // ✅ Validate mini-draw entry limits for upsells (if it's a mini-draw upsell)
    // Use calculated entries for validation
    if (miniDrawInfo?.miniDrawId && calculatedEntriesCount > 0) {
      const miniDraw = await MiniDraw.findById(miniDrawInfo.miniDrawId);

      if (!miniDraw) {
        return NextResponse.json(
          {
            error: "Mini draw not found",
          },
          { status: 404 }
        );
      }

      // Validate draw is active
      if (miniDraw.status !== "active") {
        return NextResponse.json(
          {
            error: `Mini draw "${miniDraw.name}" is in ${miniDraw.status} status and cannot accept entries`,
          },
          { status: 400 }
        );
      }

      // Check if minimum entries has been reached
      if (miniDraw.totalEntries >= miniDraw.minimumEntries) {
        return NextResponse.json(
          {
            error: `Mini draw "${miniDraw.name}" has reached its minimum entries limit (${miniDraw.minimumEntries}) and is now closed`,
          },
          { status: 400 }
        );
      }

      // Check if upsell entries would exceed remaining entries
      const remainingEntries = Math.max(miniDraw.minimumEntries - miniDraw.totalEntries, 0);
      if (calculatedEntriesCount > remainingEntries) {
        return NextResponse.json(
          {
            error: `Mini draw "${miniDraw.name}" only has ${remainingEntries} entries remaining`,
          },
          { status: 400 }
        );
      }
    }

    const stripeIdempotencyKey =
      validatedData.idempotencyKey ??
      `pi_upsell_${validatedData.offerId}_${session.user.id}_${Date.now()}`;

    if (validatedData.useDefaultPayment && validatedData.paymentMethodId) {
      // One-click purchase using the specific payment method provided
      return await handleOneClickPurchase(
        user as unknown as Parameters<typeof handleOneClickPurchase>[0],
        offer,
        validatedData.paymentMethodId,
        miniDrawInfo,
        requestContext,
        calculatedEntriesCount,
        validatedData.originalPurchaseContext,
        capiEventSourceUrl,
        validatedData.attribution,
        stripeIdempotencyKey
      );
    } else {
      // Create payment intent for manual confirmation
      return await handlePaymentIntentCreation(
        user,
        offer,
        validatedData.paymentMethodId,
        miniDrawInfo,
        requestContext,
        calculatedEntriesCount,
        validatedData.originalPurchaseContext,
        request, // ✅ Pass request for error logging
        capiEventSourceUrl,
        validatedData.attribution,
        stripeIdempotencyKey
      );
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Upsell purchase error:", error);
    return NextResponse.json({ error: "Failed to process upsell purchase" }, { status: 500 });
  }
}

/**
 * Handle one-click purchase using default payment method
 */
async function handleOneClickPurchase(
  user: {
    _id: string;
    email: string;
    stripeCustomerId?: string;
    savedPaymentMethods?: Array<{ paymentMethodId: string }>;
    accumulatedEntries: number;
    rewardsPoints: number;
    upsellPurchases?: Array<{
      offerId: string;
      offerTitle: string;
      entriesAdded: number;
      amountPaid: number;
      purchaseDate: Date;
    }>;
    save: () => Promise<void>;
  },
  offer: StaticUpsellPackage,
  paymentMethodId: string | undefined,
  miniDrawInfo: { miniDrawId?: string; miniDrawName?: string } | undefined,
  requestContext: { client_ip_address?: string; client_user_agent?: string; fbc?: string; fbp?: string } | undefined,
  calculatedEntriesCount: number,
  originalPurchaseContext?: { packageType?: "membership" | "one-time" | "mini-draw"; paymentIntentId?: string },
  capiEventSourceUrl?: string,
  attribution?: Parameters<typeof buildAttributionMetadata>[0],
  stripeIdempotencyKey?: string
) {
  try {
    if (!paymentMethodId) {
      return NextResponse.json(
        {
          error: "Payment method ID is required",
          requiresPayment: true,
        },
        { status: 400 }
      );
    }

    // 🚀 CONSISTENT PATTERN: Create and attach NEW payment method (like subscription/one-time APIs)
    let finalPaymentMethodId = paymentMethodId;

    // For development OR reuse prevention - create new payment method
    if (paymentMethodId === "pm_card_visa" || !paymentMethodId.startsWith("pm_")) {
      // console.log(`🔄 Creating fresh payment method for upsell (reuse pattern)`);

      // Create a new test/card payment method for this customer
      const newPaymentMethod = await stripe.paymentMethods.create({
        type: "card",
        card: {
          token: "tok_visa", // Use Stripe's test token (works in both test and live modes)
        },
      });

      // Attach to customer immediately
      await stripe.paymentMethods.attach(newPaymentMethod.id, {
        customer: user.stripeCustomerId!,
      });

      finalPaymentMethodId = newPaymentMethod.id;
      // console.log(`💳 Created and attached NEW payment method: ${finalPaymentMethodId}`);
    } else {
      // For existing payment methods, try reuse but with better checks
      try {
        const existingPaymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

        // If not attached to our customer, attach it
        if (!existingPaymentMethod.customer) {
          await stripe.paymentMethods.attach(paymentMethodId, {
            customer: user.stripeCustomerId!,
          });
          // console.log(`💳 Reusing payment method attached to customer: ${paymentMethodId}`);
        } else if (existingPaymentMethod.customer === user.stripeCustomerId) {
          // console.log(`💳 Payment method already attached to our customer: ${paymentMethodId}`);
        } else {
          // Payment method belongs to someone else - create new one instead of failing
          // console.log(`🔄 Payment method belongs to another customer. Creating new one...`);

          const newPaymentMethod = await stripe.paymentMethods.create({
            type: "card",
            card: { token: "tok_visa" },
          });

          await stripe.paymentMethods.attach(newPaymentMethod.id, {
            customer: user.stripeCustomerId!,
          });

          finalPaymentMethodId = newPaymentMethod.id;
          // console.log(`💳 Created replacement payment method: ${finalPaymentMethodId}`);
        }
      } catch (stripeError: unknown) {
        console.error(`❌ Cannot reuse payment method, creating new one:`, stripeError);

        // Fallback: Create fresh payment method (same as subscription/one-time pattern)
        const fallbackPaymentMethod = await stripe.paymentMethods.create({
          type: "card",
          card: { token: "tok_visa" },
        });

        await stripe.paymentMethods.attach(fallbackPaymentMethod.id, {
          customer: user.stripeCustomerId!,
        });

        finalPaymentMethodId = fallbackPaymentMethod.id;
        // console.log(`💳 Created fallback payment method: ${finalPaymentMethodId}`);
      }
    }

    // Create payment intent with automatic confirmation
    // PCI-COMPLIANT: Use automatic payment methods with redirects disabled for security
    let paymentIntent;
    try {
      // Prepare metadata with original package type
      const paymentMetadata = {
        type: "upsell",
        offerId: offer.id,
        userId: user._id.toString(),
        entriesCount: calculatedEntriesCount.toString(), // Use calculated entries
        staticEntriesCount: offer.entriesCount.toString(), // Keep static value for fallback
        offerTitle: offer.name, // Ensure offer title is included for webhook
        // Store original package type for bonus entry promo checks
        ...(originalPurchaseContext?.packageType && {
          originalPackageType: originalPurchaseContext.packageType,
        }),
        // One purchase per appearance: tie upsell to the trigger (original purchase) for webhook storage
        ...(originalPurchaseContext?.paymentIntentId && {
          triggeringPaymentIntentId: originalPurchaseContext.paymentIntentId,
        }),
        ...(miniDrawInfo?.miniDrawId && { miniDrawId: miniDrawInfo.miniDrawId }),
        ...(miniDrawInfo?.miniDrawName && { miniDrawName: miniDrawInfo.miniDrawName }),
        // Store request context for Facebook CAPI (webhook will extract and use)
        ...(requestContext?.client_ip_address ? { capi_client_ip: requestContext.client_ip_address } : {}),
        ...(requestContext?.client_user_agent ? { capi_user_agent: requestContext.client_user_agent } : {}),
        ...(requestContext?.fbc ? { capi_fbc: requestContext.fbc } : {}),
        ...(requestContext?.fbp ? { capi_fbp: requestContext.fbp } : {}),
        ...(capiEventSourceUrl ? { capi_event_source_url: capiEventSourceUrl } : {}),
        ...buildAttributionMetadata(attribution),
      };

      // Log metadata for debugging
      console.log(`📝 Creating payment intent with metadata:`, {
        offerId: offer.id,
        originalPackageType: paymentMetadata.originalPackageType || "NOT SET",
        hasOriginalPackageType: !!paymentMetadata.originalPackageType,
        entriesCount: paymentMetadata.entriesCount,
        calculatedEntriesCount: calculatedEntriesCount,
        staticEntriesCount: paymentMetadata.staticEntriesCount,
      });

      // ✅ Use centralized PaymentIntent configuration with 3DS support
      const paymentIntentConfig = createPaymentIntentConfig({
        amount: Math.round(offer.discountedPrice * 100), // Convert to cents
        currency: "aud",
        customer: user.stripeCustomerId!,
        paymentMethod: finalPaymentMethodId, // Use the SAFE validated payment method
        confirm: true,
        paymentType: "upsell",
        description: offer.name,
        setupFutureUsage: "off_session", // Store payment method for future use
        metadata: paymentMetadata,
      });

      paymentIntent = await stripe.paymentIntents.create(paymentIntentConfig, {
        idempotencyKey: stripeIdempotencyKey ?? `pi_upsell_oc_${offer.id}_${user._id}_${Date.now()}`,
      });
    } catch (stripeError) {
      console.error("Stripe payment intent creation failed:", stripeError);
      return NextResponse.json(
        {
          error: "Payment processing failed",
          requiresPayment: true,
          details: stripeError instanceof Error ? stripeError.message : "Unknown payment error",
        },
        { status: 400 }
      );
    }

    // ✅ OPTIMIZED: Trust Stripe's status - webhook handles verification
    // Payment status is accurate when returned - no delay or re-retrieve needed
    if (paymentIntent.status === "succeeded") {
      // Payment successful - benefits will be granted via webhook
      await handleUpsellPaymentSuccess(
        user,
        {
          id: offer.id,
          name: offer.name,
          price: offer.discountedPrice,
          entriesCount: calculatedEntriesCount,
        },
        paymentIntent.id
      );

      return NextResponse.json({
        success: true,
        message: "Upsell purchase successful",
        data: {
          entriesAdded: offer.entriesCount,
          packageName: offer.name,
          source: "upsell",
          paymentIntentId: paymentIntent.id,
          processingStatus: "pending", // Benefits will be processed via webhook
        },
      });
    } else if (paymentIntent.status === "requires_action") {
      // ✅ 3DS authentication required - return client_secret for frontend to complete redirect
      // With allow_redirects: "always", the frontend will handle the 3DS redirect flow
      console.log(`⏳ Payment requires 3DS authentication - returning client_secret for frontend redirect`);
      
      return NextResponse.json({
        success: false,
        requiresAction: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        message: "3D Secure authentication required. Please complete the authentication.",
      });
    } else if (paymentIntent.status === "processing") {
      // Payment is processing (async payment methods like bank transfers)
      // Trust Stripe's status - webhook will handle when payment completes
      return NextResponse.json({
        success: true,
        message: "Upsell purchase processing",
        data: {
          entriesAdded: offer.entriesCount,
          packageName: offer.name,
          source: "upsell",
          paymentIntentId: paymentIntent.id,
          processingStatus: "processing", // Payment is still processing - webhook will handle when complete
        },
      });
    } else {
      console.error(`❌ Payment intent status: ${paymentIntent.status} for upsell offer: ${offer.id}`);
      return NextResponse.json(
        {
          error: "Payment failed",
          requiresPayment: true,
          details: `Payment status: ${paymentIntent.status}`,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("One-click purchase error:", error);
    return NextResponse.json(
      {
        error: "One-click purchase failed",
        requiresPayment: true,
      },
      { status: 500 }
    );
  }
}

/**
 * Handle payment intent creation for manual confirmation
 */
async function handlePaymentIntentCreation(
  user: { _id: string; stripeCustomerId?: string },
  offer: StaticUpsellPackage,
  paymentMethodId: string | undefined,
  miniDrawInfo: { miniDrawId?: string; miniDrawName?: string } | undefined,
  requestContext: { client_ip_address?: string; client_user_agent?: string; fbc?: string; fbp?: string } | undefined,
  calculatedEntriesCount: number,
  originalPurchaseContext?: { packageType?: "membership" | "one-time" | "mini-draw"; paymentIntentId?: string },
  request?: NextRequest, // ✅ Pass request for error logging
  capiEventSourceUrl?: string,
  attribution?: Parameters<typeof buildAttributionMetadata>[0],
  stripeIdempotencyKey?: string
) {
  try {
    // Derive event source URL for CAPI if not passed (e.g. from request)
    const eventSourceUrl = safeEventSourceUrl(
      capiEventSourceUrl ??
      (request
        ? request.headers.get("referer") ??
          (process.env.NEXTAUTH_URL ? `${process.env.NEXTAUTH_URL}/shop` : undefined)
        : undefined)
    );

    // Prepare metadata with original package type
    const paymentMetadata = {
      type: "upsell",
      offerId: offer.id,
      userId: user._id.toString(),
      entriesCount: calculatedEntriesCount.toString(), // Use calculated entries
      staticEntriesCount: offer.entriesCount.toString(), // Keep static value for fallback
      // Store original package type for bonus entry promo checks
      ...(originalPurchaseContext?.packageType && {
        originalPackageType: originalPurchaseContext.packageType,
      }),
      // One purchase per appearance: tie upsell to the trigger (original purchase) for webhook storage
      ...(originalPurchaseContext?.paymentIntentId && {
        triggeringPaymentIntentId: originalPurchaseContext.paymentIntentId,
      }),
      ...(miniDrawInfo?.miniDrawId && { miniDrawId: miniDrawInfo.miniDrawId }),
      ...(miniDrawInfo?.miniDrawName && { miniDrawName: miniDrawInfo.miniDrawName }),
      // Store request context for Facebook CAPI (webhook will extract and use)
      ...(requestContext?.client_ip_address ? { capi_client_ip: requestContext.client_ip_address } : {}),
      ...(requestContext?.client_user_agent ? { capi_user_agent: requestContext.client_user_agent } : {}),
      ...(requestContext?.fbc ? { capi_fbc: requestContext.fbc } : {}),
      ...(requestContext?.fbp ? { capi_fbp: requestContext.fbp } : {}),
      ...(eventSourceUrl ? { capi_event_source_url: eventSourceUrl } : {}),
      ...buildAttributionMetadata(attribution),
    };

    // Log metadata for debugging
    console.log(`📝 Creating payment intent (manual) with metadata:`, {
      offerId: offer.id,
      originalPackageType: paymentMetadata.originalPackageType || "NOT SET",
      hasOriginalPackageType: !!paymentMetadata.originalPackageType,
      entriesCount: paymentMetadata.entriesCount,
    });

    const idempotencyKey =
      stripeIdempotencyKey ?? `pi_upsell_${offer.id}_${user._id.toString()}_${Date.now()}`;

    // ✅ Use centralized PaymentIntent configuration with 3DS support
    const paymentIntentConfig = createPaymentIntentConfig({
      amount: Math.round(offer.discountedPrice * 100), // Convert to cents
      currency: "aud",
      customer: user.stripeCustomerId!,
      paymentMethod: paymentMethodId,
      confirm: paymentMethodId ? true : false,
      paymentType: "upsell",
      description: offer.name,
      metadata: paymentMetadata,
    });

    const paymentIntent = await stripe.paymentIntents.create(
      paymentIntentConfig,
      {
        idempotencyKey,
      }
    );

    return NextResponse.json({
      success: true,
      requiresPayment: !paymentMethodId,
      clientSecret: paymentIntent.client_secret,
      data: {
        offerId: offer.id,
        amount: offer.discountedPrice,
        entriesCount: calculatedEntriesCount,
        paymentIntentId: paymentIntent.id,
        processingStatus: "pending",
      },
    });
  } catch (error) {
    console.error("Payment intent creation error:", error);
    
    // ✅ OPTIMIZED: Auto-log error for monitoring (fire-and-forget, non-blocking)
    // Don't await - let it run in background without blocking error response
    if (request) {
      getServerSession(authOptions)
        .then((session) => {
          return request.json().catch(() => ({})).then((requestBody) => {
            ErrorLoggingService.logError(error, {
              userId: session?.user?.id,
              userEmail: session?.user?.email || undefined, // Convert null to undefined
              guestEmail: (requestBody as { userEmail?: string })?.userEmail, // Guest email from request
              endpoint: request.url,
              requestMethod: "POST",
              requestBody,
              component: "upsell-purchase",
              flow: "upsell-purchase",
              offerId: (requestBody as { offerId?: string })?.offerId,
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
          ErrorLoggingService.logError(error, {
            endpoint: request.url,
            requestMethod: "POST",
            component: "upsell-purchase",
            flow: "upsell-purchase",
          }, {
            isServerSide: true,
            request,
            skipRateLimit: true,
          }).catch(() => {
            // Silently fail
          });
        });
    }
    
    throw error; // Re-throw to be handled by caller
  }
}

/**
 * DEPRECATED: Entries are now handled by webhook
 * This function was replaced by webhook mechanism in /api/stripe/webhook/route.ts
 */
