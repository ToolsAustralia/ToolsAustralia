import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import PromoLink from "@/models/PromoLink";
import { z } from "zod";
import mongoose from "mongoose";
import { DEFAULT_PRIZE_SLUG } from "@/config/prizes";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Validation schema for updating promo link
 */
const updatePromoLinkSchema = z
  .object({
    bonusEntries: z.number().int().min(1, "Bonus entries must be at least 1").optional(),
    expiresAt: z.string().datetime("Invalid expiration date format").optional().nullable(),
    description: z.string().max(500, "Description cannot exceed 500 characters").optional(),
    isActive: z.boolean().optional(),
    appliesToMembership: z.boolean().optional(),
    appliesToOneTime: z.boolean().optional(),
    campaignType: z.enum(["general", "cancelled-membership-comeback"]).optional(),
    eligibilityAudience: z.enum(["all", "cancelled-members"]).optional(),
    eligibilityRules: z
      .object({
        requireInactiveSubscription: z.boolean().optional(),
        cancelledWithinDays: z.number().int().min(1, "cancelledWithinDays must be at least 1").optional(),
      })
      .optional(),
  })
  .refine(
    (data) => {
      // If isActive is being set to true, check if at least one package type is selected
      // We need to check the final state after update
      if (data.isActive === true) {
        // If both package types are being updated, check them
        if (data.appliesToMembership !== undefined || data.appliesToOneTime !== undefined) {
          const appliesToMembership = data.appliesToMembership ?? false;
          const appliesToOneTime = data.appliesToOneTime ?? false;
          return appliesToMembership || appliesToOneTime;
        }
        // If isActive is being set but package types aren't being updated,
        // we'll validate after loading the existing promo link
      }
      return true;
    },
    {
      message: "At least one package type (membership or one-time) must be selected for active promo links",
      path: ["appliesToMembership"],
    }
  );

/**
 * PATCH /api/admin/promo/link/[id]
 * Update a promo link
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
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

    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid promo link ID" }, { status: 400 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = updatePromoLinkSchema.parse(body);

    // Find the promo link
    const promoLink = await PromoLink.findById(id);
    if (!promoLink) {
      return NextResponse.json({ error: "Promo link not found" }, { status: 404 });
    }

    // Update fields
    if (validatedData.bonusEntries !== undefined) {
      promoLink.bonusEntries = validatedData.bonusEntries;
    }

    if (validatedData.expiresAt !== undefined) {
      if (validatedData.expiresAt === null) {
        promoLink.expiresAt = undefined;
      } else {
        const expiresAt = new Date(validatedData.expiresAt);
        // Validate expiration is in the future (if being set)
        if (expiresAt <= new Date()) {
          return NextResponse.json({ success: false, error: "Expiration date must be in the future" }, { status: 400 });
        }
        promoLink.expiresAt = expiresAt;
      }
    }

    if (validatedData.description !== undefined) {
      promoLink.description = validatedData.description || undefined;
    }

    if (validatedData.appliesToMembership !== undefined) {
      promoLink.appliesToMembership = validatedData.appliesToMembership;
    }

    if (validatedData.appliesToOneTime !== undefined) {
      promoLink.appliesToOneTime = validatedData.appliesToOneTime;
    }

    if (validatedData.isActive !== undefined) {
      promoLink.isActive = validatedData.isActive;
    }

    if (validatedData.campaignType !== undefined) {
      promoLink.campaignType = validatedData.campaignType;
    }

    if (validatedData.eligibilityAudience !== undefined) {
      promoLink.eligibilityAudience = validatedData.eligibilityAudience;
    }

    if (validatedData.eligibilityRules !== undefined) {
      promoLink.eligibilityRules = validatedData.eligibilityRules;
    }

    // Validate that if active, at least one package type is selected
    const finalIsActive = validatedData.isActive !== undefined ? validatedData.isActive : promoLink.isActive;
    const finalAppliesToMembership =
      validatedData.appliesToMembership !== undefined
        ? validatedData.appliesToMembership
        : promoLink.appliesToMembership;
    const finalAppliesToOneTime =
      validatedData.appliesToOneTime !== undefined ? validatedData.appliesToOneTime : promoLink.appliesToOneTime;

    if (finalIsActive && !finalAppliesToMembership && !finalAppliesToOneTime) {
      return NextResponse.json(
        {
          success: false,
          error: "At least one package type (membership or one-time) must be selected for active promo links",
        },
        { status: 400 }
      );
    }

    const finalCampaignType = validatedData.campaignType !== undefined ? validatedData.campaignType : promoLink.campaignType;
    const finalEligibilityAudience =
      validatedData.eligibilityAudience !== undefined ? validatedData.eligibilityAudience : promoLink.eligibilityAudience;
    if (finalCampaignType === "cancelled-membership-comeback" && finalEligibilityAudience !== "cancelled-members") {
      return NextResponse.json(
        {
          success: false,
          error: "Comeback campaign must target cancelled-members audience",
        },
        { status: 400 }
      );
    }

    await promoLink.save();

    console.log(`✅ Updated promo link ${id}`, {
      updatedBy: user.email,
      appliesToMembership: promoLink.appliesToMembership,
      appliesToOneTime: promoLink.appliesToOneTime,
      campaignType: promoLink.campaignType,
      eligibilityAudience: promoLink.eligibilityAudience,
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au";
    const promoUrl = `${baseUrl}/promotions/${DEFAULT_PRIZE_SLUG}?promo=${promoLink.code}`;

    return NextResponse.json({
      success: true,
      message: "Promo link updated successfully",
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        id: (promoLink._id as any).toString(),
        code: promoLink.code,
        bonusEntries: promoLink.bonusEntries,
        expiresAt: promoLink.expiresAt,
        isActive: promoLink.isActive,
        appliesToMembership: promoLink.appliesToMembership,
        appliesToOneTime: promoLink.appliesToOneTime,
        campaignType: promoLink.campaignType,
        eligibilityAudience: promoLink.eligibilityAudience,
        eligibilityRules: promoLink.eligibilityRules,
        description: promoLink.description,
        usageCount: promoLink.usageCount,
        promoUrl,
        updatedAt: promoLink.updatedAt,
      },
    });
  } catch (error) {
    console.error("❌ Error updating promo link:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: error.issues.map((err) => ({
            field: err.path.join("."),
            message: err.message,
          })),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to update promo link",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/promo/link/[id]
 * Delete a promo link
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid promo link ID" }, { status: 400 });
    }

    // Find and delete the promo link
    const promoLink = await PromoLink.findByIdAndDelete(id);
    if (!promoLink) {
      return NextResponse.json({ error: "Promo link not found" }, { status: 404 });
    }

    console.log(`🗑️ Deleted promo link ${id}`, {
      deletedBy: user.email,
      code: promoLink.code,
    });

    return NextResponse.json({
      success: true,
      message: "Promo link deleted successfully",
    });
  } catch (error) {
    console.error("❌ Error deleting promo link:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete promo link",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

