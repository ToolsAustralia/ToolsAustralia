/**
 * TEST SCRIPT 4: Next Draw Active (Post-Gap Period)
 *
 * Setup:
 * - October Draw: COMPLETED, ended 4+ hours ago
 * - November Draw: ACTIVE, activated exactly now
 *
 * This simulates the state after the gap period ends and the next draw becomes active.
 * October is fully completed, November is now accepting entries.
 */

import mongoose from "mongoose";
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import MajorDraw from "@/models/MajorDraw";
import { formatDateInAEST } from "@/utils/common/timezone";

async function setupTest4() {
  try {
    console.log("🧪 TEST 4: Setting up next draw as ACTIVE (post-gap)...\n");

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
    // OCTOBER: Completed, ended 4+ hours ago
    // ========================================
    const octoberDrawEnd = new Date(now.getTime() - 5 * 60 * 60 * 1000); // -5 hours (ended 5 hours ago)
    const octoberFreeze = new Date(octoberDrawEnd.getTime() - 30 * 60 * 1000); // -30 minutes before draw end

    // Status: COMPLETED (draw ended hours ago)
    octoberDraw.status = "completed";
    octoberDraw.isActive = false;
    octoberDraw.drawDate = octoberDrawEnd;
    octoberDraw.freezeEntriesAt = octoberFreeze;
    octoberDraw.configurationLocked = true; // Locked (completed)
    octoberDraw.lockedAt = octoberFreeze;

    await octoberDraw.save();

    // ========================================
    // NOVEMBER: Active, activated exactly now
    // ========================================
    const novemberActivation = new Date(octoberDrawEnd.getTime() + 4 * 60 * 60 * 1000); // +4 hours from October end (which is now - 1 hour)
    const novemberDrawEnd = new Date(novemberActivation.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days
    const novemberFreeze = new Date(novemberDrawEnd.getTime() - 30 * 60 * 1000); // -30 minutes

    // Status: ACTIVE (activation time has passed, accepting entries now)
    novemberDraw.status = "active";
    novemberDraw.isActive = true;
    novemberDraw.activationDate = novemberActivation;
    novemberDraw.drawDate = novemberDrawEnd;
    novemberDraw.freezeEntriesAt = novemberFreeze;
    novemberDraw.configurationLocked = false; // Not locked yet
    novemberDraw.lockedAt = undefined;

    await novemberDraw.save();

    // ========================================
    // SUMMARY
    // ========================================
    console.log("✅ TEST 4 SETUP COMPLETE\n");

    console.log("📊 OCTOBER DRAW:");
    console.log(`   Status: ${octoberDraw.status} ✅ (COMPLETED)`);
    console.log(`   Ended: ${formatDateInAEST(octoberDrawEnd)} (5 hours ago)\n`);

    console.log("📊 NOVEMBER DRAW:");
    console.log(`   Status: ${novemberDraw.status} 🚀 (ACTIVE NOW)`);
    console.log(`   Activated: ${formatDateInAEST(novemberActivation)} (1 hour ago)`);
    console.log(`   Ends: ${formatDateInAEST(novemberDrawEnd)} (in ~30 days)`);
    console.log(`   Freezes: ${formatDateInAEST(novemberFreeze)} (in ~29 days 23.5 hours)\n`);

    console.log("🎯 EXPECTED BEHAVIOR:");
    console.log("   ✅ New entries → November (active)");
    console.log("   ✅ Frontend: Shows November with countdown");
    console.log("   ✅ October is in history (completed)");
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await mongoose.connection.close();
    console.log("\n📡 MongoDB connection closed");
  }
}

setupTest4();
