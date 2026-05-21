import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import MajorDraw from "@/models/MajorDraw";
import Winner from "@/models/Winner";
import { z } from "zod";
import mongoose, { Types } from "mongoose";

// Type definitions for populated documents
type PopulatedUser = {
  _id: Types.ObjectId | string;
  firstName: string;
  lastName: string;
  email: string;
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
  startDate: Date;
  endDate: Date;
  drawDate: Date;
  activationDate: Date;
  freezeEntriesAt: Date;
  configurationLocked: boolean;
  lockedAt?: Date;
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
  createdAt: Date;
  updatedAt: Date;
};

type ProcessedDraw = {
  _id: string;
  name: string;
  description: string;
  status: "queued" | "active" | "frozen" | "completed" | "cancelled";
  startDate: Date;
  endDate: Date;
  drawDate: Date;
  activationDate: Date;
  freezeEntriesAt: Date;
  configurationLocked: boolean;
  lockedAt?: Date;
  prize: {
    name?: string;
    description?: string;
    value?: number;
    images?: string[];
    brand?: string;
    specifications?: Record<string, string | number | string[]>;
    terms?: string[];
  } | null;
  totalEntries: number;
  winner: {
    winnerId: string;
    userId: string;
    userDetails: {
      firstName: string;
      lastName: string;
      email: string;
    } | null;
    entryNumber?: number;
    selectedDate: Date;
    selectedBy: string | null;
    selectedByDetails: {
      firstName: string;
      lastName: string;
      email: string;
    } | null;
    selectionMethod?: "manual" | "government-app";
    imageUrl?: string;
    drawResultUrl?: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
};

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

    // Winner filter - will be handled after fetching draws by checking Winner collection

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
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      MajorDraw.countDocuments(filter),
    ]);

    // Get all draw IDs
    const drawIds = majorDraws.map((draw) => draw._id);

    // Fetch winners from Winner model for these draws
    const winners = await Winner.find({
      drawId: { $in: drawIds },
      drawType: "major",
    })
      .populate("userId", "firstName lastName email")
      .populate("selectedBy", "firstName lastName email")
      .lean();

    // Create a map of drawId -> winner for quick lookup
    const winnerMap = new Map<string, WinnerLean>();
    winners.forEach((winner) => {
      const winnerDoc = winner as unknown as WinnerLean;
      const drawId = winnerDoc.drawId instanceof Types.ObjectId 
        ? winnerDoc.drawId.toString() 
        : String(winnerDoc.drawId);
      winnerMap.set(drawId, winnerDoc);
    });

    // Helper to check if userId/selectedBy is populated
    const isPopulatedUser = (user: PopulatedUser | Types.ObjectId | string | undefined): user is PopulatedUser => {
      return user !== undefined && typeof user === "object" && !(user instanceof Types.ObjectId) && "_id" in user && "firstName" in user;
    };

    // Helper to convert ObjectId to string
    const toIdString = (id: Types.ObjectId | string | undefined): string => {
      if (!id) return "";
      if (id instanceof Types.ObjectId) return id.toString();
      if (typeof id === "string") return id;
      if (typeof id === "object" && "_id" in id) {
        const objId = (id as PopulatedUser)._id;
        return objId instanceof Types.ObjectId ? objId.toString() : String(objId);
      }
      return String(id);
    };

    // Process the results
    const processedDraws: ProcessedDraw[] = [];
    
    for (const draw of majorDraws) {
      const drawDoc = draw as unknown as MajorDrawLean;
      const drawId = drawDoc._id instanceof Types.ObjectId 
        ? drawDoc._id.toString() 
        : String(drawDoc._id);
      const winner = winnerMap.get(drawId);
      
      // Apply hasWinner filter if specified
      if (hasWinner === "true" && !winner) {
        continue; // Filter out draws without winners
      }
      if (hasWinner === "false" && winner) {
        continue; // Filter out draws with winners
      }

      processedDraws.push({
        _id: drawId,
        name: drawDoc.name,
        description: drawDoc.description,
        status: drawDoc.status,
        startDate: drawDoc.startDate,
        endDate: drawDoc.endDate,
        drawDate: drawDoc.drawDate,
        activationDate: drawDoc.activationDate,
        freezeEntriesAt: drawDoc.freezeEntriesAt,
        configurationLocked: drawDoc.configurationLocked,
        lockedAt: drawDoc.lockedAt,
        prize: drawDoc.prize
          ? {
              name: drawDoc.prize?.name,
              description: drawDoc.prize?.description,
              value: drawDoc.prize?.value,
              images: drawDoc.prize?.images,
              brand: drawDoc.prize?.brand,
              specifications: drawDoc.prize?.specifications,
              terms: drawDoc.prize?.terms,
            }
          : null,
        totalEntries: drawDoc.totalEntries,
        winner: winner
          ? {
              winnerId: toIdString(winner._id),
              userId: isPopulatedUser(winner.userId) 
                ? toIdString(winner.userId._id)
                : toIdString(winner.userId),
              userDetails: isPopulatedUser(winner.userId)
                ? {
                    firstName: winner.userId.firstName,
                    lastName: winner.userId.lastName,
                    email: winner.userId.email,
                  }
                : null,
              entryNumber: winner.entryNumber,
              selectedDate: winner.selectedDate,
              selectedBy: winner.selectedBy && isPopulatedUser(winner.selectedBy)
                ? toIdString(winner.selectedBy._id)
                : (winner.selectedBy ? toIdString(winner.selectedBy) : null),
              selectedByDetails: winner.selectedBy && isPopulatedUser(winner.selectedBy)
                ? {
                    firstName: winner.selectedBy.firstName,
                    lastName: winner.selectedBy.lastName,
                    email: winner.selectedBy.email,
                  }
                : null,
              selectionMethod: winner.selectionMethod,
              imageUrl: winner.imageUrl,
              drawResultUrl: winner.drawResultUrl,
            }
          : null,
        createdAt: drawDoc.createdAt,
        updatedAt: drawDoc.updatedAt,
      });
    }

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);

    // Get summary statistics
    const [drawStats, winnerCount] = await Promise.all([
      MajorDraw.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalDraws: { $sum: 1 },
            totalEntries: { $sum: "$totalEntries" },
            totalPrizeValue: { $sum: "$prize.value" },
          },
        },
      ]),
      // Count winners from Winner collection for draws matching filter
      (async () => {
        const matchingDraws = await MajorDraw.find(filter).select("_id").lean();
        const matchingDrawIds = matchingDraws.map((d) => d._id);
        return Winner.countDocuments({
          drawId: { $in: matchingDrawIds },
          drawType: "major",
        });
      })(),
    ]);

    const drawStatsResult = drawStats[0] || {
      totalDraws: 0,
      totalEntries: 0,
      totalPrizeValue: 0,
    };

    const summaryStats = {
      totalDraws: drawStatsResult.totalDraws,
      totalEntries: drawStatsResult.totalEntries,
      totalPrizeValue: drawStatsResult.totalPrizeValue,
      drawsWithWinners: winnerCount,
      drawsWithoutWinners: drawStatsResult.totalDraws - winnerCount,
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
