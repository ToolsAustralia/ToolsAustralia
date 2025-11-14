/**
 * TEST SCRIPT 2: Draw Ending in 30 Minutes (FROZEN)
 *
 * Setup:
 * - October Draw: FROZEN, ends in 30 minutes from now
 * - Freeze: Already happened (now - 1 minute, so it's already frozen)
 * - November Draw: QUEUED, activates 4 hours after October ends
 *
 * This simulates the freeze period where October is frozen and entries go to November.
 */

import mongoose from "mongoose";
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import MajorDraw from "@/models/MajorDraw";
import { formatDateInAEST } from "@/utils/common/timezone";

async function setupTest2() {
  try {
    console.log("🧪 TEST 2: Setting up draw ending in 30 minutes (FROZEN)...\n");

    await mongoose.connect(process.env.MONGODB_URI!);
    console.log("✅ MongoDB connected\n");

    const now = new Date();

    // Get draws
    const octoberDraw = await MajorDraw.findOne({ name: /October/ });
    const novemberDraw = await MajorDraw.findOne({ name: /November/ });

    if (!octoberDraw || !novemberDraw) {
      console.log("❌ Draws not found");
      return;
    }

    // ========================================
    // OCTOBER: Frozen, ends in 30 minutes
    // ========================================
    const octoberDrawEnd = new Date(now.getTime() + 30 * 60 * 1000); // +30 minutes
    const octoberFreeze = new Date(now.getTime() - 1 * 60 * 1000); // -1 minute (already frozen)

    // Status: FROZEN (freeze time has passed)
    octoberDraw.status = "frozen";
    octoberDraw.isActive = false; // Not active anymore (frozen)
    octoberDraw.drawDate = octoberDrawEnd;
    octoberDraw.freezeEntriesAt = octoberFreeze;
    octoberDraw.configurationLocked = true; // Locked (freeze started)
    octoberDraw.lockedAt = octoberFreeze;

    await octoberDraw.save();

    // ========================================
    // NOVEMBER: Queued, activates 4 hours after October ends
    // ========================================
    const novemberActivation = new Date(octoberDrawEnd.getTime() + 4 * 60 * 60 * 1000); // +4 hours from October end
    const novemberDrawEnd = new Date(novemberActivation.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days
    const novemberFreeze = new Date(novemberDrawEnd.getTime() - 30 * 60 * 1000); // -30 minutes

    // Status: QUEUED (not activated yet)
    novemberDraw.status = "queued";
    novemberDraw.isActive = false;
    novemberDraw.activationDate = novemberActivation;
    novemberDraw.drawDate = novemberDrawEnd;
    novemberDraw.freezeEntriesAt = novemberFreeze;
    novemberDraw.configurationLocked = false;
    novemberDraw.lockedAt = undefined;

    await novemberDraw.save();

    // ========================================
    // SUMMARY
    // ========================================
    console.log("✅ TEST 2 SETUP COMPLETE\n");

    console.log("📊 OCTOBER DRAW:");
    console.log(`   Status: ${octoberDraw.status} ❄️`);
    console.log(`   Freeze: ${formatDateInAEST(octoberFreeze)} (ALREADY FROZEN)`);
    console.log(`   Ends: ${formatDateInAEST(octoberDrawEnd)} (in 30 mins)\n`);

    console.log("📊 NOVEMBER DRAW:");
    console.log(`   Status: ${novemberDraw.status}`);
    console.log(`   Activates: ${formatDateInAEST(novemberActivation)} (in 4.5 hours)`);
    console.log(`   Ends: ${formatDateInAEST(novemberDrawEnd)} (in ~30 days)\n`);

    console.log("🎯 EXPECTED BEHAVIOR:");
    console.log("   ✅ New entries → November (queued)");
    console.log("   ✅ Frontend: Shows October with freeze banner");
    console.log("   ✅ In 30 mins: Cron completes October");
    console.log("   ✅ In 4.5 hours: Cron activates November");
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await mongoose.connection.close();
    console.log("\n📡 MongoDB connection closed");
  }
}

setupTest2();
