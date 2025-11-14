/**
 * API Route: User My Account Data
 *
 * GET /api/users/[id]/my-account
 * Returns user account data including membership, entries, recent orders
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import Order from "@/models/Order";
import MiniDraw from "@/models/MiniDraw";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPackageById } from "@/data/membershipPackages";
import { getEffectiveBenefits } from "@/utils/membership/benefit-resolution";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();

    // Get session to verify authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Users can only access their own data (unless admin)
    if (session.user.id !== id && session.user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Find user by ID with populated data
    let user;
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(id);

    if (isValidObjectId) {
      user = await User.findById(id).select("-password -emailVerificationToken -passwordResetToken").lean();
    } else {
      // Google OAuth user - find by email from session
      if (!session.user.email) {
        return NextResponse.json({ error: "User email not found in session" }, { status: 400 });
      }

      user = await User.findOne({ email: session.user.email })
        .select("-password -emailVerificationToken -passwordResetToken")
        .lean();
    }

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
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
    let subscriptionPackageData = null;
    if (userData.subscription?.packageId) {
      try {
        // Use smart benefit resolution to get effective benefits
        const effectiveBenefits = getEffectiveBenefits(userData as unknown as import("@/models/User").IUser);
        if (effectiveBenefits) {
          subscriptionPackageData = effectiveBenefits.benefits; // Full package object
          console.log(
            `🔍 Using smart benefit resolution in my-account: ${
              effectiveBenefits.packageName
            } (preserved during downgrade: ${effectiveBenefits.packageId !== userData.subscription.packageId})`
          );
        } else {
          // Fallback to direct lookup
          const packageIdStr = String(userData.subscription.packageId);
          subscriptionPackageData = getPackageById(packageIdStr);
          console.log(`🔍 Fallback to direct lookup in my-account: ${subscriptionPackageData?.name || "Not found"}`);
        }

        if (subscriptionPackageData) {
          console.log(
            `✅ Successfully retrieved subscription package data in my-account: ${subscriptionPackageData.name}`
          );
        } else {
          console.log(`⚠️ No package data returned for user subscription in my-account`);
        }
      } catch (error) {
        console.log(
          `⚠️ Could not find membership package ${userData.subscription.packageId} (${typeof userData.subscription
            .packageId}):`,
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
          if (packageData) {
            oneTimePackageData.push({
              ...oneTimePackage,
              packageData: packageData, // Include full package details
            });
          } else {
            console.log(`⚠️ One-time package ID not found in static data: ${packageIdStr}`);
          }
        } catch (error) {
          console.log(
            `⚠️ Could not find one-time package ${oneTimePackage.packageId} (${typeof oneTimePackage.packageId}):`,
            error
          );
        }
      }
    }

    // Get related data from database
    const [activeMiniDraws, recentOrders] = await Promise.all([
      MiniDraw.find({
        isActive: true,
        endDate: { $gt: new Date() },
      })
        .limit(5)
        .lean(),
      Order.find({
        userId: userData._id,
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
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

    console.log("🔍 My Account API - Profile setup check:", {
      profileSetupCompleted: (userData as { profileSetupCompleted?: boolean }).profileSetupCompleted,
      hasProfileSetupCompleted: "profileSetupCompleted" in userData,
      userId: userData._id,
    });

    return NextResponse.json({
      success: true,
      data: {
        user: {
          ...userData,
          subscriptionPackageData,
          enrichedOneTimePackages: oneTimePackageData,
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
  } catch (error) {
    console.error("Error fetching user account data:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
