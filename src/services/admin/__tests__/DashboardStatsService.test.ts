import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { strict as assert } from "node:assert";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import { DashboardStatsService } from "@/services/admin/DashboardStatsService";

async function run() {
  await connectDB();
  try {
    const svc = new DashboardStatsService();
    const stats = await svc.getStats({ dateRange: "today" });
    assert.ok(stats.users, "users block present");
    assert.ok(stats.revenue, "revenue block present");
    assert.ok(stats.majorDraw, "majorDraw block present");
    assert.equal(typeof stats.conversionRate, "number");
    assert.ok(stats.facebookAds, "facebookAds block present");
    console.log("✓ DashboardStatsService returns canonical shape");
  } finally {
    await mongoose.disconnect();
  }
}

void run().catch((e) => {
  console.error(e);
  process.exit(1);
});
