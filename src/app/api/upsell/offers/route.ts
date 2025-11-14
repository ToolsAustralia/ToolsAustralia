import { NextRequest, NextResponse } from "next/server";
import {
  getActiveUpsellPackages,
  getUpsellPackagesByTrigger,
  filterUpsellPackagesByUserSegment,
  sortUpsellPackagesByPriority,
  type StaticUpsellPackage,
} from "@/data/upsellPackages";
import { z } from "zod";

const getOffersSchema = z.object({
  triggerEvent: z.enum(["membership-purchase", "ticket-purchase", "one-time-purchase"]).optional(),
  userType: z.enum(["new-user", "returning-user", "high-value"]).optional(),
  userId: z.string().optional(),
  packageId: z.string().optional(),
  packageType: z.enum(["subscription", "one-time"]).optional(),
});

/**
 * GET /api/upsell/offers
 * Get available upsell offers based on user context
 * Now uses static data for improved performance and better targeting
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const triggerEvent = searchParams.get("triggerEvent") as string | null;
    const userType = searchParams.get("userType") as string | null;
    const userId = searchParams.get("userId");
    const packageId = searchParams.get("packageId");
    const packageType = searchParams.get("packageType") as "subscription" | "one-time" | null;

    // Validate query parameters
    const validatedData = getOffersSchema.parse({
      triggerEvent,
      userType,
      userId,
      packageId,
      packageType,
    });

    console.log(
      `📋 Getting upsell offers for trigger: ${triggerEvent}, userType: ${userType}, packageId: ${packageId}`
    );

    let relevantOffers: StaticUpsellPackage[];

    // If we have specific package information, get targeted offers
    if (packageId && packageType) {
      const { getUpsellPackagesForPurchase } = await import("@/data/upsellPackages");
      relevantOffers = getUpsellPackagesForPurchase(packageId, packageType);
    } else if (triggerEvent) {
      // Get offers by trigger event
      relevantOffers = getUpsellPackagesByTrigger(triggerEvent);
    } else {
      // Get all active offers
      relevantOffers = getActiveUpsellPackages();
    }

    // Filter by user type if specified
    if (userType) {
      relevantOffers = filterUpsellPackagesByUserSegment(relevantOffers, userType);
    }

    // Filter out expired offers
    relevantOffers = relevantOffers.filter((offer) => {
      if (!offer.isActive) return false;
      if (offer.validUntil && new Date() > new Date(offer.validUntil)) return false;
      return true;
    });

    // Sort by priority (higher priority first)
    relevantOffers = sortUpsellPackagesByPriority(relevantOffers);

    // Return only the top 3 offers to avoid overwhelming the user
    const topOffers = relevantOffers.slice(0, 3);

    return NextResponse.json({
      success: true,
      data: {
        offers: topOffers,
        totalAvailable: relevantOffers.length,
        context: {
          triggerEvent: validatedData.triggerEvent,
          userType: validatedData.userType,
          packageId: validatedData.packageId,
          packageType: validatedData.packageType,
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Get upsell offers error:", error);
    return NextResponse.json({ error: "Failed to get upsell offers" }, { status: 500 });
  }
}

/**
 * POST /api/upsell/offers
 * Create or update upsell offers (admin only)
 */
export async function POST() {
  try {
    // This would be for admin functionality to create/update offers
    // For now, we're using static sample offers

    return NextResponse.json(
      {
        success: false,
        error: "Offer management not implemented yet. Using sample offers.",
      },
      { status: 501 }
    );
  } catch (error) {
    console.error("Create upsell offer error:", error);
    return NextResponse.json({ error: "Failed to create upsell offer" }, { status: 500 });
  }
}
