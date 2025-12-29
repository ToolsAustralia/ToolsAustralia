import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Winner from "@/models/Winner";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    // Get major draw winners from Winner model, sorted by selection date (newest first)
    const majorDrawWinners = await Winner.find({ drawType: "major" })
      .sort({ selectedDate: -1 })
      .limit(limit)
      .populate("userId", "firstName lastName state")
      .populate({
        path: "drawId",
        model: "MajorDraw",
        select: "name prize",
      })
      .lean();

    const winners = majorDrawWinners.map((winner: {
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
      return {
        id: winner._id.toString(),
        drawId: winner.drawId.toString(),
        drawName: majorDraw?.name || "Major Draw",
        drawType: "major" as const,
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
      };
    });

    return NextResponse.json({
      success: true,
      winners,
    });
  } catch (error) {
    console.error("Error fetching major draw winners:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch major draw winners",
      },
      { status: 500 }
    );
  }
}

