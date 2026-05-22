/**
 * Admin API: Get Major Draw Participants
 *
 * GET /api/admin/major-draw/participants?majorDrawId=xxx&page=1&limit=20&search=query
 *
 * Fetches participants of a major draw with pagination and search functionality.
 * Accessible to admins only.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import mongoose from "mongoose";
import MajorDraw from "@/models/MajorDraw";
import User from "@/models/User";

// Type for entry in major draw entries array
type MajorDrawEntry = {
  userId: mongoose.Types.ObjectId | string;
  totalEntries: number;
  entriesBySource: {
    membership?: number;
    "one-time-package"?: number;
    upsell?: number;
    "mini-draw"?: number;
    referral?: number;
    "bonus-entry-promo"?: number;
  };
  firstAddedDate: Date;
  lastUpdatedDate: Date;
};

// Type for participant data
interface Participant {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string;
  state?: string;
  totalEntries: number;
  entriesBySource: {
    membership?: number;
    "one-time-package"?: number;
    upsell?: number;
    "mini-draw"?: number;
    referral?: number;
  };
  firstAddedDate: Date;
  lastUpdatedDate: Date;
}

/**
 * GET handler for fetching major draw participants
 *
 * Query params:
 * - majorDrawId: Required - ID of the major draw
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - search: Optional search query for name or email
 */
export async function GET(request: NextRequest) {
  try {
    const _guard = await requirePermission("majorDraw.view");
    if (_guard instanceof NextResponse) return _guard;

    await connectDB();

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const majorDrawId = searchParams.get("majorDrawId");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);
    const searchQuery = searchParams.get("search") || "";

    // Validate majorDrawId
    if (!majorDrawId) {
      return NextResponse.json({ error: "Major draw ID is required" }, { status: 400 });
    }

    // Get major draw
    const majorDraw = await MajorDraw.findById(majorDrawId);

    if (!majorDraw) {
      return NextResponse.json({ error: "Major draw not found" }, { status: 404 });
    }

    // Get all entries from the major draw
    let entries = majorDraw.entries || [];

    // If search query provided, filter entries by matching user details
    if (searchQuery.trim()) {
      // Get user IDs that match the search query
      const searchRegex = new RegExp(searchQuery.trim(), "i");
      const matchingUsers = await User.find({
        $or: [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { email: searchRegex },
          {
            $expr: {
              $regexMatch: {
                input: { $concat: ["$firstName", " ", "$lastName"] },
                regex: searchQuery.trim(),
                options: "i",
              },
            },
          },
        ],
      }).select("_id");

      const matchingUserIds = new Set(matchingUsers.map((user) => user._id.toString()));

      // Filter entries to only include matching users
      // Handle both ObjectId and string userId formats
      entries = entries.filter((entry: MajorDrawEntry) => {
        if (!entry.userId) return false;
        const userId =
          typeof entry.userId === "object" && "toString" in entry.userId
            ? entry.userId.toString()
            : String(entry.userId);
        return matchingUserIds.has(userId);
      });
    }

    // Calculate pagination
    const totalCount = entries.length;
    const totalPages = Math.ceil(totalCount / limit);
    const skip = (page - 1) * limit;
    const paginatedEntries = entries.slice(skip, skip + limit);

    // Get user IDs from paginated entries
    // Handle both ObjectId and string userId formats
    const userIds = paginatedEntries
      .map((entry: MajorDrawEntry) => {
        if (!entry.userId) return null;
        return typeof entry.userId === "object" && "toString" in entry.userId ? entry.userId : entry.userId;
      })
      .filter(Boolean);

    // Populate user details
    const users = await User.find({
      _id: { $in: userIds },
    }).select("firstName lastName email mobile state");

    // Create a map of user data for quick lookup
    const userMap = new Map(users.map((user) => [user._id.toString(), user]));

    // Build participant data
    const participants: Participant[] = paginatedEntries.map((entry: MajorDrawEntry) => {
      // Handle both ObjectId and string userId formats
      const userId =
        typeof entry.userId === "object" && "toString" in entry.userId
          ? entry.userId.toString()
          : String(entry.userId || "");
      const user = userId ? userMap.get(userId) : null;

      return {
        userId: userId || "",
        firstName: user?.firstName || "",
        lastName: user?.lastName || "",
        email: user?.email || "",
        mobile: user?.mobile || "",
        state: user?.state || "",
        totalEntries: entry.totalEntries || 0,
        entriesBySource: entry.entriesBySource || {},
        firstAddedDate: entry.firstAddedDate || new Date(),
        lastUpdatedDate: entry.lastUpdatedDate || new Date(),
      };
    });

    // Sort participants by total entries (descending) for better UX
    participants.sort((a, b) => b.totalEntries - a.totalEntries);

    // Return response with pagination info
    return NextResponse.json({
      success: true,
      data: {
        participants,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
        majorDraw: {
          _id: majorDraw._id,
          name: majorDraw.name,
          totalEntries: majorDraw.totalEntries,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching major draw participants:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch participants",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
