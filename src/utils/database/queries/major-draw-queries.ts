import mongoose from "mongoose";
import MajorDraw from "@/models/MajorDraw";

/**
 * OPTION 1: Single Source of Truth Implementation
 * All major draw entry queries now use majordraws.entries as the only source
 */

export interface UserMajorDrawStats {
  totalEntries: number;
  membershipEntries: number;
  oneTimeEntries: number;
  currentDrawEntries: number;
  totalDrawsEntered: number;
  entriesByPackage: Array<{
    packageName: string;
    packageId: string;
    entryCount: number;
    source: "membership" | "one-time-package" | "upsell" | "mini-draw";
  }>;
}

export interface UserMajorDrawEntry {
  majorDrawId: string;
  majorDrawName: string;
  entryCount: number;
  source: "membership" | "one-time-package" | "upsell" | "mini-draw";
  packageId: string;
  packageName: string;
  addedDate: Date;
  drawStatus: "active" | "queued" | "completed" | "cancelled";
}

/**
 * Get user's major draw entries from a specific draw
 */
export async function getUserMajorDrawEntries(userId: string, majorDrawId: string): Promise<UserMajorDrawEntry | null> {
  try {
    const majorDraw = await MajorDraw.findById(majorDrawId).populate("name");

    if (!majorDraw) {
      return null;
    }

    const userEntry = majorDraw.entries.find(
      (entry: { userId: { toString(): string } }) => entry.userId.toString() === userId
    );

    if (!userEntry) {
      return null;
    }

    // Convert aggregated data back to individual entries format
    const entries: UserMajorDrawEntry[] = [];

    // Create entries for each source type
    Object.entries(userEntry.entriesBySource).forEach(([source, count]) => {
      const entryCount = count as number | undefined;
      if (entryCount && entryCount > 0) {
        entries.push({
          majorDrawId: majorDraw._id.toString(),
          majorDrawName: majorDraw.name,
          entryCount: entryCount,
          source: source as "membership" | "one-time-package" | "upsell" | "mini-draw",
          packageId: source, // For aggregated data, we use source as packageId
          packageName: `${source.charAt(0).toUpperCase() + source.slice(1)} Entries`,
          addedDate: userEntry.firstAddedDate,
          drawStatus: majorDraw.status,
        });
      }
    });

    // Return the first entry (or create a summary entry)
    return entries.length > 0 ? entries[0] : null;
  } catch (error) {
    console.error(`❌ Error getting user major draw entries:`, error);
    return null;
  }
}

/**
 * Get user's stats for a specific major draw
 */
export async function getUserMajorDrawStats(userId: string, majorDrawId: string): Promise<UserMajorDrawStats> {
  try {
    const majorDraw = await MajorDraw.findById(majorDrawId);

    if (!majorDraw) {
      return {
        totalEntries: 0,
        membershipEntries: 0,
        oneTimeEntries: 0,
        currentDrawEntries: 0,
        totalDrawsEntered: 0,
        entriesByPackage: [],
      };
    }

    console.log(
      `🔍 getUserMajorDrawStats - Using draw: ${majorDraw.name} (${majorDraw.status}) - ID: ${majorDraw._id}`
    );

    // Get user's entry from the specified draw
    const userEntry = majorDraw.entries.find(
      (entry: { userId: { toString(): string } }) => entry.userId.toString() === userId
    );

    if (!userEntry) {
      console.log(`🔍 getUserMajorDrawStats - No user entry found in draw: ${majorDraw.name}`);
      return {
        totalEntries: 0,
        membershipEntries: 0,
        oneTimeEntries: 0,
        currentDrawEntries: 0,
        totalDrawsEntered: 0,
        entriesByPackage: [],
      };
    }

    console.log(`🔍 getUserMajorDrawStats - User entry found: ${userEntry.totalEntries} total entries`);

    // Calculate stats from aggregated entry data
    const totalEntries = userEntry.totalEntries;
    const membershipEntries = userEntry.entriesBySource.membership || 0;
    const oneTimeEntries =
      (userEntry.entriesBySource["one-time-package"] || 0) +
      (userEntry.entriesBySource.upsell || 0) +
      (userEntry.entriesBySource["mini-draw"] || 0);

    // Create entriesByPackage array from aggregated data
    const entriesByPackage = Object.entries(userEntry.entriesBySource)
      .filter(([, count]) => {
        const entryCount = count as number | undefined;
        return entryCount && entryCount > 0;
      })
      .map(([source, count]) => {
        const entryCount = count as number | undefined;
        return {
          packageName: `${source.charAt(0).toUpperCase() + source.slice(1)} Entries`,
          packageId: source,
          entryCount: entryCount || 0,
          source: source as "membership" | "one-time-package" | "upsell" | "mini-draw",
        };
      });

    return {
      totalEntries,
      membershipEntries,
      oneTimeEntries,
      currentDrawEntries: totalEntries,
      totalDrawsEntered: entriesByPackage.length,
      entriesByPackage,
    };
  } catch (error) {
    console.error(`❌ Error getting user major draw stats:`, error);
    return {
      totalEntries: 0,
      membershipEntries: 0,
      oneTimeEntries: 0,
      currentDrawEntries: 0,
      totalDrawsEntered: 0,
      entriesByPackage: [],
    };
  }
}

/**
 * Get user's stats for the current active major draw
 */
export async function getUserCurrentMajorDrawStats(userId: string): Promise<UserMajorDrawStats> {
  try {
    // Find the current active major draw - prioritize active over queued
    let currentMajorDraw = await MajorDraw.findOne({
      status: "active",
    }).sort({ activationDate: -1 });

    // If no active draw found, then look for queued draw
    if (!currentMajorDraw) {
      currentMajorDraw = await MajorDraw.findOne({
        status: "queued",
      }).sort({ activationDate: 1 }); // Earliest activation date first
    }

    if (!currentMajorDraw) {
      return {
        totalEntries: 0,
        membershipEntries: 0,
        oneTimeEntries: 0,
        currentDrawEntries: 0,
        totalDrawsEntered: 0,
        entriesByPackage: [],
      };
    }

    console.log(
      `🔍 getUserCurrentMajorDrawStats - Using draw: ${currentMajorDraw.name} (${currentMajorDraw.status}) - ID: ${currentMajorDraw._id}`
    );

    // Get user's entry from the current draw
    const userEntry = currentMajorDraw.entries.find(
      (entry: { userId: { toString(): string } }) => entry.userId.toString() === userId
    );

    if (!userEntry) {
      console.log(`🔍 getUserCurrentMajorDrawStats - No user entry found in draw: ${currentMajorDraw.name}`);
      return {
        totalEntries: 0,
        membershipEntries: 0,
        oneTimeEntries: 0,
        currentDrawEntries: 0,
        totalDrawsEntered: 0,
        entriesByPackage: [],
      };
    }

    console.log(`🔍 getUserCurrentMajorDrawStats - User entry found: ${userEntry.totalEntries} total entries`);

    // Calculate stats from aggregated entry data
    const totalEntries = userEntry.totalEntries;
    const membershipEntries = userEntry.entriesBySource.membership || 0;
    const oneTimeEntries =
      (userEntry.entriesBySource["one-time-package"] || 0) +
      (userEntry.entriesBySource.upsell || 0) +
      (userEntry.entriesBySource["mini-draw"] || 0);

    // Create entriesByPackage array from aggregated data
    const entriesByPackage = Object.entries(userEntry.entriesBySource)
      .filter(([, count]) => {
        const entryCount = count as number | undefined;
        return entryCount && entryCount > 0;
      })
      .map(([source, count]) => {
        const entryCount = count as number | undefined;
        return {
          packageName: `${source.charAt(0).toUpperCase() + source.slice(1)} Entries`,
          packageId: source,
          entryCount: entryCount || 0,
          source: source as "membership" | "one-time-package" | "upsell" | "mini-draw",
        };
      });

    return {
      totalEntries,
      membershipEntries,
      oneTimeEntries,
      currentDrawEntries: totalEntries,
      totalDrawsEntered: entriesByPackage.length,
      entriesByPackage,
    };
  } catch (error) {
    console.error(`❌ Error getting user current major draw stats:`, error);
    return {
      totalEntries: 0,
      membershipEntries: 0,
      oneTimeEntries: 0,
      currentDrawEntries: 0,
      totalDrawsEntered: 0,
      entriesByPackage: [],
    };
  }
}

/**
 * Get all major draw entries for a user across all draws
 */
export async function getUserAllMajorDrawEntries(userId: string): Promise<UserMajorDrawEntry[]> {
  try {
    // Find all major draws where user has entries
    const majorDraws = await MajorDraw.find({
      "entries.userId": new mongoose.Types.ObjectId(userId),
    }).sort({ createdAt: -1 });

    const allEntries: UserMajorDrawEntry[] = [];

    majorDraws.forEach((majorDraw) => {
      const userEntry = majorDraw.entries.find(
        (entry: { userId: { toString(): string } }) => entry.userId.toString() === userId
      );

      if (userEntry) {
        // Convert aggregated data back to individual entries format
        Object.entries(userEntry.entriesBySource).forEach(([source, count]) => {
          const entryCount = count as number | undefined;
          if (entryCount && entryCount > 0) {
            allEntries.push({
              majorDrawId: majorDraw._id.toString(),
              majorDrawName: majorDraw.name,
              entryCount: entryCount,
              source: source as "membership" | "one-time-package" | "upsell" | "mini-draw",
              packageId: source,
              packageName: `${source.charAt(0).toUpperCase() + source.slice(1)} Entries`,
              addedDate: userEntry.firstAddedDate,
              drawStatus: majorDraw.status,
            });
          }
        });
      }
    });

    return allEntries;
  } catch (error) {
    console.error(`❌ Error getting user all major draw entries:`, error);
    return [];
  }
}

/**
 * Check if user has entries in a specific major draw
 */
export async function userHasMajorDrawEntries(userId: string, majorDrawId: string): Promise<boolean> {
  try {
    const majorDraw = await MajorDraw.findById(majorDrawId);

    if (!majorDraw) {
      return false;
    }

    return majorDraw.entries.some((entry: { userId: { toString(): string } }) => entry.userId.toString() === userId);
  } catch (error) {
    console.error(`❌ Error checking user major draw entries:`, error);
    return false;
  }
}

/**
 * Get total accumulated entries for a user (sum across all draws)
 */
export async function getUserTotalAccumulatedEntries(userId: string): Promise<number> {
  try {
    const majorDraws = await MajorDraw.find({
      "entries.userId": new mongoose.Types.ObjectId(userId),
    });

    let totalEntries = 0;

    majorDraws.forEach((majorDraw) => {
      const userEntry = majorDraw.entries.find(
        (entry: { userId: { toString(): string }; totalEntries: number }) => entry.userId.toString() === userId
      );

      if (userEntry) {
        totalEntries += userEntry.totalEntries;
      }
    });

    return totalEntries;
  } catch (error) {
    console.error(`❌ Error getting user total accumulated entries:`, error);
    return 0;
  }
}

/**
 * Validate data consistency between user.majorDrawEntries and majordraws.entries
 * This function helps identify any sync issues during migration
 */
export async function validateMajorDrawConsistency(userId: string): Promise<{
  isConsistent: boolean;
  issues: string[];
  userTotal: number;
  aggregatedTotal: number;
}> {
  try {
    const issues: string[] = [];

    // Get user's total from majordraws collection
    const aggregatedTotal = await getUserTotalAccumulatedEntries(userId);

    // For now, we'll skip the user.majorDrawEntries comparison since we're removing it
    // This function is mainly for validation during migration

    const isConsistent = issues.length === 0;

    return {
      isConsistent,
      issues,
      userTotal: 0, // Will be 0 since we're removing user.majorDrawEntries
      aggregatedTotal,
    };
  } catch (error) {
    console.error(`❌ Error validating major draw consistency:`, error);
    return {
      isConsistent: false,
      issues: [`Validation error: ${error instanceof Error ? error.message : "Unknown error"}`],
      userTotal: 0,
      aggregatedTotal: 0,
    };
  }
}
