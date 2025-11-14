import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentMajorDrawForDisplay } from "@/utils/draws/major-draw-helpers";
import { getTimeUntilFreeze, getTimeUntilDraw } from "@/utils/common/timezone";

// Interface for the MajorDraw document from database with new fields
interface MajorDrawDocument {
  _id: string;
  name: string;
  description: string;
  prize?: Record<string, unknown>;
  isActive: boolean;
  // NEW: Status fields
  status: "queued" | "active" | "frozen" | "completed" | "cancelled";
  freezeEntriesAt?: Date;
  drawDate?: Date;
  activationDate?: Date;
  configurationLocked: boolean;
  lockedAt?: Date;
  winner?: {
    userId: string;
    entryNumber: number;
    selectedDate: Date;
    notified: boolean;
    selectedBy?: string;
    selectionMethod?: "manual" | "government-app";
  };
  entries: Array<{
    userId: { toString: () => string };
    totalEntries: number;
    entriesBySource: {
      membership?: number;
      "one-time-package"?: number;
      upsell?: number;
      "mini-draw"?: number;
    };
    firstAddedDate: Date;
    lastUpdatedDate: Date;
  }>;
  totalEntries: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * GET /api/major-draw
 * Get the current active major draw with user stats
 */
export async function GET() {
  try {
    console.log("🎯 Fetching current major draw...");

    await connectDB();

    // Get current major draw for display (handles active, frozen, and gap period)
    const majorDrawResult = await getCurrentMajorDrawForDisplay(true);
    const majorDraw = majorDrawResult as unknown as MajorDrawDocument | null;

    if (!majorDraw) {
      return NextResponse.json(
        {
          success: false,
          error: "No active major draw found",
        },
        { status: 404 }
      );
    }

    // Get user session
    const session = await getServerSession(authOptions);
    let userStats = null;

    if (session?.user?.id) {
      // ✅ Get user stats for the specific draw being displayed
      const { getUserMajorDrawStats } = await import("@/utils/database/queries/major-draw-queries");
      userStats = await getUserMajorDrawStats(session.user.id, majorDraw._id);

      console.log(
        `🎯 User ${session.user.id} stats for draw ${majorDraw.name}: ${userStats.totalEntries} total entries from ${userStats.totalDrawsEntered} sources`
      );
    }

    // Calculate days remaining and freeze information
    const now = new Date();
    const endDate = new Date(majorDraw.drawDate || "");
    const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    // Calculate freeze period information
    const isFrozen =
      majorDraw.status === "frozen" || (majorDraw.freezeEntriesAt ? now >= majorDraw.freezeEntriesAt : false);
    const timeUntilFreeze = majorDraw.freezeEntriesAt ? getTimeUntilFreeze(majorDraw.freezeEntriesAt) : undefined;
    const timeUntilDraw = majorDraw.drawDate ? getTimeUntilDraw(majorDraw.drawDate) : undefined;

    const response = {
      success: true,
      data: {
        majorDraw: {
          _id: majorDraw._id,
          name: majorDraw.name,
          description: majorDraw.description,
          isActive: majorDraw.isActive,
          // NEW: Status fields
          status: majorDraw.status,
          freezeEntriesAt: majorDraw.freezeEntriesAt,
          drawDate: majorDraw.drawDate,
          activationDate: majorDraw.activationDate,
          configurationLocked: majorDraw.configurationLocked,
          totalEntries: majorDraw.totalEntries,
          winner: majorDraw.winner,
          createdAt: majorDraw.createdAt,
          updatedAt: majorDraw.updatedAt,
        },
        userStats,
        totalEntries: majorDraw.totalEntries,
        daysRemaining,
        isActive: majorDraw.isActive,
        // NEW: Freeze period information
        status: majorDraw.status,
        isFrozen,
        timeUntilFreeze,
        timeUntilDraw,
      },
    };

    console.log(`✅ Major draw fetched: ${majorDraw.name} (${majorDraw.totalEntries} entries)`);

    // Dynamic caching: disable cache close to critical events
    const headers = new Headers();
    headers.set("Content-Type", "application/json");

    const msUntilFreeze = majorDraw.freezeEntriesAt
      ? new Date(majorDraw.freezeEntriesAt).getTime() - Date.now()
      : Number.POSITIVE_INFINITY;
    const msUntilDraw = majorDraw.drawDate
      ? new Date(majorDraw.drawDate).getTime() - Date.now()
      : Number.POSITIVE_INFINITY;
    const nearestMs = Math.min(msUntilFreeze, msUntilDraw);

    if (nearestMs <= 60 * 60 * 1000) {
      // Critical window: no cache to ensure real-time transitions
      headers.set("Cache-Control", "no-store, must-revalidate");
    } else if (nearestMs <= 6 * 60 * 60 * 1000) {
      // Near window: short cache
      headers.set("Cache-Control", "public, s-maxage=10, max-age=10");
    } else {
      // Normal: existing caching
      headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    }

    return NextResponse.json(response, { headers });
  } catch (error) {
    console.error("❌ Error fetching major draw:", error);

    // Add no-cache headers for error responses
    const headers = new Headers();
    headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    headers.set("Content-Type", "application/json");

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500, headers }
    );
  }
}
