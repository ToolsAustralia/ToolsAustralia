import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import MajorDraw from "@/models/MajorDraw";
import mongoose from "mongoose";
import { protectDebugEndpoint } from "@/lib/debugAuth";
import { resetDrawPropertiesForAllUsers } from "@/utils/integrations/klaviyo/klaviyo-draw-reset";

/**
 * POST /api/test/klaviyo-draw-reset
 * Test endpoint to manually trigger Klaviyo draw reset
 * Only available in development/staging with debug auth
 *
 * Request Body:
 * {
 *   drawId?: string;  // Optional - auto-detects if not provided
 *   dryRun?: boolean; // Default: false - if true, returns info without updating
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Protect debug endpoint
    const authResult = await protectDebugEndpoint();
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const body = await request.json().catch(() => ({}));
    const { drawId, dryRun = false } = body;

    await connectDB();

    // Get target draw (optional - will auto-detect if not provided)
    let targetDraw = null;
    if (drawId) {
      targetDraw = await MajorDraw.findById(drawId);
      if (!targetDraw) {
        return NextResponse.json(
          { error: `Draw with ID ${drawId} not found` },
          { status: 404 }
        );
      }
    } else {
      // Auto-detect current active draw
      targetDraw = await MajorDraw.findOne({
        status: { $in: ["active", "frozen"] },
      }).sort({ activationDate: -1 });
      
      if (!targetDraw) {
        return NextResponse.json(
          { error: "No active draw found. Please provide a drawId or activate a draw first." },
          { status: 404 }
        );
      }
    }

    console.log(`🧪 [TEST] Starting Klaviyo draw reset for: ${targetDraw.name} (ID: ${targetDraw._id})`);
    console.log(`🧪 [TEST] Dry run: ${dryRun ? "YES" : "NO"}`);

    if (dryRun) {
      // Dry run - just show what would be updated
      // Get count of users who would be processed
      const majorDrawsWithEntries = await MajorDraw.find({
        status: { $in: ["active", "frozen", "completed"] },
        "entries.0": { $exists: true },
      }).select("entries.userId");

      const userIdsWithEntries = new Set<string>();
      majorDrawsWithEntries.forEach((draw) => {
        if (draw.entries && draw.entries.length > 0) {
          draw.entries.forEach((entry: { userId: mongoose.Types.ObjectId | string }) => {
            const userId = entry.userId instanceof mongoose.Types.ObjectId 
              ? entry.userId.toString() 
              : String(entry.userId);
            userIdsWithEntries.add(userId);
          });
        }
      });

      return NextResponse.json({
        success: true,
        message: "Dry run - no updates made",
        draw: {
          id: targetDraw._id.toString(),
          name: targetDraw.name,
          status: targetDraw.status,
          activationDate: targetDraw.activationDate,
        },
        estimatedUsers: userIdsWithEntries.size,
        note: "Set dryRun: false to actually update profiles",
      });
    }

    // Run the reset
    const result = await resetDrawPropertiesForAllUsers(targetDraw);

    return NextResponse.json({
      success: true,
      message: "Klaviyo draw reset test completed",
      draw: {
        id: targetDraw._id.toString(),
        name: targetDraw.name,
        status: targetDraw.status,
        activationDate: targetDraw.activationDate,
      },
      result: {
        processed: result.processed,
        synced: result.synced,
        errors: result.errors,
        duration: `${result.duration}ms`,
        errorDetails: result.errorDetails.slice(0, 10), // First 10 errors
      },
      note: "Check your Klaviyo dashboard to verify profile updates",
    });
  } catch (error) {
    console.error("❌ Klaviyo draw reset test failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Draw reset test failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

