import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import MajorDraw from "@/models/MajorDraw";
import { z } from "zod";
import { calculateActivationDate, calculateFreezeTime } from "@/utils/common/timezone";

// Validation schema for major draw creation
const prizeSchema = z
  .object({
    name: z.string().min(1, "Prize name is required"),
    description: z.string().min(1, "Prize description is required"),
    value: z.number().min(0, "Prize value must be positive"),
    images: z.array(z.string()).min(1, "At least one prize image is required"),
    brand: z.string().optional(),
    terms: z.array(z.string()).optional(),
    specifications: z.record(z.string(), z.union([z.string(), z.number(), z.array(z.string())])).optional(),
    components: z
      .array(
        z.object({
          title: z.string().min(1, "Component title is required"),
          description: z.string().min(1, "Component description is required"),
          icon: z.string().optional(),
        })
      )
      .optional(),
  })
  .optional();

const createMajorDrawSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name too long"),
  description: z.string().min(1, "Description is required").max(2000, "Description too long"),
  drawDate: z.string().datetime("Invalid draw date format"),
  activationDate: z.string().datetime("Invalid activation date format").optional(),
  freezeEntriesAt: z.string().datetime("Invalid freeze date format").optional(),
  prize: prizeSchema,
});

/**
 * POST /api/admin/major-draw/create
 * Create a new major draw with monthly restriction validation
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("🎯 Creating new major draw...");

    // Parse and validate request body
    const body = await request.json();
    const validatedData = createMajorDrawSchema.parse(body);

    const drawDate = new Date(validatedData.drawDate);
    const targetMonth = drawDate.getMonth();
    const targetYear = drawDate.getFullYear();

    // ========================================
    // MONTHLY RESTRICTION VALIDATION
    // ========================================
    console.log(`🔍 Checking for existing draws in ${targetYear}-${targetMonth + 1}...`);

    const existingDraw = await MajorDraw.findOne({
      drawDate: {
        $gte: new Date(targetYear, targetMonth, 1),
        $lt: new Date(targetYear, targetMonth + 1, 1),
      },
      status: { $in: ["queued", "active", "frozen"] },
    });

    if (existingDraw) {
      console.log(`❌ Draw conflict found: ${existingDraw.name} (${existingDraw._id})`);
      return NextResponse.json(
        {
          success: false,
          error: "A major draw already exists for this month",
          details: `There is already a ${existingDraw.status} draw scheduled for ${targetYear}-${String(
            targetMonth + 1
          ).padStart(2, "0")}`,
          conflictingDraw: {
            id: existingDraw._id,
            name: existingDraw.name,
            status: existingDraw.status,
            drawDate: existingDraw.drawDate,
          },
        },
        { status: 409 }
      );
    }

    // ========================================
    // DATE CALCULATION AND VALIDATION
    // ========================================
    let activationDate: Date;
    let freezeEntriesAt: Date;

    if (validatedData.activationDate) {
      // Admin provided custom activation date
      activationDate = new Date(validatedData.activationDate);
    } else {
      // Auto-calculate activation date (midnight AEST after previous draw completes)
      activationDate = calculateActivationDate(drawDate);
    }

    if (validatedData.freezeEntriesAt) {
      // Admin provided custom freeze date
      freezeEntriesAt = new Date(validatedData.freezeEntriesAt);
    } else {
      // Auto-calculate freeze date (30 minutes before draw date)
      freezeEntriesAt = calculateFreezeTime(drawDate);
    }

    // Validate date relationships
    if (activationDate >= drawDate) {
      return NextResponse.json({ success: false, error: "Activation date must be before draw date" }, { status: 400 });
    }

    if (freezeEntriesAt >= drawDate) {
      return NextResponse.json(
        { success: false, error: "Freeze entries date must be before draw date" },
        { status: 400 }
      );
    }

    if (activationDate >= drawDate) {
      return NextResponse.json({ success: false, error: "Activation date must be before draw date" }, { status: 400 });
    }

    // ========================================
    // CREATE MAJOR DRAW
    // ========================================
    const newMajorDraw = new MajorDraw({
      name: validatedData.name.trim(),
      description: validatedData.description.trim(),
      drawDate,
      activationDate,
      freezeEntriesAt,
      status: "queued",
      isActive: false,
      configurationLocked: false,
      entries: [],
      totalEntries: 0,
      ...(validatedData.prize
        ? {
            prize: {
              name: validatedData.prize.name.trim(),
              description: validatedData.prize.description.trim(),
              value: validatedData.prize.value,
              images: validatedData.prize.images,
              ...(validatedData.prize.brand ? { brand: validatedData.prize.brand.trim() } : {}),
              terms: validatedData.prize.terms,
              specifications: validatedData.prize.specifications || {},
              components:
                validatedData.prize.components?.map((component) => ({
                  title: component.title.trim(),
                  description: component.description.trim(),
                  ...(component.icon ? { icon: component.icon.trim() } : {}),
                })) || [],
            },
          }
        : {}),
    });

    await newMajorDraw.save();

    console.log(`✅ Major draw created successfully: ${newMajorDraw.name} (ID: ${newMajorDraw._id})`);

    return NextResponse.json({
      success: true,
      data: {
        majorDraw: {
          _id: newMajorDraw._id,
          name: newMajorDraw.name,
          description: newMajorDraw.description,
          status: newMajorDraw.status,
          drawDate: newMajorDraw.drawDate,
          activationDate: newMajorDraw.activationDate,
          freezeEntriesAt: newMajorDraw.freezeEntriesAt,
          configurationLocked: newMajorDraw.configurationLocked,
          prize: newMajorDraw.prize,
          totalEntries: newMajorDraw.totalEntries,
          createdAt: newMajorDraw.createdAt,
          updatedAt: newMajorDraw.updatedAt,
        },
      },
      message: "Major draw created successfully",
    });
  } catch (error) {
    console.error("❌ Error creating major draw:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to create major draw",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
