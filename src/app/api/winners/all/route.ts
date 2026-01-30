import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Winner from "@/models/Winner";
// Import ensures User & MajorDraw models are registered before populate
import User from "@/models/User";
import MajorDraw from "@/models/MajorDraw";
import { Types } from "mongoose";
import type { WinnerSummary } from "@/types/winner";

// Suppress unused import warning - imports are needed for model registration
void User;
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

    const winners: WinnerSummary[] = [];

    // Fetch major draw winners if needed
    if (!drawType || drawType === "major") {
      // Importing MajorDraw ensures the model is registered before populate
      const majorDrawWinners = await Winner.find({ drawType: "major" })
        .sort({ selectedDate: -1 })
        .populate("userId", "firstName lastName state")
        .populate({
          path: "drawId",
          model: "MajorDraw", // Using string is consistent with codebase pattern
          select: "name prize drawDate",
        })
        .lean();

      majorDrawWinners.forEach((winner) => {
        // Type assertion for lean() result with populated fields
        const w = winner as unknown as {
          _id: Types.ObjectId | string;
          drawId: Types.ObjectId | string | { _id?: Types.ObjectId | string; name?: string; prize?: { name?: string; description?: string; value?: number; images?: string[] }; drawDate?: Date };
          userId: Types.ObjectId | string | { firstName?: string; lastName?: string; state?: string };
          prizeSnapshot?: { name?: string; description?: string; value?: number; images?: string[] };
          imageUrl?: string;
          selectedDate: Date;
          entryNumber?: number;
          testimony?: string;
          selectedPrize?: string;
          selectedPrizeSlug?: string; // Legacy field
          cycle?: number;
        };
        const winnerUser = (typeof w.userId === 'object' && !(w.userId instanceof Types.ObjectId) && 'firstName' in w.userId) 
          ? w.userId 
          : null;
        
        // Check if drawId was populated (object with name property)
        const majorDraw = (typeof w.drawId === 'object' && !(w.drawId instanceof Types.ObjectId) && 'name' in w.drawId) 
          ? w.drawId as { name?: string; prize?: { name?: string; description?: string; value?: number; images?: string[] }; drawDate?: Date }
          : null;
        // Won on = draw end date (drawDate) when available, not the admin selection date
        const wonOnDate = majorDraw?.drawDate ? majorDraw.drawDate : w.selectedDate;
        
        // Extract testimony and selectedPrize directly from the lean result (prefer new field, fallback to legacy)
        const testimonyValue = w.testimony || undefined;
        const selectedPrizeValue = w.selectedPrize || w.selectedPrizeSlug || undefined;
        
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
          selectedDate: w.selectedDate.toISOString(),
          wonOnDate: wonOnDate.toISOString(),
          entryNumber: w.entryNumber,
          testimony: testimonyValue,
          selectedPrize: selectedPrizeValue,
          cycle: w.cycle || 1,
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
        // Note: .lean() returns plain objects, so all fields should be included
        const w = winner as unknown as {
          _id: Types.ObjectId | string;
          drawId: Types.ObjectId | string;
          userId: Types.ObjectId | string | { firstName?: string; lastName?: string; state?: string };
          prizeSnapshot?: { name?: string; description?: string; value?: number; images?: string[] };
          imageUrl?: string;
          selectedDate: Date;
          entryNumber?: number;
          testimony?: string;
          selectedPrize?: string;
          selectedPrizeSlug?: string; // Legacy field
          cycle?: number;
        };
        const winnerUser = (typeof w.userId === 'object' && !(w.userId instanceof Types.ObjectId) && 'firstName' in w.userId) 
          ? w.userId 
          : null;
        // Extract testimony and selectedPrize directly from the lean result (prefer new field, fallback to legacy)
        const testimonyValue = w.testimony || undefined;
        const selectedPrizeValue = w.selectedPrize || w.selectedPrizeSlug || undefined;
        
        // Mini draws don't have a drawDate on the model; use selectedDate for "won on"
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
          selectedDate: w.selectedDate.toISOString(),
          wonOnDate: w.selectedDate.toISOString(),
          entryNumber: w.entryNumber,
          testimony: testimonyValue,
          selectedPrize: selectedPrizeValue,
          cycle: w.cycle || 1,
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

