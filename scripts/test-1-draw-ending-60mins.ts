/**
 * TEST SCRIPT 1: Draw Ending in 60 Minutes
 *
 * Setup:
 * - October Draw: ACTIVE, ends in 60 minutes from now
 * - Freeze: 30 minutes from now
 * - November Draw: QUEUED, activates 4 hours after October ends
 *
 * This simulates a normal active draw that will freeze and complete soon.
 */

import mongoose from "mongoose";
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import MajorDraw from "@/models/MajorDraw";
import { formatDateInAEST } from "@/utils/common/timezone";

async function setupTest1() {
  try {
    console.log("🧪 TEST 1: Setting up draw ending in 60 minutes...\n");

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
    // OCTOBER: Active, ends in 60 minutes
    // ========================================
    const octoberDrawEnd = new Date(now.getTime() + 60 * 60 * 1000); // +60 minutes
    const octoberFreeze = new Date(now.getTime() + 30 * 60 * 1000); // +30 minutes

    // Status: ACTIVE (not frozen yet, draw hasn't ended)
    octoberDraw.status = "active";
    octoberDraw.isActive = true;
    octoberDraw.drawDate = octoberDrawEnd;
    octoberDraw.freezeEntriesAt = octoberFreeze;
    octoberDraw.configurationLocked = false; // Not locked yet (freeze hasn't started)
    octoberDraw.lockedAt = undefined;

    await octoberDraw.save();

    // ========================================
    // NOVEMBER: Queued, activates 4 hours after October ends
    // ========================================
    const novemberActivation = new Date(octoberDrawEnd.getTime() + 4 * 60 * 60 * 1000); // +4 hours from October end
    const novemberDrawEnd = new Date(novemberActivation.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days
    const novemberFreeze = new Date(novemberDrawEnd.getTime() - 30 * 60 * 1000); // -30 minutes

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
    console.log("✅ TEST 1 SETUP COMPLETE\n");

    console.log("📊 OCTOBER DRAW:");
    console.log(`   Status: ${octoberDraw.status}`);
    console.log(`   Freeze: ${formatDateInAEST(octoberFreeze)} (in 30 mins)`);
    console.log(`   Ends: ${formatDateInAEST(octoberDrawEnd)} (in 60 mins)\n`);

    console.log("📊 NOVEMBER DRAW:");
    console.log(`   Status: ${novemberDraw.status}`);
    console.log(`   Activates: ${formatDateInAEST(novemberActivation)} (in 4 hours 60 mins)`);
    console.log(`   Ends: ${formatDateInAEST(novemberDrawEnd)} (in ~30 days)\n`);

    console.log("🎯 TIMELINE:");
    console.log("   Now: Test starts");
    console.log("   +30 mins: October freezes");
    console.log("   +60 mins: October ends (completed)");
    console.log("   +60 to +300 mins: GAP PERIOD (4 hours)");
    console.log("   +300 mins: November activates");
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await mongoose.connection.close();
    console.log("\n📡 MongoDB connection closed");
  }
}

setupTest1();
