import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import MajorDraw from "@/models/MajorDraw";
import Winner from "@/models/Winner";
import { Types } from "mongoose";

type PopulatedUser = {
  _id: Types.ObjectId | string;
  firstName: string;
  lastName: string;
  email: string;
  state?: string;
};

type WinnerLean = {
  _id: Types.ObjectId | string;
  drawId: Types.ObjectId | string;
  drawType: "major" | "mini";
  userId: PopulatedUser | Types.ObjectId | string;
  entryNumber?: number;
  selectedDate: Date;
  selectionMethod?: "manual" | "government-app";
  selectedBy?: PopulatedUser | Types.ObjectId | string;
  imageUrl?: string;
  drawResultUrl?: string;
  prizeSnapshot: {
    name: string;
    description: string;
    value: number;
    images: string[];
    category?: string;
  };
  cycle: number;
  createdAt: Date;
  updatedAt: Date;
};

type MajorDrawLean = {
  _id: Types.ObjectId | string;
  name: string;
  description: string;
  status: "queued" | "active" | "frozen" | "completed" | "cancelled";
  drawDate: Date;
  prize?: {
    name?: string;
    description?: string;
    value?: number;
    images?: string[];
    brand?: string;
    specifications?: Record<string, string | number | string[]>;
    terms?: string[];
  };
  totalEntries: number;
  entries?: Array<{
    userId: Types.ObjectId | string;
    totalEntries: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * GET /api/major-draw/completed
 * Get all completed major draws with winner information
 */
export async function GET() {
  try {
    await connectDB();

    // Get completed major draws
    const completedDraws = await MajorDraw.find({
      status: "completed",
    })
      .sort({ drawDate: -1 }) // Most recent first
      .lean();

    // Get all draw IDs
    const drawIds = completedDraws.map((draw) => draw._id);

    // Fetch winners from Winner model for these draws
    const winners = await Winner.find({
      drawId: { $in: drawIds },
      drawType: "major",
    })
      .populate("userId", "firstName lastName email state")
      .populate("selectedBy", "firstName lastName")
      .lean();

    // Helper to check if userId/selectedBy is populated
    const isPopulatedUser = (user: PopulatedUser | Types.ObjectId | string | undefined): user is PopulatedUser => {
      return user !== undefined && typeof user === "object" && !(user instanceof Types.ObjectId) && "_id" in user && "firstName" in user;
    };

    // Helper to convert ObjectId to string
    const _toIdString = (id: Types.ObjectId | string | undefined): string => {
      if (!id) return "";
      if (id instanceof Types.ObjectId) return id.toString();
      if (typeof id === "string") return id;
      if (typeof id === "object" && "_id" in id) {
        const objId = (id as PopulatedUser)._id;
        return objId instanceof Types.ObjectId ? objId.toString() : String(objId);
      }
      return String(id);
    };

    // Create a map of drawId -> winner for quick lookup
    const winnerMap = new Map<string, WinnerLean>();
    winners.forEach((winner) => {
      const winnerDoc = winner as unknown as WinnerLean;
      const drawId = winnerDoc.drawId instanceof Types.ObjectId 
        ? winnerDoc.drawId.toString() 
        : String(winnerDoc.drawId);
      winnerMap.set(drawId, winnerDoc);
    });

    // Transform the data to include winner details
    const drawsWithWinners = completedDraws.map((draw) => {
      const drawDoc = draw as unknown as MajorDrawLean;
      const drawId = drawDoc._id instanceof Types.ObjectId 
        ? drawDoc._id.toString() 
        : String(drawDoc._id);
      const winner = winnerMap.get(drawId);
      
      const winnerInfo = winner && isPopulatedUser(winner.userId)
        ? {
            name: `${winner.userId.firstName} ${winner.userId.lastName}`,
            state: winner.userId.state,
            email: winner.userId.email,
            entryNumber: winner.entryNumber,
            selectedDate: winner.selectedDate,
            selectionMethod: winner.selectionMethod,
            selectedBy: winner.selectedBy && isPopulatedUser(winner.selectedBy)
              ? `${winner.selectedBy.firstName} ${winner.selectedBy.lastName}`
              : null,
            imageUrl: winner.imageUrl,
            drawResultUrl: winner.drawResultUrl,
          }
        : null;

      return {
        _id: drawId,
        name: drawDoc.name,
        description: drawDoc.description,
        prize: drawDoc.prize,
        drawDate: drawDoc.drawDate,
        totalEntries: drawDoc.totalEntries,
        participantCount: drawDoc.entries?.length || 0,
        winner: winnerInfo,
        createdAt: drawDoc.createdAt,
        updatedAt: drawDoc.updatedAt,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        draws: drawsWithWinners,
        total: drawsWithWinners.length,
      },
    });
  } catch (error) {
    console.error("Error fetching completed major draws:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch completed major draws",
      },
      { status: 500 }
    );
  }
}
