/**
 * A `campaignMode: "global"` campaign must be able to enrol MORE THAN ONE
 * customer. Until 2026-08-27 it could not, and nothing in the repo could see it.
 *
 * THE BUG THIS PINS. `RedeemableIssuance` carried
 * `index({ campaignId: 1, code: 1 }, { unique: true, sparse: true })`. A COMPOUND
 * sparse index indexes a document holding AT LEAST ONE of its keys, and
 * `campaignId` is required — so a global-mode row, which never carries a `code`,
 * is indexed as `(campaignId, null)` rather than skipped. Customer #2 into the
 * same campaign therefore threw `E11000 keyPattern {campaignId:1, code:1}`, and
 * `CampaignService` misread it as a `{campaignId,userId}` race and returned
 * `already_active` WITH NO ISSUANCE — the value that means "no grant exists, but
 * tell the caller everything is fine". All three live codes (BACKIN200 /
 * LOCKIN100 / EXTRA100) are global, so each could reach exactly one customer.
 *
 * WHY IT SHIPPED. The acceptance suite mints exactly ONE issuance per campaign
 * per run against a database it drops between runs, so a second customer on one
 * campaign never happens. No number of green runs could have caught this;
 * section 3 below is the shape of assertion that can.
 *
 * WHAT EACH SECTION IS FOR
 *   1. MECHANISM, on a throwaway collection: the old unique+sparse index really
 *      does reject a second code-less row, and the new unique+partial one really
 *      does accept it. Self-contained — it builds both indexes itself, so it
 *      proves the claim regardless of what index this database happens to carry.
 *   2. THIS DATABASE: `redeemableissuances.campaignId_1_code_1` is unique +
 *      partial and NOT sparse. A Mongoose `index()` change does NOT re-option an
 *      index that already exists, so a database that has not run
 *      `npm run migrate:issuance-partial-code-index` fails here, by design.
 *   3. END TO END, through `CampaignService`: two different customers, one
 *      global campaign, both hold an issuance. Section 3 is red on the old index
 *      even with section 2 removed — which is the point.
 *
 * FIXTURE SAFETY. Every user, campaign and issuance is created here and removed
 * in `finally`; the campaign code is namespaced by run so it can never collide
 * with a real one. The throwaway collection in section 1 is dropped in the same
 * teardown.
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
const SCRATCH_COLLECTION = `zz_issuance_index_probe_${RUN_ID}`;

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

async function makeUser(suffix: string) {
  const user = await User.create({
    firstName: "Global",
    lastName: "Enrolment",
    email: `global-enrolment-${RUN_ID}-${suffix}@example.test`,
    isActive: true,
    isEmailVerified: true,
    subscription: { isActive: false },
  });
  const id = user._id as unknown as mongoose.Types.ObjectId;
  userIds.push(id);
  return id;
}

let cleanedUp = false;
async function cleanup(): Promise<void> {
  if (cleanedUp) return;
  cleanedUp = true;
  const db = mongoose.connection.db;
  const steps: Array<[string, () => Promise<unknown>]> = [
    // Campaigns first: a leaked campaign row is a LIVE campaign in whatever
    // database MONGODB_URI points at, so it is the one that actually matters.
    ["campaigns", () => MonthlyEntryCampaign.deleteMany({ _id: { $in: campaignIds } })],
    ["issuances", () => RedeemableIssuance.deleteMany({ userId: { $in: userIds } })],
    ["users", () => User.deleteMany({ _id: { $in: userIds } })],
    ["scratch collection", async () => db?.collection(SCRATCH_COLLECTION).drop().catch(() => undefined)],
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

/** The E11000 shape, read the way `CampaignService` now reads it. */
function duplicateKeyPattern(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const e = error as { code?: number; keyPattern?: Record<string, number> };
  if (e.code !== 11000) return null;
  return e.keyPattern ? Object.keys(e.keyPattern).join(",") : "(no keyPattern)";
}

async function run() {
  await connectDB();
  const db = mongoose.connection.db;
  if (!db) throw new Error("No database handle after connectDB()");

  try {
    // ---------------------------------------------------------------------
    console.log("1. MECHANISM — sparse admits ONE code-less row per campaign; partial admits many");
    {
      const probe = db.collection(SCRATCH_COLLECTION);
      const campaignId = new mongoose.Types.ObjectId();

      // 1a — the OLD index, byte-identical to what shipped.
      await probe.createIndex({ campaignId: 1, code: 1 }, { unique: true, sparse: true });
      await probe.insertOne({ campaignId, userId: new mongoose.Types.ObjectId() });
      let sparseSecond: string | null = null;
      try {
        await probe.insertOne({ campaignId, userId: new mongoose.Types.ObjectId() });
        sparseSecond = "(inserted — no collision)";
      } catch (error) {
        sparseSecond = duplicateKeyPattern(error);
      }
      check(
        "unique+SPARSE rejects the 2nd code-less row on {campaignId,code}",
        sparseSecond,
        "campaignId,code"
      );

      // 1b — the NEW index, on the same data.
      await probe.dropIndex("campaignId_1_code_1");
      await probe.deleteMany({});
      await probe.createIndex(
        { campaignId: 1, code: 1 },
        { unique: true, partialFilterExpression: { code: { $exists: true } } }
      );
      await probe.insertOne({ campaignId, userId: new mongoose.Types.ObjectId() });
      let partialSecond: string | null = null;
      try {
        await probe.insertOne({ campaignId, userId: new mongoose.Types.ObjectId() });
      } catch (error) {
        partialSecond = duplicateKeyPattern(error) ?? String(error);
      }
      check("unique+PARTIAL accepts the 2nd code-less row", partialSecond, null);

      // 1c — and the partial index still guards real per-user codes.
      let codeDupe: string | null = null;
      try {
        await probe.insertOne({ campaignId, userId: new mongoose.Types.ObjectId(), code: "DUPE-2026-08" });
        await probe.insertOne({ campaignId, userId: new mongoose.Types.ObjectId(), code: "DUPE-2026-08" });
      } catch (error) {
        codeDupe = duplicateKeyPattern(error);
      }
      check("unique+PARTIAL still rejects a duplicate per-user code", codeDupe, "campaignId,code");
    }

    // ---------------------------------------------------------------------
    console.log("\n2. THIS DATABASE — the live campaignId_1_code_1 is unique + partial, not sparse");
    {
      const indexes = await db.collection("redeemableissuances").indexes();
      const live = indexes.find((i) => i.name === "campaignId_1_code_1");
      check("the index exists", !!live, true);
      check("it is unique", live?.unique === true, true);
      check("it is NOT sparse", !live?.sparse, true);
      check(
        "it is partial on { code: { $exists: true } } — if this fails, run `npm run migrate:issuance-partial-code-index`",
        JSON.stringify(live?.partialFilterExpression ?? null),
        JSON.stringify({ code: { $exists: true } })
      );
    }

    // ---------------------------------------------------------------------
    console.log("\n3. END TO END — two customers, ONE global campaign, both hold an issuance");
    {
      const campaign = await MonthlyEntryCampaign.create({
        monthKey: "2026-08",
        name: `Global enrolment ${RUN_ID}`,
        entriesAmount: 5,
        // The whole point: no per-user code is minted, so every row is code-less.
        campaignMode: "global",
        targetingMode: "all-active-subscribers",
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 30 * DAY_MS),
        neverExpires: false,
        // A personal window + an explicit trigger is what the three live codes
        // use, and what lets a subscription-less customer qualify at all.
        validForHours: 72,
        isActive: true,
        code: `GLOBALX${RUN_ID}`.slice(0, 32),
        requiresPurchase: false,
        purchaseRequirement: "none",
      });
      campaignIds.push(campaign._id as unknown as mongoose.Types.ObjectId);
      const campaignId = campaign._id as unknown as mongoose.Types.ObjectId;

      const firstUserId = await makeUser("first");
      const secondUserId = await makeUser("second");

      const first = await CampaignService.ensureCampaignIssuanceForUser({
        userId: String(firstUserId),
        campaignCode: campaign.code,
        trigger: "one-time-purchase",
      });
      check("customer #1 is minted", first.outcome, "minted");
      check("…and carries an issuance", !!first.issuance, true);

      // THE ASSERTION WHOSE ABSENCE LET THIS SHIP.
      const second = await CampaignService.ensureCampaignIssuanceForUser({
        userId: String(secondUserId),
        campaignCode: campaign.code,
        trigger: "one-time-purchase",
      });
      check("customer #2 is minted too", second.outcome, "minted");
      check("…and carries an issuance", !!second.issuance, true);

      // Outcome strings are what the issue route maps onto Klaviyo's status, so
      // assert the STORED truth as well: `already_active` with no issuance is
      // exactly how this failed silently.
      check("both rows exist in the collection", await RedeemableIssuance.countDocuments({ campaignId }), 2);
      check("customer #1 holds one", await RedeemableIssuance.countDocuments({ campaignId, userId: firstUserId }), 1);
      check("customer #2 holds one", await RedeemableIssuance.countDocuments({ campaignId, userId: secondUserId }), 1);

      // And a third, because "one works, two collide" would also be satisfied by
      // an off-by-one somewhere else.
      const thirdUserId = await makeUser("third");
      const third = await CampaignService.ensureCampaignIssuanceForUser({
        userId: String(thirdUserId),
        campaignCode: campaign.code,
        trigger: "one-time-purchase",
      });
      check("customer #3 is minted too", third.outcome, "minted");
      check("all three rows exist", await RedeemableIssuance.countDocuments({ campaignId }), 3);

      // Re-running the SAME customer must still be the harmless idempotent case:
      // already_active WITH the stored issuance, never a silent empty one.
      const repeat = await CampaignService.ensureCampaignIssuanceForUser({
        userId: String(firstUserId),
        campaignCode: campaign.code,
        trigger: "one-time-purchase",
      });
      check("re-running customer #1 is already_active", repeat.outcome, "already_active");
      check("…and still hands back the stored issuance", !!repeat.issuance, true);
      check("…and writes no extra row", await RedeemableIssuance.countDocuments({ campaignId }), 3);
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
  console.error("global-campaign-enrolment.test.ts crashed:", error);
  process.exit(1);
});
