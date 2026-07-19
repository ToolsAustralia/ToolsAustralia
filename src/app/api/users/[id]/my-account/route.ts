/**
 * API Route: User My Account Data
 *
 * GET /api/users/[id]/my-account
 * Returns user account data including membership, entries, recent orders
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User, { type IUser } from "@/models/User";
import Order from "@/models/Order";
import MiniDraw from "@/models/MiniDraw";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requirePermission } from "@/lib/api-auth-permissions";
import { getPackageById } from "@/data/membershipPackages";
import { getEffectiveBenefits } from "@/utils/membership/benefit-resolution";
import { processPartnerDiscountQueue } from "@/utils/partner-discounts/partner-discount-queue";
import { hasMembershipGrantInCurrentDrawPeriod } from "@/utils/draws/has-membership-grant-this-draw";
import {
  MY_ACCOUNT_MINI_DRAW_FIELDS,
  MY_ACCOUNT_ORDER_FIELDS,
  MY_ACCOUNT_USER_FIELDS,
} from "@/utils/dashboard/my-account-projection";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    // Get session to verify authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Users can only access their own data; staff with users.view can access any user.
    if (session.user.id !== id) {
      const guard = await requirePermission("users.view");
      if (guard instanceof NextResponse) return guard;
    }

    // Find user by ID with populated data
    let user;
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(id);

    // Explicit include-list projection — this payload is polled for every member;
    // see src/utils/dashboard/my-account-projection.ts before adding client fields.
    if (isValidObjectId) {
      user = await User.findById(id).select(MY_ACCOUNT_USER_FIELDS).lean();
    } else {
      // Google OAuth user - find by email from session
      if (!session.user.email) {
        return NextResponse.json({ error: "User email not found in session" }, { status: 400 });
      }

      user = await User.findOne({ email: session.user.email }).select(MY_ACCOUNT_USER_FIELDS).lean();
    }

    if (!user) {
      // When the user record backing this session cannot be found,
      // return a consistent machine-readable error code so the client
      // can safely treat this as a dangling session and force logout.
      return NextResponse.json({ error: "User not found", code: "USER_NOT_FOUND" }, { status: 404 });
    }

    // Cast user to proper type
    const userData = user as unknown as {
      _id: string;
      email: string;
      firstName: string;
      lastName: string;
      subscription?: {
        packageId: string;
        isActive: boolean;
        startDate: string;
        endDate?: string;
        autoRenew: boolean;
        status?: string;
      };
      oneTimePackages?: Array<{
        packageId: string;
        isActive: boolean;
        purchaseDate: string;
      }>;
      rewardsPoints: number;
      entryWallet: number;
      accumulatedEntries: number;
      createdAt: string;
    };

    // Get membership package details from static data for subscription
    // Return package data if subscription is ACTIVE or past_due (failed renewal).
    // This ensures failed-renewal users see the correct tier (e.g. Boss) in the Membership card.
    // Do not return for cancelled / no subscription.
    let subscriptionPackageData = null;
    const sub = userData.subscription;
    const hasActiveOrPastDueSubscription =
      sub?.packageId && (sub?.isActive || sub?.status === "past_due");
    if (hasActiveOrPastDueSubscription && sub) {
      try {
        // Use smart benefit resolution to get effective benefits
        const effectiveBenefits = getEffectiveBenefits(userData as unknown as import("@/models/User").IUser);
        if (effectiveBenefits) {
          subscriptionPackageData = effectiveBenefits.benefits; // Full package object
          // console.log(
          //   `🔍 Using smart benefit resolution in my-account: ${
          //     effectiveBenefits.packageName
          //   } (preserved during downgrade: ${effectiveBenefits.packageId !== sub.packageId})`
          // );
        } else {
          // Fallback to direct lookup
          const packageIdStr = String(sub.packageId);
          subscriptionPackageData = getPackageById(packageIdStr);
          // console.log(`🔍 Fallback to direct lookup in my-account: ${subscriptionPackageData?.name || "Not found"}`);
        }

        if (subscriptionPackageData) {
          // console.log(
          //   `✅ Successfully retrieved subscription package data in my-account: ${subscriptionPackageData.name}`
          // );
        } else {
          // console.log(`⚠️ No package data returned for user subscription in my-account`);
        }
      } catch (error) {
        console.log(
          `⚠️ Could not find membership package ${sub.packageId} (${typeof sub.packageId}):`,
          error
        );
      }
    }

    // Get one-time package details from static data
    const oneTimePackageData = [];
    if (userData.oneTimePackages) {
      for (const oneTimePackage of userData.oneTimePackages) {
        try {
          const packageIdStr = String(oneTimePackage.packageId);
          const packageData = getPackageById(packageIdStr);
          // Include package even when not found in static data - show minimal info so user sees their data
          oneTimePackageData.push({
            ...oneTimePackage,
            packageId: packageIdStr,
            packageData: packageData ?? {
              _id: packageIdStr,
              name: "One-Time Package",
              type: "one-time",
              price: 0,
              description: "",
              features: [],
              isActive: true,
            },
          });
        } catch (error) {
          console.log(
            `⚠️ Could not find one-time package ${oneTimePackage.packageId} (${typeof oneTimePackage.packageId}):`,
            error
          );
          // Still include package so user can see their data
          const packageIdStr = String(oneTimePackage?.packageId ?? "unknown");
          oneTimePackageData.push({
            ...oneTimePackage,
            packageId: packageIdStr,
            packageData: {
              _id: packageIdStr,
              name: "One-Time Package",
              type: "one-time",
              price: 0,
              description: "",
              features: [],
              isActive: true,
            },
          });
        }
      }
    }

    // Get related data from database
    const [activeMiniDraws, recentOrders, hasCurrentDrawMembershipGrant] = await Promise.all([
      // .select() is load-bearing: an unprojected MiniDraw doc carries the full
      // per-user entries[] array (one subdoc per participant — MB-scale on the wire).
      MiniDraw.find({
        isActive: true,
        endDate: { $gt: new Date() },
      })
        .select(MY_ACCOUNT_MINI_DRAW_FIELDS)
        .limit(5)
        .lean(),
      Order.find({
        userId: userData._id,
      })
        .select(MY_ACCOUNT_ORDER_FIELDS)
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      hasMembershipGrantInCurrentDrawPeriod(userData._id),
    ]);

    // Calculate insights
    const totalSpent = (recentOrders as unknown as Array<{ totalAmount?: number }>).reduce(
      (sum: number, order: { totalAmount?: number }) => sum + (order.totalAmount || 0),
      0
    );
    const activeDrawsCount = activeMiniDraws.length;
    const memberSince = Math.floor(
      (new Date().getTime() - new Date(userData.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Determine membership tier based on rewards points
    let membershipTier = "None";
    if (
      userData.subscription?.isActive ||
      userData.oneTimePackages?.some((pkg: { isActive: boolean }) => pkg.isActive)
    ) {
      if (userData.rewardsPoints >= 5000) {
        membershipTier = "Gold";
      } else if (userData.rewardsPoints >= 1000) {
        membershipTier = "Silver";
      } else {
        membershipTier = "Bronze";
      }
    }

    // console.log("🔍 My Account API - Profile setup check:", {
    //   profileSetupCompleted: (userData as { profileSetupCompleted?: boolean }).profileSetupCompleted,
    //   hasProfileSetupCompleted: "profileSetupCompleted" in userData,
    //   userId: userData._id,
    // });

    // Reconcile-then-read: the stored partnerDiscountQueue can be stale — a finished active window
    // the daily cron hasn't swept yet, or (for a PAST-DUE member) an eligible one-time pack still
    // sitting `queued` behind the now-defunct membership row. Sweep an in-memory CLONE so the client's
    // partner-access resolution reflects the member's REAL current entitlement instead of the stored
    // status. Sanctioned read side of the reconcile-then-read rule (see getReconciledPartnerDiscountSummary)
    // and side-effect-free: the canonical persisted sweep stays with the cron + `GET /api/partner-discount/queue`.
    const iUserForQueue = userData as unknown as IUser;
    let reconciledPartnerDiscountQueue = iUserForQueue.partnerDiscountQueue;
    try {
      const sweepClone = {
        subscription: iUserForQueue.subscription,
        partnerDiscountQueue: (iUserForQueue.partnerDiscountQueue ?? []).map((item) => ({ ...item })),
      } as unknown as IUser;
      await processPartnerDiscountQueue(sweepClone);
      reconciledPartnerDiscountQueue = sweepClone.partnerDiscountQueue;
    } catch (error) {
      console.error("my-account: partner-discount queue reconcile failed; serving raw queue", error);
    }

    // ✅ CRITICAL: Add cache control headers to ensure fresh data
    // This prevents Next.js from caching subscription status changes
    const response = NextResponse.json({
      success: true,
      data: {
        user: {
          ...userData,
          partnerDiscountQueue: reconciledPartnerDiscountQueue,
          subscriptionPackageData,
          enrichedOneTimePackages: oneTimePackageData,
          hasCurrentDrawMembershipGrant,
        },
        activeMiniDraws,
        recentOrders,
        insights: {
          totalSpent,
          activeDrawsCount,
          memberSince,
          membershipTier,
        },
      },
    });

    // Set cache control headers to prevent caching of subscription status
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");

    return response;
  } catch (error) {
    console.error("Error fetching user account data:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
