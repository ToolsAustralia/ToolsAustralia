import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import mongoose, { Types } from "mongoose";
import MiniDraw from "@/models/MiniDraw";
import User from "@/models/User";
import Winner from "@/models/Winner";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import { z } from "zod";

// Validation schema for winner selection
const selectWinnerSchema = z.object({
  miniDrawId: z.string().min(1, "Mini draw ID is required"),
  winnerUserId: z.string().min(1, "Winner user ID is required"),
  entryNumber: z.number().min(1, "Entry number must be at least 1"),
  selectionMethod: z.enum(["manual", "government-app"]),
  selectedBy: z.string().min(1, "Admin user ID is required"),
  imageUrl: z.string().url("Winner image must be a valid URL").optional(),
});

/**
 * POST /api/admin/mini-draw/[id]/select-winner
 * Select winner for a mini draw, persist a Winner document, and reset the draw for the next cycle.
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse multipart form payload
    const formData = await request.formData();

    const miniDrawIdValue = formData.get("miniDrawId");
    const winnerUserIdValue = formData.get("winnerUserId");
    const entryNumberValue = formData.get("entryNumber");
    const selectionMethodValue = formData.get("selectionMethod");
    const selectedByValue = formData.get("selectedBy");
    const existingImageUrlValue = formData.get("imageUrl");
    const imageFileEntry = formData.get("winnerImage");

    if (
      typeof miniDrawIdValue !== "string" ||
      typeof winnerUserIdValue !== "string" ||
      typeof selectionMethodValue !== "string" ||
      typeof selectedByValue !== "string"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid payload received",
        },
        { status: 400 }
      );
    }

    const parsedEntryNumber =
      typeof entryNumberValue === "string" ? parseInt(entryNumberValue, 10) : Number(entryNumberValue);

    if (!Number.isFinite(parsedEntryNumber) || parsedEntryNumber <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Entry number must be a positive integer",
        },
        { status: 400 }
      );
    }

    const baseData = {
      miniDrawId: miniDrawIdValue,
      winnerUserId: winnerUserIdValue,
      entryNumber: parsedEntryNumber,
      selectionMethod: selectionMethodValue,
      selectedBy: selectedByValue,
      imageUrl:
        typeof existingImageUrlValue === "string" && existingImageUrlValue.trim().length > 0
          ? existingImageUrlValue.trim()
          : undefined,
    };

    const validatedData = selectWinnerSchema.parse(baseData);

    const imageFile =
      typeof File !== "undefined" && imageFileEntry instanceof File && imageFileEntry.size > 0
        ? (imageFileEntry as File)
        : undefined;

    const trx = await mongoose.startSession();
    trx.startTransaction();

    try {
      // Find the mini draw within the transaction
      const miniDraw = await MiniDraw.findById(validatedData.miniDrawId).session(trx);
      if (!miniDraw) {
        await trx.abortTransaction();
        trx.endSession();
        return NextResponse.json({ error: "Mini draw not found" }, { status: 404 });
      }

      // Validate mini draw is in a valid state for winner selection
      if (miniDraw.status !== "frozen" && miniDraw.status !== "completed") {
        await trx.abortTransaction();
        trx.endSession();
        return NextResponse.json(
          {
            success: false,
            error: "Winner can only be selected for frozen or completed mini draws",
            details: `Current status: ${miniDraw.status}`,
          },
          { status: 400 }
        );
      }

      // Validate user exists
      const winnerUser = await User.findById(validatedData.winnerUserId).session(trx);
      if (!winnerUser) {
        await trx.abortTransaction();
        trx.endSession();
        return NextResponse.json({ error: "Winner user not found" }, { status: 404 });
      }

      // Validate entry number is within valid range
      if (validatedData.entryNumber > miniDraw.totalEntries) {
        await trx.abortTransaction();
        trx.endSession();
        return NextResponse.json(
          {
            success: false,
            error: "Invalid entry number",
            details: `Entry number ${validatedData.entryNumber} exceeds total entries (${miniDraw.totalEntries})`,
          },
          { status: 400 }
        );
      }

      // Validate user has entries in this mini draw
      const userEntry = miniDraw.entries.find(
        (entry: { userId: Types.ObjectId; totalEntries: number }) =>
          entry.userId.toString() === validatedData.winnerUserId
      );
      if (!userEntry) {
        await trx.abortTransaction();
        trx.endSession();
        return NextResponse.json(
          {
            success: false,
            error: "User has no entries in this mini draw",
          },
          { status: 400 }
        );
      }

      // Validate entry number is within user's entry range
      let entryRangeStart = 1;
      for (const entry of miniDraw.entries) {
        if (entry.userId.toString() === validatedData.winnerUserId) {
          const entryRangeEnd = entryRangeStart + entry.totalEntries - 1;
          if (validatedData.entryNumber < entryRangeStart || validatedData.entryNumber > entryRangeEnd) {
            await trx.abortTransaction();
            trx.endSession();
            return NextResponse.json(
              {
                success: false,
                error: "Invalid entry number for this user",
                details: `User's entry range is ${entryRangeStart}-${entryRangeEnd}`,
              },
              { status: 400 }
            );
          }
          break;
        }
        entryRangeStart += entry.totalEntries;
      }

      const participantUserIds = miniDraw.entries.map((entry: { userId: Types.ObjectId }) => entry.userId);
      const selectedDate = new Date();
      const currentCycle = miniDraw.cycle ?? 1;
      let imageUrlToSave = validatedData.imageUrl;

      if (imageFile) {
        try {
          const uploadResult = await uploadImageToCloudinary(imageFile, "mini-draw-winners", {
            public_id_prefix: `${validatedData.miniDrawId}-cycle-${currentCycle}`,
            tags: ["mini-draw", "winner"],
          });
          imageUrlToSave = uploadResult.secure_url;
        } catch (uploadError) {
          await trx.abortTransaction();
          trx.endSession();
          console.error("❌ Failed to upload winner image:", uploadError);
          return NextResponse.json(
            {
              success: false,
              error: "Failed to upload winner image",
            },
            { status: 500 }
          );
        }
      }

      // Persist the winner snapshot so we keep a permanent record for this cycle
      const [winnerDoc] = await Winner.create(
        [
          {
            drawId: miniDraw._id,
            drawType: "mini",
            userId: new Types.ObjectId(validatedData.winnerUserId),
            entryNumber: validatedData.entryNumber,
            selectedDate,
            selectionMethod: validatedData.selectionMethod,
            notified: false,
            selectedBy: new Types.ObjectId(validatedData.selectedBy),
            prizeSnapshot: {
              name: miniDraw.prize.name,
              description: miniDraw.prize.description,
              value: miniDraw.prize.value,
              images: miniDraw.prize.images,
              category: miniDraw.prize.category,
            },
            imageUrl: imageUrlToSave,
            cycle: currentCycle,
          },
        ],
        { session: trx }
      );

      // Reset the draw so it can start accepting entries for the next cycle immediately
      miniDraw.set({
        winner: undefined,
        latestWinnerId: winnerDoc._id,
        winnerHistory: [...(miniDraw.winnerHistory || []), winnerDoc._id],
        entries: [],
        totalEntries: 0,
        status: "active",
        isActive: true,
        configurationLocked: false,
        lockedAt: undefined,
        cycle: currentCycle + 1,
      });

      await miniDraw.save({ session: trx });

      if (participantUserIds.length > 0) {
        await User.updateMany(
          { _id: { $in: participantUserIds } },
          {
            $set: {
              "miniDrawParticipation.$[participation].isActive": false,
              "miniDrawParticipation.$[participation].totalEntries": 0,
              "miniDrawParticipation.$[participation].entriesBySource.mini-draw-package": 0,
              "miniDrawParticipation.$[participation].entriesBySource.free-entry": 0,
              "miniDrawParticipation.$[participation].lastParticipatedDate": selectedDate,
            },
          },
          {
            arrayFilters: [{ "participation.miniDrawId": miniDraw._id }],
            session: trx,
          }
        );
      }

      await trx.commitTransaction();
      trx.endSession();

      console.log(`✅ Winner selected and draw reset for mini draw: ${miniDraw.name} (ID: ${miniDraw._id})`);

      return NextResponse.json({
        success: true,
        data: {
          miniDraw: {
            _id: miniDraw._id,
            name: miniDraw.name,
            status: miniDraw.status,
            cycle: miniDraw.cycle,
            latestWinnerId: miniDraw.latestWinnerId?.toString(),
          },
          winner: {
            _id: winnerDoc._id.toString(),
            userId: winnerDoc.userId.toString(),
            entryNumber: winnerDoc.entryNumber,
            selectedDate: winnerDoc.selectedDate,
            selectionMethod: winnerDoc.selectionMethod,
            imageUrl: winnerDoc.imageUrl,
          },
        },
        message: "Winner recorded and draw reopened successfully",
      });
    } catch (error) {
      await trx.abortTransaction();
      trx.endSession();
      throw error;
    }
  } catch (error) {
    console.error("❌ Error selecting winner:", error);

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
        error: "Failed to select winner",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
