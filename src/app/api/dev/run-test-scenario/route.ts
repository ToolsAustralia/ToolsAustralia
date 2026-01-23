/**
 * Development API: Run Major Draw Test Scenarios
 *
 * POST /api/dev/run-test-scenario?scenario=1-4
 *
 * Executes one of 4 test scenarios for major draw lifecycle testing.
 * Only available in development environment.
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import MajorDraw, { IMajorDraw } from "@/models/MajorDraw";
import { getNextQueuedDraw } from "@/utils/draws/major-draw-helpers";
import { resetDrawPropertiesForAllUsers } from "@/utils/integrations/klaviyo/klaviyo-draw-reset";

export async function POST(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "This endpoint is only available in development mode" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const scenario = parseInt(searchParams.get("scenario") || "1");
    
    // Optional: restore specific draws by ID
    const restoreCurrentDrawId = searchParams.get("currentDrawId");
    const restoreNextDrawId = searchParams.get("nextDrawId");

    if (scenario < 1 || scenario > 4) {
      return NextResponse.json({ error: "Invalid scenario. Must be 1-4." }, { status: 400 });
    }

    await connectDB();

    const now = new Date();

    let currentDraw: IMajorDraw | null = null;
    let nextDraw: IMajorDraw | null = null;

    // If draw IDs provided, restore those specific draws
    if (restoreCurrentDrawId && restoreNextDrawId) {
      currentDraw = await MajorDraw.findById(restoreCurrentDrawId);
      nextDraw = await MajorDraw.findById(restoreNextDrawId);
      
      if (!currentDraw || !nextDraw) {
        return NextResponse.json(
          { error: "Could not find draws with provided IDs. Falling back to auto-detection." },
          { status: 404 }
        );
      }
    } else {
      // Original logic: Find current draw (active, frozen, or latest completed)
      currentDraw = await MajorDraw.findOne({
        status: { $in: ["active", "frozen"] },
      }).sort({ activationDate: -1 });

      // If no active/frozen, get the latest completed draw
      if (!currentDraw) {
        currentDraw = await MajorDraw.findOne({
          status: "completed",
        }).sort({ drawDate: -1 });
      }

      // Find next draw (queued or any draw after current)
      nextDraw = await getNextQueuedDraw();

      // If no queued draw, try to find any draw that comes after the current one
      if (!nextDraw && currentDraw) {
        nextDraw = await MajorDraw.findOne({
          _id: { $ne: currentDraw._id },
          drawDate: { $gt: currentDraw.drawDate },
        }).sort({ drawDate: 1 });
      }

      // If still no next draw, use any available draw as fallback
      if (!nextDraw) {
        nextDraw = await MajorDraw.findOne({
          _id: currentDraw ? { $ne: currentDraw._id } : {},
        }).sort({ drawDate: 1 });
      }
    }

    // Validation: Ensure we have two different draws
    if (!currentDraw || !nextDraw) {
      return NextResponse.json(
        {
          error: "Need at least 2 draws in database. Please create 2 major draws first.",
          hint: "The system will use the current draw and the next consecutive draw automatically.",
        },
        { status: 404 }
      );
    }

    // Type assertion: After null check, nextDraw is guaranteed to be IMajorDraw
    const nextDrawTyped = nextDraw as IMajorDraw;

    // Ensure current and next are different draws
    // Cast _id to handle TypeScript's unknown type from Document interface
    const currentDrawId = String(currentDraw._id);
    const nextDrawId = String((nextDrawTyped._id as unknown as { toString(): string }));
    if (currentDrawId === nextDrawId) {
      return NextResponse.json(
        {
          error: "Need 2 different draws. Please create another major draw.",
        },
        { status: 404 }
      );
    }

    let currentDrawEnd: Date;
    let currentFreeze: Date;
    let currentStatus: "active" | "frozen" | "completed";
    let currentIsActive: boolean;
    let currentConfigLocked: boolean;
    let currentLockedAt: Date | undefined;

    let nextActivation: Date;
    let nextStatus: "queued" | "active";
    let nextIsActive: boolean;

    // Configure based on scenario
    switch (scenario) {
      case 1:
        // TEST 1: Draw ending in 60 minutes (Active)
        currentDrawEnd = new Date(now.getTime() + 60 * 60 * 1000); // +60 mins
        currentFreeze = new Date(now.getTime() + 30 * 60 * 1000); // +30 mins
        currentStatus = "active";
        currentIsActive = true;
        currentConfigLocked = false;
        currentLockedAt = undefined;

        nextActivation = new Date(currentDrawEnd.getTime() + 4 * 60 * 60 * 1000); // +4 hours
        nextStatus = "queued";
        nextIsActive = false;
        break;

      case 2:
        // TEST 2: Draw ending in 30 minutes (Frozen)
        currentDrawEnd = new Date(now.getTime() + 30 * 60 * 1000); // +30 mins
        currentFreeze = new Date(now.getTime() - 1 * 60 * 1000); // -1 min (already frozen)
        currentStatus = "frozen";
        currentIsActive = false;
        currentConfigLocked = true;
        currentLockedAt = currentFreeze;

        nextActivation = new Date(currentDrawEnd.getTime() + 4 * 60 * 60 * 1000); // +4 hours
        nextStatus = "queued";
        nextIsActive = false;
        break;

      case 3:
        // TEST 3: Draw just ended (Gap Period)
        currentDrawEnd = new Date(now.getTime()); // Ended NOW
        currentFreeze = new Date(now.getTime() - 30 * 60 * 1000); // -30 mins
        currentStatus = "completed";
        currentIsActive = false;
        currentConfigLocked = true;
        currentLockedAt = currentFreeze;

        nextActivation = new Date(currentDrawEnd.getTime() + 4 * 60 * 60 * 1000); // +4 hours from currentDrawEnd
        nextStatus = "queued";
        nextIsActive = false;
        break;

      case 4:
        // TEST 4: Next draw active (Post-Gap)
        currentDrawEnd = new Date(now.getTime() - 5 * 60 * 60 * 1000); // -5 hours (ended 5 hours ago)
        currentFreeze = new Date(currentDrawEnd.getTime() - 30 * 60 * 1000); // -30 mins before end
        currentStatus = "completed";
        currentIsActive = false;
        currentConfigLocked = true;
        currentLockedAt = currentFreeze;

        nextActivation = new Date(currentDrawEnd.getTime() + 4 * 60 * 60 * 1000); // +4 hours from current end (1 hour ago)
        nextStatus = "active";
        nextIsActive = true;
        break;

      default:
        return NextResponse.json({ error: "Invalid scenario" }, { status: 400 });
    }

    // Update Current Draw
    currentDraw.status = currentStatus;
    currentDraw.isActive = currentIsActive;
    currentDraw.drawDate = currentDrawEnd;
    currentDraw.freezeEntriesAt = currentFreeze;
    currentDraw.configurationLocked = currentConfigLocked;
    currentDraw.lockedAt = currentLockedAt;
    await currentDraw.save();

    // Update Next Draw
    const nextDrawEnd = new Date(nextActivation.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days
    const nextFreeze = new Date(nextDrawEnd.getTime() - 30 * 60 * 1000); // -30 minutes

    nextDrawTyped.status = nextStatus;
    nextDrawTyped.isActive = nextIsActive;
    nextDrawTyped.activationDate = nextActivation;
    nextDrawTyped.drawDate = nextDrawEnd;
    nextDrawTyped.freezeEntriesAt = nextFreeze;
    nextDrawTyped.configurationLocked = false;
    nextDrawTyped.lockedAt = undefined;
    await nextDrawTyped.save();

    // Auto-trigger Klaviyo reset for scenarios with active draws (1, 2, 4)
    // This helps with testing by automatically updating Klaviyo profiles
    let klaviyoResetResult: Awaited<ReturnType<typeof resetDrawPropertiesForAllUsers>> | null = null;
    let klaviyoResetError: string | null = null;
    const shouldTriggerReset =
      (scenario === 1 && currentIsActive) || // Test Case 1: Active draw
      (scenario === 2 && currentStatus === "frozen") || // Test Case 2: Frozen draw
      (scenario === 4 && nextIsActive); // Test Case 4: Next draw active

    if (shouldTriggerReset) {
      try {
        console.log(`🔄 [TEST] Auto-triggering Klaviyo reset for scenario ${scenario}...`);
        const targetDraw = scenario === 4 ? nextDrawTyped : currentDraw;
        klaviyoResetResult = await resetDrawPropertiesForAllUsers(targetDraw);
        console.log(`✅ [TEST] Klaviyo reset completed:`, {
          processed: klaviyoResetResult.processed,
          synced: klaviyoResetResult.synced,
          errors: klaviyoResetResult.errors,
          duration: `${klaviyoResetResult.duration}ms`,
        });
      } catch (resetError) {
        console.error(`❌ [TEST] Klaviyo reset failed for scenario ${scenario}:`, resetError);
        klaviyoResetError = resetError instanceof Error ? resetError.message : "Unknown error";
      }
    }

    // Build response message
    const scenarioDescriptions = [
      "",
      "Active draw (ends in 60 mins)",
      "Frozen draw (ends in 30 mins)",
      "Gap period (just ended)",
      "Next draw active (post-gap)",
    ];

    const response: {
      success: boolean;
      message: string;
      scenario: string;
      draws: {
        current: {
          id: string;
          name: string;
          status: string;
          isActive: boolean;
          drawDate: Date;
          freezeEntriesAt: Date;
        };
        next: {
          id: string;
          name: string;
          status: string;
          isActive: boolean;
          activationDate: Date;
          drawDate: Date;
        };
      };
      klaviyoReset?: {
        processed?: number;
        synced?: number;
        errors?: number;
        duration?: string;
        error?: string;
        note?: string;
      };
    } = {
      success: true,
      message: `Test scenario ${scenario} loaded successfully`,
      scenario: scenarioDescriptions[scenario],
      draws: {
        current: {
          id: currentDrawId,
          name: currentDraw.name,
          status: currentStatus,
          isActive: currentIsActive,
          drawDate: currentDrawEnd,
          freezeEntriesAt: currentFreeze,
        },
        next: {
          id: nextDrawId,
          name: nextDrawTyped.name,
          status: nextStatus,
          isActive: nextIsActive,
          activationDate: nextActivation,
          drawDate: nextDrawEnd,
        },
      },
    };

    // Include Klaviyo reset results in response
    if (shouldTriggerReset) {
      if (klaviyoResetError) {
        response.klaviyoReset = {
          error: klaviyoResetError,
          note: "Reset failed - check server logs for details",
        };
      } else if (klaviyoResetResult) {
        response.klaviyoReset = {
          processed: klaviyoResetResult.processed,
          synced: klaviyoResetResult.synced,
          errors: klaviyoResetResult.errors,
          duration: `${klaviyoResetResult.duration}ms`,
          note: "Check your Klaviyo dashboard to verify profile updates",
        };
      }
    } else {
      response.klaviyoReset = {
        note: "Reset skipped - no active draw in this scenario",
      };
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error running test scenario:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
