/**
 * Admin API: Get Mini Draw Participants
 *
 * GET /api/admin/mini-draw/[id]/participants?page=1&limit=20&search=query
 *
 * The read behind the admin "Participants" modal — the same entrant data the CSV/Excel
 * export dumps, but paginated and searchable so staff can answer "did this person enter?"
 * without downloading a spreadsheet of everyone's personal details.
 *
 * Deliberately mirrors /api/admin/major-draw/participants: same query params, same response
 * envelope, same sort-before-slice ordering. One shared `ParticipantsModal` consumes both, so
 * a divergence here shows up as a broken modal rather than a compile error.
 *
 * Mini-draw entries are PACKAGE-ONLY (no membership / referral sources), so there is no
 * `entriesBySource` breakdown to report — the major-draw shape carries one, this does not.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { Types } from "mongoose";
import MiniDraw from "@/models/MiniDraw";
import User from "@/models/User";

type MiniDrawEntry = {
  userId: Types.ObjectId | string;
  totalEntries: number;
  firstAddedDate?: Date;
  lastUpdatedDate?: Date;
};

interface Participant {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string;
  state?: string;
  totalEntries: number;
  firstAddedDate: Date;
  lastUpdatedDate: Date;
}

const MAX_LIMIT = 100;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Entrant PII — gated separately from `miniDraws.view`, which only grants the draw list.
    const _guard = await requirePermission("miniDraws.viewParticipants");
    if (_guard instanceof NextResponse) return _guard;

    await connectDB();

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid mini draw ID" }, { status: 400 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "20", 10)), MAX_LIMIT);
    const searchQuery = (searchParams.get("search") || "").trim();

    const miniDraw = await MiniDraw.findById(id).select("_id name totalEntries minimumEntries entries").lean<{
      _id: Types.ObjectId;
      name: string;
      totalEntries?: number;
      minimumEntries?: number;
      entries?: MiniDrawEntry[];
    } | null>();

    if (!miniDraw) {
      return NextResponse.json({ error: "Mini draw not found" }, { status: 404 });
    }

    let entries: MiniDrawEntry[] = miniDraw.entries || [];

    // Search resolves against User first, then filters the embedded entries — the same order
    // the major-draw route uses, because the searchable fields live on User, not on the entry.
    if (searchQuery) {
      const searchRegex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const matchingUsers = await User.find({
        $or: [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { email: searchRegex },
          // Admins paste mobiles unspaced, so match the raw stored value.
          { mobile: searchRegex },
          {
            $expr: {
              $regexMatch: {
                input: { $concat: ["$firstName", " ", "$lastName"] },
                regex: searchQuery,
                options: "i",
              },
            },
          },
        ],
      }).select("_id");

      const matchingUserIds = new Set(matchingUsers.map((user) => user._id.toString()));
      entries = entries.filter((entry) => entry.userId && matchingUserIds.has(String(entry.userId)));
    }

    // Sort BEFORE the slice. Sorting after would order only the current page, so page 1 would
    // be "the first N in insertion order, then sorted" rather than the top N.
    entries = [...entries].sort((a, b) => (b.totalEntries || 0) - (a.totalEntries || 0));

    const totalCount = entries.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const skip = (page - 1) * limit;
    const paginatedEntries = entries.slice(skip, skip + limit);

    const userIds = paginatedEntries.map((entry) => entry.userId).filter(Boolean);
    const users = await User.find({ _id: { $in: userIds } })
      .select("firstName lastName email mobile state")
      .lean();

    const userMap = new Map(users.map((user) => [String(user._id), user]));

    const participants: Participant[] = paginatedEntries.map((entry) => {
      const userId = String(entry.userId || "");
      const user = userId ? userMap.get(userId) : null;
      return {
        userId,
        firstName: user?.firstName || "",
        lastName: user?.lastName || "",
        email: user?.email || "",
        mobile: user?.mobile || "",
        state: user?.state || "",
        totalEntries: entry.totalEntries || 0,
        firstAddedDate: entry.firstAddedDate || new Date(),
        lastUpdatedDate: entry.lastUpdatedDate || new Date(),
      };
    });

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
        miniDraw: {
          _id: String(miniDraw._id),
          name: miniDraw.name,
          totalEntries: miniDraw.totalEntries ?? 0,
          minimumEntries: miniDraw.minimumEntries ?? 0,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching mini draw participants:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch participants",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
