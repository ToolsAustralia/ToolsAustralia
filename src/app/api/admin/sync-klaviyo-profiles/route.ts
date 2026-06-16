import { NextRequest, NextResponse } from "next/server";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import connectDB from "@/lib/mongodb";
import User, { IUser } from "@/models/User";
import { syncMultipleUserProfilesToKlaviyo } from "@/utils/integrations/klaviyo/klaviyo-profile-sync";

// The bulk sync is now rate-limit throttled (8 concurrent / 700ms batch), so it runs longer.
// Give it headroom. NOTE: this still only fits a few-hundred-user set within the limit — a
// whole-DB sweep (thousands) must run as an ops script, not this route.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/sync-klaviyo-profiles
 * Admin endpoint to sync all user profiles to Klaviyo
 * Useful for initial setup or data migration
 */
export async function POST(request: NextRequest) {
  // Admin-gated: this mass-writes every user's profile to Klaviyo. `users.edit` covers
  // editing/syncing user data (not money — that's `users.charge`).
  const guard = await requirePermissionWithAudit("users.edit", request);
  if (guard instanceof NextResponse) return guard;
  const { log } = guard;
  try {
    await connectDB();

    // Get all users from database
    const users = await User.find({}).lean();
    console.log(`📊 Found ${users.length} users to sync to Klaviyo`);

    if (users.length === 0) {
      await log(200);
      return NextResponse.json({
        success: true,
        message: "No users found to sync",
        syncedCount: 0,
      });
    }

    // Sync all user profiles to Klaviyo (throttled to Klaviyo rate limits)
    await syncMultipleUserProfilesToKlaviyo(users as IUser[]);

    await log(200);
    return NextResponse.json({
      success: true,
      message: `Successfully synced ${users.length} user profiles to Klaviyo`,
      syncedCount: users.length,
    });
  } catch (error) {
    console.error("❌ Error syncing user profiles to Klaviyo:", error);
    await log(500);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to sync user profiles to Klaviyo",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
