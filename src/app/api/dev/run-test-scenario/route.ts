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
import MajorDraw from "@/models/MajorDraw";

export async function POST(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "This endpoint is only available in development mode" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const scenario = parseInt(searchParams.get("scenario") || "1");

    if (scenario < 1 || scenario > 4) {
      return NextResponse.json({ error: "Invalid scenario. Must be 1-4." }, { status: 400 });
    }

    await connectDB();

    const now = new Date();

    // Get draws
    const octoberDraw = await MajorDraw.findOne({ name: /October/ });
    const novemberDraw = await MajorDraw.findOne({ name: /November/ });

    if (!octoberDraw || !novemberDraw) {
      return NextResponse.json({ error: "Test draws not found. Please seed the database first." }, { status: 404 });
    }

    let octoberDrawEnd: Date;
    let octoberFreeze: Date;
    let octoberStatus: "active" | "frozen" | "completed";
    let octoberIsActive: boolean;
    let octoberConfigLocked: boolean;
    let octoberLockedAt: Date | undefined;

    let novemberActivation: Date;
    let novemberStatus: "queued" | "active";
    let novemberIsActive: boolean;

    // Configure based on scenario
    switch (scenario) {
      case 1:
        // TEST 1: Draw ending in 60 minutes (Active)
        octoberDrawEnd = new Date(now.getTime() + 60 * 60 * 1000); // +60 mins
        octoberFreeze = new Date(now.getTime() + 30 * 60 * 1000); // +30 mins
        octoberStatus = "active";
        octoberIsActive = true;
        octoberConfigLocked = false;
        octoberLockedAt = undefined;

        novemberActivation = new Date(octoberDrawEnd.getTime() + 4 * 60 * 60 * 1000); // +4 hours
        novemberStatus = "queued";
        novemberIsActive = false;
        break;

      case 2:
        // TEST 2: Draw ending in 30 minutes (Frozen)
        octoberDrawEnd = new Date(now.getTime() + 30 * 60 * 1000); // +30 mins
        octoberFreeze = new Date(now.getTime() - 1 * 60 * 1000); // -1 min (already frozen)
        octoberStatus = "frozen";
        octoberIsActive = false;
        octoberConfigLocked = true;
        octoberLockedAt = octoberFreeze;

        novemberActivation = new Date(octoberDrawEnd.getTime() + 4 * 60 * 60 * 1000); // +4 hours
        novemberStatus = "queued";
        novemberIsActive = false;
        break;

      case 3:
        // TEST 3: Draw just ended (Gap Period)
        octoberDrawEnd = new Date(now.getTime()); // Ended NOW
        octoberFreeze = new Date(now.getTime() - 30 * 60 * 1000); // -30 mins
        octoberStatus = "completed";
        octoberIsActive = false;
        octoberConfigLocked = true;
        octoberLockedAt = octoberFreeze;

        novemberActivation = new Date(now.getTime() + 4 * 60 * 60 * 1000); // +4 hours from now
        novemberStatus = "queued";
        novemberIsActive = false;
        break;

      case 4:
        // TEST 4: Next draw active (Post-Gap)
        octoberDrawEnd = new Date(now.getTime() - 5 * 60 * 60 * 1000); // -5 hours (ended 5 hours ago)
        octoberFreeze = new Date(octoberDrawEnd.getTime() - 30 * 60 * 1000); // -30 mins before end
        octoberStatus = "completed";
        octoberIsActive = false;
        octoberConfigLocked = true;
        octoberLockedAt = octoberFreeze;

        novemberActivation = new Date(octoberDrawEnd.getTime() + 4 * 60 * 60 * 1000); // +4 hours from October end (1 hour ago)
        novemberStatus = "active";
        novemberIsActive = true;
        break;

      default:
        return NextResponse.json({ error: "Invalid scenario" }, { status: 400 });
    }

    // Update October Draw
    octoberDraw.status = octoberStatus;
    octoberDraw.isActive = octoberIsActive;
    octoberDraw.drawDate = octoberDrawEnd;
    octoberDraw.freezeEntriesAt = octoberFreeze;
    octoberDraw.configurationLocked = octoberConfigLocked;
    octoberDraw.lockedAt = octoberLockedAt;
    await octoberDraw.save();

    // Update November Draw
    const novemberDrawEnd = new Date(novemberActivation.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days
    const novemberFreeze = new Date(novemberDrawEnd.getTime() - 30 * 60 * 1000); // -30 minutes

    novemberDraw.status = novemberStatus;
    novemberDraw.isActive = novemberIsActive;
    novemberDraw.activationDate = novemberActivation;
    novemberDraw.drawDate = novemberDrawEnd;
    novemberDraw.startDate = novemberActivation;
    novemberDraw.endDate = novemberDrawEnd;
    novemberDraw.freezeEntriesAt = novemberFreeze;
    novemberDraw.configurationLocked = false;
    novemberDraw.lockedAt = undefined;
    await novemberDraw.save();

    // Build response message
    const scenarioDescriptions = [
      "",
      "Active draw (ends in 60 mins)",
      "Frozen draw (ends in 30 mins)",
      "Gap period (just ended)",
      "Next draw active (post-gap)",
    ];

    return NextResponse.json({
      success: true,
      message: `Test scenario ${scenario} loaded successfully`,
      scenario: scenarioDescriptions[scenario],
      draws: {
        october: {
          status: octoberStatus,
          isActive: octoberIsActive,
          drawDate: octoberDrawEnd,
          freezeEntriesAt: octoberFreeze,
        },
        november: {
          status: novemberStatus,
          isActive: novemberIsActive,
          activationDate: novemberActivation,
          drawDate: novemberDrawEnd,
        },
      },
    });
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
