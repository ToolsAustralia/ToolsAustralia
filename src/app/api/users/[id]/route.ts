import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requirePermission } from "@/lib/api-auth-permissions";
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

    // Users can only access their own data; staff with users.view can access any user.
    if (session.user.id !== id) {
      const guard = await requirePermission("users.view");
      if (guard instanceof NextResponse) return guard;
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
      // When the user record backing this session cannot be found,
      // return a consistent machine-readable error code so the client
      // can safely treat this as a dangling session and force logout.
      return NextResponse.json({ error: "User not found", code: "USER_NOT_FOUND" }, { status: 404 });
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
          // Success - no logging needed
        } else {
          // Package data not found in static data (might be deleted package)
          console.warn(`⚠️ Package data not found for subscription packageId: ${userData.subscription.packageId}`);
        }
      } catch (error) {
        console.error(`⚠️ Could not resolve membership package for user:`, error);
      }
    } else {
      // ✅ FIX: Distinguish between legitimate cases and actual problems
      if (!userData.subscription) {
        // User has no subscription - this is legitimate (user might only have one-time packages)
        // No logging needed - this is expected behavior
      } else if (!userData.subscription.packageId && userData.subscription.isActive) {
        // ✅ RACE CONDITION: Subscription is active but missing packageId - this is a problem
        // This can happen if API is called before webhook sets packageId
        console.warn(
          `⚠️ Active subscription missing packageId for user ${userData._id} - may be race condition. Subscription status: ${userData.subscription.status}`
        );
      } else if (!userData.subscription.isActive) {
        // Subscription exists but is inactive (cancelled) - this is legitimate
        // No logging needed - inactive subscriptions don't need package data
      } else {
        // Fallback for any other case
        console.warn(`⚠️ Subscription data incomplete for user ${userData._id}: packageId=${!!userData.subscription?.packageId}, isActive=${userData.subscription?.isActive}`);
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
              packageData, // Include full package details, not just basic fields
            });
          } else {
            // console.log(`⚠️ One-time package ID not found in static data: ${packageIdStr}`);
          }
        } catch (error) {
          console.error(
            `⚠️ Could not find one-time package ${oneTimePackage.packageId} (${typeof oneTimePackage.packageId}):`,
            error
          );
        }
      }
    }

    // Check if user has password set (without exposing the actual password)
    const userWithPassword = await User.findById(userData._id).select("password").lean();
    const hasPassword = !!userWithPassword?.password;

    const responseData = {
      ...userData,
      hasPassword,
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
    console.error("Error fetching user:", error);
    return NextResponse.json({ error: "Failed to fetch user data" }, { status: 500 });
  }
}
