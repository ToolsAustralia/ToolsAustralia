import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import AlternatingPromoMultiplier from "@/models/AlternatingPromoMultiplier";
import { z } from "zod";
import { zPromoMultiplier } from "@/lib/zod/promo-multiplier-schema";
import type {
  AlternatingPromoMultiplier as AlternatingPromoMultiplierType,
  AlternatingPromoMultiplierListResponse,
  CreateAlternatingPromoMultiplierPayload,
} from "@/types/admin";

// Validation schema
const createAlternatingMultiplierSchema = z.object({
  type: z.enum(["membership-packages", "one-time-packages", "mini-packages"]),
  multipliers: z
    .array(zPromoMultiplier)
    .length(2, "Must have exactly 2 multipliers")
    .refine((arr) => arr[0] !== arr[1], "Multipliers must be different"),
  isEnabled: z.boolean().optional(),
  description: z.string().max(500).optional(),
});

/**
 * GET /api/admin/promo/alternating-multiplier
 * Get all alternating multiplier configurations (admin management)
 * Optional query param: ?type=membership-packages to get specific type
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // Check if type query param is provided
    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get("type");

    type ConfigDocument = {
      _id: { toString(): string } | string;
      type: "membership-packages" | "one-time-packages" | "mini-packages";
      multipliers: [number, number] | number[];
      isEnabled: boolean;
      description?: string;
      createdAt: Date | string;
      updatedAt: Date | string;
      createdBy?: {
        firstName: string;
        lastName: string;
        email: string;
      };
    };

    let configs: ConfigDocument[];
    if (typeParam && ["membership-packages", "one-time-packages", "mini-packages"].includes(typeParam)) {
      // Get specific type
      const config = await AlternatingPromoMultiplier.findOne({
        type: typeParam as "membership-packages" | "one-time-packages" | "mini-packages",
      })
        .populate("createdBy", "firstName lastName email")
        .lean()
        .exec();

      configs = config ? [config as unknown as ConfigDocument] : [];
    } else {
      // Get all configs
      configs = (await AlternatingPromoMultiplier.find()
        .populate("createdBy", "firstName lastName email")
        .sort({ createdAt: -1 })
        .lean()
        .exec()) as unknown as ConfigDocument[];
    }

    // Convert to response format
    const response: AlternatingPromoMultiplierType[] = configs.map((config) => {
      const id = typeof config._id === "string" ? config._id : config._id.toString();
      const createdAt = config.createdAt instanceof Date 
        ? config.createdAt.toISOString() 
        : typeof config.createdAt === "string" 
        ? config.createdAt 
        : new Date(config.createdAt).toISOString();
      const updatedAt = config.updatedAt instanceof Date 
        ? config.updatedAt.toISOString() 
        : typeof config.updatedAt === "string" 
        ? config.updatedAt 
        : new Date(config.updatedAt).toISOString();
      const multipliers = Array.isArray(config.multipliers) && config.multipliers.length === 2
        ? [config.multipliers[0], config.multipliers[1]] as [number, number]
        : [2, 3] as [number, number]; // Fallback if invalid

      return {
        id,
        type: config.type,
        multipliers,
        isEnabled: config.isEnabled,
        description: config.description,
        createdAt,
        updatedAt,
        createdBy:
          config.createdBy && typeof config.createdBy === "object" && "firstName" in config.createdBy
            ? {
                id: String((config.createdBy as { _id?: { toString(): string } })._id || ""),
                email: String((config.createdBy as { email?: string }).email || ""),
                firstName: String((config.createdBy as { firstName?: string }).firstName || ""),
                lastName: String((config.createdBy as { lastName?: string }).lastName || ""),
              }
            : null,
      };
    });

    return NextResponse.json(
      {
        success: true,
        data: response,
        count: response.length,
      } as AlternatingPromoMultiplierListResponse,
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching alternating multiplier configs:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch alternating multiplier configurations",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/promo/alternating-multiplier
 * Create or update (upsert) alternating multiplier configuration
 * Uses type as unique identifier - if config exists for type, updates it; otherwise creates new
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as CreateAlternatingPromoMultiplierPayload;

    // Validate input
    const validationResult = createAlternatingMultiplierSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: validationResult.error.issues,
        },
        { status: 400 }
      );
    }

    await connectDB();

    // Upsert: find existing config by type, or create new
    const existingConfig = await AlternatingPromoMultiplier.findOne({
      type: validationResult.data.type,
    });

    let config;
    if (existingConfig) {
      // Update existing config
      existingConfig.multipliers = validationResult.data.multipliers as [number, number];
      existingConfig.isEnabled = validationResult.data.isEnabled ?? existingConfig.isEnabled;
      if (validationResult.data.description !== undefined) {
        existingConfig.description = validationResult.data.description;
      }
      config = await existingConfig.save();
    } else {
      // Create new config
      config = new AlternatingPromoMultiplier({
        type: validationResult.data.type,
        multipliers: validationResult.data.multipliers as [number, number],
        isEnabled: validationResult.data.isEnabled ?? false,
        description: validationResult.data.description,
        createdBy: session.user.id,
      });
      config = await config.save();
    }

    // Populate createdBy for response
    await config.populate("createdBy", "firstName lastName email");

    const response: AlternatingPromoMultiplierType = {
      id: (config._id as { toString(): string }).toString(),
      type: config.type,
      multipliers: config.multipliers as [number, number],
      isEnabled: config.isEnabled,
      description: config.description,
      createdAt: config.createdAt.toISOString(),
      updatedAt: config.updatedAt.toISOString(),
      createdBy:
        config.createdBy && typeof config.createdBy === "object" && "firstName" in config.createdBy
          ? {
              id: String((config.createdBy as { _id?: { toString(): string } })._id || ""),
              email: String((config.createdBy as { email?: string }).email || ""),
              firstName: String((config.createdBy as { firstName?: string }).firstName || ""),
              lastName: String((config.createdBy as { lastName?: string }).lastName || ""),
            }
          : null,
    };

    return NextResponse.json(
      {
        success: true,
        data: response,
        message: existingConfig ? "Configuration updated successfully" : "Configuration created successfully",
      },
      { status: existingConfig ? 200 : 201 }
    );
  } catch (error) {
    console.error("Error creating/updating alternating multiplier config:", error);
    
    // Handle duplicate key error (shouldn't happen with upsert, but just in case)
    if ((error as { code?: number }).code === 11000) {
      return NextResponse.json(
        {
          success: false,
          error: "Configuration already exists for this package type",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to create/update alternating multiplier configuration",
      },
      { status: 500 }
    );
  }
}

