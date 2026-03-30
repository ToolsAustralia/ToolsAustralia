/**
 * Admin API: Winner Management
 *
 * GET /api/admin/winners/[id] - Get winner details
 * PATCH /api/admin/winners/[id] - Update winner testimony and selected prize
 * DELETE /api/admin/winners/[id] - Remove a major draw winner (deletes record; draw stays completed; use Select Winner to record a new winner)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import Winner from "@/models/Winner";
import MajorDraw from "@/models/MajorDraw";
import MiniDraw from "@/models/MiniDraw";
import mongoose, { Types } from "mongoose";
import { z } from "zod";
type RouteParams = { params: Promise<{ id: string }> };

// Validation schema for updating winner
const updateWinnerSchema = z.object({
  testimony: z.string().trim().optional().nullable(),
  selectedPrize: z.string().trim().optional().nullable(),
  // Legacy field - kept for backward compatibility
  selectedPrizeSlug: z.string().optional().nullable(),
  imageUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
});

/**
 * GET /api/admin/winners/[id]
 * Get detailed winner information including user details and draw information
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();

    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: winnerId } = await params;

    if (!mongoose.Types.ObjectId.isValid(winnerId)) {
      return NextResponse.json({ error: "Invalid winner ID" }, { status: 400 });
    }

    // Fetch winner with populated user and draw information
    const winner = await Winner.findById(winnerId)
      .populate("userId", "firstName lastName email state")
      .populate("selectedBy", "firstName lastName email")
      .lean();

    if (!winner) {
      return NextResponse.json({ error: "Winner not found" }, { status: 404 });
    }

    // Get draw information based on draw type
    let drawInfo: { name?: string; id?: string } = {};
    if (winner.drawType === "major") {
      const majorDraw = await MajorDraw.findById(winner.drawId).select("name").lean();
      if (majorDraw && !Array.isArray(majorDraw) && majorDraw._id) {
        const drawId = typeof majorDraw._id === 'object' && '_id' in majorDraw._id 
          ? (majorDraw._id as { _id: Types.ObjectId })._id.toString()
          : String(majorDraw._id);
        drawInfo = { name: majorDraw.name, id: drawId };
      }
    } else {
      const miniDraw = await MiniDraw.findById(winner.drawId).select("name").lean();
      if (miniDraw && !Array.isArray(miniDraw) && miniDraw._id) {
        const drawId = typeof miniDraw._id === 'object' && '_id' in miniDraw._id 
          ? (miniDraw._id as { _id: Types.ObjectId })._id.toString()
          : String(miniDraw._id);
        drawInfo = { name: miniDraw.name, id: drawId };
      }
    }

    // Format response
    const winnerUser = winner.userId as unknown as { firstName?: string; lastName?: string; email?: string; state?: string };
    const selectedByUser = winner.selectedBy as unknown as { firstName?: string; lastName?: string; email?: string } | null;

    return NextResponse.json({
      success: true,
      winner: {
        id: winner._id.toString(),
        drawId: winner.drawId.toString(),
        drawName: drawInfo.name || "Unknown Draw",
        drawType: winner.drawType,
        userId: winner.userId.toString(),
        winnerFirstName: winnerUser?.firstName || "",
        winnerLastName: winnerUser?.lastName || "",
        winnerEmail: winnerUser?.email || "",
        winnerState: winnerUser?.state || "",
        prize: {
          name: winner.prizeSnapshot?.name || "",
          description: winner.prizeSnapshot?.description || "",
          value: winner.prizeSnapshot?.value || 0,
          images: winner.prizeSnapshot?.images || [],
        },
        entryNumber: winner.entryNumber,
        selectedDate: winner.selectedDate,
        imageUrl: winner.imageUrl,
        testimony: winner.testimony || null,
        selectedPrize: (winner.selectedPrize || winner.selectedPrizeSlug) || null, // Prefer new field, fallback to legacy
        selectedPrizeSlug: winner.selectedPrizeSlug || null, // Legacy field
        selectedBy: selectedByUser
          ? {
              id: winner.selectedBy?.toString(),
              name: `${selectedByUser.firstName || ""} ${selectedByUser.lastName || ""}`.trim(),
              email: selectedByUser.email || "",
            }
          : null,
        cycle: winner.cycle,
        createdAt: winner.createdAt,
        updatedAt: winner.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching winner:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch winner",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/winners/[id]
 * Update winner testimony and/or selected prize slug
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();

    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: winnerId } = await params;

    if (!mongoose.Types.ObjectId.isValid(winnerId)) {
      return NextResponse.json({ error: "Invalid winner ID" }, { status: 400 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = updateWinnerSchema.parse(body);

    // Find winner
    const winner = await Winner.findById(winnerId);
    if (!winner) {
      return NextResponse.json({ error: "Winner not found" }, { status: 404 });
    }

    // Update fields if provided
    if (validatedData.testimony !== undefined) {
      winner.testimony = validatedData.testimony || undefined;
    }

    // Update selected prize (prefer new field, fallback to legacy)
    if (validatedData.selectedPrize !== undefined) {
      // Only allow prize selection for major draws
      if (winner.drawType !== "major") {
        return NextResponse.json(
          { error: "Prize selection is only available for major draw winners" },
          { status: 400 }
        );
      }
      winner.selectedPrize = validatedData.selectedPrize || undefined;
    } else if (validatedData.selectedPrizeSlug !== undefined) {
      // Legacy support: migrate selectedPrizeSlug to selectedPrize
      if (winner.drawType !== "major") {
        return NextResponse.json(
          { error: "Prize selection is only available for major draw winners" },
          { status: 400 }
        );
      }
      winner.selectedPrize = validatedData.selectedPrizeSlug || undefined;
    }

    // Update winner image URL (optional; null or empty clears it)
    if (validatedData.imageUrl !== undefined) {
      winner.imageUrl = validatedData.imageUrl && validatedData.imageUrl.trim() !== "" ? validatedData.imageUrl : undefined;
    }

    await winner.save();

    // Fetch updated winner with populated data
    const updatedWinner = await Winner.findById(winnerId)
      .populate("userId", "firstName lastName email state")
      .lean();

    if (!updatedWinner) {
      return NextResponse.json({ error: "Failed to fetch updated winner" }, { status: 500 });
    }

    // Get draw information
    let drawInfo: { name?: string } = {};
    if (updatedWinner.drawType === "major") {
      const majorDraw = await MajorDraw.findById(updatedWinner.drawId).select("name").lean();
      if (majorDraw && !Array.isArray(majorDraw)) {
        drawInfo = { name: majorDraw.name };
      }
    } else {
      const miniDraw = await MiniDraw.findById(updatedWinner.drawId).select("name").lean();
      if (miniDraw && !Array.isArray(miniDraw)) {
        drawInfo = { name: miniDraw.name };
      }
    }

    const winnerUser = updatedWinner.userId as unknown as { firstName?: string; lastName?: string; email?: string; state?: string };

    return NextResponse.json({
      success: true,
      message: "Winner updated successfully",
      winner: {
        id: updatedWinner._id.toString(),
        drawId: updatedWinner.drawId.toString(),
        drawName: drawInfo.name || "Unknown Draw",
        drawType: updatedWinner.drawType,
        winnerFirstName: winnerUser?.firstName || "",
        winnerLastName: winnerUser?.lastName || "",
        prize: {
          name: updatedWinner.prizeSnapshot?.name || "",
          description: updatedWinner.prizeSnapshot?.description || "",
          value: updatedWinner.prizeSnapshot?.value || 0,
          images: updatedWinner.prizeSnapshot?.images || [],
        },
        testimony: updatedWinner.testimony || null,
        selectedPrize: (updatedWinner.selectedPrize || updatedWinner.selectedPrizeSlug) || null, // Prefer new field, fallback to legacy
        selectedPrizeSlug: updatedWinner.selectedPrizeSlug || null, // Legacy field
        imageUrl: updatedWinner.imageUrl ?? null,
      },
    });
  } catch (error) {
    console.error("Error updating winner:", error);
    
    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to update winner",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/winners/[id]
 * Remove major draw winner only: deletes Winner document and clears legacy fields on MajorDraw.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: winnerId } = await params;

    if (!mongoose.Types.ObjectId.isValid(winnerId)) {
      return NextResponse.json({ error: "Invalid winner ID" }, { status: 400 });
    }

    const winner = await Winner.findById(winnerId);
    if (!winner) {
      return NextResponse.json({ error: "Winner not found" }, { status: 404 });
    }

    if (winner.drawType !== "major") {
      return NextResponse.json(
        { error: "Only major draw winners can be removed with this action" },
        { status: 400 }
      );
    }

    const majorDrawId = winner.drawId;

    const trx = await mongoose.startSession();
    trx.startTransaction();

    try {
      await Winner.deleteOne({ _id: winner._id }, { session: trx });

      await MajorDraw.updateOne(
        { _id: majorDrawId },
        { $unset: { winner: 1, latestWinnerId: 1 } },
        { session: trx }
      );

      await trx.commitTransaction();

      return NextResponse.json({
        success: true,
        message: "Major draw winner removed. You can select a new winner from Draw Results.",
        majorDrawId: majorDrawId.toString(),
      });
    } catch (err) {
      await trx.abortTransaction();
      throw err;
    } finally {
      trx.endSession();
    }
  } catch (error) {
    console.error("Error removing winner:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to remove winner",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
