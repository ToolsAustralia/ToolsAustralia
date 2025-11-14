import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import MajorDraw from "@/models/MajorDraw";
import mongoose from "mongoose";

/**
 * POST /api/cancellation-upsell/redeem
 * Redeem 100 free entries for users trying to cancel their subscription
 * This is a one-time offer to encourage retention
 */
export async function POST() {
  try {
    await connectDB();

    // Get the authenticated user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    console.log(`🎁 Processing cancellation upsell redemption for user: ${session.user.id}`);

    // Get the user
    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if user has already redeemed this offer
    if (user.cancellationUpsellRedeemed) {
      return NextResponse.json({ error: "You have already redeemed this offer" }, { status: 400 });
    }

    // Check if user has an active subscription (required for this offer)
    const hasActiveSubscription = user.subscription?.isActive;
    const hasActiveOneTimePackages = user.oneTimePackages?.some((pkg: { isActive: boolean }) => pkg.isActive);

    if (!hasActiveSubscription && !hasActiveOneTimePackages) {
      return NextResponse.json(
        { error: "No active membership found. This offer is only available to active members." },
        { status: 400 }
      );
    }

    const entriesToAdd = 100;

    // Add entries to user's accumulated entries
    await User.findByIdAndUpdate(
      user._id,
      {
        $inc: {
          accumulatedEntries: entriesToAdd,
        },
        $set: {
          cancellationUpsellRedeemed: true,
          cancellationUpsellRedeemedAt: new Date(),
        },
      },
      { new: false }
    );

    console.log(`🎫 Added ${entriesToAdd} entries to user ${user._id} (cancellation upsell)`);

    // Add entries to major draw
    await addToMajorDraw(user._id.toString(), {
      entries: entriesToAdd,
      packageType: "cancellation-upsell",
      packageId: "cancellation-upsell-100-entries",
      packageName: "Cancellation Retention Offer",
    });

    console.log(`🎯 Added ${entriesToAdd} entries to major draw for user ${user._id}`);

    return NextResponse.json({
      success: true,
      message: "100 free entries successfully added to your account",
      data: {
        entriesAdded: entriesToAdd,
        totalEntries: (user.accumulatedEntries || 0) + entriesToAdd,
      },
    });
  } catch (error) {
    console.error("Cancellation upsell redemption error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to redeem free entries. Please try again.",
      },
      { status: 500 }
    );
  }
}

/**
 * Add entries to the active major draw
 * Reuses the same logic as other entry systems
 */
async function addToMajorDraw(
  userId: string,
  packageData: { entries: number; packageType: string; packageId?: string; packageName?: string }
): Promise<void> {
  try {
    // Find the active major draw
    const activeMajorDraw = await MajorDraw.findOne({ isActive: true });
    if (!activeMajorDraw) {
      console.log("No active major draw found - skipping major draw entry addition");
      return;
    }

    const now = new Date();
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const sourceType = packageData.packageType as
      | "membership"
      | "one-time-package"
      | "upsell"
      | "mini-draw"
      | "cancellation-upsell";

    // Create entries by source object
    const entriesBySource: {
      membership?: number;
      "one-time-package"?: number;
      upsell?: number;
      "mini-draw"?: number;
      "cancellation-upsell"?: number;
    } = {
      membership: 0,
      "one-time-package": 0,
      upsell: 0,
      "mini-draw": 0,
      "cancellation-upsell": 0,
    };
    entriesBySource[sourceType] = packageData.entries;

    // Find existing user entry
    const existingUserEntry = activeMajorDraw.entries.find(
      (entry: { userId: { toString(): string } }) => entry.userId.toString() === userId
    );

    if (existingUserEntry) {
      // Update existing entry
      await MajorDraw.updateOne(
        {
          _id: activeMajorDraw._id,
          "entries.userId": userObjectId,
        },
        {
          $inc: {
            "entries.$.totalEntries": packageData.entries,
            [`entries.$.entriesBySource.${sourceType}`]: packageData.entries,
          },
          $set: {
            "entries.$.lastUpdatedDate": now,
          },
        }
      );
      console.log(`🎯 Updated existing major draw entry for user ${userId} (+${packageData.entries} ${sourceType})`);
    } else {
      // Create new entry
      const newEntry = {
        userId: userObjectId,
        totalEntries: packageData.entries,
        entriesBySource,
        firstAddedDate: now,
        lastUpdatedDate: now,
      };

      await MajorDraw.updateOne({ _id: activeMajorDraw._id }, { $push: { entries: newEntry } });
      console.log(`🎯 Created new major draw entry for user ${userId} (+${packageData.entries} ${sourceType})`);
    }

    // Get updated major draw for total calculation
    const updatedMajorDraw = await MajorDraw.findById(activeMajorDraw._id);
    const totalEntries =
      updatedMajorDraw?.entries.reduce((sum: number, entry: { totalEntries: number }) => sum + entry.totalEntries, 0) ||
      0;

    // ✅ CRITICAL: Update totalEntries field since updateOne() bypasses pre-save middleware
    if (updatedMajorDraw && totalEntries !== updatedMajorDraw.totalEntries) {
      await MajorDraw.updateOne({ _id: activeMajorDraw._id }, { $set: { totalEntries } });
    }

    console.log(`🎯 Major draw entries updated for user ${userId} (draw total: ${totalEntries})`);
  } catch (error) {
    console.error(`❌ ERROR in addToMajorDraw for cancellation upsell:`, error);
    // Don't throw - allow redemption to continue even if major draw update fails
  }
}
