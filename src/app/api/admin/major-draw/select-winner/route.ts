/**
 * Admin API: Select Winner for Major Draw
 *
 * POST /api/admin/major-draw/select-winner
 *
 * Allows admin to manually record the winner selected via government app.
 * Can only be done after freeze period starts.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import MajorDraw from "@/models/MajorDraw";
import User from "@/models/User";
import Winner from "@/models/Winner";
import mongoose, { Types } from "mongoose";
import { z } from "zod";

// Validation schema
const selectWinnerSchema = z.object({
  majorDrawId: z.string(),
  winnerUserId: z.string(),
  imageUrl: z.string().url().optional().nullable(),
  testimony: z.string().trim().optional().nullable(),
  selectedPrize: z.string().trim().optional().nullable(),
  // Legacy field - kept for backward compatibility
  selectedPrizeSlug: z.string().optional().nullable(),
  drawResultUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
});

/**
 * POST handler for selecting winner
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requirePermission("majorDraw.selectWinner");
    if (guard instanceof NextResponse) return guard;

    const { session } = guard;
    await connectDB();

    // Parse JSON request (image is uploaded to /api/upload/cloudinary first, then URL is sent here)
    const body = await request.json();
    const validatedData = selectWinnerSchema.parse(body);

    // Get major draw
    const majorDraw = await MajorDraw.findById(validatedData.majorDrawId);
    if (!majorDraw) {
      return NextResponse.json({ error: "Major draw not found" }, { status: 404 });
    }

    // Check if draw is in correct status (frozen or completed)
    if (majorDraw.status !== "frozen" && majorDraw.status !== "completed") {
      return NextResponse.json(
        {
          error: "Can only select winner after freeze period starts",
          currentStatus: majorDraw.status,
        },
        { status: 400 }
      );
    }

    // Allow updating winner if one already exists (e.g., to add/update image)
    // We'll merge the new data with existing winner data

    // Verify winner user exists
    const winnerUser = await User.findById(validatedData.winnerUserId);
    if (!winnerUser) {
      return NextResponse.json({ error: "Winner user not found" }, { status: 404 });
    }

    // Verify user has entries in this draw
    const userEntry = majorDraw.entries.find(
      (entry: { userId: { toString: () => string } }) => entry.userId.toString() === validatedData.winnerUserId
    );

    if (!userEntry) {
      return NextResponse.json(
        {
          error: "User has no entries in this draw",
          userId: validatedData.winnerUserId,
        },
        { status: 400 }
      );
    }

    // Check if winner already exists in Winner collection
    const existingWinner = await Winner.findOne({
      drawId: majorDraw._id,
      drawType: "major",
    });

    if (existingWinner) {
      // Update existing winner document
      existingWinner.userId = new Types.ObjectId(validatedData.winnerUserId);
      existingWinner.selectedBy = new Types.ObjectId(session.user.id);
      if (validatedData.imageUrl !== undefined) {
        existingWinner.imageUrl = validatedData.imageUrl || undefined;
      }
      // Update testimony if provided
      if (validatedData.testimony !== undefined) {
        existingWinner.testimony = validatedData.testimony || undefined;
      }
      // Update selected prize if provided (prefer new field, fallback to legacy)
      if (validatedData.selectedPrize !== undefined) {
        existingWinner.selectedPrize = validatedData.selectedPrize || undefined;
      } else if (validatedData.selectedPrizeSlug !== undefined) {
        // Legacy support: migrate selectedPrizeSlug to selectedPrize
        existingWinner.selectedPrize = validatedData.selectedPrizeSlug || undefined;
      }
      if (validatedData.drawResultUrl !== undefined) {
        existingWinner.drawResultUrl =
          validatedData.drawResultUrl && validatedData.drawResultUrl !== "" ? validatedData.drawResultUrl : undefined;
      }
      // Update prize snapshot - use draw name/description fallback when prize is empty
      const snapshotName = (majorDraw.prize?.name || majorDraw.name || "Major Prize").trim() || "Major Prize";
      const snapshotDesc = (majorDraw.prize?.description || majorDraw.description || "").trim() || "Major draw prize";
      existingWinner.prizeSnapshot = {
        name: snapshotName,
        description: snapshotDesc,
        value: majorDraw.prize?.value ?? 0,
        images: majorDraw.prize?.images ?? [],
      };
      await existingWinner.save();

      // Update major draw status
      if (majorDraw.status !== "completed") {
        majorDraw.status = "completed";
        majorDraw.isActive = false;
        await majorDraw.save();
      }

      // Get updated winner user details
      const updatedWinnerUser = await User.findById(validatedData.winnerUserId).select("firstName lastName email");

      return NextResponse.json(
        {
          success: true,
          message: "Winner updated successfully",
          winner: {
            userId: updatedWinnerUser?._id,
            name: updatedWinnerUser ? `${updatedWinnerUser.firstName} ${updatedWinnerUser.lastName}` : "Unknown",
            email: updatedWinnerUser?.email,
            selectedDate: existingWinner.selectedDate,
            selectedBy: session.user.email,
            imageUrl: existingWinner.imageUrl,
          },
          majorDraw: {
            id: majorDraw._id,
            name: majorDraw.name,
            totalEntries: majorDraw.totalEntries,
            status: majorDraw.status,
          },
        },
        { status: 200 }
      );
    }

    // Image URL is already uploaded to Cloudinary by the client, just use it
    const imageUrlToSave = validatedData.imageUrl;

    // Build prize snapshot - Winner schema requires non-empty name/description.
    // Major draw prize is deprecated; fall back to draw name/description when empty.
    const prizeName = (majorDraw.prize?.name || majorDraw.name || "Major Prize").trim() || "Major Prize";
    const prizeDescription = (majorDraw.prize?.description || majorDraw.description || "").trim() || "Major draw prize";

    // Use transaction for atomic operations (like mini draws)
    const trx = await mongoose.startSession();
    trx.startTransaction();

    try {
      // Create Winner document (like mini draws) - NO nested object
      const selectedDate = new Date();
      const winnerData: {
        drawId: Types.ObjectId;
        drawType: "major";
        userId: Types.ObjectId;
        entryNumber?: number;
        selectedDate: Date;
        selectedBy: Types.ObjectId;
        selectionMethod?: string;
        prizeSnapshot: {
          name: string;
          description: string;
          value: number;
          images: string[];
        };
        imageUrl?: string;
        testimony?: string;
        selectedPrize?: string;
        selectedPrizeSlug?: string; // Legacy field
        drawResultUrl?: string;
        cycle: number;
      } = {
        drawId: majorDraw._id,
        drawType: "major",
        userId: new Types.ObjectId(validatedData.winnerUserId),
        selectedDate,
        selectedBy: new Types.ObjectId(session.user.id),
        selectionMethod: undefined, // Not used for major draws
        prizeSnapshot: {
          name: prizeName,
          description: prizeDescription,
          value: majorDraw.prize?.value ?? 0,
          images: majorDraw.prize?.images ?? [],
        },
        imageUrl: imageUrlToSave || undefined, // Convert null to undefined
        testimony: validatedData.testimony || undefined,
        selectedPrize: validatedData.selectedPrize || (validatedData.selectedPrizeSlug || undefined), // Prefer new field, fallback to legacy
        selectedPrizeSlug: validatedData.selectedPrizeSlug || undefined,
        cycle: 1, // Major draws are single-cycle
      };
      
      // Only include entryNumber if needed (defaults to 0 in schema)
      // Omitting it to avoid validation issues with cached models
      
      const [winnerDoc] = await Winner.create([winnerData], { session: trx });

      // Update major draw status - DO NOT set majorDraw.winner
      majorDraw.status = "completed";
      majorDraw.isActive = false;
      await majorDraw.save({ session: trx });

      await trx.commitTransaction();

      return NextResponse.json(
        {
          success: true,
          message: "Winner selected successfully",
          winner: {
            userId: winnerUser._id,
            name: `${winnerUser.firstName} ${winnerUser.lastName}`,
            email: winnerUser.email,
            selectedDate: winnerDoc.selectedDate,
            selectedBy: session.user.email,
            imageUrl: winnerDoc.imageUrl, // Direct field access
          },
          majorDraw: {
            id: majorDraw._id,
            name: majorDraw.name,
            totalEntries: majorDraw.totalEntries,
            status: majorDraw.status,
          },
        },
        { status: 200 }
      );
    } catch (error) {
      await trx.abortTransaction();
      throw error;
    } finally {
      trx.endSession();
    }

  } catch (error) {
    console.error("Error selecting winner:", error);

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to select winner",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET handler - Get current winner if exists
 */
export async function GET(request: NextRequest) {
  try {
    const _guard = await requirePermission("majorDraw.view");
    if (_guard instanceof NextResponse) return _guard;

    await connectDB();

    // Get major draw ID from query params
    const searchParams = request.nextUrl.searchParams;
    const majorDrawId = searchParams.get("majorDrawId");

    if (!majorDrawId) {
      return NextResponse.json({ error: "majorDrawId is required" }, { status: 400 });
    }

    // Get major draw
    const majorDraw = await MajorDraw.findById(majorDrawId);
    if (!majorDraw) {
      return NextResponse.json({ error: "Major draw not found" }, { status: 404 });
    }

    // Query Winner model instead of majorDraw.winner
    const winner = await Winner.findOne({
      drawId: majorDraw._id,
      drawType: "major",
    }).populate("userId", "firstName lastName email mobile state");

    if (!winner) {
      return NextResponse.json(
        {
          hasWinner: false,
          majorDraw: {
            id: majorDraw._id,
            name: majorDraw.name,
            status: majorDraw.status,
            totalEntries: majorDraw.totalEntries,
          },
        },
        { status: 200 }
      );
    }

    // Get winner user details
    const winnerUser = (typeof winner.userId === 'object' && 'firstName' in winner.userId) 
      ? winner.userId as { firstName?: string; lastName?: string; email?: string; mobile?: string; state?: string }
      : null;

    return NextResponse.json(
      {
        hasWinner: true,
        winner: {
          userId: winner.userId,
          user: winnerUser
            ? {
                name: `${winnerUser.firstName || ''} ${winnerUser.lastName || ''}`.trim(),
                email: winnerUser.email,
                mobile: winnerUser.mobile,
                state: winnerUser.state,
              }
            : null,
          entryNumber: winner.entryNumber,
          selectedDate: winner.selectedDate,
          selectionMethod: winner.selectionMethod,
          imageUrl: winner.imageUrl,
          testimony: winner.testimony,
          selectedPrize: winner.selectedPrize || winner.selectedPrizeSlug,
          selectedPrizeSlug: winner.selectedPrizeSlug,
          drawResultUrl: winner.drawResultUrl,
        },
        majorDraw: {
          id: majorDraw._id,
          name: majorDraw.name,
          status: majorDraw.status,
          totalEntries: majorDraw.totalEntries,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error getting winner:", error);
    return NextResponse.json(
      {
        error: "Failed to get winner",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
