import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import MiniDraw from "@/models/MiniDraw";
import Winner, { type IWinner } from "@/models/Winner";
import { z } from "zod";
import mongoose from "mongoose";

// Validation schema for query parameters
const listQuerySchema = z.object({
  status: z.enum(["active", "completed", "cancelled"]).optional(),
  search: z.string().optional(),
  page: z.string().regex(/^\d+$/).default("1").transform(Number),
  limit: z.string().regex(/^\d+$/).default("20").transform(Number),
  sortBy: z.enum(["createdAt", "name", "totalEntries", "minimumEntries"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

/**
 * GET /api/admin/mini-draw/list
 * List all mini draws with pagination, filtering, and sorting
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const queryParams = Object.fromEntries(searchParams.entries());

    const validatedParams = listQuerySchema.parse(queryParams);
    const { status, search, page, limit, sortBy, sortOrder } = validatedParams;

    // Build filter query
    const filter: mongoose.FilterQuery<typeof MiniDraw> = {};

    // Status filter
    if (status) {
      filter.status = status;
    }

    // Search filter
    if (search) {
      const searchRegex = new RegExp(search, "i");
      filter.$or = [
        { name: searchRegex },
        { description: searchRegex },
        { "prize.name": searchRegex },
        { "prize.description": searchRegex },
      ];
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Build sort object
    const sort: Record<string, 1 | -1> = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    // Fetch mini draws with pagination
    const [miniDrawsRaw, total] = await Promise.all([
      MiniDraw.find(filter)
        .select("-entries -winner -__v") // Exclude large arrays for list view
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      MiniDraw.countDocuments(filter),
    ]);

    const miniDraws = await Promise.all(
      miniDrawsRaw.map(async (draw) => {
        const entriesRemaining = Math.max((draw.minimumEntries || 0) - (draw.totalEntries || 0), 0);
        let latestWinner = null;

        if (draw.latestWinnerId) {
          const winnerDoc = await Winner.findById(
            draw.latestWinnerId as mongoose.Types.ObjectId
          ).lean<IWinner | null>();
          if (winnerDoc) {
            const winner = winnerDoc as unknown as IWinner & { _id: mongoose.Types.ObjectId };
            latestWinner = {
              _id: winner._id.toString(),
              userId: winner.userId.toString(),
              entryNumber: winner.entryNumber,
              selectedDate: winner.selectedDate.toISOString(),
              imageUrl: winner.imageUrl,
              cycle: winner.cycle,
            };
          }
        }

        const drawId = (draw._id as mongoose.Types.ObjectId).toString();

        return {
          ...draw,
          _id: drawId,
          entriesRemaining,
          cycle: draw.cycle ?? 1,
          latestWinner,
        };
      })
    );

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      data: {
        miniDraws,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      },
    });
  } catch (error) {
    console.error("❌ Error fetching mini draws:", error);

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
        error: "Failed to fetch mini draws",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
