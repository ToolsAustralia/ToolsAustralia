import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import MiniDraw from "@/models/MiniDraw";
import User from "@/models/User";
import { Types } from "mongoose";

/**
 * GET /api/mini-draws/[id]/activity
 * Get recent activity for a mini draw (entry purchases)
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    const { id } = await params;

    // Validate ObjectId
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid mini draw ID" }, { status: 400 });
    }

    // Find the mini draw and populate user information
    const miniDraw = (await MiniDraw.findById(id).lean()) as import("@/models/MiniDraw").IMiniDraw | null;

    if (!miniDraw) {
      return NextResponse.json({ error: "Mini draw not found" }, { status: 404 });
    }

    // Get entries sorted by lastUpdatedDate (most recent first)
    const entries = (miniDraw.entries || []).sort(
      (a: { lastUpdatedDate: Date }, b: { lastUpdatedDate: Date }) =>
        new Date(b.lastUpdatedDate).getTime() - new Date(a.lastUpdatedDate).getTime()
    );

    // Limit to most recent 20 entries
    const recentEntries = entries.slice(0, 20);

    // Fetch user information for each entry
    const activityData = await Promise.all(
      recentEntries.map(
        async (entry: {
          userId: Types.ObjectId;
          totalEntries: number;
          lastUpdatedDate: Date;
          entriesBySource?: { "mini-draw-package"?: number };
        }) => {
          const user = await User.findById(entry.userId).select("firstName lastName email").lean();

          if (!user) {
            return null;
          }

          // Format user name (show first name and last initial for privacy)
          const userName = user.firstName ? `${user.firstName} ${user.lastName?.charAt(0) || ""}.` : "Anonymous";

          // Calculate time ago
          const timeAgo = getTimeAgo(new Date(entry.lastUpdatedDate));

          // Get entries added from package purchases
          const packageEntries = entry.entriesBySource?.["mini-draw-package"] || 0;

          return {
            id: entry.userId.toString(),
            type: "entry_purchase",
            user: userName,
            message: packageEntries > 0 ? `purchased ${packageEntries} entries` : "added entries",
            timestamp: timeAgo,
            entries: entry.totalEntries,
            date: entry.lastUpdatedDate,
          };
        }
      )
    );

    // Filter out null entries and return
    const filteredActivity = activityData.filter((item) => item !== null);

    return NextResponse.json({
      success: true,
      data: filteredActivity,
    });
  } catch (error) {
    console.error("Error fetching mini draw activity:", error);
    return NextResponse.json({ error: "Failed to fetch activity" }, { status: 500 });
  }
}

/**
 * Helper function to calculate time ago
 */
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return `${diffInSeconds} second${diffInSeconds !== 1 ? "s" : ""} ago`;
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes !== 1 ? "s" : ""} ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours !== 1 ? "s" : ""} ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays !== 1 ? "s" : ""} ago`;
  }

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) {
    return `${diffInWeeks} week${diffInWeeks !== 1 ? "s" : ""} ago`;
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  return `${diffInMonths} month${diffInMonths !== 1 ? "s" : ""} ago`;
}
