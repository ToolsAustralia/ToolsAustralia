import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Winner from "@/models/Winner";
import MajorDraw from "@/models/MajorDraw";

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
      const majorDrawWinners = await Winner.find({ drawType: "major" })
        .sort({ selectedDate: -1 })
        .populate("userId", "firstName lastName state")
        .populate({
          path: "drawId",
          model: "MajorDraw",
          select: "name prize",
        })
        .lean();

      majorDrawWinners.forEach((winner: {
        _id: { toString(): string };
        drawId: { toString(): string } | { name?: string; prize?: { name?: string; description?: string; value?: number; images?: string[] } };
        userId: { firstName?: string; lastName?: string; state?: string } | { toString(): string };
        prizeSnapshot?: { name?: string; description?: string; value?: number; images?: string[] };
        imageUrl?: string;
        selectedDate: Date;
        entryNumber?: number;
      }) => {
        const winnerUser = (typeof winner.userId === 'object' && 'firstName' in winner.userId) 
          ? winner.userId 
          : null;
        const majorDraw = (typeof winner.drawId === 'object' && 'name' in winner.drawId) 
          ? winner.drawId 
          : null;
        winners.push({
          id: winner._id.toString(),
          drawId: winner.drawId.toString(),
          drawName: majorDraw?.name || "Major Draw",
          drawType: "major",
          prize: {
            name: winner.prizeSnapshot?.name || majorDraw?.prize?.name || "Major Prize",
            description: winner.prizeSnapshot?.description || majorDraw?.prize?.description || "",
            value: winner.prizeSnapshot?.value || majorDraw?.prize?.value || 0,
            images: winner.prizeSnapshot?.images || majorDraw?.prize?.images || [],
          },
          winnerFirstName: winnerUser?.firstName || "",
          winnerLastName: winnerUser?.lastName || "",
          winnerState: winnerUser?.state || "",
          imageUrl: winner.imageUrl,
          selectedDate: winner.selectedDate,
          entryNumber: winner.entryNumber,
        });
      });
    }

    // Fetch mini draw winners if needed
    if (!drawType || drawType === "mini") {
      const miniDrawWinners = await Winner.find({ drawType: "mini" })
        .sort({ selectedDate: -1 })
        .populate("userId", "firstName lastName state")
        .lean();

      miniDrawWinners.forEach((winner: {
        _id: { toString(): string };
        drawId: { toString(): string };
        userId: { firstName?: string; lastName?: string; state?: string } | { toString(): string };
        prizeSnapshot?: { name?: string; description?: string; value?: number; images?: string[] };
        imageUrl?: string;
        selectedDate: Date;
        entryNumber?: number;
      }) => {
        const winnerUser = (typeof winner.userId === 'object' && 'firstName' in winner.userId) 
          ? winner.userId 
          : null;
        winners.push({
          id: winner._id.toString(),
          drawId: winner.drawId.toString(),
          drawName: winner.prizeSnapshot?.name || "Mini Draw",
          drawType: "mini",
          prize: {
            name: winner.prizeSnapshot?.name || "",
            description: winner.prizeSnapshot?.description || "",
            value: winner.prizeSnapshot?.value || 0,
            images: winner.prizeSnapshot?.images || [],
          },
          winnerFirstName: winnerUser?.firstName || "",
          winnerLastName: winnerUser?.lastName || "",
          winnerState: winnerUser?.state || "",
          imageUrl: winner.imageUrl,
          selectedDate: winner.selectedDate,
          entryNumber: winner.entryNumber,
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

