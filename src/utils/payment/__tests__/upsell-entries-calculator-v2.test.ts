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
import { calculateUpsellEntriesForOffer } from "@/utils/payment/upsell-entries-calculator";

async function main() {
  await connectDB();

  // Cleanup: delete any existing config before starting
  await UpsellMultiplierConfig.findByIdAndDelete(UPSELL_MULTIPLIER_CONFIG_ID);

  // 1. Defaults (membership 10, one-time 2, additional 2).

  // Membership upsells: 10× of template pack's base entries.
  // apprentice base 3 → 30, tradie base 15 → 150, foreman base 30 → 300
  assert.equal(
    await calculateUpsellEntriesForOffer("membership-upsell-tradie"),
    30,
    "membership-upsell-tradie with default multiplier 10 and apprentice base 3"
  );
  assert.equal(
    await calculateUpsellEntriesForOffer("membership-upsell-foreman"),
    150,
    "membership-upsell-foreman with default multiplier 10 and tradie base 15"
  );
  assert.equal(
    await calculateUpsellEntriesForOffer("membership-upsell-boss"),
    300,
    "membership-upsell-boss with default multiplier 10 and foreman base 30"
  );

  // One-time upsells: 2× of base.
  assert.equal(
    await calculateUpsellEntriesForOffer("onetime-upsell-apprentice"),
    6,
    "onetime-upsell-apprentice: 3 × 2"
  );
  assert.equal(
    await calculateUpsellEntriesForOffer("onetime-upsell-tradie"),
    30,
    "onetime-upsell-tradie: 15 × 2"
  );
  assert.equal(
    await calculateUpsellEntriesForOffer("onetime-upsell-foreman"),
    60,
    "onetime-upsell-foreman: 30 × 2"
  );
  assert.equal(
    await calculateUpsellEntriesForOffer("onetime-upsell-boss"),
    300,
    "onetime-upsell-boss: 150 × 2"
  );
  assert.equal(
    await calculateUpsellEntriesForOffer("onetime-upsell-power"),
    1200,
    "onetime-upsell-power: 600 × 2"
  );
  assert.equal(
    await calculateUpsellEntriesForOffer("onetime-upsell-vip"),
    3000,
    "onetime-upsell-vip: 1500 × 2"
  );

  // Additional upsells: 2× of base.
  assert.equal(
    await calculateUpsellEntriesForOffer("additional-upsell-tradie"),
    30,
    "additional-upsell-tradie: 15 × 2"
  );
  assert.equal(
    await calculateUpsellEntriesForOffer("additional-upsell-foreman"),
    60,
    "additional-upsell-foreman: 30 × 2"
  );
  assert.equal(
    await calculateUpsellEntriesForOffer("additional-upsell-boss"),
    300,
    "additional-upsell-boss: 150 × 2"
  );
  assert.equal(
    await calculateUpsellEntriesForOffer("additional-upsell-power"),
    1200,
    "additional-upsell-power: 600 × 2"
  );
  assert.equal(
    await calculateUpsellEntriesForOffer("additional-upsell-vip"),
    3000,
    "additional-upsell-vip: 1500 × 2"
  );

  // Mini upsells — no multiplier, entries == trigger base.
  assert.equal(
    await calculateUpsellEntriesForOffer("mini-upsell-1"),
    1,
    "mini-upsell-1: base 1"
  );
  assert.equal(
    await calculateUpsellEntriesForOffer("mini-upsell-2"),
    5,
    "mini-upsell-2: base 5"
  );
  assert.equal(
    await calculateUpsellEntriesForOffer("mini-upsell-3"),
    10,
    "mini-upsell-3: base 10"
  );
  assert.equal(
    await calculateUpsellEntriesForOffer("mini-upsell-additional-tradie"),
    25,
    "mini-upsell-additional-tradie: base 25"
  );
  assert.equal(
    await calculateUpsellEntriesForOffer("mini-upsell-additional-foreman"),
    50,
    "mini-upsell-additional-foreman: base 50"
  );
  assert.equal(
    await calculateUpsellEntriesForOffer("mini-upsell-additional-boss"),
    125,
    "mini-upsell-additional-boss: base 125"
  );
  assert.equal(
    await calculateUpsellEntriesForOffer("mini-upsell-additional-power"),
    250,
    "mini-upsell-additional-power: base 250"
  );
  assert.equal(
    await calculateUpsellEntriesForOffer("mini-upsell-additional-vip"),
    500,
    "mini-upsell-additional-vip: base 500"
  );

  // 2. Change membership multiplier to 100 — Tradie sub upsell becomes 300 (3 × 100).
  const config = await UpsellMultiplierConfig.getOrCreate();
  config.membership = 100;
  await config.save();
  assert.equal(
    await calculateUpsellEntriesForOffer("membership-upsell-tradie"),
    300,
    "membership-upsell-tradie with multiplier 100 and apprentice base 3"
  );

  // Mini upsell unaffected by membership multiplier change.
  assert.equal(
    await calculateUpsellEntriesForOffer("mini-upsell-additional-tradie"),
    25,
    "mini-upsell-additional-tradie unaffected by membership multiplier change"
  );

  // 3. Unknown offer → 0.
  assert.equal(
    await calculateUpsellEntriesForOffer("does-not-exist"),
    0,
    "unknown offer returns 0"
  );

  // Cleanup: delete config after test completes
  await UpsellMultiplierConfig.findByIdAndDelete(UPSELL_MULTIPLIER_CONFIG_ID);
  await mongoose.connection.close();
  console.log("✅ upsell-entries-calculator-v2 tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
