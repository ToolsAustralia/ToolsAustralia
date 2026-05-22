/**
 * Admin API: Winner Management
 *
 * GET /api/admin/winners/[id] - Get winner details
 * PATCH /api/admin/winners/[id] - Update winner testimony and selected prize
 * DELETE /api/admin/winners/[id] - Remove a major draw winner (deletes record; draw stays completed; use Select Winner to record a new winner)
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import connectDB from "@/lib/mongodb";
import Winner from "@/models/Winner";
import MajorDraw from "@/models/MajorDraw";
import MiniDraw from "@/models/MiniDraw";
import mongoose from "mongoose";
import { z } from "zod";
import { getWinnerDetail } from "@/services/admin/MajorDrawService";
type RouteParams = { params: Promise<{ id: string }> };

// Validation schema for updating winner
const updateWinnerSchema = z.object({
  testimony: z.string().trim().optional().nullable(),
  selectedPrize: z.string().trim().optional().nullable(),
  // Legacy field - kept for backward compatibility
  selectedPrizeSlug: z.string().optional().nullable(),
  imageUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
  drawResultUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
});

/**
 * GET /api/admin/winners/[id]
 * Get detailed winner information including user details and draw information.
 *
 * Delegates to `getWinnerDetail` so the Norm `/v1/winners/{id}` projection
 * shares the same code path (PII fields are present on the full result; the
 * Norm route strips lastName/email/selectedBy before responding).
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const _guard = await requirePermission("majorDraw.view");
    if (_guard instanceof NextResponse) return _guard;

    const { id: winnerId } = await params;

    const outcome = await getWinnerDetail(winnerId);
    if (!outcome.ok) {
      if (outcome.code === "bad_id") {
        return NextResponse.json({ error: "Invalid winner ID" }, { status: 400 });
      }
      return NextResponse.json({ error: "Winner not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      winner: outcome.data,
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
    const { id: winnerId } = await params;
    const guard = await requirePermissionWithAudit("majorDraw.edit", request, {
      resourceType: "Winner",
      resourceId: winnerId,
    });
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;

    await connectDB();

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

    if (validatedData.drawResultUrl !== undefined) {
      winner.drawResultUrl =
        validatedData.drawResultUrl && validatedData.drawResultUrl !== "" ? validatedData.drawResultUrl : undefined;
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

    await log(200);
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
        drawResultUrl: updatedWinner.drawResultUrl ?? null,
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
    const { id: winnerId } = await params;
    const guard = await requirePermissionWithAudit("majorDraw.edit", request, {
      resourceType: "Winner",
      resourceId: winnerId,
    });
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;

    await connectDB();

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

      await log(200);
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
