/**
 * routing.test.ts — locks the calibrated deflection routing.
 * Runs the labelled set through tryDeflect at PRODUCTION (default) thresholds.
 * Asserts ZERO mis-routes (the failure that triggered the 2026-06-27 fix) and that
 * correct deflections meet the calibrated baseline. Offline; no LLM/Mongo.
 * Run: npm run test:chat-routing
 */
import assert from "node:assert/strict";
import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(process.cwd(), ".env.local") });

import { tryDeflect } from "../deflection";
import { ROUTING_GOLDEN_SET } from "./routingGoldenSet";

// Calibrated floor: correct deflections must meet/exceed this (set from Task 4 output).
const MIN_CORRECT_DEFLECT = 45; // ← calibrated baseline integer from Task 4.

async function main() {
  let correctDeflect = 0;
  const misRoutes: string[] = [];

  for (const c of ROUTING_GOLDEN_SET) {
    const res = await tryDeflect(c.question);
    const deflectedId = res.answered ? res.sources?.[0]?.id : undefined;
    if (c.expect.kind === "deflect") {
      if (deflectedId === c.expect.faqId) correctDeflect++;
      else if (deflectedId) misRoutes.push(`"${c.question}" → id${deflectedId}, expected id${c.expect.faqId}`);
      // abstaining on a should-deflect is a missed deflection (allowed; not a mis-route).
    } else if (deflectedId) {
      misRoutes.push(`"${c.question}" → id${deflectedId}, expected ${c.expect.kind}`);
    }
  }

  for (const m of misRoutes) console.error(`  MIS-ROUTE  ${m}`);
  assert.strictEqual(misRoutes.length, 0, `${misRoutes.length} mis-route(s) — see above`);
  assert.ok(
    correctDeflect >= MIN_CORRECT_DEFLECT,
    `correctDeflect ${correctDeflect} < calibrated baseline ${MIN_CORRECT_DEFLECT}`
  );

  console.log(`PASS — routing lock: 0 mis-routes, ${correctDeflect} correct deflections (>= ${MIN_CORRECT_DEFLECT})`);
}
main().catch((e) => { console.error(e); process.exit(1); });
