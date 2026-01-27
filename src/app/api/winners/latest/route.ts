import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Winner from "@/models/Winner";
import MajorDraw from "@/models/MajorDraw";
import mongoose, { Types } from "mongoose";
import "@/models/User";

// Next.js ISR configuration
export const revalidate = 60; // Revalidate every 60 seconds (ISR)

export async function GET() {
  try {
    await connectDB();
    
    // Ensure MajorDraw model is registered before using in populate
    // This prevents MissingSchemaError when using model name string in populate
    // The import should register it, but we explicitly check to ensure it's available
    if (!mongoose.models.MajorDraw) {
      // Force model registration by accessing it
      void MajorDraw;
    }

    // Get latest major draw winner from Winner model
    const latestMajorDrawWinner = await Winner.findOne({ drawType: "major" })
      .sort({ selectedDate: -1 })
      .populate("userId", "firstName lastName state")
      .populate({
        path: "drawId",
        model: MajorDraw,
        select: "name prize drawDate",
      })
      .lean()
      .exec();

    if (latestMajorDrawWinner && !Array.isArray(latestMajorDrawWinner)) {
      const winner = latestMajorDrawWinner as unknown as {
        _id: Types.ObjectId;
        drawId: Types.ObjectId | {
          name?: string;
          prize?: { name?: string; description?: string; value?: number; images?: string[] };
          drawDate?: Date;
        };
        userId: { firstName?: string; lastName?: string; state?: string } | Types.ObjectId;
        prizeSnapshot?: { name?: string; description?: string; value?: number; images?: string[] };
        imageUrl?: string;
        selectedDate: Date;
        entryNumber?: number;
        selectedPrize?: string;
        selectedPrizeSlug?: string;
      };
      const winnerUser = (typeof winner.userId === 'object' && 'firstName' in winner.userId) 
        ? winner.userId 
        : null;
      const majorDraw = (typeof winner.drawId === 'object' && 'name' in winner.drawId)
        ? winner.drawId
        : null;
      
      const drawIdString = typeof winner.drawId === 'object' && 'name' in winner.drawId
        ? (winner.drawId as { _id?: Types.ObjectId })._id?.toString() || winner.drawId.toString()
        : (winner.drawId as Types.ObjectId).toString();
      
      return NextResponse.json(
        {
          success: true,
          winner: {
            id: winner._id.toString(),
            drawId: drawIdString,
            drawName: majorDraw?.name || "Major Draw",
            drawType: "major" as const,
            prize: {
              name: winner.prizeSnapshot?.name || majorDraw?.prize?.name || "Major Prize",
              description: winner.prizeSnapshot?.description || majorDraw?.prize?.description || "",
              value: winner.prizeSnapshot?.value || majorDraw?.prize?.value || 0,
              images: winner.prizeSnapshot?.images || majorDraw?.prize?.images || [],
            },
            winnerName: winnerUser
              ? `${winnerUser.firstName} ${winnerUser.lastName}`
              : "Unknown",
            winnerFirstName: winnerUser?.firstName || "",
            winnerLastName: winnerUser?.lastName || "",
            winnerState: winnerUser?.state || "",
            imageUrl: winner.imageUrl,
            selectedDate: winner.selectedDate,
            drawDate: majorDraw?.drawDate || winner.selectedDate,
            entryNumber: winner.entryNumber,
            selectedPrize: winner.selectedPrize || winner.selectedPrizeSlug || undefined,
          },
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300", // Cache 1min, serve stale up to 5min
          },
        }
      );
    }

    // Fallback to latest mini draw winner
    const latestMiniDrawWinner = await Winner.findOne({ drawType: "mini" })
      .sort({ selectedDate: -1 })
      .populate("userId", "firstName lastName state")
      .lean()
      .exec();

    if (latestMiniDrawWinner && !Array.isArray(latestMiniDrawWinner)) {
      const miniWinner = latestMiniDrawWinner as unknown as {
        _id: Types.ObjectId;
        drawId: Types.ObjectId;
        userId: { firstName?: string; lastName?: string; state?: string } | Types.ObjectId;
        prizeSnapshot?: { name?: string; description?: string; value?: number; images?: string[] };
        imageUrl?: string;
        selectedDate: Date;
        entryNumber?: number;
      };
      const winnerUser = (typeof miniWinner.userId === 'object' && 'firstName' in miniWinner.userId) 
        ? miniWinner.userId 
        : null;
      
      const miniDrawIdString = (miniWinner.drawId as Types.ObjectId).toString();
      
      return NextResponse.json(
        {
          success: true,
          winner: {
            id: miniWinner._id.toString(),
            drawId: miniDrawIdString,
            drawName: miniWinner.prizeSnapshot?.name || "Mini Draw",
            drawType: "mini" as const,
            prize: {
              name: miniWinner.prizeSnapshot?.name || "",
              description: miniWinner.prizeSnapshot?.description || "",
              value: miniWinner.prizeSnapshot?.value || 0,
              images: miniWinner.prizeSnapshot?.images || [],
            },
            winnerName: winnerUser
              ? `${winnerUser.firstName} ${winnerUser.lastName}`
              : "Unknown",
            winnerFirstName: winnerUser?.firstName || "",
            winnerLastName: winnerUser?.lastName || "",
            winnerState: winnerUser?.state || "",
            imageUrl: miniWinner.imageUrl,
            selectedDate: miniWinner.selectedDate,
            entryNumber: miniWinner.entryNumber,
          },
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300", // Cache 1min, serve stale up to 5min
          },
        }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "No winners found",
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300", // Cache 1min, serve stale up to 5min
        },
      }
    );
  } catch (error) {
    console.error("Error fetching latest winner:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch latest winner",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }
}
