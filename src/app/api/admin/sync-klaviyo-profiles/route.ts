import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User, { IUser } from "@/models/User";
import { syncMultipleUserProfilesToKlaviyo } from "@/utils/integrations/klaviyo/klaviyo-profile-sync";

/**
 * POST /api/admin/sync-klaviyo-profiles
 * Admin endpoint to sync all user profiles to Klaviyo
 * Useful for initial setup or data migration
 */
export async function POST() {
  try {
    // TODO: Add admin authentication check here
    // For now, this is open - you should secure this endpoint

    await connectDB();

    // Get all users from database
    const users = await User.find({}).lean();
    console.log(`📊 Found ${users.length} users to sync to Klaviyo`);

    if (users.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No users found to sync",
        syncedCount: 0,
      });
    }

    // Sync all user profiles to Klaviyo
    await syncMultipleUserProfilesToKlaviyo(users as IUser[]);

    return NextResponse.json({
      success: true,
      message: `Successfully initiated sync for ${users.length} user profiles to Klaviyo`,
      syncedCount: users.length,
    });
  } catch (error) {
    console.error("❌ Error syncing user profiles to Klaviyo:", error);
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
