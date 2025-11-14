import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUpsellPackagesForPurchase, getBestUpsellOfferForUser } from "@/data/upsellPackages";

const triggerUpsellSchema = z.object({
  packageId: z.string().min(1, "Package ID is required"),
  packageType: z.enum(["subscription", "one-time"]),
  userId: z.string().optional(),
  userType: z
    .enum(["new-user", "returning-user", "high-value", "mini-draw-buyer", "special-package-buyer"])
    .optional()
    .default("returning-user"),
  isMember: z.boolean().optional().default(false), // Add membership status
  triggerEvent: z.enum(["membership-purchase", "one-time-purchase"]).optional(),
});

/**
 * POST /api/upsell/trigger
 * Get the best upsell offer for a specific package purchase
 * This endpoint is called after successful membership/package purchases
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = triggerUpsellSchema.parse(body);

    console.log(`🎯 Triggering upsell for package: ${validatedData.packageId} (${validatedData.packageType})`);
    console.log(`🔍 User context: userType=${validatedData.userType}, isMember=${validatedData.isMember}`);

    // Get the best upsell offer for this purchase, considering membership status
    const bestOffer = getBestUpsellOfferForUser(
      validatedData.packageId,
      validatedData.packageType,
      validatedData.userType,
      validatedData.isMember
    );

    console.log(`🔍 Upsell search result:`, {
      packageId: validatedData.packageId,
      packageType: validatedData.packageType,
      userType: validatedData.userType,
      foundOffer: !!bestOffer,
      offerName: bestOffer?.name,
    });

    // Debug: Log the filtering process
    const relevantPackages = getUpsellPackagesForPurchase(validatedData.packageId, validatedData.packageType);
    console.log(
      `🔍 Relevant packages for ${validatedData.packageId}:`,
      relevantPackages.map((p) => ({ id: p.id, name: p.name, userSegments: p.userSegments }))
    );

    const filteredPackages = relevantPackages.filter(
      (pkg) => pkg.userSegments.includes("all") || pkg.userSegments.includes(validatedData.userType)
    );
    console.log(
      `🔍 Filtered packages for userType ${validatedData.userType}:`,
      filteredPackages.map((p) => ({ id: p.id, name: p.name }))
    );

    if (!bestOffer) {
      return NextResponse.json({
        success: false,
        message: "No upsell offers available for this purchase",
        data: null,
      });
    }

    // Convert StaticUpsellPackage to a format suitable for the frontend
    const upsellOffer = {
      id: bestOffer.id,
      name: bestOffer.name,
      description: bestOffer.description,
      category: bestOffer.category,
      originalPrice: bestOffer.originalPrice,
      discountedPrice: bestOffer.discountedPrice,
      discountPercentage: bestOffer.discountPercentage,
      entriesCount: bestOffer.entriesCount,
      shopDiscountPercent: bestOffer.shopDiscountPercent,
      partnerDiscountDays: bestOffer.partnerDiscountDays,
      accessAfterExpiry: bestOffer.accessAfterExpiry,
      buttonText: bestOffer.buttonText,
      conditions: bestOffer.conditions,
      urgencyText: bestOffer.urgencyText,
      validUntil: bestOffer.validUntil,
      priority: bestOffer.priority,
      imageUrl: bestOffer.imageUrl,
      isActive: bestOffer.isActive,
      showAfterPurchase: bestOffer.showAfterPurchase,
      showAfterDelay: bestOffer.showAfterDelay,
    };

    console.log(`✅ Found upsell offer: ${bestOffer.name} for package ${validatedData.packageId}`);

    return NextResponse.json({
      success: true,
      message: "Upsell offer found",
      data: {
        offer: upsellOffer,
        context: {
          packageId: validatedData.packageId,
          packageType: validatedData.packageType,
          userType: validatedData.userType,
          triggerEvent: validatedData.triggerEvent || "membership-purchase",
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: error.issues,
        },
        { status: 400 }
      );
    }
    console.error("Error triggering upsell:", error);
    return NextResponse.json(
      {
        error: "Failed to trigger upsell",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/upsell/trigger
 * Get all available upsell offers for a specific package (for preview/testing)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const packageId = searchParams.get("packageId");
    const packageType = searchParams.get("packageType") as "subscription" | "one-time" | null;

    if (!packageId || !packageType) {
      return NextResponse.json(
        {
          error: "packageId and packageType are required",
        },
        { status: 400 }
      );
    }

    // Get all upsell offers for this package
    const offers = getUpsellPackagesForPurchase(packageId, packageType);

    return NextResponse.json({
      success: true,
      data: {
        packageId,
        packageType,
        offers: offers.map((offer) => ({
          id: offer.id,
          name: offer.name,
          description: offer.description,
          category: offer.category,
          originalPrice: offer.originalPrice,
          discountedPrice: offer.discountedPrice,
          discountPercentage: offer.discountPercentage,
          entriesCount: offer.entriesCount,
          buttonText: offer.buttonText,
          priority: offer.priority,
          isActive: offer.isActive,
        })),
        count: offers.length,
      },
    });
  } catch (error) {
    console.error("Error getting upsell offers for package:", error);
    return NextResponse.json(
      {
        error: "Failed to get upsell offers",
      },
      { status: 500 }
    );
  }
}
