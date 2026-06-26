/**
 * currentPromo.test.ts
 *
 * Unit tests for getCurrentPromoBlurb — the live-promo blurb for Cobber's prompt.
 * Fully deps-injected: NO Mongo, NO network. Verifies formatting + the fail-safe.
 *
 * Run: npm run test:chat-promo
 */

import assert from "node:assert/strict";
import { getCurrentPromoBlurb } from "../currentPromo";
import type { EffectiveForBannerEntry } from "@/types/admin";

let failures = 0;
function pass(label: string) {
  console.log(`  PASS  ${label}`);
}
function fail(label: string, msg: string) {
  failures++;
  console.error(`  FAIL  ${label}: ${msg}`);
}

function entry(multiplier: number | null): EffectiveForBannerEntry {
  return { multiplier, source: "none" };
}

async function run() {
  // 1. No active promo (all null / 1x) → null.
  {
    const r = await getCurrentPromoBlurb({
      getEffectiveForBanner: async () => ({
        "membership-packages": entry(null),
        "one-time-packages": entry(1),
        "mini-packages": entry(null),
      }),
    });
    if (r !== null) fail("no promo → null", `got ${JSON.stringify(r)}`);
    else pass("no active promo (null/1x) → null");
  }

  // 2. Single uniform multiplier → one blurb naming the multiplier.
  {
    const r = await getCurrentPromoBlurb({
      getEffectiveForBanner: async () => ({
        "membership-packages": entry(10),
        "one-time-packages": entry(10),
        "mini-packages": entry(10),
      }),
    });
    if (!r || !r.includes("10X")) fail("uniform 10X → blurb", `got ${JSON.stringify(r)}`);
    else if (/membership purchases;|on one-time/.test(r)) fail("uniform should not list per-type", r);
    else pass("uniform 10X → single blurb mentioning 10X");
  }

  // 3. Mixed multipliers → per-type list (only the >1 ones).
  {
    const r = await getCurrentPromoBlurb({
      getEffectiveForBanner: async () => ({
        "membership-packages": entry(10),
        "one-time-packages": entry(5),
        "mini-packages": entry(1),
      }),
    });
    if (!r) fail("mixed → blurb", "got null");
    else if (!r.includes("10X") || !r.includes("5X")) fail("mixed lists both 10X and 5X", r);
    else if (r.includes("Mini Draw packs")) fail("mixed excludes the 1x mini packs", r);
    else pass("mixed (10X/5X/1x) → lists 10X + 5X, excludes 1x");
  }

  // 4. Fail-safe: resolver throws → null (never throws, never blocks a chat).
  {
    const r = await getCurrentPromoBlurb({
      getEffectiveForBanner: async () => {
        throw new Error("DB down");
      },
    });
    if (r !== null) fail("throw → null (fail-safe)", `got ${JSON.stringify(r)}`);
    else pass("resolver throws → null (fail-safe, no throw)");
  }

  console.log(`\n${"─".repeat(60)}`);
  if (failures > 0) {
    console.error(`currentPromo tests FAILED — ${failures} assertion(s)`);
    process.exit(1);
  }
  console.log("PASS — currentPromo test (no Mongo, fail-safe verified)");
  process.exit(0);
}

void run().catch((err) => {
  console.error(err);
  process.exit(1);
});
