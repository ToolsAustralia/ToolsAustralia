/**
 * Development API: Run Major Draw Test Scenarios
 *
 * POST /api/dev/run-test-scenario?scenario=1-5
 *
 * Executes one of 5 test scenarios for major draw lifecycle testing.
 * Scenario 5: Draw tomorrow (active draw with drawDate = tomorrow AEST, for promo banner testing).
 * Only available in development environment.
 */

import { NextRequest, NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import connectDB from "@/lib/mongodb";
import MajorDraw, { IMajorDraw } from "@/models/MajorDraw";
import { getNextQueuedDraw } from "@/utils/draws/major-draw-helpers";
import { resetDrawPropertiesForAllUsers } from "@/utils/integrations/klaviyo/klaviyo-draw-reset";
import { createAESTDateAsUTC } from "@/utils/common/timezone";
import { addDays, addMinutes } from "date-fns";

const AEST_TIMEZONE = "Australia/Sydney";

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

    if (scenario < 1 || scenario > 5) {
      return NextResponse.json({ error: "Invalid scenario. Must be 1-5." }, { status: 400 });
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

      case 5: {
        // TEST 5: Draw tomorrow (active draw with drawDate = tomorrow AEST — for "DRAWN TOMORROW" promo banner)
        const tomorrowDate = addDays(now, 1);
        const tomorrowYear = parseInt(formatInTimeZone(tomorrowDate, AEST_TIMEZONE, "yyyy"), 10);
        const tomorrowMonth = parseInt(formatInTimeZone(tomorrowDate, AEST_TIMEZONE, "M"), 10);
        const tomorrowDay = parseInt(formatInTimeZone(tomorrowDate, AEST_TIMEZONE, "d"), 10);
        currentDrawEnd = createAESTDateAsUTC(tomorrowYear, tomorrowMonth, tomorrowDay, 18, 0); // Tomorrow 6:00 PM AEST
        currentFreeze = addMinutes(currentDrawEnd, -30);
        currentStatus = "active";
        currentIsActive = true;
        currentConfigLocked = false;
        currentLockedAt = undefined;

        nextActivation = new Date(currentDrawEnd.getTime() + 4 * 60 * 60 * 1000);
        nextStatus = "queued";
        nextIsActive = false;
        break;
      }

      default:
        return NextResponse.json({ error: "Invalid scenario" }, { status: 400 });
    }

    /**
     * getCurrentMajorDrawForDisplay + getActiveMajorDrawForNewEntryPurchases only match
     * active/frozen draws when activationDate <= now. Without syncing this field, real DB
     * values (e.g. future activation) hide the draw after toggling — gates look "stuck".
     */
    const activationInPast = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    if (currentStatus === "active" || currentStatus === "frozen") {
      currentDraw.activationDate = activationInPast;
    } else if (currentStatus === "completed") {
      currentDraw.activationDate = new Date(currentDrawEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
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

    // Dev-only: avoid multiple active/frozen rows fighting transitions + confusing the UI
    await MajorDraw.updateMany(
      {
        _id: { $nin: [currentDraw._id, nextDrawTyped._id] },
        status: { $in: ["active", "frozen"] },
      },
      {
        $set: {
          status: "queued",
          isActive: false,
          activationDate: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
          configurationLocked: false,
        },
      }
    );

    // Klaviyo bulk sync can take minutes; never block the HTTP response or the UI will appear
    // "stuck" until sync finishes. DB state is already saved above — sync runs in background.
    const shouldTriggerReset =
      (scenario === 1 && currentIsActive) || // Test Case 1: Active draw
      (scenario === 2 && currentStatus === "frozen") || // Test Case 2: Frozen draw
      (scenario === 4 && nextIsActive) || // Test Case 4: Next draw active
      (scenario === 5 && currentIsActive); // Test Case 5: Draw tomorrow (active)

    // Build response message
    const scenarioDescriptions = [
      "",
      "Active draw (ends in 60 mins)",
      "Frozen draw (ends in 30 mins)",
      "Gap period (just ended)",
      "Next draw active (post-gap)",
      "Draw tomorrow (DRAWN TOMORROW promo)",
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

    if (shouldTriggerReset) {
      const targetDraw = scenario === 4 ? nextDrawTyped : currentDraw;
      response.klaviyoReset = {
        note: "Klaviyo profile sync started in the background (does not block scenario load). Watch server logs for completion.",
      };
      void (async () => {
        try {
          console.log(`🔄 [TEST] Klaviyo reset (background) for scenario ${scenario}...`);
          const result = await resetDrawPropertiesForAllUsers(targetDraw);
          console.log(`✅ [TEST] Klaviyo reset completed:`, {
            processed: result.processed,
            synced: result.synced,
            errors: result.errors,
            durationMs: result.duration,
          });
        } catch (resetError) {
          console.error(`❌ [TEST] Klaviyo reset failed for scenario ${scenario}:`, resetError);
        }
      })();
    } else {
      response.klaviyoReset = {
        note: "Klaviyo reset skipped — no active/frozen draw in this scenario (e.g. gap).",
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
