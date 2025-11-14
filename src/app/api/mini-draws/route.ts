import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import MiniDraw from "@/models/MiniDraw";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";

// Query parameters validation (updated for entry-based system)
const querySchema = z.object({
  page: z.string().optional().default("1"),
  limit: z.string().optional().default("12"),
  status: z.enum(["active", "completed", "cancelled", "all", "upcoming"]).optional(),
  minPrice: z.string().optional(),
  maxPrice: z.string().optional(),
  sortBy: z.enum(["createdAt", "prizeValue", "totalEntries", "minimumEntries"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  search: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const query = Object.fromEntries(searchParams.entries());

    // Validate query parameters
    let validatedQuery;
    try {
      validatedQuery = querySchema.parse(query);
    } catch (validationError) {
      return NextResponse.json({ error: "Invalid query parameters", details: validationError }, { status: 400 });
    }

    // Build filter object (using entry-based fields)
    const filter: Record<string, unknown> = {};

    // Filter by status (using new status field)
    if (!validatedQuery.status || validatedQuery.status === "active" || validatedQuery.status === "upcoming") {
      // "upcoming" maintained for backward compatibility; treat the same as active now that draws are capacity based
      filter.status = "active";
    } else if (validatedQuery.status === "completed") {
      filter.status = "completed";
    } else if (validatedQuery.status === "cancelled") {
      filter.status = "cancelled";
    } else if (validatedQuery.status !== "all") {
      filter.status = "active";
    }

    // Filter by prize value (no ticket price in entry-based system)
    if (validatedQuery.minPrice || validatedQuery.maxPrice) {
      const prizeValueFilter: Record<string, number> = {};
      if (validatedQuery.minPrice) {
        prizeValueFilter.$gte = parseFloat(validatedQuery.minPrice);
      }
      if (validatedQuery.maxPrice) {
        prizeValueFilter.$lte = parseFloat(validatedQuery.maxPrice);
      }
      filter["prize.value"] = prizeValueFilter;
    }

    // Search filter
    if (validatedQuery.search) {
      filter.$or = [
        { name: { $regex: validatedQuery.search, $options: "i" } },
        { description: { $regex: validatedQuery.search, $options: "i" } },
        { "prize.name": { $regex: validatedQuery.search, $options: "i" } },
      ];
    }

    // Build sort object (using entry-based fields)
    const sort: Record<string, 1 | -1> = {};
    if (validatedQuery.sortBy === "totalEntries") {
      sort.totalEntries = validatedQuery.sortOrder === "asc" ? 1 : -1;
    } else if (validatedQuery.sortBy === "prizeValue") {
      sort["prize.value"] = validatedQuery.sortOrder === "asc" ? 1 : -1;
    } else if (validatedQuery.sortBy === "minimumEntries") {
      sort.minimumEntries = validatedQuery.sortOrder === "asc" ? 1 : -1;
    } else {
      sort[validatedQuery.sortBy] = validatedQuery.sortOrder === "asc" ? 1 : -1;
    }

    // Calculate pagination
    const page = parseInt(validatedQuery.page);
    const limit = parseInt(validatedQuery.limit);
    const skip = (page - 1) * limit;

    // Execute query with timeout and optimization
    const queryTimeout = 10000; // 10 seconds timeout

    const [miniDraws, totalCount] = (await Promise.race([
      Promise.all([
        MiniDraw.find(filter)
          .select("-entries -winner -__v") // Exclude large arrays for list view
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean()
          .maxTimeMS(queryTimeout),
        MiniDraw.countDocuments(filter).maxTimeMS(queryTimeout),
      ]),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Query timeout")), queryTimeout)),
    ])) as [unknown[], number];

    // Get user membership status if authenticated
    let hasActiveMembership = false;
    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      const user = await User.findById(session.user.id).lean();
      if (user) {
        // Check for active subscription or one-time packages
        const hasActiveSubscription = user.subscription?.isActive || false;
        const hasActiveOneTime = user.oneTimePackages?.some((pkg) => pkg.isActive) || false;
        hasActiveMembership = hasActiveSubscription || hasActiveOneTime;
      }
    }

    // Add membership requirement and status to each mini draw
    const miniDrawsWithMembership = (miniDraws as Array<Record<string, unknown>>).map((draw) => ({
      ...draw,
      requiresMembership: true,
      hasActiveMembership,
      entriesRemaining: Math.max((draw.minimumEntries as number) - (draw.totalEntries as number), 0),
    }));

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return NextResponse.json({
      miniDraws: miniDrawsWithMembership,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNextPage,
        hasPrevPage,
        limit,
      },
    });
  } catch (error) {
    console.error("Error fetching mini draws:", error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message === "Query timeout") {
        return NextResponse.json({ error: "Query timeout - please try again" }, { status: 408 });
      }

      if (error.message.includes("MongoServerError")) {
        return NextResponse.json({ error: "Database connection error" }, { status: 503 });
      }
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid query parameters", details: error.issues }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to fetch mini draws" }, { status: 500 });
  }
}
