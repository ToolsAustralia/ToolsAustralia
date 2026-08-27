/**
 * `CampaignService` enrolment, against a live database.
 *
 * THE TRIGGER IS THE TARGETING. Two of the three eligibility moments describe
 * people who by definition have no active subscription (a one-time buyer
 * without a membership; a guest who just registered). Every stored-audience
 * branch keys off `subscription.isActive`, so without the `triggerIsTargeting`
 * relaxation those two triggers would return `not_applicable` forever,
 * silently, under every targeting mode an admin can pick. Section 1 proves the
 * relaxation is real AND that it is scoped to personal-window campaigns only.
 * Section 2 proves the same for the email-verified waiver — which only a
 * database can prove, because what defeated the first attempt was the value
 * Mongoose actually PERSISTS, not the value the code reads.
 *
 * This is the eligibility contract `POST /api/bonus-codes/v1/issue` depends on:
 * the endpoint resolves the customer, then hands `CampaignService` a trigger and
 * a campaign code and does nothing else. If either relaxation regresses, every
 * Klaviyo flow sends a discount email for a code that was never minted.
 *
 * The pure companion is `npm run test:trigger-eligibility`, which asserts the
 * same rules against hand-built campaign objects with no database.
 *
 * NOTHING HERE EMITS. `CampaignService` imports no Klaviyo, email or ads client,
 * directly or transitively — minting and emailing were split apart deliberately,
 * and the emit now lives behind `mintBonusCodeForTrigger`, which this suite does
 * not load. There is therefore no stub to install and no `VERCEL_ENV` to force.
 *
 * FIXTURE SAFETY. All users/campaigns are created here and removed in
 * `finally`. Issuances are deleted by `userId` (all users are new this run).
 * Every campaign code is namespaced by run (`T12TRG<RUN_ID>…`), so no fixture
 * can ever collide with a real campaign code.
 */
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import MonthlyEntryCampaign from "@/models/MonthlyEntryCampaign";
import RedeemableIssuance from "@/models/RedeemableIssuance";
import { CampaignService } from "../CampaignService";

const RUN_ID = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}\n        expected: ${e}\n        actual:   ${a}`);
  }
}

const userIds: mongoose.Types.ObjectId[] = [];
const campaignIds: mongoose.Types.ObjectId[] = [];

async function makeUser(suffix: string, extra: Record<string, unknown> = {}) {
  const user = await User.create({
    firstName: "Task12",
    lastName: "Trigger",
    email: `task12-trigger-${RUN_ID}-${suffix}@example.test`,
    isActive: true,
    isEmailVerified: true,
    ...extra,
  });
  const id = user._id as unknown as mongoose.Types.ObjectId;
  userIds.push(id);
  return id;
}

async function makeCampaign(suffix: string, over: Record<string, unknown> = {}) {
  const campaign = await MonthlyEntryCampaign.create({
    monthKey: "2026-08",
    name: `Task12 trigger ${suffix}`,
    entriesAmount: 6,
    campaignMode: "unique",
    targetingMode: "all-active-subscribers",
    startsAt: new Date(Date.now() - 60_000),
    endsAt: new Date(Date.now() + 30 * DAY_MS),
    neverExpires: false,
    validForHours: 72,
    isActive: true,
    code: `T12TRG${RUN_ID}${suffix}`.slice(0, 32),
    requiresPurchase: false,
    purchaseRequirement: "none",
    ...over,
  });
  campaignIds.push(campaign._id as unknown as mongoose.Types.ObjectId);
  return campaign;
}

function rowsFor(campaignId: mongoose.Types.ObjectId, userId: mongoose.Types.ObjectId) {
  return RedeemableIssuance.countDocuments({ campaignId, userId });
}

/**
 * Idempotent teardown.
 *
 * Every fixture code is namespaced by run, so a leak here cannot block a real
 * campaign — but a leaked campaign row is still a live campaign in whatever
 * database `MONGODB_URI` points at, so clean up regardless of how the run ends.
 *
 * Every step is individually caught so one failure cannot skip the rest, and
 * the campaign delete runs FIRST because it is the one that matters.
 */
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

/**
 * Ctrl-C is the one ending `finally` cannot cover, and section 1's legacy
 * fixture is deliberately UNSCOPED — `isActive: true`, `all-active-subscribers`,
 * 6 entries, a 30-day window — because that is what makes it a legacy campaign.
 * Leaked, `ensureActiveCampaignIssuancesForUser` enrols every active subscriber
 * into it on their next /my-account load, which section 2's own passing control
 * ("the wallet sweep still enrols a VERIFIED customer") proves it would do.
 * `cleanup` is idempotent, so racing the `finally` is harmless.
 */
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
    // ---------------------------------------------------------------------
    console.log("1. A customer with no active subscription is enrolled when — and only when — a trigger says so");
    // Two campaigns, identical but for `validForHours`; one subscription-less
    // user; the same explicit trigger on both. `triggerIsTargeting` requires
    // BOTH a trigger and a personal window, so the split isolates it exactly.
    {
      const userId = await makeUser("no-sub", { subscription: { isActive: false } });
      const personal = await makeCampaign("PW", { validForHours: 72 });
      const legacy = await makeCampaign("LG", { validForHours: undefined });
      const personalId = personal._id as unknown as mongoose.Types.ObjectId;
      const legacyId = legacy._id as unknown as mongoose.Types.ObjectId;

      const personalResult = await CampaignService.ensureCampaignIssuanceForUser({
        userId: String(userId),
        campaignCode: personal.code,
        trigger: "one-time-purchase",
      });
      check("a personal-window campaign enrols them on the trigger alone", personalResult.outcome, "minted");
      check("…writing one row", await rowsFor(personalId, userId), 1);

      const legacyResult = await CampaignService.ensureCampaignIssuanceForUser({
        userId: String(userId),
        campaignCode: legacy.code,
        trigger: "one-time-purchase",
      });
      check(
        "the same trigger does NOT widen a legacy campaign — no subscription, no enrolment",
        legacyResult.outcome,
        "not_applicable"
      );
      check("…and writes nothing", await rowsFor(legacyId, userId), 0);

      // The sweep is the read path /my-account calls on every load. If it ever
      // enrolled here it would burn this customer's lifetime grant silently.
      const sweptUserId = await makeUser("sweep-no-sub", { subscription: { isActive: false } });
      const sweepTarget = await makeCampaign("SW", {
        validForHours: 72,
        targetingMode: "manual-users",
        segmentConfig: { includeUserIds: [String(sweptUserId)] },
      });
      const sweepTargetId = sweepTarget._id as unknown as mongoose.Types.ObjectId;
      await CampaignService.ensureActiveCampaignIssuancesForUser(String(sweptUserId));
      check("the wallet sweep enrols nobody into a personal-window campaign", await rowsFor(sweepTargetId, sweptUserId), 0);

      const afterTrigger = await CampaignService.ensureCampaignIssuanceForUser({
        userId: String(sweptUserId),
        campaignCode: sweepTarget.code,
        trigger: "checkout-start",
      });
      check("…though the very same pinned user IS enrolled once a trigger is passed", afterTrigger.outcome, "minted");
    }

    // ---------------------------------------------------------------------
    console.log("\n2. A trigger WAIVES the email-verified requirement — and without one it still gates");
    // THE RULE. A trigger campaign does not ask whether the customer verified
    // their email, because they proved they are real by doing the qualifying
    // thing: cancelling, buying a one-time pack, or starting checkout.
    // checkout-start fires SECONDS after registration, before any verification
    // email could possibly be actioned, so enforcing it there excludes that
    // trigger's entire population — which is exactly what happened: this was
    // written as `?? !triggerIsTargeting`, unreachable because the schema
    // persists `requiresEmailVerified: true` on every campaign, so LOCKIN100
    // could never mint for anyone. Fixed in round 2; these four blocks pin BOTH
    // halves of the boundary so it cannot be quietly re-broken in either
    // direction.
    //
    // The pure companion is `npm run test:trigger-eligibility`, which asserts
    // the same rule against hand-built campaign objects. This file is the half
    // that only a database can prove: that the waiver survives the value
    // Mongoose ACTUALLY PERSISTS, which is what defeated the original attempt.
    {
      // 2a — waived against the persisted SCHEMA DEFAULT. Nobody set the flag
      // here; Mongoose stored `true` anyway. That stored `true` is precisely
      // what made the first fix dead code, so the assertion below is worthless
      // unless we first prove the row really carries it.
      const userId = await makeUser("unverified", { isEmailVerified: false, subscription: { isActive: false } });
      const campaign = await makeCampaign("DS", {
        validForHours: 72,
        targetingMode: "dynamic-segment",
      });
      const campaignId = campaign._id as unknown as mongoose.Types.ObjectId;

      const stored = await MonthlyEntryCampaign.findById(campaignId).lean();
      check(
        "the schema persists requiresEmailVerified: true even though nobody set it",
        stored?.segmentConfig?.requiresEmailVerified,
        true
      );

      const result = await CampaignService.ensureCampaignIssuanceForUser({
        userId: String(userId),
        campaignCode: campaign.code,
        trigger: "checkout-start",
      });
      check(
        "a trigger enrols an UNVERIFIED customer despite that stored requirement",
        result.outcome,
        "minted"
      );
      check("…writing the row the trigger's own population depends on", await rowsFor(campaignId, userId), 1);

      // 2b — waived when an admin set it DELIBERATELY, not just by default.
      // The waiver is unconditional under a trigger: "did they verify?" is a
      // proxy for "are they real", and the trigger answers that directly.
      const explicit = await makeCampaign("DSEXP", {
        validForHours: 72,
        targetingMode: "dynamic-segment",
        segmentConfig: { requiresEmailVerified: true },
      });
      const explicitId = explicit._id as unknown as mongoose.Types.ObjectId;
      const explicitResult = await CampaignService.ensureCampaignIssuanceForUser({
        userId: String(userId),
        campaignCode: explicit.code,
        trigger: "checkout-start",
      });
      check(
        "an explicitly-set requiresEmailVerified is waived under a trigger too",
        explicitResult.outcome,
        "minted"
      );
      check("…and writes its row", await rowsFor(explicitId, userId), 1);
    }
    {
      // 2c — THE CONVERSE, trigger held constant. Same trigger, same targeting,
      // same flag; the ONLY difference from 2b is that the campaign has no
      // validForHours. The waiver is scoped to `triggerIsTargeting`, so a legacy
      // campaign must still gate — this is what stops the fix leaking into the
      // pre-existing campaigns nobody asked it to change.
      //
      // `membershipTiers` is a throwaway value: it is evaluated AFTER the
      // verification check, so it cannot change either outcome under test, but
      // it makes this (necessarily unpinned) dynamic-segment campaign inert for
      // every real account while it briefly exists.
      const TIER = "task12-tier-only";
      const legacy = await makeCampaign("LGV", {
        validForHours: undefined,
        targetingMode: "dynamic-segment",
        segmentConfig: { requiresEmailVerified: true, membershipTiers: [TIER] },
      });
      const legacyId = legacy._id as unknown as mongoose.Types.ObjectId;

      const verifiedId = await makeUser("legacy-verified", {
        isEmailVerified: true,
        subscription: { isActive: true, packageId: TIER },
      });
      const unverifiedId = await makeUser("legacy-unverified", {
        isEmailVerified: false,
        subscription: { isActive: true, packageId: TIER },
      });

      // Control first: without it, "unverified is refused" could equally mean
      // the campaign refuses everybody.
      const controlResult = await CampaignService.ensureCampaignIssuanceForUser({
        userId: String(verifiedId),
        campaignCode: legacy.code,
        trigger: "checkout-start",
      });
      check("control — a VERIFIED customer is enrolled in the legacy campaign", controlResult.outcome, "minted");

      const gatedResult = await CampaignService.ensureCampaignIssuanceForUser({
        userId: String(unverifiedId),
        campaignCode: legacy.code,
        trigger: "checkout-start",
      });
      check(
        "a trigger does NOT waive verification on a legacy campaign — it still refuses",
        gatedResult.outcome,
        "not_applicable"
      );
      check("…and writes nothing", await rowsFor(legacyId, unverifiedId), 0);

      // 2d — and with NO trigger at all, through the read path that runs on
      // every /my-account load. This is the byte-identical guarantee for the
      // wallet sweep and every campaign that existed before this feature.
      const sweptVerifiedId = await makeUser("sweep-verified", {
        isEmailVerified: true,
        subscription: { isActive: true, packageId: TIER },
      });
      const sweptUnverifiedId = await makeUser("sweep-unverified", {
        isEmailVerified: false,
        subscription: { isActive: true, packageId: TIER },
      });
      await CampaignService.ensureActiveCampaignIssuancesForUser(String(sweptVerifiedId));
      await CampaignService.ensureActiveCampaignIssuancesForUser(String(sweptUnverifiedId));

      check(
        "control — the wallet sweep still enrols a VERIFIED customer",
        await rowsFor(legacyId, sweptVerifiedId),
        1
      );
      check(
        "the wallet sweep still honours requiresEmailVerified with no trigger",
        await rowsFor(legacyId, sweptUnverifiedId),
        0
      );
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
  console.error("campaign-enrolment.test.ts crashed:", error);
  process.exit(1);
});
