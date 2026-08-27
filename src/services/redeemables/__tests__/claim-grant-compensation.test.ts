/**
 * F1 — a claim must never report success while granting nothing.
 *
 * `RedemptionService.redeem()` used to flip the issuance to `redeemed`, stamp the
 * permanent one-per-lifetime `redeemedEverAt` marker, call
 * `DrawGrantService.grantMonthlyCouponEntries(...)` and THROW AWAY its boolean —
 * then return `{ success: true, entriesGranted }` regardless. That boolean is
 * `false` whenever `getTargetMajorDraw()` finds no draw to grant into (a freeze
 * window with nothing queued, a gap with no queued draw). In that window the
 * customer was told "200 free entries added to your account", their grant was
 * burned for life, and no draw ever received a single entry. The only trace was a
 * `console.warn`, which production builds strip.
 *
 * F2 — and a claim must never REVERSE a grant it cannot prove was unwritten.
 *
 * The first fix reversed on `false` AND on a throw, as if they were one fact.
 * They are not. `false` meant no draw was ever touched; a throw could come from
 * `activeMajorDraw.save()`, AFTER the entries were added to the document. A lost
 * acknowledgement on a save the server actually applied then left 200 entries in
 * the live draw AND handed the code back — so the customer's next claim landed a
 * second 200 against one 200-entry code, in a draw that decides who wins a real
 * prize. `DrawGrantService` now answers with three states, and only the verified
 * "nothing was written" one may be reversed.
 *
 * This suite pins both halves of the contract:
 *   1. Monthly coupon, grant verified `not_written` → `success: false, reason:
 *      "grant_unavailable"`, issuance back to `active`, `redeemedEverAt` gone,
 *      wallet counter and redemptionHistory row reversed. The grant survives.
 *   2. The same issuance can then be claimed for real once a draw is available.
 *   3. A pre-existing `redeemedEverAt` (a refunded LEGACY coupon, whose row is
 *      restored to `active` while KEEPING the marker) must NOT be erased by the
 *      compensation — `$min` kept the older value, so this call never wrote it,
 *      so this call may not unwrite it. Erasing it would hand back a grant that
 *      was genuinely spent.
 *   4. Milestone manual claim — the second call site that discarded the boolean —
 *      compensates the same way.
 *   5. An `unconfirmed` write reverses NOTHING and answers `grant_unresolved`:
 *      the issuance stays `redeemed`, the wallet keeps its `$inc` and history
 *      row. A stuck claim is admin-recoverable; a second grant is not.
 *   6. A THROWN grant is the same fact as `unconfirmed`, and is treated as one.
 *      Scenario 4 used to drive this case and assert full reversal — i.e. it
 *      pinned the ambiguity as intended, which is why it changed with the fix.
 *
 * HOW THE FAILURE IS FORCED. `DrawGrantService.grantMonthlyCouponEntries` is
 * stubbed on the class object that `RedemptionService` imports. Deleting or
 * freezing the real draws to make `getTargetMajorDraw()` fail would mutate shared
 * dev data every other suite grants into; stubbing keeps the blast radius at zero
 * while still driving the real service, the real Mongo writes and the real
 * compensation path.
 *
 * THIS SUITE REACHES SHARED DATA (users, issuances, and — in scenario 2 — the live
 * target MajorDraw). Everything it creates is removed in `finally`, filtered to
 * this run's throwaway rows. Point a `MONGODB_URI` at production and this writes
 * to production.
 */
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { strict as assert } from "node:assert";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import MajorDraw from "@/models/MajorDraw";
import MonthlyEntryCampaign from "@/models/MonthlyEntryCampaign";
import RedeemableIssuance from "@/models/RedeemableIssuance";
import MilestoneIssuance from "@/models/MilestoneIssuance";
import MilestoneReward from "@/models/MilestoneReward";
import { RedemptionService } from "../RedemptionService";
import { DrawGrantService, type DrawGrantOutcome } from "../DrawGrantService";

/** Verified that nothing reached the draw — the ONLY outcome a claim may reverse. */
const NOT_WRITTEN: DrawGrantOutcome = { status: "not_written", reason: "no_target_draw" };
/** A write was attempted and cannot be proven either way — must NOT be reversed. */
const UNCONFIRMED: DrawGrantOutcome = { status: "unconfirmed", reason: "save_unverified: simulated" };

const RUN_ID = Date.now();
const NOW = new Date();
const STARTS_AT = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000);
const ENDS_AT = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
const EXPIRES_AT = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000);
const OLD_REDEEMED_EVER_AT = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000);
const ENTRIES = 200;

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
const issuanceIds: mongoose.Types.ObjectId[] = [];
const milestoneRewardIds: mongoose.Types.ObjectId[] = [];
const milestoneIssuanceIds: mongoose.Types.ObjectId[] = [];

async function makeUser(suffix: string) {
  const user = await User.create({
    firstName: "F1",
    lastName: "Compensation",
    email: `f1-compensation-${RUN_ID}-${suffix}@example.test`,
    isActive: true,
    isEmailVerified: true,
    accumulatedEntries: 0,
  });
  userIds.push(user._id as unknown as mongoose.Types.ObjectId);
  return user;
}

/** Personal-window campaign — the shape the three live trigger codes use. */
async function makeCampaign(suffix: string, over: Record<string, unknown> = {}) {
  const campaign = await MonthlyEntryCampaign.create({
    monthKey: "2026-08",
    name: `F1 compensation ${suffix}`,
    entriesAmount: ENTRIES,
    campaignMode: "unique",
    targetingMode: "manual-users",
    startsAt: STARTS_AT,
    endsAt: ENDS_AT,
    neverExpires: false,
    isActive: true,
    code: `F1COMP${RUN_ID}${suffix}`.slice(0, 32),
    requiresPurchase: false,
    purchaseRequirement: "none",
    validForHours: 72,
    ...over,
  });
  campaignIds.push(campaign._id as unknown as mongoose.Types.ObjectId);
  return campaign;
}

async function makeIssuance(
  campaignId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  over: Record<string, unknown> = {}
) {
  const issuance = await RedeemableIssuance.create({
    campaignId,
    userId,
    monthKey: "2026-08",
    status: "active",
    source: "monthly-coupon",
    entriesAmount: ENTRIES,
    issuedAt: NOW,
    expiresAt: EXPIRES_AT,
    ...over,
  });
  issuanceIds.push(issuance._id as mongoose.Types.ObjectId);
  return issuance;
}

/**
 * Swap the grant for a stub, run the body, always restore the real one.
 *
 * The stub answers with a `DrawGrantOutcome`, because that is the distinction the
 * compensation now turns on. `"throw"` remains available and means the SAME thing
 * the union's `unconfirmed` does — an escape from a function that is total by
 * contract tells us nothing about what it wrote.
 */
const realGrant = DrawGrantService.grantMonthlyCouponEntries;
async function withGrantResult<T>(
  result: DrawGrantOutcome | "throw",
  body: () => Promise<T>
): Promise<T> {
  DrawGrantService.grantMonthlyCouponEntries = async () => {
    if (result === "throw") throw new Error("simulated draw save failure");
    return result;
  };
  try {
    return await body();
  } finally {
    DrawGrantService.grantMonthlyCouponEntries = realGrant;
  }
}

async function walletState(userId: mongoose.Types.ObjectId, redemptionId: string) {
  const u = await User.findById(userId).select("accumulatedEntries redemptionHistory").lean<{
    accumulatedEntries?: number;
    redemptionHistory?: Array<{ redemptionId?: string }>;
  } | null>();
  return {
    accumulatedEntries: u?.accumulatedEntries ?? 0,
    historyRows: (u?.redemptionHistory ?? []).filter((r) => r.redemptionId === redemptionId).length,
  };
}

async function run() {
  await connectDB();

  console.log("\nScenario 1 — monthly coupon: no draw to grant into");
  {
    const user = await makeUser("coupon");
    const campaign = await makeCampaign("A");
    const issuance = await makeIssuance(
      campaign._id as unknown as mongoose.Types.ObjectId,
      user._id as unknown as mongoose.Types.ObjectId
    );
    const redemptionId = `monthly-coupon-${String(issuance._id)}`;

    const result = await withGrantResult(NOT_WRITTEN, () =>
      RedemptionService.redeem({ userId: String(user._id), issuanceId: String(issuance._id) })
    );

    check("claim reports FAILURE, not a phantom success", { success: result.success, reason: result.reason }, {
      success: false,
      reason: "grant_unavailable",
    });
    check("no entriesGranted is claimed", result.entriesGranted ?? null, null);

    const after = await RedeemableIssuance.findById(issuance._id).lean<{
      status?: string;
      redeemedAt?: Date;
      redeemedEverAt?: Date;
    } | null>();
    check("issuance is back to active — the grant survives", after?.status, "active");
    check("redeemedAt was reversed", after?.redeemedAt ?? null, null);
    check("redeemedEverAt was reversed — one-per-lifetime NOT burned", after?.redeemedEverAt ?? null, null);

    const wallet = await walletState(user._id as unknown as mongoose.Types.ObjectId, redemptionId);
    check("wallet counter reversed", wallet.accumulatedEntries, 0);
    check("redemptionHistory row reversed", wallet.historyRows, 0);

    console.log("\nScenario 2 — the SAME issuance still claims for real once a draw is there");
    const second = await RedemptionService.redeem({
      userId: String(user._id),
      issuanceId: String(issuance._id),
    });
    check("re-claim succeeds", { success: second.success, entriesGranted: second.entriesGranted }, {
      success: true,
      entriesGranted: ENTRIES,
    });
    const settled = await RedeemableIssuance.findById(issuance._id).lean<{ status?: string; redeemedEverAt?: Date } | null>();
    check("issuance now redeemed", settled?.status, "redeemed");
    check("redeemedEverAt now stamped", Boolean(settled?.redeemedEverAt), true);
  }

  console.log("\nScenario 3 — a PRE-EXISTING redeemedEverAt is never erased by compensation");
  {
    const user = await makeUser("legacy");
    // Legacy (non-personal-window) campaign: `personalWindowGoverns` is false, so a row
    // restored to `active` by a refund while KEEPING redeemedEverAt is still claimable —
    // the only shape where compensation could destroy a marker it did not write.
    const campaign = await makeCampaign("B", { validForHours: undefined });
    const issuance = await makeIssuance(
      campaign._id as unknown as mongoose.Types.ObjectId,
      user._id as unknown as mongoose.Types.ObjectId,
      { redeemedEverAt: OLD_REDEEMED_EVER_AT }
    );

    const result = await withGrantResult(NOT_WRITTEN, () =>
      RedemptionService.redeem({ userId: String(user._id), issuanceId: String(issuance._id) })
    );
    check("claim reports failure", { success: result.success, reason: result.reason }, {
      success: false,
      reason: "grant_unavailable",
    });

    const after = await RedeemableIssuance.findById(issuance._id).lean<{ status?: string; redeemedEverAt?: Date } | null>();
    check("issuance restored to active", after?.status, "active");
    check(
      "the OLDER redeemedEverAt is preserved, not unset",
      after?.redeemedEverAt ? new Date(after.redeemedEverAt).toISOString() : null,
      OLD_REDEEMED_EVER_AT.toISOString()
    );
  }

  /** One throwaway milestone reward + issuance, ready to claim. */
  async function makeMilestone(suffix: string) {
    const user = await makeUser(`milestone-${suffix}`);
    const reward = await MilestoneReward.create({
      milestoneType: "entries-gained",
      name: `F1 compensation milestone ${RUN_ID} ${suffix}`,
      code: `F1MILE${RUN_ID}${suffix}`.slice(0, 32),
      threshold: 1,
      entriesAmount: ENTRIES,
      isActive: true,
      neverExpires: true,
      autoGrant: false,
    });
    milestoneRewardIds.push(reward._id as unknown as mongoose.Types.ObjectId);

    const mIssuance = await MilestoneIssuance.create({
      milestoneRewardId: reward._id,
      userId: user._id,
      milestoneType: "entries-gained",
      thresholdReached: 1,
      status: "active",
      entriesAmount: ENTRIES,
      issuedAt: NOW,
    });
    milestoneIssuanceIds.push(mIssuance._id as mongoose.Types.ObjectId);
    return { user, mIssuance, redemptionId: `milestone-${String(mIssuance._id)}` };
  }

  console.log("\nScenario 4 — milestone manual claim compensates identically (nothing was written)");
  {
    const { user, mIssuance, redemptionId } = await makeMilestone("A");

    const result = await withGrantResult(NOT_WRITTEN, () =>
      RedemptionService.redeem({ userId: String(user._id), issuanceId: String(mIssuance._id) })
    );
    check("milestone claim reports failure", { success: result.success, reason: result.reason }, {
      success: false,
      reason: "grant_unavailable",
    });

    const after = await MilestoneIssuance.findById(mIssuance._id).lean<{ status?: string; redeemedAt?: Date } | null>();
    check("milestone issuance is back to active", after?.status, "active");
    check("milestone redeemedAt reversed", after?.redeemedAt ?? null, null);

    const wallet = await walletState(user._id as unknown as mongoose.Types.ObjectId, redemptionId);
    check("milestone wallet counter reversed", wallet.accumulatedEntries, 0);
    check("milestone redemptionHistory row reversed", wallet.historyRows, 0);
  }

  console.log("\nScenario 5 — F2: an UNCONFIRMED draw write is NOT reversed (monthly coupon)");
  {
    const user = await makeUser("unconfirmed");
    const campaign = await makeCampaign("C");
    const issuance = await makeIssuance(
      campaign._id as unknown as mongoose.Types.ObjectId,
      user._id as unknown as mongoose.Types.ObjectId
    );
    const redemptionId = `monthly-coupon-${String(issuance._id)}`;

    const result = await withGrantResult(UNCONFIRMED, () =>
      RedemptionService.redeem({ userId: String(user._id), issuanceId: String(issuance._id) })
    );

    // NOT `grant_unavailable`: that reason promises the code is still theirs, and
    // here it is not — reversing over entries that may already be in the live draw
    // is what would let the next claim grant the same 200 a SECOND time.
    check("claim reports grant_unresolved, not grant_unavailable", { success: result.success, reason: result.reason }, {
      success: false,
      reason: "grant_unresolved",
    });

    const after = await RedeemableIssuance.findById(issuance._id).lean<{
      status?: string;
      redeemedEverAt?: Date;
    } | null>();
    check("issuance stays redeemed — the code is NOT handed back", after?.status, "redeemed");
    check("redeemedEverAt stays stamped", Boolean(after?.redeemedEverAt), true);

    const wallet = await walletState(user._id as unknown as mongoose.Types.ObjectId, redemptionId);
    check("wallet counter is NOT reversed", wallet.accumulatedEntries, ENTRIES);
    check("redemptionHistory row is NOT reversed", wallet.historyRows, 1);
  }

  console.log("\nScenario 6 — F2: a THROWN grant is treated the same way (milestone)");
  {
    // The old code caught this throw and reversed everything, which is exactly the
    // double-grant door: an escape from a function that is total by contract is no
    // evidence the draw write did not land.
    const { user, mIssuance, redemptionId } = await makeMilestone("B");

    const result = await withGrantResult("throw", () =>
      RedemptionService.redeem({ userId: String(user._id), issuanceId: String(mIssuance._id) })
    );
    check("milestone claim reports grant_unresolved", { success: result.success, reason: result.reason }, {
      success: false,
      reason: "grant_unresolved",
    });

    const after = await MilestoneIssuance.findById(mIssuance._id).lean<{ status?: string } | null>();
    check("milestone issuance stays redeemed", after?.status, "redeemed");

    const wallet = await walletState(user._id as unknown as mongoose.Types.ObjectId, redemptionId);
    check("milestone wallet counter is NOT reversed", wallet.accumulatedEntries, ENTRIES);
    check("milestone redemptionHistory row is NOT reversed", wallet.historyRows, 1);
  }
}

run()
  .catch((error) => {
    failures++;
    console.error("SUITE ERROR:", error);
  })
  .finally(async () => {
    // Scenario 2 grants real entries into the live target draw — pull the row back out.
    // Deliberately load-mutate-save rather than `updateMany($pull)`: `MajorDraw.totalEntries`
    // is a denormalised field recomputed by the schema's pre("save") hook, so an $pull would
    // remove the row and leave the stored total 200 too high (the exact drift flagged as a
    // carry-out in the 2026-08-27 claimables-visibility proof). Saving keeps the draw's own
    // arithmetic honest.
    for (const userId of userIds) {
      const draws = await MajorDraw.find({ "entries.userId": userId });
      for (const draw of draws) {
        draw.entries = draw.entries.filter(
          (e: { userId: mongoose.Types.ObjectId }) => e.userId.toString() !== userId.toString()
        );
        await draw.save();
      }
    }
    if (issuanceIds.length) await RedeemableIssuance.deleteMany({ _id: { $in: issuanceIds } });
    if (milestoneIssuanceIds.length) await MilestoneIssuance.deleteMany({ _id: { $in: milestoneIssuanceIds } });
    if (milestoneRewardIds.length) await MilestoneReward.deleteMany({ _id: { $in: milestoneRewardIds } });
    if (campaignIds.length) await MonthlyEntryCampaign.deleteMany({ _id: { $in: campaignIds } });
    // Any issuance the milestone sweep minted for a throwaway user goes too.
    if (userIds.length) {
      await RedeemableIssuance.deleteMany({ userId: { $in: userIds } });
      await MilestoneIssuance.deleteMany({ userId: { $in: userIds } });
      await User.deleteMany({ _id: { $in: userIds } });
    }
    console.log(
      `\n[cleanup] users=${userIds.length} campaigns=${campaignIds.length} issuances=${issuanceIds.length} milestones=${milestoneIssuanceIds.length}`
    );
    await mongoose.disconnect();
    if (failures > 0) {
      console.error(`\n${failures} CHECK(S) FAILED`);
      process.exit(1);
    }
    console.log("\nALL CHECKS PASSED");
    process.exit(0);
  });

assert.ok(true);
