/**
 * Task 12 — the per-customer bonus-code MINT, against a live database.
 *
 * The five existing suites (test:bonus-code-expiry, :bonus-code-policy,
 * :issuance-expiry, :campaign-window, :trigger-eligibility) all exercise PURE
 * functions. They prove the arithmetic and the decision table are right; they
 * prove nothing about the write. Before this file the happy path of the whole
 * feature — `CampaignService.createIssuanceForUser`'s upsert — had executed
 * zero times outside a code read.
 *
 * What this file protects, none of which any pure test can reach:
 *
 *   1. THE DRIVER CONTRACT. The mint reads `lastErrorObject.updatedExisting`
 *      off an `includeResultMetadata` upsert to tell "I inserted" from
 *      "someone else won the race". That was type-verified only — TypeScript
 *      cannot tell you what Mongo returns on a MATCHED, `$setOnInsert`-only
 *      update. Section 1 pins the real driver behaviour on both branches.
 *   2. THE MINT ITSELF — one row, stamped with the deadline it reports back.
 *   3. THE RE-ARM LIFECYCLE — mint, expire, re-qualify: fresh deadline,
 *      `firstIssuedAt` preserved, notify outcome cleared.
 *   4. "ONE PER PERSON FOR LIFE" ACROSS A REFUND — redeem, reverse the
 *      redemption, re-trigger. `redeemedEverAt` is the ONLY thing holding that
 *      line and it is invisible to every pure test.
 *   5. CONCURRENCY — two triggers at once must not surface as "cancel failed"
 *      on a subscription that was in fact cancelled.
 *   6. LEGACY PARITY — a campaign with no `validForHours` still stamps the
 *      campaign's own end date, and the wallet sweep still enrols into it.
 *   7. THE SWEEP LEAK — the same sweep must NOT enrol anyone into a
 *      personal-window campaign, which would silently burn a lifetime grant.
 *
 * FIXTURE SAFETY. Every user and campaign is created here under a per-run
 * identifier and removed in `finally`, including on failure. Nothing this file
 * did not create is ever mutated or deleted:
 *   - issuances are deleted by `userId` (all users are brand new this run, so
 *     every issuance carrying one of those ids was written by this run);
 *   - the refund section makes `RedemptionService` push a Major Draw entry for
 *     a throwaway user; the reversal removes the entries, and the cleanup
 *     `$pull`s the (now zero) element back out, filtered to those users only.
 * Test users deliberately carry NO active subscription and every campaign is
 * pinned to its own user via `manual-users`, so neither the wallet sweep nor a
 * real dev campaign can cross-contaminate — and no real customer can be
 * enrolled into a fixture campaign during the run.
 */
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import MajorDraw from "@/models/MajorDraw";
import MonthlyEntryCampaign from "@/models/MonthlyEntryCampaign";
import RedeemableIssuance from "@/models/RedeemableIssuance";
import MilestoneIssuance from "@/models/MilestoneIssuance";
import { CampaignService } from "../CampaignService";
import { RedemptionService } from "../RedemptionService";
import { RedeemablesWalletService } from "../RedeemablesWalletService";
import { REARM_COOLDOWN_DAYS } from "@/utils/redeemables/bonus-code-policy";

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
    lastName: "Mint",
    email: `task12-mint-${RUN_ID}-${suffix}@example.test`,
    isActive: true,
    isEmailVerified: true,
    ...extra,
  });
  const id = user._id as unknown as mongoose.Types.ObjectId;
  userIds.push(id);
  return id;
}

/**
 * Every fixture campaign is `manual-users` pinned to exactly one throwaway
 * user. That is what makes it safe to create a live campaign in a shared dev
 * database: `isUserEligibleForCampaign` treats pins as authoritative, so no
 * other account can be enrolled while the campaign exists.
 */
async function makeCampaign(
  suffix: string,
  pinnedUserId: mongoose.Types.ObjectId,
  over: Record<string, unknown> = {}
) {
  const campaign = await MonthlyEntryCampaign.create({
    monthKey: "2026-08",
    name: `Task12 mint ${suffix}`,
    entriesAmount: 4,
    campaignMode: "unique",
    targetingMode: "manual-users",
    segmentConfig: { includeUserIds: [String(pinnedUserId)] },
    startsAt: new Date(Date.now() - 60_000),
    endsAt: new Date(Date.now() + 30 * DAY_MS),
    neverExpires: false,
    validForHours: 72,
    isActive: true,
    code: `T12MINT${RUN_ID}${suffix}`.slice(0, 32),
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

async function run() {
  await connectDB();

  try {
    // ---------------------------------------------------------------------
    console.log("1. Mongo tells an upsert INSERT apart from an upsert MATCH");
    // The mint's whole "did I win the race?" answer is this one field. If Mongo
    // reported `updatedExisting` differently on a $setOnInsert-only match, every
    // concurrent mint would report the wrong outcome and the loser would email a
    // customer a code it did not create.
    {
      const userId = await makeUser("driver");
      const campaign = await makeCampaign("DRV", userId, { isActive: false });
      const campaignId = campaign._id as unknown as mongoose.Types.ObjectId;

      const setOnInsert = {
        campaignId,
        userId,
        monthKey: "2026-08",
        status: "active",
        source: "monthly-coupon",
        entriesAmount: 4,
        issuedAt: new Date("2026-08-01T00:00:00.000Z"),
        firstIssuedAt: new Date("2026-08-01T00:00:00.000Z"),
        expiresAt: new Date("2026-08-08T13:59:59.999Z"),
      };
      // Byte-for-byte the option set CampaignService.createIssuanceForUser uses.
      const options = {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        runValidators: true,
        includeResultMetadata: true,
      } as const;

      const inserted = await RedeemableIssuance.findOneAndUpdate(
        { campaignId, userId },
        { $setOnInsert: setOnInsert },
        options
      );
      check("insert reports updatedExisting false", inserted.lastErrorObject?.updatedExisting, false);
      check("insert reports the new id under `upserted`", String(inserted.lastErrorObject?.upserted ?? ""), String(inserted.value?._id ?? "x"));
      check("insert still returns the document", Boolean(inserted.value), true);

      // The second call deliberately carries a DIFFERENT issuedAt. With
      // `$setOnInsert` it must be ignored on a match; if the operator were ever
      // changed to `$set`, the loser of a race would overwrite the winner's
      // stamped dates while still reporting `already_active`. Re-using the same
      // payload here would make that swap invisible.
      const matched = await RedeemableIssuance.findOneAndUpdate(
        { campaignId, userId },
        { $setOnInsert: { ...setOnInsert, issuedAt: new Date("2026-09-09T09:09:09.999Z") } },
        options
      );
      check("match on a $setOnInsert-only update reports updatedExisting true", matched.lastErrorObject?.updatedExisting, true);
      check("match reports no `upserted` id", matched.lastErrorObject?.upserted ?? null, null);
      check("match returns the PRE-EXISTING row, not a second one", String(matched.value?._id ?? ""), String(inserted.value?._id ?? "y"));
      check("match left the stored issuedAt untouched", matched.value?.issuedAt?.toISOString(), "2026-08-01T00:00:00.000Z");
      check("one row exists, not two", await rowsFor(campaignId, userId), 1);
      check("setDefaultsOnInsert applied the notify defaults", [inserted.value?.notifiedAt ?? null, inserted.value?.notifyError ?? null], [null, null]);
    }

    // ---------------------------------------------------------------------
    console.log("\n2. A first trigger mints one grant, stamped with the deadline it reports back");
    {
      const userId = await makeUser("mint");
      const campaign = await makeCampaign("MNT", userId, { validForHours: 72, entriesAmount: 4 });
      const campaignId = campaign._id as unknown as mongoose.Types.ObjectId;

      const result = await CampaignService.ensureCampaignIssuanceForUser({
        userId: String(userId),
        campaignCode: campaign.code,
        trigger: "cancel-click",
      });

      check("outcome is minted", result.outcome, "minted");
      check("exactly one row was written", await rowsFor(campaignId, userId), 1);

      const stored = await RedeemableIssuance.findOne({ campaignId, userId }).lean();
      if (!stored) throw new Error("mint wrote no row");

      check("caller's id matches the stored row", result.issuance?.id, String(stored._id));
      check("status active", stored.status, "active");
      check("entries copied from the campaign", stored.entriesAmount, 4);
      check("the trigger name is recorded on the row", stored.metadata?.issuedBy, "cancel-click");
      check("firstIssuedAt is stamped and equals issuedAt", stored.firstIssuedAt?.getTime(), stored.issuedAt.getTime());
      check("notify outcome starts empty", [stored.notifiedAt ?? null, stored.notifyError ?? null], [null, null]);
      check("unique campaign mode minted a per-customer code", /^TA-\d{6}-[A-Z0-9]{6}$/.test(stored.code ?? ""), true);

      // Every rendered copy of the deadline derives from what the caller was
      // handed. Rationale corrected 2026-08-26: this used to read "the email
      // prints what the caller was handed … a mint 150ms either side of Sydney
      // midnight prints a date redemption will not honour". No email prints the
      // deadline, and `expiryAfterHours` removed the midnight cliff. The rule
      // stands for the surviving reason: a re-arm MOVES this instant, so a
      // recomputed value on a row the caller did not just write can be a whole
      // 72-hour window off what redemption enforces.
      check(
        "the reported deadline IS the persisted deadline",
        result.issuance?.expiresAt?.toISOString(),
        stored.expiresAt.toISOString()
      );

      // Expected value derived independently: an EXACT offset on the timeline,
      // not a calendar-day snap. 72h in milliseconds from the stored issuedAt.
      check(
        "deadline is exactly 72 hours after the mint, to the millisecond",
        stored.expiresAt.getTime() - stored.issuedAt.getTime(),
        72 * 60 * 60 * 1000
      );
      // The old model snapped to 23:59:59.999 Sydney. Under an exact offset the
      // sub-second component of issuedAt must survive untouched — this is the
      // guard against anyone re-applying `.setUTCSeconds(59, 999)`.
      check(
        "the mint's millisecond component is carried through, not snapped",
        stored.expiresAt.getUTCMilliseconds(),
        stored.issuedAt.getUTCMilliseconds()
      );
    }

    // ---------------------------------------------------------------------
    console.log("\n3. A second trigger inside the live window is a silent no-op that reports the STORED deadline");
    {
      const userId = await makeUser("resend");
      const campaign = await makeCampaign("RSN", userId, { validForHours: 24 });
      const campaignId = campaign._id as unknown as mongoose.Types.ObjectId;

      const first = await CampaignService.ensureCampaignIssuanceForUser({
        userId: String(userId),
        campaignCode: campaign.code,
        trigger: "checkout-start",
      });
      const second = await CampaignService.ensureCampaignIssuanceForUser({
        userId: String(userId),
        campaignCode: campaign.code,
        trigger: "checkout-start",
      });

      check("first is minted", first.outcome, "minted");
      check("second is already_active", second.outcome, "already_active");
      check("still one row", await rowsFor(campaignId, userId), 1);
      check("same row id", second.issuance?.id, first.issuance?.id);
      check(
        "the second call reports the ORIGINAL deadline, not a fresh one",
        second.issuance?.expiresAt?.toISOString(),
        first.issuance?.expiresAt?.toISOString()
      );
      check("…and the original issuedAt", second.issuance?.issuedAt?.toISOString(), first.issuance?.issuedAt?.toISOString());
    }

    // ---------------------------------------------------------------------
    console.log("\n4. Triggers racing for one customer mint exactly one grant and none of them fails the caller");
    // The bug this replaced: a double-clicked Cancel threw E11000 out of the
    // caller AFTER Stripe had cancelled, so the customer saw "cancel failed" on
    // a subscription that was gone. `ensureCampaignIssuanceForUser` swallows a
    // throw into "not_applicable", so a `not_applicable` here IS the fingerprint
    // of an escaped error — that is what the third assertion watches for.
    {
      const userId = await makeUser("race");
      const campaign = await makeCampaign("RCE", userId, { validForHours: 48 });
      const campaignId = campaign._id as unknown as mongoose.Types.ObjectId;

      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          CampaignService.ensureCampaignIssuanceForUser({
            userId: String(userId),
            campaignCode: campaign.code,
            trigger: "one-time-purchase",
          })
        )
      );
      const outcomes = results.map((r) => r.outcome).sort();

      check("exactly one caller minted", outcomes.filter((o) => o === "minted").length, 1);
      check("every other caller saw already_active", outcomes.filter((o) => o === "already_active").length, 4);
      check("nobody got not_applicable (an escaped error)", outcomes.filter((o) => o === "not_applicable").length, 0);
      check("one row, not five", await rowsFor(campaignId, userId), 1);

      const stored = await RedeemableIssuance.findOne({ campaignId, userId }).lean();
      const ids = new Set(results.map((r) => r.issuance?.id));
      check("every caller was handed the same winning row", [ids.size, ids.has(String(stored?._id))], [1, true]);
    }

    // ---------------------------------------------------------------------
    console.log("\n5. A lapsed grant re-arms with a fresh deadline, keeps firstIssuedAt, and clears the notify outcome");
    {
      const userId = await makeUser("rearm");
      const campaign = await makeCampaign("RRM", userId, { validForHours: 240 });
      const campaignId = campaign._id as unknown as mongoose.Types.ObjectId;

      const minted = await CampaignService.ensureCampaignIssuanceForUser({
        userId: String(userId),
        campaignCode: campaign.code,
        trigger: "cancel-click",
      });
      check("minted first", minted.outcome, "minted");

      const original = await RedeemableIssuance.findOne({ campaignId, userId }).lean();
      if (!original) throw new Error("re-arm fixture: mint wrote no row");

      // Stand in for "the window lapsed and an email had already gone out".
      // There is no injectable clock on this path, so the row is aged directly —
      // it is a row this test created.
      //
      // `firstIssuedAt` is aged PAST the re-arm cooldown deliberately. decideRearm
      // refuses a re-arm for REARM_COOLDOWN_DAYS after the customer's first-ever
      // issuance, so a row whose firstIssuedAt is still "now" reports
      // expired_no_rearm no matter how far back expiresAt is pushed. This section
      // tests the re-arm LIFECYCLE; the cooldown boundary itself is pinned in
      // test:bonus-code-policy.
      const agedFirstIssuedAt = new Date(Date.now() - (REARM_COOLDOWN_DAYS + 10) * DAY_MS);
      await RedeemableIssuance.updateOne(
        { _id: original._id },
        {
          $set: {
            issuedAt: agedFirstIssuedAt,
            firstIssuedAt: agedFirstIssuedAt,
            expiresAt: new Date(Date.now() - 2 * DAY_MS),
            notifiedAt: new Date("2026-01-01T00:00:00.000Z"),
            notifyError: "stale-emit-failure",
          },
        }
      );

      const aged = await RedeemableIssuance.findOne({ _id: original._id }).lean();
      if (!aged) throw new Error("re-arm fixture: row vanished while ageing");
      const originalFirstIssuedAt = aged.firstIssuedAt?.toISOString();
      const originalIssuedAt = aged.issuedAt.toISOString();

      const rearmed = await CampaignService.ensureCampaignIssuanceForUser({
        userId: String(userId),
        campaignCode: campaign.code,
        trigger: "cancel-click",
      });
      check("outcome is rearmed", rearmed.outcome, "rearmed");
      check("no second row was created", await rowsFor(campaignId, userId), 1);
      check("same row id", rearmed.issuance?.id, String(original._id));

      const after = await RedeemableIssuance.findOne({ _id: original._id }).lean();
      if (!after) throw new Error("re-arm fixture: row vanished");
      check("status back to active", after.status, "active");
      check("firstIssuedAt survived the re-arm", after.firstIssuedAt?.toISOString(), originalFirstIssuedAt);
      check("issuedAt moved forward", after.issuedAt.toISOString() > originalIssuedAt, true);
      check("the deadline is in the future again", after.expiresAt.getTime() > Date.now(), true);
      check("notifiedAt was cleared so the re-armed deadline can be emailed", after.notifiedAt ?? null, null);
      check("the stale notify error was cleared too", after.notifyError ?? null, null);
      check(
        "the caller is handed the re-armed deadline, not the lapsed one",
        rearmed.issuance?.expiresAt?.toISOString(),
        after.expiresAt.toISOString()
      );

      check(
        "the fresh deadline is exactly 240 hours from the re-arm instant",
        after.expiresAt.getTime() - after.issuedAt.getTime(),
        240 * 60 * 60 * 1000
      );

      // LEGACY ROW. `firstIssuedAt` is written only in the mint's $setOnInsert,
      // so a row created by issueCampaignToUsers (which upserts without it) has
      // none — and the re-arm overwrites `issuedAt`, which was the only record
      // of the original date. Simply omitting firstIssuedAt from the update
      // preserved it for rows this branch inserted and destroyed it for these.
      const legacyIssuedAt = new Date(Date.now() - 40 * DAY_MS);
      await RedeemableIssuance.updateOne(
        { _id: original._id },
        {
          $set: { issuedAt: legacyIssuedAt, expiresAt: new Date(Date.now() - 2 * DAY_MS) },
          $unset: { firstIssuedAt: 1 },
        }
      );
      const legacyRearm = await CampaignService.ensureCampaignIssuanceForUser({
        userId: String(userId),
        campaignCode: campaign.code,
        trigger: "cancel-click",
      });
      check("a legacy row re-arms too", legacyRearm.outcome, "rearmed");
      const afterLegacy = await RedeemableIssuance.findOne({ _id: original._id }).lean();
      check(
        "…and the re-arm BACKFILLS firstIssuedAt from the date it is about to overwrite",
        afterLegacy?.firstIssuedAt?.toISOString(),
        legacyIssuedAt.toISOString()
      );
      check("…while issuedAt does move forward", (afterLegacy?.issuedAt.getTime() ?? 0) > legacyIssuedAt.getTime(), true);
    }

    // ---------------------------------------------------------------------
    console.log("\n6. A refund cannot resurrect a spent grant — one per person, for life");
    // The refund path restores `status: "active"` and `$unset`s `redeemedAt`, so
    // after a reversal the row is byte-identical to a never-redeemed one EXCEPT
    // for `redeemedEverAt`. That single field is the whole guarantee.
    {
      const userId = await makeUser("refund");
      const campaign = await makeCampaign("RFD", userId, { validForHours: 336, entriesAmount: 4 });
      const campaignId = campaign._id as unknown as mongoose.Types.ObjectId;

      const minted = await CampaignService.ensureCampaignIssuanceForUser({
        userId: String(userId),
        campaignCode: campaign.code,
        trigger: "one-time-purchase",
      });
      const issuanceId = minted.issuance?.id;
      if (!issuanceId) throw new Error("refund fixture: nothing minted");

      const redeemed = await RedemptionService.redeem({ userId: String(userId), issuanceId });
      check("the customer redeems it", [redeemed.success, redeemed.entriesGranted], [true, 4]);

      const afterRedeem = await RedeemableIssuance.findById(issuanceId).lean();
      check("status redeemed", afterRedeem?.status, "redeemed");
      check("redeemedEverAt was stamped", Boolean(afterRedeem?.redeemedEverAt), true);
      const spentAt = afterRedeem?.redeemedEverAt?.toISOString();

      const reversed = await RedemptionService.unredeemMonthlyCouponRedemption({
        userId: String(userId),
        redeemableIssuanceId: issuanceId,
      });
      check("the refund reversal runs", reversed.success, true);

      const afterRefund = await RedeemableIssuance.findById(issuanceId).lean();
      check("the refund put the row back to active", afterRefund?.status, "active");
      check("…and removed redeemedAt", afterRefund?.redeemedAt ?? null, null);
      check("…but redeemedEverAt SURVIVED, unchanged", afterRefund?.redeemedEverAt?.toISOString(), spentAt);

      const retriggerLive = await CampaignService.ensureCampaignIssuanceForUser({
        userId: String(userId),
        campaignCode: campaign.code,
        trigger: "one-time-purchase",
      });
      check("re-triggering a refunded, still-live grant reports spent", retriggerLive.outcome, "spent");

      // THE MONEY QUESTION the mint-side assertions above stop one step short
      // of. The refund put the row back to `status: "active"` with its ORIGINAL
      // deadline still in the future, and this campaign is
      // `purchaseRequirement: "none"` — which every trigger campaign must be,
      // since a cancel-click has no purchase to qualify on. So nothing on the
      // redeem path except `redeemedEverAt` stands between the customer and a
      // second full grant of real Major Draw entries while holding a refund.
      const secondRedeem = await RedemptionService.redeem({ userId: String(userId), issuanceId });
      check(
        "a refunded grant CANNOT be redeemed a second time",
        [secondRedeem.success, secondRedeem.reason],
        [false, "already_redeemed"]
      );
      check("…and no entries were granted", secondRedeem.entriesGranted ?? 0, 0);

      const afterSecondAttempt = await RedeemableIssuance.findById(issuanceId).lean();
      check("…the row was not flipped back to redeemed", afterSecondAttempt?.status, "active");

      // The wallet must agree with the server: rendering an ENABLED Claim button
      // on a grant redeem() refuses is the "click does nothing" bug, and before
      // the redeem gate existed it was the money hole itself.
      const wallet = await RedeemablesWalletService.getUserWallet(String(userId), { limit: 50 });
      const walletRow = wallet.items.find((item) => item.issuanceId === issuanceId);
      check("the refunded grant is still in the wallet", Boolean(walletRow), true);
      check("…but the wallet does NOT offer it as claimable", walletRow?.isRedeemableNow, false);
      // …and it must not LOOK live either. The stored row is still
      // `status: "active"` with a future expiresAt, so without the display
      // projection the card sits in the CLAIMABLE tab rendering an "Active"
      // pill with no button — a broken button — while Cobber FAQ 88 tells the
      // same customer the code "is not returned to your account".
      check("…it reads as Redeemed, not Active", walletRow?.status, "redeemed");

      const claimable = await RedeemablesWalletService.getUserWallet(String(userId), {
        limit: 50,
        status: "claimable",
      });
      check(
        "…and it is gone from the claimable tab",
        claimable.items.some((item) => item.issuanceId === issuanceId),
        false
      );
      const past = await RedeemablesWalletService.getUserWallet(String(userId), {
        limit: 50,
        status: "past",
      });
      check(
        "…and has moved into past, where a spent grant belongs",
        past.items.some((item) => item.issuanceId === issuanceId),
        true
      );

      // The dangerous shape: refunded AND lapsed. Without redeemedEverAt this is
      // indistinguishable from an honest lapsed grant and would re-arm.
      await RedeemableIssuance.updateOne(
        { _id: new mongoose.Types.ObjectId(issuanceId) },
        { $set: { expiresAt: new Date(Date.now() - 3 * DAY_MS) } }
      );
      const retriggerLapsed = await CampaignService.ensureCampaignIssuanceForUser({
        userId: String(userId),
        campaignCode: campaign.code,
        trigger: "one-time-purchase",
      });
      check("re-triggering a refunded AND lapsed grant still reports spent", retriggerLapsed.outcome, "spent");
      check("no replacement row was minted", await rowsFor(campaignId, userId), 1);

      const finalRow = await RedeemableIssuance.findById(issuanceId).lean();
      check("the lapsed deadline was not refreshed", (finalRow?.expiresAt.getTime() ?? 0) < Date.now(), true);
    }

    // ---------------------------------------------------------------------
    console.log("\n7. Legacy parity — a campaign with no validForHours still stamps the campaign's own end date");
    {
      const userId = await makeUser("legacy-ends");
      const legacyEndsAt = new Date(Date.UTC(2026, 10, 30, 12, 34, 56, 789));
      const campaign = await makeCampaign("LGE", userId, {
        validForHours: undefined,
        endsAt: legacyEndsAt,
      });
      const campaignId = campaign._id as unknown as mongoose.Types.ObjectId;

      const result = await CampaignService.ensureCampaignIssuanceForUser({
        userId: String(userId),
        campaignCode: campaign.code,
        trigger: "cancel-click",
      });
      check("a legacy campaign still mints", result.outcome, "minted");

      const stored = await RedeemableIssuance.findOne({ campaignId, userId }).lean();
      check(
        "the issuance expires exactly at the campaign's endsAt, to the millisecond",
        stored?.expiresAt.toISOString(),
        "2026-11-30T12:34:56.789Z"
      );
    }

    console.log("\n7b. Legacy parity — neverExpires still stamps the far-future sentinel");
    {
      const userId = await makeUser("legacy-never");
      const campaign = await makeCampaign("LGN", userId, {
        validForHours: undefined,
        neverExpires: true,
        endsAt: undefined,
      });
      const campaignId = campaign._id as unknown as mongoose.Types.ObjectId;

      const result = await CampaignService.ensureCampaignIssuanceForUser({
        userId: String(userId),
        campaignCode: campaign.code,
        trigger: "cancel-click",
      });
      check("a neverExpires campaign still mints", result.outcome, "minted");

      const stored = await RedeemableIssuance.findOne({ campaignId, userId }).lean();
      check("the sentinel date is stamped verbatim", stored?.expiresAt.toISOString(), "9999-12-31T23:59:59.999Z");
    }

    // ---------------------------------------------------------------------
    console.log("\n8. The wallet sweep enrols into a legacy campaign — and refuses a personal-window one");
    // Both campaigns are live, both are pinned to THIS user, both are otherwise
    // identical. The only difference is validForHours. One sweep call decides
    // both, so nothing else can explain the split.
    {
      const userId = await makeUser("sweep");
      const legacy = await makeCampaign("SWL", userId, { validForHours: undefined });
      const personal = await makeCampaign("SWP", userId, { validForHours: 72 });
      const legacyId = legacy._id as unknown as mongoose.Types.ObjectId;
      const personalId = personal._id as unknown as mongoose.Types.ObjectId;

      const sweep = await CampaignService.ensureActiveCampaignIssuancesForUser(String(userId));
      const sweptCampaignIds = new Set(sweep.issued.map((i) => i.campaignId));

      check("the sweep enrolled the legacy campaign, exactly as before", await rowsFor(legacyId, userId), 1);
      check("…and reported it back to the caller", sweptCampaignIds.has(String(legacyId)), true);
      check("the sweep refused the personal-window campaign", await rowsFor(personalId, userId), 0);
      check("…and reported nothing for it", sweptCampaignIds.has(String(personalId)), false);

      const legacyRow = await RedeemableIssuance.findOne({ campaignId: legacyId, userId }).lean();
      check(
        "the swept legacy row carries the campaign's endsAt",
        legacyRow?.expiresAt.getTime(),
        legacy.endsAt?.getTime()
      );

      // Same user, same campaign, one difference: an explicit trigger. That is
      // the entire gate.
      const triggered = await CampaignService.ensureCampaignIssuanceForUser({
        userId: String(userId),
        campaignCode: personal.code,
        trigger: "cancel-click",
      });
      check("an explicit trigger DOES enrol the same user into the same campaign", triggered.outcome, "minted");
      check("…writing exactly one row", await rowsFor(personalId, userId), 1);
    }
  } finally {
    // MILESTONE ISSUANCES ARE PART OF THIS FILE'S FOOTPRINT. Section 4 drives a
    // real `RedemptionService.redeem()`, and that calls
    // `MilestoneService.checkAndIssueMilestones` — the same chain the sibling
    // suite (campaign-window.test.ts) already cleans up after for exactly this
    // reason. It is latent today only because no active MilestoneReward has a
    // threshold low enough for a fixture user's entry count to reach; the moment
    // one does, every run of this file leaks a MilestoneIssuance permanently.
    //
    // EACH STEP INDIVIDUALLY GUARDED. As unguarded sequential awaits, ONE
    // throwing deleteMany skipped everything below it — including the MajorDraw
    // `$pull`, which is the step that removes a real entry subdocument from a
    // LIVE draw document. Same pattern, and same rationale, as
    // campaign-window.test.ts / campaign-enrolment.test.ts.
    const steps: Array<[string, () => Promise<unknown>]> = [
      ["issuances", () => RedeemableIssuance.deleteMany({ userId: { $in: userIds } })],
      [
        "major-draw entries",
        () =>
          MajorDraw.updateMany(
            { "entries.userId": { $in: userIds } },
            { $pull: { entries: { userId: { $in: userIds } } } }
          ),
      ],
      ["milestone issuances", () => MilestoneIssuance.deleteMany({ userId: { $in: userIds } })],
      ["campaigns", () => MonthlyEntryCampaign.deleteMany({ _id: { $in: campaignIds } })],
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

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed");
}

run().catch((error) => {
  console.error("bonus-code-mint.test.ts crashed:", error);
  process.exit(1);
});
