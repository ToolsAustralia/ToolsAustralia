import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import MiniDraw from "@/models/MiniDraw";
import User from "@/models/User";
import Winner, { type IWinner } from "@/models/Winner";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Types } from "mongoose";

/**
 * GET /api/mini-draws/[id]
 * Get mini draw details by ID (entry-based structure)
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    const { id } = await params;

    // Validate ObjectId
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid mini draw ID" }, { status: 400 });
    }

    // Find the mini draw
    const miniDraw = (await MiniDraw.findById(id).lean()) as import("@/models/MiniDraw").IMiniDraw | null;

    if (!miniDraw) {
      return NextResponse.json({ error: "Mini draw not found" }, { status: 404 });
    }

    // Load latest winner snapshot (if any)
    const latestWinner = await Winner.findOne({ drawId: miniDraw._id, drawType: "mini" })
      .sort({ cycle: -1, createdAt: -1 })
      .lean<IWinner | null>();

    // Get user entry count and membership status if authenticated
    let userEntryCount = 0;
    let hasActiveMembership = false;
    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      const user = await User.findById(session.user.id).lean();
      if (user) {
        // Check for active subscription or one-time packages
        hasActiveMembership = user.subscription?.isActive === true;

        // Get user entry count
        const userEntry = miniDraw.entries.find(
          (entry: { userId: Types.ObjectId; totalEntries: number }) => entry.userId.toString() === session.user.id
        );
        userEntryCount = userEntry?.totalEntries || 0;
      }
    }

    // Convert to JSON-serializable format
    const miniDrawData = {
      _id: (miniDraw._id as Types.ObjectId).toString(),
      name: miniDraw.name,
      description: miniDraw.description,
      status: miniDraw.status,
      isActive: miniDraw.isActive,
      totalEntries: miniDraw.totalEntries,
      minimumEntries: miniDraw.minimumEntries,
      entriesRemaining: Math.max(miniDraw.minimumEntries - miniDraw.totalEntries, 0),
      prize: miniDraw.prize,
      cycle: miniDraw.cycle ?? 1,
      latestWinner:
        latestWinner !== null
          ? (() => {
              const winner = latestWinner as unknown as IWinner & {
                _id: Types.ObjectId;
                userId: Types.ObjectId;
              };
              return {
                _id: winner._id.toString(),
                userId: winner.userId.toString(),
                entryNumber: winner.entryNumber,
                selectedDate: winner.selectedDate.toISOString(),
                selectionMethod: winner.selectionMethod,
                imageUrl: winner.imageUrl,
              };
            })()
          : undefined,
      userEntryCount, // Include user's entry count
      hasActiveMembership, // Include membership status
      requiresMembership: true, // Mini draws require membership
      createdAt: miniDraw.createdAt.toISOString(),
      updatedAt: miniDraw.updatedAt.toISOString(),
    };

    return NextResponse.json({
      miniDraw: miniDrawData,
    });
  } catch (error) {
    console.error("Error fetching mini draw:", error);
    return NextResponse.json(
      { error: "Failed to fetch mini draw", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
