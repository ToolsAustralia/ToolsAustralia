/**
 * Draw Entry Removal Utility
 * 
 * Functions to remove entries from Major Draw and Mini Draw collections
 * when refunds or reversals occur.
 * 
 * These functions use atomic operations to ensure data consistency.
 */

import MajorDraw, { IMajorDraw } from "@/models/MajorDraw";
import MiniDraw, { IMiniDraw } from "@/models/MiniDraw";
import connectDB from "@/lib/mongodb";
import mongoose from "mongoose";

/**
 * Source types for major draw entries
 */
type MajorDrawSourceType = "membership" | "one-time-package" | "upsell" | "mini-draw";

/**
 * Source types for mini draw entries
 */
type MiniDrawSourceType = "mini-draw-package" | "upsell" | "free-entry";

/**
 * Remove entries from Major Draw for a specific user
 * 
 * @param userId - User ID whose entries should be removed
 * @param entriesToRemove - Number of entries to remove
 * @param sourceType - Source type of the entries being removed
 * @returns Success status
 */
export async function removeMajorDrawEntries(
  userId: string,
  entriesToRemove: number,
  sourceType: MajorDrawSourceType
): Promise<{ success: boolean; error?: string }> {
  // console.log(`🎯 removeMajorDrawEntries called:`, {
  //   userId,
  //   entriesToRemove,
  //   sourceType,
  // });

  try {
    await connectDB();

    if (entriesToRemove <= 0) {
      // console.log(`⚠️ No entries to remove (${entriesToRemove})`);
      return { success: true };
    }

    // Find all major draws that have entries for this user
    const majorDraws = await MajorDraw.find({
      "entries.userId": new mongoose.Types.ObjectId(userId),
    });

    if (majorDraws.length === 0) {
      // console.log(`⚠️ No major draws found with entries for user ${userId}`);
      return { success: true };
    }

    // Process each major draw
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
        continue; // No entries of this source type in this draw
      }

      // console.log(`🎯 Removing ${entriesToRemoveFromDraw} entries from ${majorDraw.name} (source: ${sourceType})`);

      // Check if draw is frozen or completed
      // Policy decision: We'll still allow removal even if frozen/completed
      // This is for refund processing which should reverse benefits regardless
      if (majorDraw.status === "frozen" || majorDraw.status === "completed") {
        // console.log(`⚠️ Draw ${majorDraw.name} is ${majorDraw.status} - proceeding with removal anyway for refund`);
      }

      // Update the user's entry in this draw atomically
      const remainingEntriesFromSource = entriesFromSource - entriesToRemoveFromDraw;
      const newTotalEntries = userEntry.totalEntries - entriesToRemoveFromDraw;

      if (newTotalEntries <= 0) {
        // Remove the entire entry if no entries remain
        await MajorDraw.updateOne(
          { _id: majorDraw._id },
          {
            $pull: {
              entries: {
                userId: new mongoose.Types.ObjectId(userId),
              },
            },
          }
        );
        // console.log(`✅ Removed entire user entry from ${majorDraw.name}`);
      } else {
        // Update the entry with reduced counts
        await MajorDraw.updateOne(
          {
            _id: majorDraw._id,
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
        // console.log(`✅ Updated user entry in ${majorDraw.name}: removed ${entriesToRemoveFromDraw} ${sourceType} entries`);
      }

      // Update totalEntries for the draw
      const updatedDraw = await MajorDraw.findById(majorDraw._id);
      if (updatedDraw) {
        const totalEntries = (updatedDraw.entries as Array<{ totalEntries: number }>).reduce(
          (sum, entry) => sum + entry.totalEntries,
          0
        );
        await MajorDraw.updateOne(
          { _id: majorDraw._id },
          { $set: { totalEntries } }
        );
        // console.log(`✅ Updated total entries for ${majorDraw.name}: ${totalEntries}`);
      }

      // Reduce remaining entries to remove
      entriesToRemove -= entriesToRemoveFromDraw;
      if (entriesToRemove <= 0) {
        break; // All entries removed
      }
    }

    // console.log(`✅ Successfully removed major draw entries for user ${userId}`);
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

