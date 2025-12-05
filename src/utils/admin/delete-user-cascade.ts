/**
 * User Cascade Deletion Utility
 *
 * Permanently deletes a user and all associated references across all collections.
 * This is a hard delete operation - the user and all related data will be permanently removed.
 *
 * IMPORTANT: This function should only be called after:
 * 1. Confirming deletion with admin
 * 2. Canceling active Stripe subscriptions
 * 3. Creating a deletion record for audit trail
 */

import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import MajorDraw from "@/models/MajorDraw";
import MiniDraw from "@/models/MiniDraw";
import AffiliateCommission from "@/models/AffiliateCommission";
import PaymentEvent from "@/models/PaymentEvent";
import Order from "@/models/Order";
import Winner from "@/models/Winner";
import ReferralEvent from "@/models/ReferralEvent";
import TicketEntry from "@/models/TicketEntry";
import mongoose from "mongoose";
import { DeletionSummary } from "./get-user-deletion-summary";

/**
 * Result of cascade deletion
 */
export interface CascadeDeletionResult {
  success: boolean;
  error?: string;
  deletionSummary: DeletionSummary;
  cleanupReport: {
    majorDrawEntriesRemoved: number;
    miniDrawEntriesRemoved: number;
    affiliateCommissionsDeleted: number;
    paymentEventsDeleted: number;
    ordersDeleted: number;
    winnersDeleted: number;
    referralEventsDeleted: number;
    ticketEntriesDeleted: number;
  };
}

/**
 * Delete user with cascade cleanup of all references
 *
 * @param userId - User ID to delete
 * @returns Deletion result with cleanup report
 */
export async function deleteUserWithCascade(userId: string): Promise<CascadeDeletionResult> {
  // console.log(`🗑️ Starting cascade deletion for user: ${userId}`);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    await connectDB();

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid user ID");
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Get user first to verify existence
    const user = await User.findById(userObjectId).session(session);
    if (!user) {
      throw new Error("User not found");
    }

    // Initialize cleanup report
    const cleanupReport = {
      majorDrawEntriesRemoved: 0,
      miniDrawEntriesRemoved: 0,
      affiliateCommissionsDeleted: 0,
      paymentEventsDeleted: 0,
      ordersDeleted: 0,
      winnersDeleted: 0,
      referralEventsDeleted: 0,
      ticketEntriesDeleted: 0,
    };

    // 1. Remove entries from Major Draw and clear winner if applicable
    // console.log(`🎯 Cleaning up Major Draw entries...`);
    const majorDrawsWithEntries = await MajorDraw.find({
      "entries.userId": userObjectId,
    }).session(session);

    for (const majorDraw of majorDrawsWithEntries) {
      const userEntry = majorDraw.entries.find(
        (entry: { userId: { toString: () => string }; totalEntries?: number }) => entry.userId.toString() === userId
      );
      if (userEntry) {
        cleanupReport.majorDrawEntriesRemoved += userEntry.totalEntries || 0;
      }

      // Remove user entry
      await MajorDraw.updateOne(
        { _id: majorDraw._id },
        {
          $pull: { entries: { userId: userObjectId } },
        },
        { session }
      );

      // Clear winner if user is the winner
      if (majorDraw.winner?.userId?.toString() === userId) {
        await MajorDraw.updateOne(
          { _id: majorDraw._id },
          {
            $unset: { "winner.userId": "" },
          },
          { session }
        );
      }

      // Update totalEntries
      const updatedDraw = await MajorDraw.findById(majorDraw._id).session(session);
      if (updatedDraw) {
        const totalEntries = (updatedDraw.entries as Array<{ totalEntries: number }>).reduce(
          (sum: number, entry: { totalEntries: number }) => sum + entry.totalEntries,
          0
        );
        await MajorDraw.updateOne({ _id: majorDraw._id }, { $set: { totalEntries } }, { session });
      }
    }

    // 2. Remove entries from Mini Draw and clear winner if applicable
    // console.log(`🎲 Cleaning up Mini Draw entries...`);
    const miniDrawsWithEntries = await MiniDraw.find({
      "entries.userId": userObjectId,
    }).session(session);

    for (const miniDraw of miniDrawsWithEntries) {
      const userEntry = miniDraw.entries.find(
        (entry: { userId: { toString: () => string }; totalEntries?: number }) => entry.userId.toString() === userId
      );
      if (userEntry) {
        cleanupReport.miniDrawEntriesRemoved += userEntry.totalEntries || 0;
      }

      // Remove user entry
      await MiniDraw.updateOne(
        { _id: miniDraw._id },
        {
          $pull: { entries: { userId: userObjectId } },
        },
        { session }
      );

      // Clear winner if user is the winner
      if (miniDraw.winner?.userId?.toString() === userId) {
        await MiniDraw.updateOne(
          { _id: miniDraw._id },
          {
            $unset: { "winner.userId": "" },
          },
          { session }
        );
      }

      // Update totalEntries
      const updatedMiniDraw = await MiniDraw.findById(miniDraw._id).session(session);
      if (updatedMiniDraw) {
        const totalEntries = (updatedMiniDraw.entries as Array<{ totalEntries: number }>).reduce(
          (sum: number, entry: { totalEntries: number }) => sum + entry.totalEntries,
          0
        );
        await MiniDraw.updateOne({ _id: miniDraw._id }, { $set: { totalEntries } }, { session });
      }
    }

    // 3. Delete affiliate commissions
    // console.log(`💰 Deleting affiliate commissions...`);
    const affiliateCommissionsResult = await AffiliateCommission.deleteMany(
      { referredUserId: userObjectId },
      { session }
    );
    cleanupReport.affiliateCommissionsDeleted = affiliateCommissionsResult.deletedCount || 0;

    // 4. Delete payment events
    // console.log(`💳 Deleting payment events...`);
    const paymentEventsResult = await PaymentEvent.deleteMany({ userId: userObjectId }, { session });
    cleanupReport.paymentEventsDeleted = paymentEventsResult.deletedCount || 0;

    // 5. Delete orders
    // console.log(`📦 Deleting orders...`);
    const ordersResult = await Order.deleteMany({ user: userObjectId }, { session });
    cleanupReport.ordersDeleted = ordersResult.deletedCount || 0;

    // 6. Delete winners
    // console.log(`🏆 Deleting winners...`);
    const winnersResult = await Winner.deleteMany({ userId: userObjectId }, { session });
    cleanupReport.winnersDeleted = winnersResult.deletedCount || 0;

    // 7. Delete referral events (both as referrer and as invitee)
    // console.log(`🎁 Deleting referral events...`);
    const referralEventsAsReferrerResult = await ReferralEvent.deleteMany({ referrerId: userObjectId }, { session });
    const referralEventsAsInviteeResult = await ReferralEvent.deleteMany({ inviteeUserId: userObjectId }, { session });
    cleanupReport.referralEventsDeleted =
      (referralEventsAsReferrerResult.deletedCount || 0) + (referralEventsAsInviteeResult.deletedCount || 0);

    // 8. Delete ticket entries
    // console.log(`🎫 Deleting ticket entries...`);
    const ticketEntriesResult = await TicketEntry.deleteMany({ userId: userObjectId }, { session });
    cleanupReport.ticketEntriesDeleted = ticketEntriesResult.deletedCount || 0;

    // 9. Delete the user document (hard delete)
    // console.log(`👤 Deleting user document...`);
    await User.deleteOne({ _id: userObjectId }, { session });

    // Commit transaction
    await session.commitTransaction();
    // console.log(`✅ Cascade deletion completed successfully for user: ${userId}`);

    // Build deletion summary for response
    const deletionSummary: DeletionSummary = {
      majorDrawEntries: cleanupReport.majorDrawEntriesRemoved,
      miniDrawEntries: cleanupReport.miniDrawEntriesRemoved,
      affiliateCommissions: cleanupReport.affiliateCommissionsDeleted,
      paymentEvents: cleanupReport.paymentEventsDeleted,
      orders: cleanupReport.ordersDeleted,
      winners: cleanupReport.winnersDeleted,
      referralEvents: {
        asReferrer: referralEventsAsReferrerResult.deletedCount || 0,
        asInvitee: referralEventsAsInviteeResult.deletedCount || 0,
        total: cleanupReport.referralEventsDeleted,
      },
      ticketEntries: cleanupReport.ticketEntriesDeleted,
      warnings: {
        hasActiveSubscription: false, // Already handled before deletion
        isWinner: cleanupReport.winnersDeleted > 0,
      },
    };

    return {
      success: true,
      deletionSummary,
      cleanupReport,
    };
  } catch (error) {
    // Rollback transaction on error
    await session.abortTransaction();
    console.error(`❌ Error in cascade deletion:`, error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
      deletionSummary: {
        majorDrawEntries: 0,
        miniDrawEntries: 0,
        affiliateCommissions: 0,
        paymentEvents: 0,
        orders: 0,
        winners: 0,
        referralEvents: { asReferrer: 0, asInvitee: 0, total: 0 },
        ticketEntries: 0,
        warnings: {
          hasActiveSubscription: false,
          isWinner: false,
        },
      },
      cleanupReport: {
        majorDrawEntriesRemoved: 0,
        miniDrawEntriesRemoved: 0,
        affiliateCommissionsDeleted: 0,
        paymentEventsDeleted: 0,
        ordersDeleted: 0,
        winnersDeleted: 0,
        referralEventsDeleted: 0,
        ticketEntriesDeleted: 0,
      },
    };
  } finally {
    session.endSession();
  }
}
