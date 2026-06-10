import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentMajorDrawForDisplay } from "@/utils/draws/major-draw-helpers";
import { getMajorDrawParticipantCount } from "@/utils/database/queries/major-draw-queries";
import { getTimeUntilFreeze, getTimeUntilDraw } from "@/utils/common/timezone";
import { userScopedCacheControl } from "@/utils/security/cache-control";

// Draw status must reflect DB immediately (dev toggler + transitions). Do not cache the route.
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    // console.log("🎯 Fetching current major draw...");

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

      // console.log(
      //   `🎯 User ${session.user.id} stats for draw ${majorDraw.name}: ${userStats.totalEntries} total entries from ${userStats.totalDrawsEntered} sources`
      // );
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

    // Calculate total participants (number of unique users with entries).
    // Computed via a server-side $size so the unbounded entries[] array is
    // never loaded into this hot, frequently-polled handler.
    const totalParticipants = await getMajorDrawParticipantCount(majorDraw._id);

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
          totalParticipants: totalParticipants,
          createdAt: majorDraw.createdAt,
          updatedAt: majorDraw.updatedAt,
        },
        userStats,
        totalEntries: majorDraw.totalEntries,
        totalParticipants: totalParticipants,
        daysRemaining,
        isActive: majorDraw.isActive,
        // NEW: Freeze period information
        status: majorDraw.status,
        isFrozen,
        timeUntilFreeze,
        timeUntilDraw,
      },
    };

    // console.log(`✅ Major draw fetched: ${majorDraw.name} (${majorDraw.totalEntries} entries)`);

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

    // Cache-Control value used only for anonymous responses (the authenticated
    // branch below overrides it). Whether the CDN honours s-maxage on this
    // force-dynamic route is a Vercel detail; the directive is still sent verbatim.
    let publicCacheControl: string;
    if (process.env.NODE_ENV === "development") {
      publicCacheControl = "no-store, must-revalidate";
    } else if (nearestMs <= 60 * 60 * 1000) {
      publicCacheControl = "no-store, must-revalidate"; // critical window
    } else if (nearestMs <= 6 * 60 * 60 * 1000) {
      publicCacheControl = "public, s-maxage=10, max-age=10"; // near window
    } else {
      publicCacheControl = "public, s-maxage=60, stale-while-revalidate=300"; // normal
    }

    // … but this response embeds per-user `userStats`, so an authenticated request
    // must never be cached publicly. See docs/security-csp/rules.md.
    const { cacheControl, vary } = userScopedCacheControl(!!session?.user?.id, publicCacheControl);
    headers.set("Cache-Control", cacheControl);
    headers.set("Vary", vary);

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
