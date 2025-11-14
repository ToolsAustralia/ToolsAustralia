import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import Promo from "@/models/Promo";
import { z } from "zod";

// Validation schema
const createPromoSchema = z.object({
  type: z.enum(["one-time-packages", "mini-packages"]),
  multiplier: z.enum(["2", "3", "5", "10"]).transform((val) => parseInt(val) as 2 | 3 | 5 | 10),
  startDate: z.string().datetime("Invalid start date format"),
  endDate: z.string().datetime("Invalid end date format"),
  duration: z.number().min(1, "Duration must be at least 1 hour"),
  forceCreate: z.boolean().optional(), // For conflict resolution
});

export async function POST(request: NextRequest) {
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

    // Parse and validate request body
    const body = await request.json();
    const validatedData = createPromoSchema.parse(body);

    const { type, multiplier, startDate, endDate, duration, forceCreate } = validatedData;

    // Validate date relationships
    const start = new Date(startDate);
    const end = new Date(endDate);
    const currentTime = new Date();

    if (start >= end) {
      return NextResponse.json({ success: false, error: "Start date must be before end date" }, { status: 400 });
    }

    if (start <= currentTime) {
      return NextResponse.json({ success: false, error: "Start date must be in the future" }, { status: 400 });
    }

    // Check for ANY active promo of the same type (current OR future)
    const existingPromo = await Promo.findOne({
      type,
      isActive: true,
      endDate: { $gt: currentTime }, // Still active or will be active
    }).sort({ createdAt: -1 });

    if (existingPromo && !forceCreate) {
      // Return conflict information for admin to decide
      return NextResponse.json(
        {
          success: false,
          error: "Active promo conflict",
          conflict: {
            existingPromo: {
              id: existingPromo._id,
              type: existingPromo.type,
              multiplier: existingPromo.multiplier.toString(), // Convert to string for consistency
              startDate: existingPromo.startDate,
              endDate: existingPromo.endDate,
              duration: existingPromo.duration,
            },
            message: `An active ${existingPromo.multiplier}x promo for ${type} is already running. Do you want to end it and start the new promo?`,
          },
        },
        { status: 409 }
      );
    }

    // If forceCreate is true, deactivate the existing promo
    if (existingPromo && forceCreate) {
      await existingPromo.deactivate();
      console.log(`🔄 Deactivated existing promo ${existingPromo._id} to make way for new promo`);
    }

    // Create new promo
    const newPromo = new Promo({
      type,
      multiplier,
      startDate: start,
      endDate: end,
      duration,
      isActive: true,
      createdBy: user._id,
    });

    await newPromo.save();

    console.log(`✅ Created new ${multiplier}x promo for ${type}`, {
      id: newPromo._id,
      startDate: newPromo.startDate,
      endDate: newPromo.endDate,
      createdBy: user.email,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Successfully created ${multiplier}x promo for ${type}`,
        data: {
          id: newPromo._id,
          type: newPromo.type,
          multiplier: newPromo.multiplier,
          startDate: newPromo.startDate,
          endDate: newPromo.endDate,
          duration: newPromo.duration,
          isActive: newPromo.isActive,
          createdAt: newPromo.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("❌ Error creating promo:", error);

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
        error: "Failed to create promo",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
