/**
 * The recorded checkout intent — the server's own answer to "did this customer
 * apply a code to the purchase they just paid for?", used when the Stripe stamp
 * is missing.
 *
 * WHY IT EXISTS. `attachCampaignCodeToCheckout` stamps `campaignCode` onto the
 * unpaid Stripe object immediately before the charge, and the browser caps that
 * request at 15s and charges regardless of how it ends. Observed live on this
 * branch: the server answered `200 in 14903ms`, the browser had already aborted,
 * the card was charged, and the webhook saw no `campaignCode` — the customer
 * paid and their entries did not land. Raising the cap does not close that; a
 * dropped connection or a closed tab reproduces it at any cap. What closes it is
 * the asymmetry: THE SERVER knows the customer asked for the code, so the server
 * writes it down before the slow Stripe round trip, and `checkAndRedeemCampaign`
 * finishes the job off the paid webhook.
 *
 * WHAT IS PINNED HERE — the four properties the recovery depends on:
 *   1. Applying a code records the intent on THAT customer's issuance.
 *   2. REMOVING a code clears it, so a removal is honoured by the recovery
 *      exactly as it is by the stamp. Without this, "apply → remove → pay"
 *      would redeem a code the customer had taken off.
 *   3. The window expires. An intent older than `CHECKOUT_INTENT_WINDOW_MS`
 *      is not recoverable, which is what stops a later purchase or a renewal
 *      invoice auto-redeeming a code the customer never applied to it.
 *   4. A non-active issuance is never a candidate — a spent grant cannot be
 *      recovered into a second redemption.
 *
 * NOT PINNED HERE: that `RedemptionService` then honours it. That is deliberate —
 * `resolveCheckoutIntent` returns a CANDIDATE and redemption re-applies every
 * eligibility / expiry / already-spent gate, so this can never grant something
 * the normal path would refuse. `npm run test:redeemables` owns those gates.
 *
 * FIXTURE SAFETY. Users, campaigns and issuances are created here and removed in
 * `finally`; the campaign code is namespaced by run so it cannot collide with a
 * real one.
 */
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import MonthlyEntryCampaign from "@/models/MonthlyEntryCampaign";
import RedeemableIssuance from "@/models/RedeemableIssuance";
import { CampaignCodeValidationService } from "../CampaignCodeValidationService";

const RUN_ID = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual) ?? "undefined";
  const e = JSON.stringify(expected) ?? "undefined";
  if (a === e) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}\n        expected: ${e}\n        actual:   ${a}`);
  }
}

const userIds: mongoose.Types.ObjectId[] = [];
const campaignIds: mongoose.Types.ObjectId[] = [];

let cleanedUp = false;
async function cleanup(): Promise<void> {
  if (cleanedUp) return;
  cleanedUp = true;
  const steps: Array<[string, () => Promise<unknown>]> = [
    ["campaigns", () => MonthlyEntryCampaign.deleteMany({ _id: { $in: campaignIds } })],
    ["issuances", () => RedeemableIssuance.deleteMany({ userId: { $in: userIds } })],
    ["users", () => User.deleteMany({ _id: { $in: userIds } })],
    ["connection", () => mongoose.connection.close()],
  ];
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (error) {
      console.error(`  CLEANUP FAILED (${name}) — check for leaked fixtures`, error);
    }
  }
}

const onSignal = (signal: NodeJS.Signals) => {
  console.error(`\nReceived ${signal} — cleaning up fixtures before exiting.`);
  void cleanup()
    .catch((error) => console.error("cleanup failed:", error))
    .finally(() => process.exit(130));
};
process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);

async function run() {
  await connectDB();

  try {
    const campaign = await MonthlyEntryCampaign.create({
      monthKey: "2026-08",
      name: `Checkout intent ${RUN_ID}`,
      entriesAmount: 4,
      campaignMode: "global",
      targetingMode: "all-active-subscribers",
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 30 * DAY_MS),
      neverExpires: false,
      validForHours: 72,
      isActive: true,
      code: `INTENTX${RUN_ID}`.slice(0, 32),
      requiresPurchase: false,
      purchaseRequirement: "none",
    });
    campaignIds.push(campaign._id as unknown as mongoose.Types.ObjectId);
    const campaignId = campaign._id as unknown as mongoose.Types.ObjectId;

    const user = await User.create({
      firstName: "Intent",
      lastName: "Recovery",
      email: `intent-recovery-${RUN_ID}@example.test`,
      isActive: true,
      isEmailVerified: true,
    });
    const userId = user._id as unknown as mongoose.Types.ObjectId;
    userIds.push(userId);

    const issuance = await RedeemableIssuance.create({
      campaignId,
      userId,
      monthKey: "2026-08",
      status: "active",
      source: "monthly-coupon",
      entriesAmount: 4,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 3 * DAY_MS),
    });

    // ---------------------------------------------------------------------
    console.log("1. Applying a code records the intent, and it is recoverable");
    {
      check(
        "no intent before the customer applies anything",
        await CampaignCodeValidationService.resolveCheckoutIntent({ userId: String(userId) }),
        null
      );

      await CampaignCodeValidationService.recordCheckoutIntent({
        userId: String(userId),
        campaignCode: campaign.code,
        targetId: "pi_test_checkout_intent",
      });

      const recovered = await CampaignCodeValidationService.resolveCheckoutIntent({ userId: String(userId) });
      check("the canonical campaign code comes back", recovered?.code, campaign.code);
      check("…pointing at the customer's own issuance", recovered?.issuanceId, String(issuance._id));
      check("…and carrying the Stripe object for support", recovered?.intentTargetId, "pi_test_checkout_intent");
    }

    // ---------------------------------------------------------------------
    console.log("\n2. REMOVING the code clears the intent — a removal is honoured by the recovery too");
    {
      await CampaignCodeValidationService.recordCheckoutIntent({
        userId: String(userId),
        campaignCode: null,
        targetId: "pi_test_checkout_intent",
      });
      check(
        "nothing to recover after the customer removes it",
        await CampaignCodeValidationService.resolveCheckoutIntent({ userId: String(userId) }),
        null
      );
      const row = await RedeemableIssuance.findById(issuance._id).select("checkoutIntentAt").lean();
      check("…and the stored intent really is cleared, not just filtered out", row?.checkoutIntentAt ?? null, null);
    }

    // ---------------------------------------------------------------------
    console.log("\n3. The window expires — a stale intent cannot be recovered into a later purchase");
    {
      const stale = new Date(Date.now() - CampaignCodeValidationService.CHECKOUT_INTENT_WINDOW_MS - 60_000);
      await RedeemableIssuance.updateOne(
        { _id: issuance._id },
        { $set: { checkoutIntentAt: stale, checkoutIntentTargetId: "pi_test_checkout_intent" } }
      );
      check(
        "an intent older than the window is not a candidate",
        await CampaignCodeValidationService.resolveCheckoutIntent({ userId: String(userId) }),
        null
      );

      // Control: the same row, one minute INSIDE the window, is.
      const fresh = new Date(Date.now() - CampaignCodeValidationService.CHECKOUT_INTENT_WINDOW_MS + 60_000);
      await RedeemableIssuance.updateOne({ _id: issuance._id }, { $set: { checkoutIntentAt: fresh } });
      const inWindow = await CampaignCodeValidationService.resolveCheckoutIntent({ userId: String(userId) });
      check("control — one minute inside the window it still is", inWindow?.code, campaign.code);
    }

    // ---------------------------------------------------------------------
    console.log("\n4. A spent grant is never a candidate");
    {
      await RedeemableIssuance.updateOne(
        { _id: issuance._id },
        { $set: { status: "redeemed", checkoutIntentAt: new Date() } }
      );
      check(
        "a redeemed issuance cannot be recovered into a second redemption",
        await CampaignCodeValidationService.resolveCheckoutIntent({ userId: String(userId) }),
        null
      );
    }

    // ---------------------------------------------------------------------
    console.log("\n5. It never throws on bad input — the sale must never depend on it");
    {
      await CampaignCodeValidationService.recordCheckoutIntent({
        userId: "not-an-object-id",
        campaignCode: campaign.code,
        targetId: "pi_x",
      });
      await CampaignCodeValidationService.recordCheckoutIntent({
        userId: String(userId),
        campaignCode: "NO-SUCH-CAMPAIGN-CODE",
        targetId: "pi_x",
      });
      check(
        "a malformed user id resolves to null rather than throwing",
        await CampaignCodeValidationService.resolveCheckoutIntent({ userId: "not-an-object-id" }),
        null
      );
      console.log("  PASS  recordCheckoutIntent survives a bad user id and an unknown code");
    }
  } finally {
    await cleanup();
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed");
}

run().catch((error) => {
  console.error("checkout-intent-recovery.test.ts crashed:", error);
  process.exit(1);
});
