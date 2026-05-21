/**
 * POST /api/admin/klaviyo/draw-reset-execute
 * 
 * Execute endpoint to sync users to Klaviyo
 * Uses in-memory lock to prevent concurrent manual syncs
 * 
 * Authentication: Admin only
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import { resetDrawPropertiesForAllUsers } from "@/utils/integrations/klaviyo/klaviyo-draw-reset";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// In-memory lock to prevent concurrent manual syncs
let isManualSyncInProgress = false;

export async function POST(_request: NextRequest) {
  try {
    const _guard = await requirePermission("overview.edit");
    if (_guard instanceof NextResponse) return _guard;

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

    // Start sync in background (non-blocking) to prevent Vercel timeout
    // Progress tracking is enabled so UI can poll for updates
    resetDrawPropertiesForAllUsers(undefined, true)
      .then((result) => {
        console.log(`✅ Manual Klaviyo sync completed:`, {
          processed: result.processed,
          synced: result.synced,
          errors: result.errors,
          duration: `${result.duration}ms`,
        });
      })
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`❌ Manual Klaviyo sync failed:`, errorMessage);
      })
      .finally(() => {
        // Always clear lock, even if sync fails
        isManualSyncInProgress = false;
        console.log("🔓 Manual Klaviyo sync lock released");
      });

    // Return immediately - sync continues in background
    // UI will poll /api/admin/klaviyo/draw-reset-progress to track completion
    return NextResponse.json(
      {
        success: true,
        message: "Sync started in background. Use progress endpoint to track status.",
        data: {
          started: true,
          progressEndpoint: "/api/admin/klaviyo/draw-reset-progress",
        },
      },
      { status: 200 }
    );
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
