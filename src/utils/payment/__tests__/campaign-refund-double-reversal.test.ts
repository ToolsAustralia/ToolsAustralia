import { config } from "dotenv";
import path from "node:path";
import assert from "node:assert/strict";
import mongoose from "mongoose";

// `@/lib/stripe` and `@/lib/auth` read env at module load, so this must run before
// the dynamic imports below.
config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * Refunding a purchase that used a bonus code must reverse its entries EXACTLY ONCE.
 *
 * THE DEFECT (found 2026-08-28, live since 2026-04-21 — commit `aa2b1257` added the
 * `campaignUnredeem` step AND `campaignEntries` in `legacyTotalEntries` together, so the
 * double has existed for ~4 months. It was first mis-dated to the #815–#824 merge, which
 * only made it more frequent by launching the Klaviyo-distributed codes):
 *
 * `reverseLedgerBenefits` runs every reverser in order with no short-circuit
 * (`reversers/orchestrator.ts`). For a purchase carrying a campaign grant, three steps
 * touched the same 100 entries:
 *
 *   1. `accumulatedEntriesAndRewardsPoints` — `legacyTotalEntries()` INCLUDES
 *      `grants.campaignEntries`, so it did `$inc accumulatedEntries: -100`.
 *   2. `drawEntries` — removed 100 from the draw the ledger names, SCOPED by `drawId`.
 *   3. `campaignUnredeem` — called `RedemptionService.unredeem*Redemption`, which did
 *      `$inc accumulatedEntries: -100` a SECOND time and called `removeMajorDrawEntries`
 *      with NO drawId.
 *
 * Two consequences, both silent:
 *   • `accumulatedEntries` dropped by 200 for a 100-entry coupon, and could go negative —
 *     the schema's `min: 0` does not run, because both writes use `User.updateOne` and
 *     Mongoose skips validators on update by default.
 *   • The second removal took the drawId-less path in `removeMajorDrawEntries`, which that
 *     module itself calls "the historical danger zone… entries will be consumed from the
 *     oldest forward and may decrement an unrelated draw". So refunding this month's
 *     purchase could strip entries a member earned in a PREVIOUS, unrefunded draw.
 *
 * THE FIX: the unredeem methods take `entriesAlreadyReversed`, which the refund path sets
 * whenever `grants.campaignEntries` carried the figure. Both campaign arms are covered —
 * monthly-coupon and milestone — because both stamp `campaignEntries` + a scoped
 * `drawGrants` row. The milestone AUTO-GRANT flow (`grants.milestoneIssuanceIds`, reversed
 * by the `milestoneRevoke` step) does not, so it keeps the default `false` and is unchanged.
 *
 * HOW THIS TEST WORKS: it runs the REAL `reverseLedgerBenefits` with the Mongoose model
 * statics monkey-patched to RECORD writes instead of performing them — no database is
 * touched. `.env.local` points at a live Atlas cluster, so nothing here may write. What is
 * asserted is what the production code actually attempted. Re-running with MONGODB_URI
 * pointed at a dead host reproduces identically, which is what proves both.
 */

type UpdateCall = { filter: unknown; update: Record<string, unknown> };
type Scenario = { label: string; kind: "monthly-coupon" | "milestone" };

const COUPON_ENTRIES = 100;

async function runScenario(scenario: Scenario) {
  const { default: User } = await import("@/models/User");
  const { default: PaymentEvent } = await import("@/models/PaymentEvent");
  const { default: MajorDraw } = await import("@/models/MajorDraw");
  const { default: RedeemableIssuance } = await import("@/models/RedeemableIssuance");
  const { default: MilestoneIssuance } = await import("@/models/MilestoneIssuance");
  const { reverseLedgerBenefits } = await import("@/utils/payment/refund-ledger-reversal");

  const userId = new mongoose.Types.ObjectId();
  const issuanceId = new mongoose.Types.ObjectId();
  const drawId = new mongoose.Types.ObjectId();

  const userUpdates: UpdateCall[] = [];
  const drawFinds: Record<string, unknown>[] = [];

  // ── Patch the data layer: record, never write. ────────────────────────────────
  User.findById = (async () => ({
    _id: userId,
    accumulatedEntries: 500,
    rewardsPoints: 0,
    oneTimePackages: [],
    // No stripeSubscriptionId → the subscription branch cannot reach Stripe.
  })) as unknown as typeof User.findById;

  User.updateOne = (async (filter: unknown, update: Record<string, unknown>) => {
    userUpdates.push({ filter, update });
    return { acknowledged: true, modifiedCount: 1 };
  }) as unknown as typeof User.updateOne;

  MajorDraw.find = ((filter: Record<string, unknown>) => {
    drawFinds.push(filter);
    return Promise.resolve([]); // no draws → removal exits early, but the CALL is captured
  }) as unknown as typeof MajorDraw.find;

  const redeemedDoc = {
    _id: issuanceId,
    userId,
    status: "redeemed",
    entriesAmount: COUPON_ENTRIES,
    milestoneType: "other",
  };
  RedeemableIssuance.findOne = (async () => redeemedDoc) as unknown as typeof RedeemableIssuance.findOne;
  MilestoneIssuance.findOne = (async () => redeemedDoc) as unknown as typeof MilestoneIssuance.findOne;
  RedeemableIssuance.updateOne = (async () => ({ acknowledged: true })) as unknown as typeof RedeemableIssuance.updateOne;
  MilestoneIssuance.updateOne = (async () => ({ acknowledged: true })) as unknown as typeof MilestoneIssuance.updateOne;
  PaymentEvent.updateOne = (async () => ({ acknowledged: true })) as unknown as typeof PaymentEvent.updateOne;

  // ── The purchase being refunded: a pack bought with a 100-entry bonus code. ────
  const campaign: Record<string, unknown> = { code: "REPRO100", redemptionKind: scenario.kind };
  if (scenario.kind === "monthly-coupon") campaign.monthlyIssuanceId = String(issuanceId);
  else campaign.milestoneIssuanceId = String(issuanceId);

  const originalEvent = {
    _id: new mongoose.Types.ObjectId(),
    packageType: "one-time",
    paymentIntentId: "pi_repro",
    data: {
      entries: COUPON_ENTRIES,
      grants: {
        baseEntries: 0,
        bonusPromoEntries: 0,
        promoLinkEntries: 0,
        campaignEntries: COUPON_ENTRIES,
        rewardsPoints: 0,
        drawGrants: [
          { kind: "major", sourceKey: "bonus-entry-promo", drawId: String(drawId), entries: COUPON_ENTRIES },
        ],
        campaign,
      },
    },
  };

  const reversalIssues: Array<{ step: string; error: string }> = [];
  await reverseLedgerBenefits({
    userId: String(userId),
    originalEvent: originalEvent as never,
    paymentIntentId: "pi_repro",
    refundEventId: "re_repro",
    reversalIssues,
  });

  const entryDecrements = userUpdates
    .map((c) => (c.update.$inc as Record<string, number> | undefined)?.accumulatedEntries)
    .filter((v): v is number => typeof v === "number");
  const totalRemoved = -entryDecrements.reduce((a, b) => a + b, 0);
  const unscopedFinds = drawFinds.filter((f) => !("_id" in f));

  console.log(`\n${scenario.label}`);
  console.log(`  decrements  : ${JSON.stringify(entryDecrements)}   total taken back: ${totalRemoved}`);
  console.log(`  draw finds  : ${drawFinds.length} (${unscopedFinds.length} unscoped)`);
  if (reversalIssues.length) console.log(`  issues      : ${JSON.stringify(reversalIssues)}`);

  assert.equal(
    totalRemoved,
    COUPON_ENTRIES,
    `${scenario.label}: a ${COUPON_ENTRIES}-entry code must be reversed ONCE — the refund took back ${totalRemoved}`
  );
  assert.equal(
    unscopedFinds.length,
    0,
    `${scenario.label}: every draw removal must be scoped by drawId — ${unscopedFinds.length} call(s) fell ` +
      `back to the legacy multi-draw walk, which can strip a different, unrefunded draw`
  );

  // The redemption record itself is this method's own responsibility and must still be
  // undone — the fix must not have skipped the whole method, only the entry arithmetic.
  const pulled = userUpdates.some((c) => (c.update as { $pull?: unknown }).$pull);
  assert.ok(pulled, `${scenario.label}: the redemptionHistory row must still be pulled`);
}

async function run() {
  await runScenario({ label: "monthly-coupon campaign refund", kind: "monthly-coupon" });
  await runScenario({ label: "milestone campaign refund", kind: "milestone" });

  console.log("\nAll tests passed");
  // `@/lib/auth` (pulled in transitively) opens a Mongo handle that keeps the event
  // loop alive. Without this the suite prints its result and then hangs.
  process.exit(0);
}

run().catch((err) => {
  console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
