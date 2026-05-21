import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import PromoLink from "@/models/PromoLink";
import { z } from "zod";
import { generatePromoLinkCode } from "@/utils/promo/generate-promo-link-code";
import { DEFAULT_PRIZE_SLUG } from "@/config/prizes";

/**
 * Validation schema for creating promo link
 */
const createPromoLinkSchema = z
  .object({
    customCode: z
      .string()
      .trim()
      .min(6, "Promo code must be at least 6 characters")
      .max(32, "Promo code must be at most 32 characters")
      .regex(
        /^(?=.{6,32}$)[A-Z0-9]+(?:-[A-Z0-9]+)*$/i,
        "Promo code can only contain letters, numbers, and optional hyphen separators"
      )
      .optional(),
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
      // If active, at least one package type must be selected
      const isActive = data.isActive !== undefined ? data.isActive : true;
      if (!isActive) return true; // Inactive promos don't need package types
      return data.appliesToMembership || false || data.appliesToOneTime || false;
    },
    {
      message: "At least one package type (membership or one-time) must be selected for active promo links",
      path: ["appliesToMembership"], // Error will show on this field
    }
  );

/**
 * POST /api/admin/promo/link/create
 * Create a new promo link with auto-generated or custom code
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requirePermission("promos.edit");
    if (guard instanceof NextResponse) return guard;
    const { session } = guard;

    await connectDB();

    // Parse and validate request body
    const body = await request.json();
    const validatedData = createPromoLinkSchema.parse(body);

    // Use custom code when provided, otherwise generate unique code
    const code = validatedData.customCode?.trim().toUpperCase() || (await generatePromoLinkCode());

    if (validatedData.customCode) {
      const existingCode = await PromoLink.findOne({ code });
      if (existingCode) {
        return NextResponse.json(
          {
            success: false,
            error: "Promo code already exists. Please choose a different code.",
          },
          { status: 409 }
        );
      }
    }

    // Parse expiration date if provided
    let expiresAt: Date | undefined;
    if (validatedData.expiresAt) {
      expiresAt = new Date(validatedData.expiresAt);
      // Validate expiration is in the future
      if (expiresAt <= new Date()) {
        return NextResponse.json({ success: false, error: "Expiration date must be in the future" }, { status: 400 });
      }
    }

    // Campaign defaults and safety rails
    const campaignType = validatedData.campaignType || "general";
    const eligibilityAudience =
      validatedData.eligibilityAudience ||
      (campaignType === "cancelled-membership-comeback" ? "cancelled-members" : "all");
    const eligibilityRules =
      validatedData.eligibilityRules ||
      (campaignType === "cancelled-membership-comeback"
        ? { requireInactiveSubscription: true }
        : undefined);

    if (campaignType === "cancelled-membership-comeback" && eligibilityAudience !== "cancelled-members") {
      return NextResponse.json(
        {
          success: false,
          error: "Comeback campaign must target cancelled-members audience",
        },
        { status: 400 }
      );
    }

    // Create promo link
    const isActive = validatedData.isActive !== undefined ? validatedData.isActive : true;
    const newPromoLink = new PromoLink({
      code,
      bonusEntries: validatedData.bonusEntries || 100,
      expiresAt,
      isActive,
      appliesToMembership: validatedData.appliesToMembership || false,
      appliesToOneTime: validatedData.appliesToOneTime || false,
      campaignType,
      eligibilityAudience,
      eligibilityRules,
      createdBy: session.user.id,
      description: validatedData.description || undefined,
      usageCount: 0,
      usedBy: [],
    });

    await newPromoLink.save();

    // Generate full URL with default promotion slug
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au";
    const promoUrl = `${baseUrl}/promotions/${DEFAULT_PRIZE_SLUG}?promo=${code}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newPromoLinkId = (newPromoLink._id as any).toString();

    console.log(`✅ Created new promo link`, {
      id: newPromoLinkId,
      code: newPromoLink.code,
      bonusEntries: newPromoLink.bonusEntries,
      appliesToMembership: newPromoLink.appliesToMembership,
      appliesToOneTime: newPromoLink.appliesToOneTime,
      campaignType: newPromoLink.campaignType,
      eligibilityAudience: newPromoLink.eligibilityAudience,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Successfully created promo link",
        data: {
          id: newPromoLinkId,
          code: newPromoLink.code,
          bonusEntries: newPromoLink.bonusEntries,
          expiresAt: newPromoLink.expiresAt,
          isActive: newPromoLink.isActive,
          appliesToMembership: newPromoLink.appliesToMembership,
          appliesToOneTime: newPromoLink.appliesToOneTime,
          campaignType: newPromoLink.campaignType,
          eligibilityAudience: newPromoLink.eligibilityAudience,
          eligibilityRules: newPromoLink.eligibilityRules,
          description: newPromoLink.description,
          usageCount: newPromoLink.usageCount,
          promoUrl,
          createdAt: newPromoLink.createdAt,
          createdBy: {
            id: session.user.id,
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("❌ Error creating promo link:", error);

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

    const mongoErrorCode =
      error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
    if (mongoErrorCode === 11000) {
      return NextResponse.json(
        {
          success: false,
          error: "Promo code already exists. Please choose a different code.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to create promo link",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

