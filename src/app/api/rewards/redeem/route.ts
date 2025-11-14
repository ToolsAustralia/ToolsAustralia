import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "../../../../models/User";
import MajorDraw from "../../../../models/MajorDraw";
import { getPackageById } from "@/data/membershipPackages";
import { getMiniDrawPackageById } from "@/data/miniDrawPackages";
import { reorderQueue } from "../../../../utils/partner-discounts/partner-discount-queue";
import mongoose from "mongoose";
import { guardRewardsEnabled } from "@/lib/rewardsGuard";

/**
 * Helper function to add entries to major draw
 * Simplified version of the addToMajorDraw function from paymentProcessing.ts
 */
async function addToMajorDraw(
  userId: string,
  packageData: { entries: number; packageType: string; packageId?: string; packageName?: string }
): Promise<void> {
  try {
    console.log(`🎯 Adding major draw entries for redemption:`, {
      userId,
      packageData,
    });

    // Find the current active major draw
    const activeMajorDraw = await MajorDraw.findOne({
      status: "active",
      isActive: true,
    });

    if (!activeMajorDraw) {
      console.log(`⚠️ No active major draw found - skipping major draw entry allocation`);
      return;
    }

    console.log(`🎯 Adding entries to major draw: ${activeMajorDraw.name} (status: ${activeMajorDraw.status})`);

    // Determine source type
    let sourceType: "membership" | "one-time-package" | "upsell" | "mini-draw";
    switch (packageData.packageType) {
      case "subscription":
        sourceType = "membership";
        break;
      case "one-time":
        sourceType = "one-time-package";
        break;
      case "upsell":
        sourceType = "upsell";
        break;
      case "mini-draw":
        sourceType = "mini-draw";
        break;
      default:
        sourceType = "one-time-package"; // Default for redeemed packages
    }

    // Add to major draw collection only if package has entries
    if (packageData.entries > 0) {
      const now = new Date();
      const userObjectId = new mongoose.Types.ObjectId(userId);

      // Create entries by source object
      const entriesBySource: {
        membership?: number;
        "one-time-package"?: number;
        upsell?: number;
        "mini-draw"?: number;
      } = {
        membership: 0,
        "one-time-package": 0,
        upsell: 0,
        "mini-draw": 0,
      };
      entriesBySource[sourceType] = packageData.entries;

      // Find existing user entry
      const existingUserEntry = activeMajorDraw.entries.find(
        (entry: { userId: { toString(): string } }) => entry.userId.toString() === userId
      );

      if (existingUserEntry) {
        // Update existing entry
        existingUserEntry.totalEntries += packageData.entries;
        existingUserEntry.entriesBySource[sourceType] =
          (existingUserEntry.entriesBySource[sourceType] || 0) + packageData.entries;
        existingUserEntry.lastUpdatedDate = now;
      } else {
        // Create new entry
        const newEntry = {
          userId: userObjectId,
          totalEntries: packageData.entries,
          entriesBySource,
          firstAddedDate: now,
          lastUpdatedDate: now,
        };
        activeMajorDraw.entries.push(newEntry);
      }

      // Save the major draw
      await activeMajorDraw.save();

      const totalEntries =
        activeMajorDraw.entries.reduce((sum: number, entry: { totalEntries: number }) => sum + entry.totalEntries, 0) ||
        0;

      console.log(`🎯 Major draw entries updated for user ${userId} (draw total: ${totalEntries})`);
    } else {
      console.log(`🎯 No entries to add to major draw (package has 0 entries)`);
    }
  } catch (error) {
    console.error(`❌ ERROR in addToMajorDraw for redemption:`, error);
    // Don't throw - allow redemption to continue even if major draw update fails
  }
}

/**
 * POST /api/rewards/redeem
 * Redeem points for rewards including package claiming
 */
export async function POST(request: NextRequest) {
  const guardResponse = guardRewardsEnabled();
  if (guardResponse) {
    return guardResponse;
  }

  try {
    await connectDB();

    const body = await request.json();
    const { userId, redemptionType, pointsRequired, packageId, description } = body;

    if (!userId || !redemptionType || !pointsRequired) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request parameters",
        },
        { status: 400 }
      );
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "User not found",
        },
        { status: 404 }
      );
    }

    // Validate user has enough points
    if (user.rewardsPoints < pointsRequired) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient points",
        },
        { status: 400 }
      );
    }

    // Generate unique redemption ID
    const redemptionId = `redemption-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Handle different redemption types
    let redemptionData: Record<string, unknown> = {
      redemptionId,
      redemptionType,
      pointsDeducted: pointsRequired,
      redeemedAt: new Date(),
      status: "completed" as const,
    };

    let packageInfo: Record<string, unknown> | null = null;

    if (redemptionType === "package" && packageId) {
      // Handle package claiming with 5x multiplier
      packageInfo = (getPackageById(packageId) || getMiniDrawPackageById(packageId)) as unknown as Record<
        string,
        unknown
      > | null;

      if (!packageInfo) {
        return NextResponse.json(
          {
            success: false,
            error: "Package not found",
          },
          { status: 404 }
        );
      }

      // Verify the points required matches the 5x multiplier
      const expectedPoints = (packageInfo.price as number) * 5;
      if (pointsRequired !== expectedPoints) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid points amount for package",
          },
          { status: 400 }
        );
      }

      // Add package to user's one-time packages
      const packageEntry = {
        packageId: packageInfo._id,
        purchaseDate: new Date(),
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        isActive: true,
        entriesGranted:
          ((packageInfo as unknown as Record<string, unknown>).totalEntries as number) ||
          ((packageInfo as unknown as Record<string, unknown>).entries as number) ||
          0,
      };

      // Prepare partner discount queue item if package includes partner discount benefits
      const partnerDiscountDays = (packageInfo as unknown as Record<string, unknown>).partnerDiscountDays as number;
      const partnerDiscountHours = (packageInfo as unknown as Record<string, unknown>).partnerDiscountHours as number;
      let partnerDiscountQueueItem = null;

      if ((partnerDiscountDays && partnerDiscountDays > 0) || (partnerDiscountHours && partnerDiscountHours > 0)) {
        console.log(
          `🎁 Preparing partner discount queue item for redeemed package: ${partnerDiscountDays || 0} days / ${
            partnerDiscountHours || 0
          } hours access`
        );

        // Determine package type based on the package data
        const packageId = (packageInfo as Record<string, unknown>)._id as string;
        const packageName = (packageInfo as Record<string, unknown>).name as string;
        const packageType = packageId.startsWith("mini-") ? "mini-draw" : "one-time";

        // Create the queue item with 12-month expiry
        const purchaseDate = new Date();
        const expiryDate = new Date(purchaseDate);
        expiryDate.setMonth(expiryDate.getMonth() + 12); // Must be used within 12 months

        partnerDiscountQueueItem = {
          packageId: packageId,
          packageName: packageName,
          packageType: packageType,
          discountDays: partnerDiscountDays || 0,
          discountHours: partnerDiscountHours || (partnerDiscountDays || 0) * 24,
          purchaseDate: purchaseDate,
          expiryDate: expiryDate,
          status: "queued" as const,
          queuePosition: 0, // Will be set properly by reorderQueue
        };

        console.log(`📦 Created partner discount queue item:`, partnerDiscountQueueItem);
      }

      // Prepare the update operation
      const updateOperation: Record<string, unknown> = {
        $inc: {
          rewardsPoints: -pointsRequired,
          accumulatedEntries:
            ((packageInfo as unknown as Record<string, unknown>).totalEntries as number) ||
            ((packageInfo as unknown as Record<string, unknown>).entries as number) ||
            0,
        },
        $push: {
          oneTimePackages: packageEntry,
          redemptionHistory: {
            ...redemptionData,
            packageId: packageInfo._id,
            packageName: packageInfo.name,
            value: packageInfo.price,
            description: description || `Claimed ${packageInfo.name} with points`,
          },
        },
      };

      // Add partner discount queue item to the atomic operation if it exists
      if (partnerDiscountQueueItem) {
        (updateOperation.$push as Record<string, unknown>).partnerDiscountQueue = partnerDiscountQueueItem;
      }

      // Use atomic operations for safety
      await User.findByIdAndUpdate(user._id, updateOperation);

      // If we added a partner discount queue item, we need to set the proper queue position
      if (partnerDiscountQueueItem) {
        // Fetch the updated user to get the latest partnerDiscountQueue
        const updatedUser = await User.findById(user._id);
        if (updatedUser && updatedUser.partnerDiscountQueue) {
          // Call reorderQueue to set proper queue positions
          await reorderQueue(updatedUser);
          await updatedUser.save();
          console.log(`✅ Partner discount queue positions updated for redeemed package`);
        }
      }

      // Add entries to major draw (non-blocking)
      const entriesGranted =
        ((packageInfo as unknown as Record<string, unknown>).totalEntries as number) ||
        ((packageInfo as unknown as Record<string, unknown>).entries as number) ||
        0;

      if (entriesGranted > 0) {
        await addToMajorDraw(user._id.toString(), {
          entries: entriesGranted,
          packageType: "one-time", // Redeemed packages are treated as one-time packages
          packageId: (packageInfo as Record<string, unknown>)._id as string,
          packageName: (packageInfo as Record<string, unknown>).name as string,
        });
      }

      redemptionData = {
        ...redemptionData,
        packageId: packageInfo._id,
        packageName: packageInfo.name,
        value: packageInfo.price,
        description: description || `Claimed ${packageInfo.name} with points`,
      };
    } else {
      // Handle other redemption types (discount, entry, shipping)

      // For now, just deduct points and record redemption
      // TODO: Implement actual discount code generation, entry addition, etc.
      await User.findByIdAndUpdate(user._id, {
        $inc: { rewardsPoints: -pointsRequired },
        $push: {
          redemptionHistory: {
            ...redemptionData,
            value: pointsRequired, // For discounts, this would be the dollar value
            description: description || `Redeemed ${redemptionType} with points`,
          },
        },
      });

      redemptionData = {
        ...redemptionData,
        value: pointsRequired,
        description: description || `Redeemed ${redemptionType} with points`,
      };
    }

    // Generate response message
    let message = "Reward redeemed successfully";
    if (redemptionType === "package") {
      message = `${redemptionData.packageName} claimed successfully!`;
    } else {
      const redemptionMessages = {
        discount: "Discount code generated and applied to your account",
        entry: "Entries added to your wallet",
        shipping: "Free shipping voucher created",
      };
      message = redemptionMessages[redemptionType as keyof typeof redemptionMessages] || message;
    }

    return NextResponse.json({
      success: true,
      data: {
        redemptionId,
        redemptionType,
        pointsDeducted: pointsRequired,
        message,
        ...(redemptionType === "discount" && {
          code: `DISCOUNT-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        }),
        ...(redemptionType === "package" &&
          packageId && {
            packageName: redemptionData.packageName,
            entriesGranted:
              ((packageInfo as unknown as Record<string, unknown>)?.totalEntries as number) ||
              ((packageInfo as unknown as Record<string, unknown>)?.entries as number) ||
              0,
          }),
      },
    });
  } catch (error) {
    console.error("Error redeeming reward:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to redeem reward",
      },
      { status: 500 }
    );
  }
}
