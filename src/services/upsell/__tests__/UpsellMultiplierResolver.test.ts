import assert from "node:assert/strict";
import dotenv from "dotenv";
import path from "node:path";

// Load .env.local for tsx test execution
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import UpsellMultiplierConfig, {
  UPSELL_MULTIPLIER_CONFIG_ID,
} from "@/models/UpsellMultiplierConfig";
import {
  getUpsellMultiplier,
  getAllUpsellMultipliers,
} from "@/services/upsell/UpsellMultiplierResolver";

async function main() {
  await connectDB();

  // Reset
  await UpsellMultiplierConfig.findByIdAndDelete(UPSELL_MULTIPLIER_CONFIG_ID);

  // 1. Defaults: 10 / 2 / 2
  const defaults = await getAllUpsellMultipliers();
  assert.equal(defaults.membership, 10, "default membership = 10");
  assert.equal(defaults.oneTime, 2, "default oneTime = 2");
  assert.equal(defaults.additional, 2, "default additional = 2");

  // 2. Per-category getter
  assert.equal(await getUpsellMultiplier("membership"), 10);
  assert.equal(await getUpsellMultiplier("one-time"), 2);
  assert.equal(await getUpsellMultiplier("additional"), 2);

  // 3. Persist override
  const config = await UpsellMultiplierConfig.getOrCreate();
  config.membership = 50;
  await config.save();
  assert.equal(await getUpsellMultiplier("membership"), 50);

  // Cleanup
  await UpsellMultiplierConfig.findByIdAndDelete(UPSELL_MULTIPLIER_CONFIG_ID);
  await mongoose.connection.close();
  console.log("✅ UpsellMultiplierResolver tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
