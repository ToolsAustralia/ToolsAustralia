/**
 * TEST SCRIPT 3: Draw Just Ended
 *
 * Setup:
 * - October Draw: COMPLETED, ended exactly now
 * - November Draw: QUEUED, activates 4 hours from now
 *
 * This simulates the gap period where October just completed and November
 * will activate in 4 hours (simulating 8 PM → 12 AM production schedule).
 */

import mongoose from "mongoose";
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import MajorDraw from "@/models/MajorDraw";
import { formatDateInAEST } from "@/utils/common/timezone";

async function setupTest3() {
  try {
    console.log("🧪 TEST 3: Setting up draw that just ended (GAP PERIOD)...\n");

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
    // OCTOBER: Completed, ended exactly now
    // ========================================
    const octoberDrawEnd = new Date(now.getTime()); // Ended NOW
    const octoberFreeze = new Date(now.getTime() - 30 * 60 * 1000); // -30 minutes (freeze was 30 mins ago)

    // Status: COMPLETED (draw has ended)
    octoberDraw.status = "completed";
    octoberDraw.isActive = false;
    octoberDraw.drawDate = octoberDrawEnd;
    octoberDraw.freezeEntriesAt = octoberFreeze;
    octoberDraw.configurationLocked = true; // Locked (completed)
    octoberDraw.lockedAt = octoberFreeze;

    await octoberDraw.save();

    // ========================================
    // NOVEMBER: Queued, activates 4 hours from now
    // ========================================
    const novemberActivation = new Date(now.getTime() + 4 * 60 * 60 * 1000); // +4 hours from now
    const novemberDrawEnd = new Date(novemberActivation.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days
    const novemberFreeze = new Date(novemberDrawEnd.getTime() - 30 * 60 * 1000); // -30 minutes

    // Status: QUEUED (not activated yet, waiting for activation time)
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
    console.log("✅ TEST 3 SETUP COMPLETE\n");

    console.log("📊 OCTOBER DRAW:");
    console.log(`   Status: ${octoberDraw.status} ✅ (COMPLETED)`);
    console.log(`   Ended: ${formatDateInAEST(octoberDrawEnd)} (JUST NOW)`);
    console.log(`   Locked: ${formatDateInAEST(octoberFreeze)}\n`);

    console.log("📊 NOVEMBER DRAW:");
    console.log(`   Status: ${novemberDraw.status}`);
    console.log(`   Activates: ${formatDateInAEST(novemberActivation)} (in 4 hours)`);
    console.log(`   Ends: ${formatDateInAEST(novemberDrawEnd)} (in ~30 days)\n`);

    console.log("🎯 EXPECTED BEHAVIOR (GAP PERIOD):");
    console.log("   ✅ New entries → November (queued)");
    console.log("   ✅ Frontend: Shows October with 'Draw Ended' + Facebook link");
    console.log("   ✅ In 4 hours: Cron activates November automatically");
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await mongoose.connection.close();
    console.log("\n📡 MongoDB connection closed");
  }
}

setupTest3();
