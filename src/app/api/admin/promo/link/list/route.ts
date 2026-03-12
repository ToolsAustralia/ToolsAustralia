import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import PromoLink, { IPromoLink } from "@/models/PromoLink";
import { formatDateReadable } from "@/utils/common/timezone";
import { DEFAULT_PRIZE_SLUG } from "@/config/prizes";
import mongoose from "mongoose";

/**
 * Type for populated createdBy field from User model
 * When populated, createdBy contains user information
 */
interface PopulatedCreatedBy {
  _id: mongoose.Types.ObjectId;
  firstName?: string;
  lastName?: string;
  email?: string;
}

/**
 * GET /api/admin/promo/link/list
 * Get all promo links with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    // Check admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // Get user from database to verify admin role
    const { default: User } = await import("@/models/User");
    const user = await User.findOne({ email: session.user.email });
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const isActive = searchParams.get("isActive");
    const expired = searchParams.get("expired");

    // Build query - MongoDB filter for PromoLink documents
    const query: mongoose.FilterQuery<IPromoLink> = {};

    if (isActive !== null) {
      query.isActive = isActive === "true";
    }

    // Get all promo links
    const promoLinks = await PromoLink.find(query)
      .populate("createdBy", "firstName lastName email")
      .sort({ createdAt: -1 })
      .lean();

    const now = new Date();

    // Format response with calculated fields
    const formattedPromoLinks = promoLinks.map((link) => {
      const isExpired = link.expiresAt ? new Date(link.expiresAt) < now : false;
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au";
      const promoUrl = `${baseUrl}/promotions/${DEFAULT_PRIZE_SLUG}?promo=${link.code}`;

      // Extract and type-check createdBy to ensure proper type narrowing
      // When using .lean() with .populate(), createdBy could be ObjectId or populated object
      const createdBy = link.createdBy;
      let createdByInfo = null;

      // Check if createdBy is populated by verifying it's an object with the expected properties
      // This handles the case where populate() returns an object instead of just an ObjectId
      if (
        createdBy &&
        typeof createdBy === "object" &&
        !(createdBy instanceof mongoose.Types.ObjectId) &&
        "_id" in createdBy
      ) {
        // TypeScript now knows createdBy is an object with _id property
        // Cast through unknown to handle Mongoose's dynamic typing with lean()
        const populatedBy = createdBy as unknown as PopulatedCreatedBy;
        createdByInfo = {
          id: populatedBy._id?.toString() || "",
          email: populatedBy.email || "",
          name: `${populatedBy.firstName || ""} ${populatedBy.lastName || ""}`.trim(),
        };
      }

      return {
        id: link._id.toString(),
        code: link.code,
        bonusEntries: link.bonusEntries,
        expiresAt: link.expiresAt,
        expiresAtFormatted: link.expiresAt ? formatDateReadable(new Date(link.expiresAt)) : null,
        isActive: link.isActive,
        appliesToMembership: link.appliesToMembership || false,
        appliesToOneTime: link.appliesToOneTime || false,
        campaignType: link.campaignType || "general",
        eligibilityAudience: link.eligibilityAudience || "all",
        eligibilityRules: link.eligibilityRules || undefined,
        isExpired,
        description: link.description,
        usageCount: link.usageCount,
        usedByCount: link.usedBy?.length || 0,
        promoUrl,
        createdAt: link.createdAt,
        updatedAt: link.updatedAt,
        createdBy: createdByInfo,
      };
    });

    // Filter by expired if requested
    let filteredLinks = formattedPromoLinks;
    if (expired === "true") {
      filteredLinks = formattedPromoLinks.filter((link) => link.isExpired);
    } else if (expired === "false") {
      filteredLinks = formattedPromoLinks.filter((link) => !link.isExpired);
    }

    return NextResponse.json({
      success: true,
      data: filteredLinks,
      count: filteredLinks.length,
    });
  } catch (error) {
    console.error("❌ Error listing promo links:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to list promo links",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
