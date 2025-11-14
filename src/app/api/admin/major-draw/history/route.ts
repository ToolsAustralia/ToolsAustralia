import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import MajorDraw from "@/models/MajorDraw";
import { z } from "zod";
import mongoose from "mongoose";

// Validation schema for query parameters
const historyQuerySchema = z.object({
  status: z.enum(["queued", "active", "frozen", "completed", "cancelled"]).optional(),
  hasWinner: z.enum(["true", "false"]).optional(),
  search: z.string().optional(),
  page: z.string().default("1").transform(Number).pipe(z.number().int().min(1)),
  limit: z.string().default("20").transform(Number).pipe(z.number().int().min(1).max(100)),
  sortBy: z.enum(["drawDate", "createdAt", "name", "prize.value"]).default("drawDate"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

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

    const validatedParams = historyQuerySchema.parse(queryParams);
    const { status, hasWinner, search, page, limit, sortBy, sortOrder, dateFrom, dateTo } = validatedParams;

    // Build filter query
    const filter: mongoose.FilterQuery<typeof MajorDraw> = {};

    // Status filter
    if (status) {
      filter.status = status;
    }

    // Winner filter
    if (hasWinner === "true") {
      filter["winner.userId"] = { $exists: true, $ne: null };
    } else if (hasWinner === "false") {
      filter.$or = [{ "winner.userId": { $exists: false } }, { "winner.userId": null }];
    }

    // Date range filter
    if (dateFrom || dateTo) {
      filter.drawDate = {};
      if (dateFrom) {
        filter.drawDate.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        filter.drawDate.$lte = new Date(dateTo);
      }
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

    // Fetch major draws with pagination
    const [majorDraws, totalCount] = await Promise.all([
      MajorDraw.find(filter)
        .select("-entries -__v")
        .populate("winner.userId", "firstName lastName email")
        .populate("winner.selectedBy", "firstName lastName email")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      MajorDraw.countDocuments(filter),
    ]);

    // Process the results
    const processedDraws = majorDraws.map((draw) => ({
      _id: String(draw._id),
      name: draw.name,
      description: draw.description,
      status: draw.status,
      startDate: draw.startDate,
      endDate: draw.endDate,
      drawDate: draw.drawDate,
      activationDate: draw.activationDate,
      freezeEntriesAt: draw.freezeEntriesAt,
      configurationLocked: draw.configurationLocked,
      lockedAt: draw.lockedAt,
      prize: draw.prize
        ? {
            name: draw.prize?.name,
            description: draw.prize?.description,
            value: draw.prize?.value,
            images: draw.prize?.images,
            brand: draw.prize?.brand,
            specifications: draw.prize?.specifications,
            components: draw.prize?.components,
            terms: draw.prize?.terms,
          }
        : null,
      totalEntries: draw.totalEntries,
      winner: draw.winner
        ? {
            userId: draw.winner.userId?._id?.toString(),
            userDetails: draw.winner.userId
              ? {
                  firstName: draw.winner.userId.firstName,
                  lastName: draw.winner.userId.lastName,
                  email: draw.winner.userId.email,
                }
              : null,
            entryNumber: draw.winner.entryNumber,
            selectedDate: draw.winner.selectedDate,
            notified: draw.winner.notified,
            selectedBy: draw.winner.selectedBy?._id?.toString(),
            selectedByDetails: draw.winner.selectedBy
              ? {
                  firstName: draw.winner.selectedBy.firstName,
                  lastName: draw.winner.selectedBy.lastName,
                  email: draw.winner.selectedBy.email,
                }
              : null,
            selectionMethod: draw.winner.selectionMethod,
          }
        : null,
      createdAt: draw.createdAt,
      updatedAt: draw.updatedAt,
    }));

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);

    // Get summary statistics
    const stats = await MajorDraw.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalDraws: { $sum: 1 },
          totalEntries: { $sum: "$totalEntries" },
          totalPrizeValue: { $sum: "$prize.value" },
          drawsWithWinners: {
            $sum: {
              $cond: [{ $and: [{ $ne: ["$winner.userId", null] }, { $ne: ["$winner.userId", undefined] }] }, 1, 0],
            },
          },
          drawsWithoutWinners: {
            $sum: {
              $cond: [{ $or: [{ $eq: ["$winner.userId", null] }, { $eq: ["$winner.userId", undefined] }] }, 1, 0],
            },
          },
        },
      },
    ]);

    const summaryStats = stats[0] || {
      totalDraws: 0,
      totalEntries: 0,
      totalPrizeValue: 0,
      drawsWithWinners: 0,
      drawsWithoutWinners: 0,
    };

    return NextResponse.json({
      success: true,
      data: {
        draws: processedDraws,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
          limit,
        },
        filters: {
          status,
          hasWinner,
          search,
          dateFrom,
          dateTo,
          sortBy,
          sortOrder,
        },
        stats: {
          totalDraws: summaryStats.totalDraws,
          totalEntries: summaryStats.totalEntries,
          totalPrizeValue: summaryStats.totalPrizeValue,
          drawsWithWinners: summaryStats.drawsWithWinners,
          drawsWithoutWinners: summaryStats.drawsWithoutWinners,
          winnerSelectionRate:
            summaryStats.totalDraws > 0
              ? Math.round((summaryStats.drawsWithWinners / summaryStats.totalDraws) * 100)
              : 0,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching major draw history:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: "Failed to fetch major draw history",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
