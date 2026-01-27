/**
 * POST /api/admin/klaviyo/draw-reset-execute
 * 
 * Execute endpoint to sync users to Klaviyo
 * Uses in-memory lock to prevent concurrent manual syncs
 * 
 * Authentication: Admin only
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resetDrawPropertiesForAllUsers, getSyncProgress } from "@/utils/integrations/klaviyo/klaviyo-draw-reset";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// In-memory lock to prevent concurrent manual syncs
let isManualSyncInProgress = false;

export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if sync is already in progress
    if (isManualSyncInProgress) {
      console.warn("⚠️ Manual Klaviyo sync already in progress - rejecting concurrent request");
      return NextResponse.json(
        {
          success: false,
          error: "Sync already in progress. Please wait for the current sync to complete.",
        },
        { status: 409 }
      );
    }

    // Set lock
    isManualSyncInProgress = true;
    console.log("🔄 Starting manual Klaviyo sync (source: admin panel)");

    try {
      const result = await resetDrawPropertiesForAllUsers(undefined, true); // Enable progress tracking

      console.log(`✅ Manual Klaviyo sync completed:`, {
        processed: result.processed,
        synced: result.synced,
        errors: result.errors,
        duration: `${result.duration}ms`,
      });

      return NextResponse.json(
        {
          success: true,
          data: {
            processed: result.processed,
            synced: result.synced,
            errors: result.errors,
            duration: result.duration,
            errorDetails: result.errorDetails,
          },
        },
        { status: 200 }
      );
    } finally {
      // Always clear lock and progress, even if sync fails
      isManualSyncInProgress = false;
      // Clear progress after a short delay to allow final progress check
      setTimeout(() => {
        const progress = getSyncProgress();
        if (progress) {
          // Progress will be cleared by the reset function, but ensure it's cleared
        }
      }, 1000);
      console.log("🔓 Manual Klaviyo sync lock released");
    }
  } catch (error) {
    // Clear lock on error
    isManualSyncInProgress = false;
    console.error("❌ Error executing manual Klaviyo sync:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
