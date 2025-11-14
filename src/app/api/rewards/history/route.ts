import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import User from "../../../../models/User";
import ReferralEvent from "@/models/ReferralEvent";
import { REFERRAL_CONSTANTS } from "@/lib/referral";
import { getPackageById } from "@/data/membershipPackages";
import { getMiniDrawPackageById } from "@/data/miniDrawPackages";
import { getUpsellPackageById } from "@/data/upsellPackages";
import { guardRewardsEnabled } from "@/lib/rewardsGuard";

// Type definitions for user data
interface UserPackage {
  packageId: string;
  purchaseDate: Date;
  startDate?: Date;
  endDate?: Date;
  isActive: boolean;
  entriesGranted?: number;
}

interface UserUpsell {
  offerId: string;
  offerTitle: string;
  entriesAdded: number;
  amountPaid: number;
  purchaseDate: Date;
}

interface UserRedemption {
  redemptionId: string;
  redemptionType: string;
  packageId?: string;
  packageName?: string;
  pointsDeducted: number;
  value: number;
  description: string;
  redeemedAt: Date;
  status: string;
}

/**
 * GET /api/rewards/history
 * Get comprehensive rewards history including all purchase types and redemptions
 */
export async function GET(request: NextRequest) {
  const guardResponse = guardRewardsEnabled();
  if (guardResponse) {
    return guardResponse;
  }

  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ success: false, error: "User ID is required" }, { status: 400 });
    }

    // Find user with all purchase data
    const user = await User.findById(userId).lean();
    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    const rewardsHistory: Array<{
      id: string;
      type: "earned" | "redeemed";
      description: string;
      points: number;
      date: Date;
      source: string;
      category: "subscription" | "one-time" | "mini-draw" | "upsell" | "shop" | "redemption" | "referral" | "bonus";
      details?: Record<string, unknown>;
    }> = [];

    // Helper function to add history entry
    const addHistoryEntry = (
      id: string,
      type: "earned" | "redeemed",
      description: string,
      points: number,
      date: Date,
      source: string,
      category: "subscription" | "one-time" | "mini-draw" | "upsell" | "shop" | "redemption" | "referral" | "bonus",
      details?: Record<string, unknown>
    ) => {
      rewardsHistory.push({
        id,
        type,
        description,
        points,
        date,
        source,
        category,
        details,
      });
    };

    // 1. Process subscription purchases (from membership packages)
    const membershipPackage = (user as Record<string, unknown>).membershipPackage as
      | Record<string, unknown>
      | undefined;
    if (membershipPackage) {
      const packageId = membershipPackage.packageId as string;
      const purchaseDate = membershipPackage.purchaseDate as string | Date;
      const packageInfo = getPackageById(packageId);
      if (packageInfo && packageInfo.type === "subscription") {
        // Calculate total points earned from subscription (monthly)
        const monthsSincePurchase = Math.floor(
          (Date.now() - new Date(purchaseDate).getTime()) / (1000 * 60 * 60 * 24 * 30)
        );

        addHistoryEntry(
          `subscription-${packageId}`,
          "earned",
          `${packageInfo.name} subscription purchase`,
          packageInfo.price,
          new Date(purchaseDate),
          "Membership Subscription",
          "subscription",
          { packageName: packageInfo.name, price: packageInfo.price }
        );

        // Add monthly points if multiple months
        if (monthsSincePurchase > 0) {
          for (let month = 1; month <= monthsSincePurchase; month++) {
            const monthDate = new Date(purchaseDate);
            monthDate.setMonth(monthDate.getMonth() + month);

            addHistoryEntry(
              `subscription-monthly-${month}`,
              "earned",
              `${packageInfo.name} monthly subscription`,
              packageInfo.price,
              monthDate,
              "Monthly Subscription",
              "subscription",
              { packageName: packageInfo.name, month }
            );
          }
        }
      }
    }

    // 2. Process one-time package purchases (exclude redeemed packages)
    const oneTimePackages = (user as Record<string, unknown>).oneTimePackages as UserPackage[] | undefined;
    const redemptionHistory = (user as Record<string, unknown>).redemptionHistory as UserRedemption[] | undefined;

    if (oneTimePackages && oneTimePackages.length > 0) {
      oneTimePackages.forEach((pkg: UserPackage, index: number) => {
        const packageInfo = getPackageById(pkg.packageId);
        if (packageInfo) {
          // Check if this package was obtained through redemption
          const wasRedeemed = redemptionHistory?.some(
            (redemption: UserRedemption) =>
              redemption.packageId === pkg.packageId &&
              redemption.redemptionType === "package" &&
              Math.abs(new Date(redemption.redeemedAt).getTime() - new Date(pkg.purchaseDate).getTime()) < 60000 // Within 1 minute
          );

          // Only add as purchase if it wasn't redeemed
          if (!wasRedeemed) {
            addHistoryEntry(
              `one-time-${pkg.packageId}-${index}`,
              "earned",
              `${packageInfo.name} package purchase`,
              packageInfo.price,
              new Date(pkg.purchaseDate),
              "One-Time Package",
              "one-time",
              {
                packageName: packageInfo.name,
                price: packageInfo.price,
                entries: packageInfo.totalEntries,
              }
            );
          }
        }
      });
    }

    // 3. Process mini-draw package purchases (exclude redeemed packages)
    const miniDrawPackages = (user as Record<string, unknown>).miniDrawPackages as UserPackage[] | undefined;

    if (miniDrawPackages && miniDrawPackages.length > 0) {
      miniDrawPackages.forEach((pkg: UserPackage, index: number) => {
        const packageInfo = getMiniDrawPackageById(pkg.packageId);
        if (packageInfo) {
          // Check if this package was obtained through redemption
          const wasRedeemed = redemptionHistory?.some(
            (redemption: UserRedemption) =>
              redemption.packageId === pkg.packageId &&
              redemption.redemptionType === "package" &&
              Math.abs(new Date(redemption.redeemedAt).getTime() - new Date(pkg.purchaseDate).getTime()) < 60000 // Within 1 minute
          );

          // Only add as purchase if it wasn't redeemed
          if (!wasRedeemed) {
            addHistoryEntry(
              `mini-draw-${pkg.packageId}-${index}`,
              "earned",
              `${packageInfo.name} purchase`,
              packageInfo.price,
              new Date(pkg.purchaseDate),
              "Mini Draw Package",
              "mini-draw",
              {
                packageName: packageInfo.name,
                price: packageInfo.price,
                entries: packageInfo.entries,
              }
            );
          }
        }
      });
    }

    // 4. Process upsell purchases
    const upsellPurchases = (user as Record<string, unknown>).upsellPurchases as UserUpsell[] | undefined;
    if (upsellPurchases && upsellPurchases.length > 0) {
      upsellPurchases.forEach((upsell: UserUpsell, index: number) => {
        const upsellInfo = getUpsellPackageById(upsell.offerId);
        if (upsellInfo) {
          addHistoryEntry(
            `upsell-${upsell.offerId}-${index}`,
            "earned",
            `${upsell.offerTitle} upsell purchase`,
            upsell.amountPaid,
            new Date(upsell.purchaseDate),
            "Upsell Purchase",
            "upsell",
            {
              offerTitle: upsell.offerTitle,
              amountPaid: upsell.amountPaid,
              entriesAdded: upsell.entriesAdded,
            }
          );
        } else {
          // Fallback if upsell package not found in data
          addHistoryEntry(
            `upsell-${upsell.offerId}-${index}`,
            "earned",
            `${upsell.offerTitle} upsell purchase`,
            upsell.amountPaid,
            new Date(upsell.purchaseDate),
            "Upsell Purchase",
            "upsell",
            {
              offerTitle: upsell.offerTitle,
              amountPaid: upsell.amountPaid,
              entriesAdded: upsell.entriesAdded,
            }
          );
        }
      });
    }

    // 5. Process redemption history
    if (redemptionHistory && redemptionHistory.length > 0) {
      redemptionHistory.forEach((redemption: UserRedemption) => {
        addHistoryEntry(
          `redemption-${redemption.redemptionId}`,
          "redeemed",
          redemption.description,
          -redemption.pointsDeducted,
          new Date(redemption.redeemedAt),
          "Points Redemption",
          "redemption",
          {
            redemptionType: redemption.redemptionType,
            packageName: redemption.packageName,
            value: redemption.value,
            status: redemption.status,
          }
        );
      });
    }

    // 6. Add shop purchases (placeholder for future implementation)
    // TODO: Implement when shop functionality is added
    // if (user.shopOrders && user.shopOrders.length > 0) {
    //   user.shopOrders.forEach((order) => {
    //     addHistoryEntry(
    //       `shop-${order.orderId}`,
    //       "earned",
    //       `Shop purchase - ${order.items.length} items`,
    //       order.totalAmount,
    //       new Date(order.purchaseDate),
    //       `Shop Order ${order.orderId}`,
    //       "shop",
    //       { orderId: order.orderId, items: order.items }
    //     );
    //   });
    // }

    // 7. Add referral bonuses (if any)
    const referralEvents = await ReferralEvent.find({
      status: "converted",
      $or: [{ referrerId: userObjectId }, { inviteeUserId: userObjectId }],
    })
      .sort({ conversionDate: -1, createdAt: -1 })
      .lean();

    referralEvents.forEach((event) => {
      const isReferrer = event.referrerId?.toString() === userObjectId.toString();
      const entriesAwarded = isReferrer
        ? event.referrerEntriesAwarded ?? REFERRAL_CONSTANTS.rewardEntries
        : event.referreeEntriesAwarded ?? REFERRAL_CONSTANTS.rewardEntries;
      const description = isReferrer
        ? `Referral bonus earned${event.inviteeEmail ? ` (${event.inviteeEmail})` : ""}`
        : "Referral welcome bonus";
      const source = isReferrer ? "Refer a Friend (Referrer)" : "Refer a Friend (Friend)";
      const eventDate = event.conversionDate ? new Date(event.conversionDate) : new Date(event.createdAt);
      const historyId = `referral-${event._id}-${isReferrer ? "referrer" : "friend"}`;
      const details: Record<string, unknown> = {
        role: isReferrer ? "referrer" : "friend",
        referralCode: event.referralCode,
      };
      if (event.inviteeEmail) {
        details.friendEmail = event.inviteeEmail;
      }
      if (event.conversionDate) {
        details.conversionDate = event.conversionDate;
      }

      addHistoryEntry(historyId, "earned", description, entriesAwarded, eventDate, source, "referral", details);
    });

    // Sort by date (most recent first)
    rewardsHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Calculate summary statistics
    const totalPointsEarned = rewardsHistory
      .filter((entry) => entry.type === "earned")
      .reduce((sum, entry) => sum + entry.points, 0);

    const totalPointsRedeemed = Math.abs(
      rewardsHistory.filter((entry) => entry.type === "redeemed").reduce((sum, entry) => sum + entry.points, 0)
    );

    const currentPoints = user.rewardsPoints || 0;

    return NextResponse.json({
      success: true,
      data: {
        history: rewardsHistory,
        summary: {
          currentPoints,
          totalPointsEarned,
          totalPointsRedeemed,
          totalTransactions: rewardsHistory.length,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching rewards history:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch rewards history" }, { status: 500 });
  }
}
