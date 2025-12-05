import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPackageById } from "@/data/membershipPackages";
import { getEffectiveBenefits } from "@/utils/membership/benefit-resolution";

/**
 * GET /api/users/[id]
 * Get user data by ID (authenticated users only)
 */
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

    // Find user by ID or email (for Google OAuth users)
    let user;

    // Check if id is a valid MongoDB ObjectId (24 character hex string)
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(id);

    if (isValidObjectId) {
      // Regular MongoDB ObjectId
      user = await User.findById(id).select("-password -emailVerificationToken -passwordResetToken").lean();
    } else {
      // Google OAuth user ID - find by email from session
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

    // Cast user to access properties (ignoring mongoose typing complexity)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userData = user as any;

    // Get membership package details using smart benefit resolution
    // ✅ FIX: Only return package data if subscription is ACTIVE
    // This prevents showing package badges and membership status for cancelled subscriptions
    // packageId is still stored in database (useful for resubscription), but not returned in API
    let subscriptionPackageData = null;
    if (userData.subscription?.packageId && userData.subscription?.isActive) {
      try {
        // Use smart benefit resolution to get effective benefits
        const effectiveBenefits = getEffectiveBenefits(userData);
        if (effectiveBenefits) {
          subscriptionPackageData = effectiveBenefits.benefits; // Full package object
          // console.log(
          //   `🔍 Using smart benefit resolution: ${effectiveBenefits.packageName} (preserved during downgrade: ${
          //     effectiveBenefits.packageId !== userData.subscription.packageId
          //   })`
          // );
        } else {
          // Fallback to direct lookup
          const packageIdStr = String(userData.subscription.packageId);
          subscriptionPackageData = getPackageById(packageIdStr);
          // console.log(`🔍 Fallback to direct lookup: ${subscriptionPackageData?.name || "Not found"}`);
        }

        if (subscriptionPackageData) {
          // console.log(`✅ Successfully retrieved subscription package data: ${subscriptionPackageData.name}`);
        } else {
          // console.log(`⚠️ No package data returned for user subscription`);
        }
      } catch (error) {
        // console.log(`⚠️ Could not resolve membership package for user:`, error);
      }
    } else {
      // console.log(`⚠️ No subscription packageId found for user`);
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
              packageData, // Include full package details, not just basic fields
            });
          } else {
            // console.log(`⚠️ One-time package ID not found in static data: ${packageIdStr}`);
          }
        } catch (error) {
          // console.log(
          //   `⚠️ Could not find one-time package ${oneTimePackage.packageId} (${typeof oneTimePackage.packageId}):`,
          //   error
          // );
        }
      }
    }

    const responseData = {
      ...userData,
      subscriptionPackageData,
      enrichedOneTimePackages: oneTimePackageData,
    };

    // console.log("🔍 User API - Profile setup check:", {
    //   profileSetupCompleted: (userData as { profileSetupCompleted?: boolean }).profileSetupCompleted,
    //   hasProfileSetupCompleted: "profileSetupCompleted" in userData,
    //   userId: userData._id,
    // });

    // console.log(`🔍 Returning enriched user data`, {
    //   hasSubscriptionPackageData: !!subscriptionPackageData,
    //   subscriptionPackageName: subscriptionPackageData?.name,
    //   hasEnrichedOneTimePackages: oneTimePackageData.length > 0,
    // });

    // ✅ CRITICAL: Add cache control headers to ensure fresh data
    // This prevents Next.js from caching subscription status changes
    const response = NextResponse.json({
      success: true,
      data: responseData,
    });

    // Set cache control headers to prevent caching of subscription status
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");

    return response;
  } catch (error) {
    // console.error("Error fetching user:", error);
    return NextResponse.json({ error: "Failed to fetch user data" }, { status: 500 });
  }
}
