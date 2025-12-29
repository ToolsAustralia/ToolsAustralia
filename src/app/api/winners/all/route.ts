import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Winner from "@/models/Winner";
// Import ensures MajorDraw model is registered before populate
import MajorDraw from "@/models/MajorDraw";
import { Types } from "mongoose";

// Suppress unused import warning - import is needed for model registration
void MajorDraw;

// Helper to safely extract ObjectId string from populated or unpopulated fields
const toIdString = (id: Types.ObjectId | string | { _id?: Types.ObjectId | string } | undefined): string => {
  if (!id) return "";
  if (id instanceof Types.ObjectId) return id.toString();
  if (typeof id === "string") return id;
  if (typeof id === "object" && "_id" in id && id._id) {
    return id._id instanceof Types.ObjectId ? id._id.toString() : String(id._id);
  }
  return String(id);
};

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "20", 20);
    const drawType = searchParams.get("drawType"); // "major" | "mini" | null (all)

    const winners: Array<{
      id: string;
      drawId: string;
      drawName: string;
      drawType: "major" | "mini";
      prize: {
        name: string;
        description: string;
        value: number;
        images: string[];
      };
      winnerFirstName: string;
      winnerLastName: string;
      winnerState?: string;
      imageUrl?: string;
      selectedDate: Date;
      entryNumber?: number;
    }> = [];

    // Fetch major draw winners if needed
    if (!drawType || drawType === "major") {
      // Importing MajorDraw ensures the model is registered before populate
      const majorDrawWinners = await Winner.find({ drawType: "major" })
        .sort({ selectedDate: -1 })
        .populate("userId", "firstName lastName state")
        .populate({
          path: "drawId",
          model: "MajorDraw", // Using string is consistent with codebase pattern
          select: "name prize",
        })
        .lean();

      majorDrawWinners.forEach((winner) => {
        // Type assertion for lean() result with populated fields
        const w = winner as unknown as {
          _id: Types.ObjectId | string;
          drawId: Types.ObjectId | string | { _id?: Types.ObjectId | string; name?: string; prize?: { name?: string; description?: string; value?: number; images?: string[] } };
          userId: Types.ObjectId | string | { firstName?: string; lastName?: string; state?: string };
          prizeSnapshot?: { name?: string; description?: string; value?: number; images?: string[] };
          imageUrl?: string;
          selectedDate: Date;
          entryNumber?: number;
        };
        const winnerUser = (typeof w.userId === 'object' && !(w.userId instanceof Types.ObjectId) && 'firstName' in w.userId) 
          ? w.userId 
          : null;
        
        // Check if drawId was populated (object with name property)
        const majorDraw = (typeof w.drawId === 'object' && !(w.drawId instanceof Types.ObjectId) && 'name' in w.drawId) 
          ? w.drawId 
          : null;
        
        winners.push({
          id: toIdString(w._id),
          drawId: toIdString(w.drawId),
          drawName: majorDraw?.name || w.prizeSnapshot?.name || "Major Draw",
          drawType: "major",
          prize: {
            name: w.prizeSnapshot?.name || majorDraw?.prize?.name || "Major Prize",
            description: w.prizeSnapshot?.description || majorDraw?.prize?.description || "",
            value: w.prizeSnapshot?.value || majorDraw?.prize?.value || 0,
            images: w.prizeSnapshot?.images || majorDraw?.prize?.images || [],
          },
          winnerFirstName: winnerUser?.firstName || "",
          winnerLastName: winnerUser?.lastName || "",
          winnerState: winnerUser?.state || "",
          imageUrl: w.imageUrl,
          selectedDate: w.selectedDate,
          entryNumber: w.entryNumber,
        });
      });
    }

    // Fetch mini draw winners if needed
    if (!drawType || drawType === "mini") {
      const miniDrawWinners = await Winner.find({ drawType: "mini" })
        .sort({ selectedDate: -1 })
        .populate("userId", "firstName lastName state")
        .lean();

      miniDrawWinners.forEach((winner) => {
        // Type assertion for lean() result with populated fields
        const w = winner as unknown as {
          _id: Types.ObjectId | string;
          drawId: Types.ObjectId | string;
          userId: Types.ObjectId | string | { firstName?: string; lastName?: string; state?: string };
          prizeSnapshot?: { name?: string; description?: string; value?: number; images?: string[] };
          imageUrl?: string;
          selectedDate: Date;
          entryNumber?: number;
        };
        const winnerUser = (typeof w.userId === 'object' && !(w.userId instanceof Types.ObjectId) && 'firstName' in w.userId) 
          ? w.userId 
          : null;
        winners.push({
          id: toIdString(w._id),
          drawId: toIdString(w.drawId),
          drawName: w.prizeSnapshot?.name || "Mini Draw",
          drawType: "mini",
          prize: {
            name: w.prizeSnapshot?.name || "",
            description: w.prizeSnapshot?.description || "",
            value: w.prizeSnapshot?.value || 0,
            images: w.prizeSnapshot?.images || [],
          },
          winnerFirstName: winnerUser?.firstName || "",
          winnerLastName: winnerUser?.lastName || "",
          winnerState: winnerUser?.state || "",
          imageUrl: w.imageUrl,
          selectedDate: w.selectedDate,
          entryNumber: w.entryNumber,
        });
      });
    }

    // Sort all winners by selectedDate (newest first) and limit
    winners.sort((a, b) => {
      const dateA = new Date(a.selectedDate).getTime();
      const dateB = new Date(b.selectedDate).getTime();
      return dateB - dateA;
    });

    const limitedWinners = winners.slice(0, limit);

    return NextResponse.json({
      success: true,
      winners: limitedWinners,
    });
  } catch (error) {
    console.error("Error fetching all winners:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch winners",
      },
      { status: 500 }
    );
  }
}

