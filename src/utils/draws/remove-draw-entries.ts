/**
 * Draw Entry Removal Utility
 * 
 * Functions to remove entries from Major Draw and Mini Draw collections
 * when refunds or reversals occur.
 * 
 * These functions use atomic operations to ensure data consistency.
 */

import MajorDraw from "@/models/MajorDraw";
import MiniDraw from "@/models/MiniDraw";
import connectDB from "@/lib/mongodb";
import mongoose from "mongoose";

/**
 * Source types for major draw entries.
 * Must match the keys declared in MajorDraw schema `entries.entriesBySource`.
 */
type MajorDrawSourceType =
  | "membership"
  | "one-time-package"
  | "upsell"
  | "mini-draw"
  | "bonus-entry-promo"
  | "promo-link"
  | "cancellation-upsell"
  | "streak";

/**
 * Source types for mini draw entries
 */
type MiniDrawSourceType = "mini-draw-package" | "upsell" | "free-entry" | "bonus-entry-promo" | "promo-link";

/**
 * Remove entries from Major Draw for a specific user.
 *
 * **Always pass `drawId` when the caller knows which draw the entries came from**
 * (e.g. ledger-based refund reversal — `data.grants.drawGrants[].drawId`). When
 * `drawId` is omitted, the function falls back to walking every draw that
 * contains an entry for this user and depleting `sourceType` entries from the
 * oldest forward. That fallback was the root cause of the "refund stole entries
 * from a previous draw" corruption — only use it when the ledger has no drawId.
 *
 * @param userId - User ID whose entries should be removed
 * @param entriesToRemove - Number of entries to remove
 * @param sourceType - Source type of the entries being removed
 * @param drawId - (optional, strongly recommended) Specific major draw to remove from.
 *                 When provided, only this draw is touched; other draws are left alone.
 * @returns Success status
 */
export async function removeMajorDrawEntries(
  userId: string,
  entriesToRemove: number,
  sourceType: MajorDrawSourceType,
  drawId?: string
): Promise<{ success: boolean; error?: string }> {
  console.log(`[refund-reversal] removeMajorDrawEntries called`, {
    userId,
    entriesToRemove,
    sourceType,
    drawId: drawId ?? null,
    scoped: Boolean(drawId),
  });

  try {
    await connectDB();

    if (entriesToRemove <= 0) {
      console.log(`[refund-reversal] no-op: entriesToRemove=${entriesToRemove}`, { userId, sourceType });
      return { success: true };
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Build the draw selector. If drawId is supplied (the safe path used by the
    // ledger-based refund flow), only that draw is considered. Otherwise fall
    // back to "any draw containing this user" — the legacy multi-draw walk that
    // exists only for refunds whose original BenefitsGranted event predated the
    // drawGrants ledger.
    let drawFilter: Record<string, unknown>;
    if (drawId) {
      if (!mongoose.Types.ObjectId.isValid(drawId)) {
        console.error(`[refund-reversal] invalid drawId`, { userId, drawId });
        return { success: false, error: "Invalid drawId" };
      }
      drawFilter = {
        _id: new mongoose.Types.ObjectId(drawId),
        "entries.userId": userObjectId,
      };
    } else {
      drawFilter = { "entries.userId": userObjectId };
    }

    const majorDraws = await MajorDraw.find(drawFilter);

    if (majorDraws.length === 0) {
      console.log(`[refund-reversal] no candidate draws`, { userId, sourceType, drawId: drawId ?? null });
      return { success: true };
    }

    if (!drawId && majorDraws.length > 1) {
      // This branch is the historical danger zone — flag it loudly so any
      // surviving caller without a drawId can be audited.
      console.error(
        `[refund-reversal] WARNING: legacy multi-draw walk active (no drawId). ` +
          `Found ${majorDraws.length} draws containing this user; entries will be ` +
          `consumed from the oldest forward and may decrement an unrelated draw.`,
        { userId, sourceType, drawIds: majorDraws.map((d) => d._id.toString()) }
      );
    }

    // Process each candidate draw (scoped path: exactly 1; legacy path: many).
    for (const majorDraw of majorDraws) {
      const userEntry = majorDraw.entries.find(
        (entry: { userId: mongoose.Types.ObjectId; totalEntries?: number }) =>
          entry.userId.toString() === userId
      );

      if (!userEntry) {
        continue; // User has no entries in this draw
      }

      // Determine how many entries to remove from this draw
      const entriesFromSource = userEntry.entriesBySource[sourceType] || 0;
      const entriesToRemoveFromDraw = Math.min(entriesToRemove, entriesFromSource);

      if (entriesToRemoveFromDraw <= 0) {
        console.log(`[refund-reversal] skip draw — no ${sourceType} entries to remove`, {
          userId,
          drawId: majorDraw._id.toString(),
          drawName: majorDraw.name,
          sourceType,
          entriesFromSource,
        });
        continue;
      }

      // Policy: still allow removal even when the draw is frozen/completed.
      // Refunds must reverse benefits regardless of draw lifecycle state.
      const newTotalEntries = userEntry.totalEntries - entriesToRemoveFromDraw;

      if (newTotalEntries <= 0) {
        await MajorDraw.updateOne(
          { _id: majorDraw._id },
          { $pull: { entries: { userId: userObjectId } } }
        );
        console.log(`[refund-reversal] removed entire user entry`, {
          userId,
          drawId: majorDraw._id.toString(),
          drawName: majorDraw.name,
          removedFromSource: entriesToRemoveFromDraw,
          sourceType,
        });
      } else {
        await MajorDraw.updateOne(
          { _id: majorDraw._id, "entries.userId": userObjectId },
          {
            $inc: {
              "entries.$.totalEntries": -entriesToRemoveFromDraw,
              [`entries.$.entriesBySource.${sourceType}`]: -entriesToRemoveFromDraw,
            },
            $set: { "entries.$.lastUpdatedDate": new Date() },
          }
        );
        console.log(`[refund-reversal] decremented user entry`, {
          userId,
          drawId: majorDraw._id.toString(),
          drawName: majorDraw.name,
          removedFromSource: entriesToRemoveFromDraw,
          sourceType,
          newTotalEntries,
        });
      }

      // Recompute draw.totalEntries since updateOne bypasses pre-save middleware.
      const updatedDraw = await MajorDraw.findById(majorDraw._id);
      if (updatedDraw) {
        const totalEntries = (updatedDraw.entries as Array<{ totalEntries: number }>).reduce(
          (sum, entry) => sum + entry.totalEntries,
          0
        );
        await MajorDraw.updateOne({ _id: majorDraw._id }, { $set: { totalEntries } });
      }

      entriesToRemove -= entriesToRemoveFromDraw;
      if (entriesToRemove <= 0) break;
    }

    if (entriesToRemove > 0) {
      console.error(
        `[refund-reversal] FAILED to fully remove entries — ${entriesToRemove} remaining after walking all candidate draws`,
        { userId, sourceType, drawId: drawId ?? null }
      );
    }
    return { success: true };
  } catch (error) {
    console.error(`❌ ERROR in removeMajorDrawEntries:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Remove entries from Mini Draw for a specific user
 * 
 * @param userId - User ID whose entries should be removed
 * @param miniDrawId - Mini Draw ID to remove entries from
 * @param entriesToRemove - Number of entries to remove
 * @param sourceType - Source type of the entries being removed
 * @returns Success status
 */
export async function removeMiniDrawEntries(
  userId: string,
  miniDrawId: string,
  entriesToRemove: number,
  sourceType: MiniDrawSourceType
): Promise<{ success: boolean; error?: string }> {
  // console.log(`🎲 removeMiniDrawEntries called:`, {
  //   userId,
  //   miniDrawId,
  //   entriesToRemove,
  //   sourceType,
  // });

  try {
    await connectDB();

    if (entriesToRemove <= 0) {
      // console.log(`⚠️ No entries to remove (${entriesToRemove})`);
      return { success: true };
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(miniDrawId)) {
      console.error(`❌ Invalid miniDrawId: ${miniDrawId}`);
      return {
        success: false,
        error: "Invalid mini draw ID",
      };
    }

    const miniDrawObjectId = new mongoose.Types.ObjectId(miniDrawId);

    // Find the mini draw
    const miniDraw = await MiniDraw.findById(miniDrawObjectId);
    if (!miniDraw) {
      console.error(`❌ Mini draw ${miniDrawId} not found`);
      return {
        success: false,
        error: "Mini draw not found",
      };
    }

    // Find user entry in this mini draw
    const userEntry = miniDraw.entries.find(
      (entry: { userId: mongoose.Types.ObjectId; totalEntries?: number }) =>
        entry.userId.toString() === userId
    );

    if (!userEntry) {
      // console.log(`⚠️ User ${userId} has no entries in mini draw ${miniDrawId}`);
      return { success: true };
    }

    // Determine how many entries to remove from this source
    const entriesFromSource = userEntry.entriesBySource[sourceType] || 0;
    const entriesToRemoveFromDraw = Math.min(entriesToRemove, entriesFromSource);

    if (entriesToRemoveFromDraw <= 0) {
      // console.log(`⚠️ No entries of source type ${sourceType} to remove`);
      return { success: true };
    }

    // console.log(`🎲 Removing ${entriesToRemoveFromDraw} entries from ${miniDraw.name} (source: ${sourceType})`);

    // Check if draw is completed or cancelled
    // Policy decision: We'll still allow removal even if completed/cancelled
    // This is for refund processing which should reverse benefits regardless
    if (miniDraw.status === "completed" || miniDraw.status === "cancelled") {
      // console.log(`⚠️ Mini draw ${miniDraw.name} is ${miniDraw.status} - proceeding with removal anyway for refund`);
    }

    const newTotalEntries = userEntry.totalEntries - entriesToRemoveFromDraw;

    if (newTotalEntries <= 0) {
      // Remove the entire entry if no entries remain
      await MiniDraw.updateOne(
        { _id: miniDrawObjectId },
        {
          $pull: {
            entries: {
              userId: new mongoose.Types.ObjectId(userId),
            },
          },
        }
      );
      // console.log(`✅ Removed entire user entry from ${miniDraw.name}`);
    } else {
      // Update the entry with reduced counts
      await MiniDraw.updateOne(
        {
          _id: miniDrawObjectId,
          "entries.userId": new mongoose.Types.ObjectId(userId),
        },
        {
          $inc: {
            "entries.$.totalEntries": -entriesToRemoveFromDraw,
            [`entries.$.entriesBySource.${sourceType}`]: -entriesToRemoveFromDraw,
          },
          $set: {
            "entries.$.lastUpdatedDate": new Date(),
          },
        }
      );
      // console.log(`✅ Updated user entry in ${miniDraw.name}: removed ${entriesToRemoveFromDraw} ${sourceType} entries`);
    }

    // Update totalEntries for the mini draw
    const updatedMiniDraw = await MiniDraw.findById(miniDrawObjectId);
    if (updatedMiniDraw) {
      const totalEntries = (updatedMiniDraw.entries as Array<{ totalEntries: number }>).reduce(
        (sum, entry) => sum + entry.totalEntries,
        0
      );
      await MiniDraw.updateOne(
        { _id: miniDrawObjectId },
        { $set: { totalEntries } }
      );
      // console.log(`✅ Updated total entries for ${miniDraw.name}: ${totalEntries}`);
    }

    // Update user's mini draw participation tracking
    await removeFromUserMiniDrawParticipation(userId, miniDrawObjectId, entriesToRemoveFromDraw, sourceType);

    // console.log(`✅ Successfully removed mini draw entries for user ${userId}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ ERROR in removeMiniDrawEntries:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Remove entries from user's mini draw participation tracking
 * 
 * @param userId - User ID
 * @param miniDrawId - Mini Draw ObjectId
 * @param entriesToRemove - Number of entries to remove
 * @param sourceType - Source type of entries
 */
async function removeFromUserMiniDrawParticipation(
  userId: string,
  miniDrawId: mongoose.Types.ObjectId,
  entriesToRemove: number,
  sourceType: MiniDrawSourceType
): Promise<void> {
  try {
    await connectDB();
    const User = (await import("@/models/User")).default;

    // Update user's mini draw participation
    await User.updateOne(
      {
        _id: new mongoose.Types.ObjectId(userId),
        "miniDrawParticipation.miniDrawId": miniDrawId,
      },
      {
        $inc: {
          "miniDrawParticipation.$.totalEntries": -entriesToRemove,
          [`miniDrawParticipation.$.entriesBySource.${sourceType}`]: -entriesToRemove,
        },
        $set: {
          "miniDrawParticipation.$.lastUpdatedDate": new Date(),
        },
      }
    );

    // console.log(`✅ Updated user mini draw participation tracking`);
  } catch (error) {
    console.error(`❌ Error updating user mini draw participation:`, error);
    // Non-blocking - log but continue
  }
}

