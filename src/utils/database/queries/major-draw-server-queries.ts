/**
 * Server-Side Major Draw Queries
 * 
 * Cached server-side functions for fetching major draw data.
 * These functions use createCachedQuery to prevent duplicate queries
 * between generateMetadata and page components in the same request.
 */

import { createCachedQuery } from "./server-queries";
import { getCurrentMajorDrawForDisplay } from "@/utils/draws/major-draw-helpers";
import { IMajorDraw } from "@/models/MajorDraw";

/**
 * Interface for major draw data returned from server queries
 * Simplified version for initial page load
 */
export interface ServerMajorDraw {
  _id: string;
  name: string;
  description: string;
  isActive: boolean;
  status: "queued" | "active" | "frozen" | "completed" | "cancelled";
  freezeEntriesAt?: Date | string;
  drawDate?: Date | string;
  activationDate?: Date | string;
  totalEntries: number;
}

/**
 * Get the current major draw for display
 * Uses cached query to prevent duplicate fetches in the same request
 * 
 * This function returns a simplified version of the major draw
 * suitable for initial page rendering. Full data can be fetched
 * client-side for real-time updates.
 * 
 * @returns Major draw object or null if not found
 */
export const getCurrentMajorDrawServer = createCachedQuery(
  async (): Promise<ServerMajorDraw | null> => {
    // Get current major draw for display (handles active, frozen, and gap period)
    const majorDraw = await getCurrentMajorDrawForDisplay(true);

    if (!majorDraw) {
      return null;
    }

    // Return simplified version for initial render
    // Type assertion: majorDraw._id is mongoose.Types.ObjectId from IMajorDraw interface
    return {
      _id: (majorDraw._id as { toString: () => string }).toString(),
      name: majorDraw.name,
      description: majorDraw.description,
      isActive: majorDraw.isActive,
      status: majorDraw.status,
      freezeEntriesAt: majorDraw.freezeEntriesAt,
      drawDate: majorDraw.drawDate,
      activationDate: majorDraw.activationDate,
      totalEntries: majorDraw.totalEntries || 0,
    };
  }
);

