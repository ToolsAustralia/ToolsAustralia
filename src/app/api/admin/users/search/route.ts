/**
 * Admin API: Search Users
 *
 * GET /api/admin/users/search?q=searchTerm&page=1&limit=20
 *
 * Allows admin to search users by name, email, mobile, or user ID.
 * Returns paginated results with user details and major draw entry counts.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import MajorDraw from "@/models/MajorDraw";
import MiniDraw from "@/models/MiniDraw";
import { z } from "zod";

// Validation schema for search parameters
const searchSchema = z.object({
  q: z
    .string()
    .max(100, "Search query too long")
    .transform((s) => s?.trim() ?? ""),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20)),
  majorDrawId: z.string().optional(), // Optional major draw ID to filter participants
  miniDrawId: z.string().optional(), // Optional mini draw ID to filter participants
});

// Response interface for user search results
interface UserSearchResult {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string;
  state?: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  lastLogin?: Date;
  // Major or mini draw entry information
  currentDrawEntries?: {
    totalEntries: number;
    entriesBySource: {
      membership?: number;
      "one-time-package"?: number;
      upsell?: number;
      "mini-draw"?: number;
    };
  };
}

/**
 * GET handler for user search
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const guard = await requirePermission("users.view");
    if (guard instanceof NextResponse) return guard;

    // Parse and validate query parameters
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    const page = searchParams.get("page") || "1";
    const limit = searchParams.get("limit") || "20";
    const majorDrawId = searchParams.get("majorDrawId") || undefined;
    const miniDrawId = searchParams.get("miniDrawId") || undefined;

    const validatedParams = searchSchema.parse({
      q: query,
      page,
      limit,
      majorDrawId,
      miniDrawId,
    });

    // Require search query unless filtering by draw participants
    if (!validatedParams.q && !validatedParams.majorDrawId && !validatedParams.miniDrawId) {
      return NextResponse.json({ error: "Search query or draw ID is required" }, { status: 400 });
    }

    // Validate pagination limits
    if (validatedParams.page < 1) {
      return NextResponse.json({ error: "Page must be at least 1" }, { status: 400 });
    }
    if (validatedParams.limit < 1 || validatedParams.limit > 100) {
      return NextResponse.json({ error: "Limit must be between 1 and 100" }, { status: 400 });
    }

    // Build search query with fuzzy matching
    const searchQuery: Record<string, unknown> = {};

    if (validatedParams.q.trim()) {
      // Support searching by:
      // 1. User ID (exact match)
      // 2. Email (partial match)
      // 3. Mobile (partial match)
      // 4. First name + Last name (partial match)
      // 5. Full name combination (partial match)

      const searchTerm = validatedParams.q.trim();

      // Check if it's a valid MongoDB ObjectId (24 character hex string)
      const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(searchTerm);

      if (isValidObjectId) {
        // Exact ID search
        searchQuery._id = searchTerm;
      } else {
        // Text-based search with fuzzy matching
        searchQuery.$or = [
          { email: { $regex: searchTerm, $options: "i" } },
          { mobile: { $regex: searchTerm, $options: "i" } },
          { firstName: { $regex: searchTerm, $options: "i" } },
          { lastName: { $regex: searchTerm, $options: "i" } },
          // Full name search (firstName + lastName)
          {
            $expr: {
              $regexMatch: {
                input: { $concat: ["$firstName", " ", "$lastName"] },
                regex: searchTerm,
                options: "i",
              },
            },
          },
        ];
      }
    }

    // If majorDrawId or miniDrawId is provided, filter to only show participants
    let participantUserIds: string[] = [];
    if (validatedParams.majorDrawId) {
      const majorDraw = await MajorDraw.findById(validatedParams.majorDrawId);
      if (majorDraw && majorDraw.entries) {
        participantUserIds = majorDraw.entries.map((entry: { userId: { toString: () => string } }) =>
          entry.userId.toString()
        );
      }
    } else if (validatedParams.miniDrawId) {
      const miniDraw = await MiniDraw.findById(validatedParams.miniDrawId);
      if (miniDraw && miniDraw.entries) {
        participantUserIds = miniDraw.entries
          .filter((entry: { totalEntries: number }) => entry.totalEntries > 0)
          .map((entry: { userId: { toString: () => string } }) => entry.userId.toString());
      }
    }

    if (participantUserIds.length > 0) {
      const participantFilter = { _id: { $in: participantUserIds } };
      if (validatedParams.q) {
        const textConditions = searchQuery.$or as unknown[] | undefined;
        if (textConditions?.length) {
          searchQuery.$and = [participantFilter, { $or: textConditions }];
          delete searchQuery.$or;
        } else if (searchQuery._id) {
          // ObjectId search: ensure the matched user is a participant
          const searchId = searchQuery._id as string;
          searchQuery._id = participantUserIds.includes(searchId) ? searchId : "000000000000000000000000";
        }
      } else {
        Object.keys(searchQuery).forEach((k) => delete searchQuery[k]);
        Object.assign(searchQuery, participantFilter);
      }
    } else if (validatedParams.majorDrawId || validatedParams.miniDrawId) {
      // No participants found for this draw
      return NextResponse.json({
        success: true,
        data: {
          users: [],
          pagination: {
            currentPage: validatedParams.page,
            totalPages: 0,
            totalCount: 0,
            hasNextPage: false,
            hasPrevPage: false,
          },
        },
      });
    }

    // Calculate pagination
    const skip = (validatedParams.page - 1) * validatedParams.limit;

    // Execute search with pagination
    const [users, totalCount] = await Promise.all([
      User.find(searchQuery)
        .select("firstName lastName email mobile state role isActive createdAt lastLogin")
        .sort({ createdAt: -1 }) // Most recent users first
        .skip(skip)
        .limit(validatedParams.limit)
        .lean(),
      User.countDocuments(searchQuery),
    ]);

    // Get draw for entry information (major or mini)
    let targetMajorDraw = null;
    let targetMiniDraw = null;
    if (validatedParams.majorDrawId) {
      targetMajorDraw = await MajorDraw.findById(validatedParams.majorDrawId);
    } else if (validatedParams.miniDrawId) {
      targetMiniDraw = await MiniDraw.findById(validatedParams.miniDrawId);
    } else {
      targetMajorDraw = await MajorDraw.findOne({
        status: { $in: ["active", "frozen"] },
      }).sort({ activationDate: -1 });
    }

    // Enhance user data with draw entry information
    const enhancedUsers: UserSearchResult[] = await Promise.all(
      users.map(async (user) => {
        let currentDrawEntries = null;

        if (targetMajorDraw) {
          const userEntry = targetMajorDraw.entries.find(
            (entry: { userId: { toString: () => string } }) => entry.userId.toString() === user._id.toString()
          );
          if (userEntry) {
            currentDrawEntries = {
              totalEntries: userEntry.totalEntries,
              entriesBySource: userEntry.entriesBySource,
            };
          }
        } else if (targetMiniDraw) {
          const userEntry = targetMiniDraw.entries.find(
            (entry: { userId: { toString: () => string } }) => entry.userId.toString() === user._id.toString()
          );
          if (userEntry) {
            currentDrawEntries = {
              totalEntries: userEntry.totalEntries,
              entriesBySource: {
                membership: 0,
                "one-time-package": 0,
                upsell: 0,
                "mini-draw": userEntry.totalEntries,
              },
            };
          }
        }

        return {
          _id: user._id.toString(),
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          mobile: user.mobile,
          state: user.state,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin,
          currentDrawEntries: currentDrawEntries || undefined,
        };
      })
    );

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / validatedParams.limit);
    const hasNextPage = validatedParams.page < totalPages;
    const hasPrevPage = validatedParams.page > 1;

    return NextResponse.json({
      success: true,
      data: {
        users: enhancedUsers,
        pagination: {
          currentPage: validatedParams.page,
          totalPages,
          totalCount,
          hasNextPage,
          hasPrevPage,
          limit: validatedParams.limit,
        },
        searchInfo: {
          query: validatedParams.q,
          resultsFound: totalCount,
          currentDraw: targetMajorDraw
            ? {
                id: targetMajorDraw._id.toString(),
                name: targetMajorDraw.name,
                status: targetMajorDraw.status,
              }
            : targetMiniDraw
              ? {
                  id: targetMiniDraw._id.toString(),
                  name: targetMiniDraw.name,
                  status: targetMiniDraw.status,
                }
              : null,
        },
      },
    });
  } catch (error) {
    console.error("Error searching users:", error);

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
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
        error: "Failed to search users",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
