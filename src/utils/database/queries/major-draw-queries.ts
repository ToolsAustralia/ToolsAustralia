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
 * Shape returned by the projected entry query below — only the caller's single
 * entry subdocument (entries[0]), never the whole entries[] array.
 */
type ProjectedUserEntryDraw = {
  _id: mongoose.Types.ObjectId;
  entries?: Array<{
    userId: mongoose.Types.ObjectId;
    totalEntries: number;
    entriesBySource: Record<string, number | undefined>;
    firstAddedDate: Date;
    lastUpdatedDate: Date;
  }>;
};

/**
 * Get user's stats for a specific major draw.
 *
 * Loads ONLY the caller's entry subdocument via a positional `$elemMatch`
 * projection + `.lean()`, instead of pulling the entire (unbounded) `entries[]`
 * array and scanning it in JS. `entries[]` grows one element per participating
 * user across a month-long shared draw, so on this hot, frequently-polled path
 * the old full-document load meant multi-MB of egress + Mongoose hydration per
 * request that got monotonically worse as the draw filled. The
 * `{'entries.userId': 1}` index (MajorDraw.ts) backs the match.
 */
export async function getUserMajorDrawStats(userId: string, majorDrawId: string): Promise<UserMajorDrawStats> {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return {
        totalEntries: 0,
        membershipEntries: 0,
        oneTimeEntries: 0,
        currentDrawEntries: 0,
        totalDrawsEntered: 0,
        entriesByPackage: [],
      };
    }

    const majorDraw = await MajorDraw.findById(majorDrawId, {
      entries: { $elemMatch: { userId: new mongoose.Types.ObjectId(userId) } },
    }).lean<ProjectedUserEntryDraw | null>();

    const userEntry = majorDraw?.entries?.[0];

    if (!userEntry) {
      return {
        totalEntries: 0,
        membershipEntries: 0,
        oneTimeEntries: 0,
        currentDrawEntries: 0,
        totalDrawsEntered: 0,
        entriesByPackage: [],
      };
    }

    // Calculate stats from aggregated entry data
    const totalEntries = userEntry.totalEntries;
    const membershipEntries = userEntry.entriesBySource.membership || 0;
    const oneTimeEntries =
      (userEntry.entriesBySource["one-time-package"] || 0) +
      (userEntry.entriesBySource.upsell || 0) +
      (userEntry.entriesBySource["mini-draw"] || 0) +
      (userEntry.entriesBySource.referral || 0) +
      (userEntry.entriesBySource["bonus-entry-promo"] || 0) +
      (userEntry.entriesBySource["cancellation-upsell"] || 0) +
      (userEntry.entriesBySource["promo-link"] || 0);

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
 * Count unique participants (entries[].length) for a draw WITHOUT loading the
 * unbounded entries[] array. A server-side `$size` returns only an integer, so
 * the participant array never crosses the wire — replaces the old
 * `majorDraw.entries.length` read on the hot /api/major-draw display path.
 */
export async function getMajorDrawParticipantCount(
  majorDrawId: string | { toString(): string }
): Promise<number> {
  try {
    const id = typeof majorDrawId === "string" ? majorDrawId : majorDrawId.toString();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return 0;
    }

    const result = await MajorDraw.aggregate<{ count: number }>([
      { $match: { _id: new mongoose.Types.ObjectId(id) } },
      { $project: { count: { $size: { $ifNull: ["$entries", []] } } } },
    ]);

    return result[0]?.count ?? 0;
  } catch (error) {
    console.error(`❌ Error getting major draw participant count:`, error);
    return 0;
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

    // console.log(
    //   `🔍 getUserCurrentMajorDrawStats - Using draw: ${currentMajorDraw.name} (${currentMajorDraw.status}) - ID: ${currentMajorDraw._id}`
    // );

    // Get user's entry from the current draw
    const userEntry = currentMajorDraw.entries.find(
      (entry: { userId: { toString(): string } }) => entry.userId.toString() === userId
    );

    if (!userEntry) {
      // console.log(`🔍 getUserCurrentMajorDrawStats - No user entry found in draw: ${currentMajorDraw.name}`);
      return {
        totalEntries: 0,
        membershipEntries: 0,
        oneTimeEntries: 0,
        currentDrawEntries: 0,
        totalDrawsEntered: 0,
        entriesByPackage: [],
      };
    }

    // console.log(`🔍 getUserCurrentMajorDrawStats - User entry found: ${userEntry.totalEntries} total entries`);

    // Calculate stats from aggregated entry data
    const totalEntries = userEntry.totalEntries;
    const membershipEntries = userEntry.entriesBySource.membership || 0;
    const oneTimeEntries =
      (userEntry.entriesBySource["one-time-package"] || 0) +
      (userEntry.entriesBySource.upsell || 0) +
      (userEntry.entriesBySource["mini-draw"] || 0) +
      (userEntry.entriesBySource.referral || 0) +
      (userEntry.entriesBySource["bonus-entry-promo"] || 0) +
      (userEntry.entriesBySource["cancellation-upsell"] || 0) +
      (userEntry.entriesBySource["promo-link"] || 0);

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
 * Get all major draw entries for a user across all draws.
 *
 * Projects ONLY the caller's matched entry from each draw (positional `$`) +
 * `.lean()`, instead of loading every matched draw's full `entries[]` array and
 * scanning it in JS. The `{'entries.userId': 1}` index selects the draws and the
 * positional operator returns just the user's element per draw — so a user who
 * has entered N draws transfers N small subdocs, not N full participant arrays.
 * See docs/draws/gotchas.md → "Read-path amplification".
 */
export async function getUserAllMajorDrawEntries(userId: string): Promise<UserMajorDrawEntry[]> {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return [];
    }

    const majorDraws = await MajorDraw.find(
      { "entries.userId": new mongoose.Types.ObjectId(userId) },
      { "entries.$": 1, name: 1, status: 1 }
    )
      .sort({ createdAt: -1 })
      .lean<
        Array<{
          _id: mongoose.Types.ObjectId;
          name: string;
          status: string;
          entries?: Array<{ entriesBySource: Record<string, number | undefined>; firstAddedDate: Date }>;
        }>
      >();

    const allEntries: UserMajorDrawEntry[] = [];

    majorDraws.forEach((majorDraw) => {
      const userEntry = majorDraw.entries?.[0];
      if (!userEntry) return;

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
            drawStatus: majorDraw.status as UserMajorDrawEntry["drawStatus"],
          });
        }
      });
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
