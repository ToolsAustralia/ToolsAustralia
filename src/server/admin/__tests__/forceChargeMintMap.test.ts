/**
 * mapMintFailureToForceChargeReason — pure mapper from a mintCurrentCycleInvoice failure reason to the
 * existing ForceChargeResult vocabulary (used by the no_held_draft re-bill fallback in
 * forceChargeCurrentCycle). Dynamic import after dotenv so `@/lib/stripe` doesn't throw at load.
 * Run: npm run test:force-charge-mint-map
 */
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import assert from "node:assert/strict";

type MapFn = (typeof import("../forceChargePastDue"))["mapMintFailureToForceChargeReason"];
let map: MapFn;

async function run() {
  ({ mapMintFailureToForceChargeReason: map } = await import("../forceChargePastDue"));

  // A real card decline / Stripe mint error → pay_failed (logged as a failed row, drives dunning).
  assert.equal(map("charge_failed"), "pay_failed", "charge_failed → pay_failed");
  assert.equal(map("anchor_failed"), "pay_failed", "anchor_failed → pay_failed");
  assert.equal(map("no_minted_invoice"), "pay_failed", "no_minted_invoice → pay_failed");
  // A prior re-bill already collected → the member is current.
  assert.equal(map("already_collected"), "period_already_paid", "already_collected → period_already_paid");
  // Not collectible / scheduled-to-cancel → don't re-bill.
  assert.equal(map("subscription_inactive"), "subscription_inactive", "subscription_inactive → subscription_inactive");
  assert.equal(map("member_ending"), "subscription_inactive", "member_ending → subscription_inactive");
  // A concurrent recovery holds the claim → retry shortly.
  assert.equal(map("claim_held"), "recent_charge_attempt", "claim_held → recent_charge_attempt");

  console.log("mapMintFailureToForceChargeReason tests passed");
}
run().catch((e) => { console.error(e); process.exit(1); });
