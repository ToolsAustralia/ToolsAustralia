import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import MajorDraw from "@/models/MajorDraw";
import { z } from "zod";

// Validation schema for major draw updates
const majorDrawUpdateSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name too long").optional(),
  description: z.string().min(1, "Description is required").max(2000, "Description too long").optional(),
  status: z.enum(["queued", "active", "frozen", "completed", "cancelled"]).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  drawDate: z.string().datetime().optional(),
  activationDate: z.string().datetime().optional(),
  prize: z
    .object({
      name: z.string().min(1, "Prize name is required").optional(),
      description: z.string().min(1, "Prize description is required").optional(),
      value: z.number().min(0, "Prize value must be positive").optional(),
      brand: z.string().optional(),
      images: z.array(z.string()).min(1).optional(),
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
    .optional(),
});

export async function PUT(request: NextRequest) {
  try {
    await connectDB();

    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const majorDrawId = searchParams.get("id");

    if (!majorDrawId) {
      return NextResponse.json({ error: "Major draw ID is required" }, { status: 400 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = majorDrawUpdateSchema.parse(body);

    // Find the major draw
    const majorDraw = await MajorDraw.findById(majorDrawId);
    if (!majorDraw) {
      return NextResponse.json({ error: "Major draw not found" }, { status: 404 });
    }

    // Check if configuration is locked
    if (majorDraw.configurationLocked) {
      // Only allow limited updates when locked
      const allowedFields = ["name", "description", "status"];
      const hasRestrictedFields = Object.keys(validatedData).some((key) => !allowedFields.includes(key));

      if (hasRestrictedFields) {
        return NextResponse.json(
          { error: "Configuration is locked. Only basic information can be updated." },
          { status: 403 }
        );
      }
    }

    // Validate date logic
    const updateData: Record<string, unknown> = {};

    // Map top-level fields directly
    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.description !== undefined) updateData.description = validatedData.description;
    if (validatedData.status !== undefined) updateData.status = validatedData.status;
    if (validatedData.startDate !== undefined) updateData.startDate = validatedData.startDate;
    if (validatedData.endDate !== undefined) updateData.endDate = validatedData.endDate;
    if (validatedData.drawDate !== undefined) updateData.drawDate = validatedData.drawDate;
    if (validatedData.activationDate !== undefined) updateData.activationDate = validatedData.activationDate;

    // Convert date strings to Date objects
    if (updateData.drawDate) {
      updateData.drawDate = new Date(updateData.drawDate as string | Date);
    }
    if (updateData.activationDate) {
      updateData.activationDate = new Date(updateData.activationDate as string | Date);
    }

    // Validate date relationships
    const activationDate = (updateData.activationDate as Date) || majorDraw.activationDate;
    const drawDate = (updateData.drawDate as Date) || majorDraw.drawDate;
    const freezeEntriesAt = (updateData.freezeEntriesAt as Date) || majorDraw.freezeEntriesAt;

    if (activationDate && drawDate && activationDate >= drawDate) {
      return NextResponse.json({ error: "Activation date must be before draw date" }, { status: 400 });
    }

    if (freezeEntriesAt && drawDate && freezeEntriesAt >= drawDate) {
      return NextResponse.json({ error: "Freeze entries date must be before draw date" }, { status: 400 });
    }

    // Update freezeEntriesAt if drawDate is being updated
    if (updateData.drawDate) {
      // Set freeze entries 30 minutes before draw date
      const drawDateObj =
        updateData.drawDate instanceof Date ? updateData.drawDate : new Date(updateData.drawDate as string);
      updateData.freezeEntriesAt = new Date(drawDateObj.getTime() - 30 * 60 * 1000);
    }

    // Handle prize updates using dot-notation to avoid stripping existing nested fields
    if (validatedData.prize) {
      const prizeUpdates = validatedData.prize;
      if (prizeUpdates.name !== undefined) updateData["prize.name"] = prizeUpdates.name;
      if (prizeUpdates.description !== undefined) updateData["prize.description"] = prizeUpdates.description;
      if (prizeUpdates.value !== undefined) updateData["prize.value"] = prizeUpdates.value;
      if (prizeUpdates.brand !== undefined) {
        updateData["prize.brand"] =
          typeof prizeUpdates.brand === "string" ? prizeUpdates.brand.trim() : prizeUpdates.brand;
      }
      if (prizeUpdates.terms !== undefined) updateData["prize.terms"] = prizeUpdates.terms;
      if (prizeUpdates.images !== undefined) updateData["prize.images"] = prizeUpdates.images;
      if (prizeUpdates.specifications !== undefined) updateData["prize.specifications"] = prizeUpdates.specifications;
      if (prizeUpdates.components !== undefined) {
        updateData["prize.components"] = prizeUpdates.components.map((component) => ({
          title: component.title.trim(),
          description: component.description.trim(),
          ...(component.icon ? { icon: component.icon.trim() } : {}),
        }));
      }
    }

    // Update the major draw
    const updatedMajorDraw = await MajorDraw.findByIdAndUpdate(
      majorDrawId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedMajorDraw) {
      return NextResponse.json({ error: "Failed to update major draw" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        majorDraw: {
          _id: updatedMajorDraw._id,
          name: updatedMajorDraw.name,
          description: updatedMajorDraw.description,
          status: updatedMajorDraw.status,
          drawDate: updatedMajorDraw.drawDate,
          activationDate: updatedMajorDraw.activationDate,
          freezeEntriesAt: updatedMajorDraw.freezeEntriesAt,
          configurationLocked: updatedMajorDraw.configurationLocked,
          prize: updatedMajorDraw.prize,
          totalEntries: updatedMajorDraw.totalEntries,
          createdAt: updatedMajorDraw.createdAt,
          updatedAt: updatedMajorDraw.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error("Error updating major draw:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Failed to update major draw", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// GET endpoint to fetch major draw details for editing
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const majorDrawId = searchParams.get("id");

    if (!majorDrawId) {
      return NextResponse.json({ error: "Major draw ID is required" }, { status: 400 });
    }

    // Find the major draw
    const majorDraw = await MajorDraw.findById(majorDrawId).select("-entries -winner -__v");

    if (!majorDraw) {
      return NextResponse.json({ error: "Major draw not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        majorDraw: {
          _id: majorDraw._id,
          name: majorDraw.name,
          description: majorDraw.description,
          status: majorDraw.status,
          drawDate: majorDraw.drawDate,
          activationDate: majorDraw.activationDate,
          freezeEntriesAt: majorDraw.freezeEntriesAt,
          configurationLocked: majorDraw.configurationLocked,
          lockedAt: majorDraw.lockedAt,
          prize: majorDraw.prize,
          totalEntries: majorDraw.totalEntries,
          createdAt: majorDraw.createdAt,
          updatedAt: majorDraw.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching major draw:", error);
    return NextResponse.json(
      { error: "Failed to fetch major draw", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
