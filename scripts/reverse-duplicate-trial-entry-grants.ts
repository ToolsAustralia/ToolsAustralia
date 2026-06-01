#!/usr/bin/env npx tsx

/**
 * Reverse membership entry-grants that were DOUBLE-GRANTED by Stripe's $0
 * "Trial period" invoice bug.
 *
 * Background: whenever `trial_end` is set on an existing subscription (past-due
 * reanchor, the `migrate-anchor-billing-24` migration, join-anchoring 25/26/27→24),
 * Stripe auto-creates a separate $0 invoice with `billing_reason=subscription_update`
 * and marks it paid. The `invoice.payment_succeeded` webhook granted membership
 * entries for that $0 invoice — DOUBLE-counting the real `subscription_cycle`
 * renewal. See `src/utils/billing/trial-invoice.ts` for the now-deployed guard.
 *
 * A "duplicate" is defined as: a `BenefitsGranted` event with
 * `data.billingReason==='subscription_update'` that has a sibling REAL grant
 * (`data.billingReason ∈ {subscription_cycle, subscription_create}`) for the same
 * user within ±1 day. Standalone `subscription_update` grants (no sibling) are
 * NOT auto-reversed — they are listed as FLAGGED for manual review.
 *
 * Usage:
 *   npm run reverse:duplicate-trial-entry-grants:dry -- --all
 *   npm run reverse:duplicate-trial-entry-grants -- --all --apply
 *   npm run reverse:duplicate-trial-entry-grants -- --userId=<id> --apply
 *   npm run reverse:duplicate-trial-entry-grants -- --email=<addr> --apply
 *
 * Options:
 *   --apply            Actually write changes. Without this flag, the script is
 *                      a DRY-RUN (prints plan, makes ZERO writes).
 *   --all              Process every confirmed-duplicate user since --since.
 *   --userId=<id>      Target a single user by Mongo ObjectId.
 *   --email=<addr>     Target a single user by email address (case-insensitive).
 *   --since=YYYY-MM-DD Lower bound for confirmed-duplicate search (default: 2026-01-01).
 *   --include-points   Also reverse rewardsPoints credited by the dup event.
 *                      DEFAULT OFF: leaving points avoids over-penalising users
 *                      (the over-credit is a small positive balance, not a
 *                      negative one). Enable only when confirmed the points were
 *                      used to redeem rewards that have since been reversed.
 *
 * Safety:
 *   - Default mode is DRY-RUN — pass --apply to write.
 *   - NEVER touches Stripe, subscription.isActive/autoRenew/endDate/status,
 *     Winner docs, TicketEntry, or MonthlyEntryCampaign.
 *   - Does NOT call reverseLedgerBenefits / reverseMembershipLedger — those
 *     cancel the live subscription. Only adjusts entry/point counters.
 *   - Idempotent: skips any dup event that already has a BenefitsReversed marker.
 *   - Only calls removeMajorDrawEntries with an explicit drawId (from the ledger).
 *     If a ledger row has no usable drawId, it is skipped and flagged.
 *
 * Env: MONGODB_URI (loaded from .env.local).
 *
 * @module scripts/reverse-duplicate-trial-entry-grants
 */

import { config } from "dotenv";
import path from "path";
import mongoose from "mongoose";

config({ path: path.resolve(process.cwd(), ".env.local") });

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArg(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split("=").slice(1).join("=") : undefined;
}

const ARG_APPLY = process.argv.includes("--apply");
const ARG_ALL = process.argv.includes("--all");
const ARG_USER_ID = parseArg("userId");
const ARG_EMAIL = parseArg("email");
const ARG_SINCE = parseArg("since") ?? "2026-01-01";
const ARG_INCLUDE_POINTS = process.argv.includes("--include-points");

const DRY_RUN = !ARG_APPLY;

if (!ARG_USER_ID && !ARG_EMAIL && !ARG_ALL) {
  console.error("Specify one of: --userId=<id>, --email=<addr>, --all");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Local types (mirrors ledger shapes from src/types/payment-ledger.ts)
// ---------------------------------------------------------------------------

interface DrawGrantRow {
  kind: "major" | "mini";
  drawId: string;
  sourceKey: string;
  entries: number;
}

interface GrantsLedger {
  drawGrants?: DrawGrantRow[];
  rewardsPoints?: number;
  lastMonthDelta?: number;
}

interface BenefitsGrantedEvent {
  _id: string;
  eventType: string;
  userId: mongoose.Types.ObjectId;
  paymentIntentId: string;
  packageType: string;
  packageName?: string;
  data: {
    billingReason?: string;
    entries?: number;
    grants?: GrantsLedger;
    [key: string]: unknown;
  };
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Sibling detection — same logic as find-duplicate-trial-entry-grants.ts
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MongoCollection = mongoose.mongo.Collection<any>;

async function findSiblingRealGrant(
  eventsColl: MongoCollection,
  userId: mongoose.Types.ObjectId,
  ts: Date
): Promise<boolean> {
  const sibling = await eventsColl.findOne({
    userId,
    eventType: "BenefitsGranted",
    packageType: "membership",
    "data.billingReason": { $in: ["subscription_cycle", "subscription_create"] },
    timestamp: {
      $gte: new Date(ts.getTime() - DAY_MS),
      $lte: new Date(ts.getTime() + DAY_MS),
    },
  });
  return sibling !== null;
}

/**
 * READ-ONLY: live MajorDraw membership state for a user across every draw they
 * appear in. Used to ground-truth the empty-drawGrants gap case (was the draw
 * actually over-credited, or was the credit swallowed?).
 */
async function getUserDrawState(
  majorDrawsColl: MongoCollection,
  userId: string
): Promise<Array<{ drawId: string; name: string; total: number; membership: number }>> {
  const objId = new mongoose.Types.ObjectId(userId);
  const draws = await majorDrawsColl
    .find({ "entries.userId": objId }, { projection: { name: 1, "entries.$": 1 } })
    .toArray();
  return draws.map((d) => {
    const e = (d.entries as Array<{ totalEntries?: number; entriesBySource?: Record<string, number> }>)?.[0];
    return {
      drawId: String(d._id),
      name: (d.name as string) ?? "(unnamed)",
      total: e?.totalEntries ?? 0,
      membership: e?.entriesBySource?.membership ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Per-event reversal
// ---------------------------------------------------------------------------

interface ReversalResult {
  skipped: boolean;
  skipReason?: string;
  anomalous?: boolean; // skipped because data.entries exceeds scoped drawGrants
  entriesReversed: number; // accumulatedEntries decrement (= data.entries)
  drawEntriesReversed?: number; // sum of scoped draw-ledger rows
  drawLedgerGap?: number; // accumulated − draw (entries with no scoped draw row)
  drawIds: string[];
  pointsReversed: number;
  lastMonthAdjusted: boolean;
  missingDrawIdRows: number;
}

async function reverseOneDupEvent(
  eventsColl: MongoCollection,
  usersColl: MongoCollection,
  dupEvent: BenefitsGrantedEvent,
  userId: string,
  userEmail: string,
  userDoc: {
    accumulatedEntries?: number;
    rewardsPoints?: number;
    subscription?: { lastMonthAccumulatedEntries?: number };
    processedPayments?: string[];
  },
  scriptStartTime: Date
): Promise<ReversalResult> {
  const dupId = dupEvent.paymentIntentId; // e.g. "invoice_XXXX"
  const reversalMarkerId = `BenefitsReversed-${dupId}`;
  const sourceEventId = `BenefitsGranted-${dupId}`;

  // Step 1 — idempotency: skip if already reversed
  const alreadyReversed = await eventsColl.findOne({ _id: reversalMarkerId as unknown });
  if (alreadyReversed) {
    return {
      skipped: true,
      skipReason: "already-reversed (BenefitsReversed marker exists)",
      entriesReversed: 0,
      drawIds: [],
      pointsReversed: 0,
      lastMonthAdjusted: false,
      missingDrawIdRows: 0,
    };
  }

  // Read the grants ledger from the dup event
  const ledger: GrantsLedger = (dupEvent.data.grants as GrantsLedger) ?? {};
  const drawGrants = ledger.drawGrants ?? [];
  const ledgerPoints = ledger.rewardsPoints ?? 0;
  const ledgerLastMonthDelta = ledger.lastMonthDelta ?? 0;
  // `data.entries` is `packageData.entries` — the amount that `grantBenefits`
  // ALWAYS $inc'd into accumulatedEntries (payment-processing.ts:1070), BEFORE
  // and INDEPENDENT of the draw write. The draw credit can fail-and-be-swallowed
  // (leaving drawGrants empty) while accumulatedEntries was still incremented, so
  // accumulatedEntries MUST be reversed by data.entries — NOT by sum(drawGrants).
  const ledgerEntries = Number((dupEvent.data as { entries?: number }).entries ?? 0);

  // Step 2 — compute which draw rows we can action vs must skip
  const majorGrants = drawGrants.filter((g) => g.kind === "major");
  const skippedRows: DrawGrantRow[] = [];
  const actionableGrants: DrawGrantRow[] = [];

  for (const g of majorGrants) {
    if (!g.drawId || !mongoose.Types.ObjectId.isValid(g.drawId)) {
      skippedRows.push(g);
    } else {
      actionableGrants.push(g);
    }
  }

  // Draw-level reversal total (scoped per ledger row). May be < accumulated total
  // when a draw credit was swallowed (empty/partial drawGrants).
  const drawEntriesToReverse = actionableGrants.reduce((s, g) => s + g.entries, 0);
  // accumulatedEntries reversal = what was actually added to it (data.entries).
  // Fall back to the draw total only if data.entries is absent/0.
  const accumulatedToReverse = ledgerEntries > 0 ? ledgerEntries : drawEntriesToReverse;
  // Gap = entries that hit accumulatedEntries but have NO scoped draw ledger row.
  // We can't safely decrement an unknown draw, so the gap is flagged, not actioned.
  const drawLedgerGap = accumulatedToReverse - drawEntriesToReverse;
  const affectedDrawIds = actionableGrants.map((g) => g.drawId);
  const pointsToReverse = ARG_INCLUDE_POINTS ? ledgerPoints : 0;

  // Step 3 — determine lastMonthAccumulatedEntries plan.
  //
  // lastMonthAccumulatedEntries is an ABSOLUTE $set (last-writer-wins) that is
  // read back at every FUTURE renewal to size that renewal's grant — so a wrong
  // value compounds forever. The dup and the real renewal both ran for the SAME
  // cycle; whichever wrote last won. The CORRECT post-reversal value is simply
  // what the REAL renewal computed — which it recorded as its own data.entries
  // (newLastMonthAccumulatedEntries == entriesToGrant == data.entries for a
  // renewal). So we SET lastMonth to the real sibling's data.entries rather than
  // decrement by the dup's recorded delta (the delta overstates the dup's net
  // effect in the concurrent-same-baseline case, e.g. William: both wrote 560,
  // delta=40, but the dup changed the final value by 0).
  //
  // We only touch it when NO subsequent CYCLE has overwritten it. "Subsequent
  // cycle" = a membership grant more than 1 day after the dup (the same-cycle
  // real sibling is within ±1 day and must NOT count as a later renewal).
  const laterCycleGrant = await eventsColl.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    eventType: "BenefitsGranted",
    packageType: "membership",
    timestamp: { $gt: new Date(dupEvent.timestamp.getTime() + DAY_MS) },
  });
  const isLatestCycle = laterCycleGrant === null;

  // The same-cycle real renewal sibling (closest cycle/create within ±1 day).
  const siblingCandidates = (await eventsColl
    .find({
      userId: new mongoose.Types.ObjectId(userId),
      eventType: "BenefitsGranted",
      packageType: "membership",
      "data.billingReason": { $in: ["subscription_cycle", "subscription_create"] },
      timestamp: {
        $gte: new Date(dupEvent.timestamp.getTime() - DAY_MS),
        $lte: new Date(dupEvent.timestamp.getTime() + DAY_MS),
      },
    })
    .toArray()) as BenefitsGrantedEvent[];
  siblingCandidates.sort(
    (a, b) =>
      Math.abs(a.timestamp.getTime() - dupEvent.timestamp.getTime()) -
      Math.abs(b.timestamp.getTime() - dupEvent.timestamp.getTime())
  );
  const realSibling = siblingCandidates[0];
  const realSiblingEntries =
    realSibling != null ? Number((realSibling.data as { entries?: number }).entries ?? 0) : null;

  const currentLastMonth = userDoc.subscription?.lastMonthAccumulatedEntries ?? 0;
  // Target = the real renewal's value. Only adjust when this is the latest cycle,
  // we found the sibling, and the current value actually differs.
  const lastMonthTarget = realSiblingEntries;
  const willAdjustLastMonth =
    isLatestCycle && lastMonthTarget !== null && lastMonthTarget !== currentLastMonth;
  const lastMonthAfter = willAdjustLastMonth ? lastMonthTarget! : currentLastMonth;

  const currentAccumulated = userDoc.accumulatedEntries ?? 0;
  const accumulatedAfter = Math.max(0, currentAccumulated - accumulatedToReverse);

  const currentPoints = userDoc.rewardsPoints ?? 0;
  const pointsAfter = Math.max(0, currentPoints - pointsToReverse);

  // ─── DRY-RUN output ──────────────────────────────────────────────────────
  console.error(
    `\n  [event] ${sourceEventId}  paymentIntentId=${dupId}  pkg=${dupEvent.packageName ?? dupEvent.packageType}`
  );
  console.error(`    timestamp: ${dupEvent.timestamp.toISOString()}`);
  console.error(`    data.entries (granted to accumulatedEntries): ${ledgerEntries}`);
  console.error(`    ledger drawGrants (major): ${majorGrants.length} row(s), summing ${drawEntriesToReverse} entries`);

  for (const g of actionableGrants) {
    console.error(`      → drawId=${g.drawId} sourceKey=${g.sourceKey} entries=${g.entries} [WILL REVERSE in draw]`);
  }
  for (const g of skippedRows) {
    console.error(
      `      → drawId=MISSING sourceKey=${g.sourceKey} entries=${g.entries} [SKIP — no drawId — needs manual review]`
    );
  }

  // ANOMALOUS GUARD: a clean duplicate is one where the dup's scoped drawGrants
  // FULLY account for its data.entries (gap === 0). When data.entries exceeds the
  // scoped draw rows, the event doesn't fit the clean double-grant model — the
  // draw may or may not be over-credited, the matched "sibling" may be wrong, and
  // the live-draw / lastMonth numbers don't reconcile (e.g. logepark: April
  // draw=1060 but drawGrants empty and sibling=60). Auto-reversing such a case
  // risks corrupting it further, so we FLAG it for manual review and act on NOTHING.
  if (drawLedgerGap > 0) {
    console.error(
      `    ⚠ ANOMALOUS — FLAGGED, NOT auto-reversed: data.entries (${ledgerEntries}) exceeds scoped drawGrants (${drawEntriesToReverse}) by ${drawLedgerGap}.`
    );
    console.error(
      `      → The clean double-grant model (draw = realSibling + dupDrawGrant) does not hold here. Reconcile by hand against the live-draw state printed above.`
    );
    return {
      skipped: true,
      skipReason: `anomalous draw-ledger gap (${drawLedgerGap}) — needs manual review`,
      anomalous: true,
      entriesReversed: 0,
      drawEntriesReversed: 0,
      drawLedgerGap,
      drawIds: [],
      pointsReversed: 0,
      lastMonthAdjusted: false,
      missingDrawIdRows: skippedRows.length,
    };
  }

  console.error(
    `    accumulatedEntries: ${currentAccumulated} → ${accumulatedAfter}  (decrement ${accumulatedToReverse})`
  );

  const siblingDesc =
    realSibling != null
      ? `realSibling=${String(realSibling._id)} data.entries=${realSiblingEntries} reason=${realSibling.data.billingReason}`
      : `realSibling=NONE-FOUND`;
  console.error(`    ${siblingDesc}  ledger lastMonthDelta(for reference)=${ledgerLastMonthDelta}`);
  if (!isLatestCycle) {
    console.error(
      `    lastMonthAccumulatedEntries: ${currentLastMonth} [LEAVE — a later CYCLE overwrote it; laterCycle._id=${String(laterCycleGrant!._id)}]`
    );
  } else if (realSibling == null) {
    console.error(
      `    lastMonthAccumulatedEntries: ${currentLastMonth} [LEAVE — no real sibling found to derive the correct value; FLAG for manual review]`
    );
  } else if (!willAdjustLastMonth) {
    console.error(
      `    lastMonthAccumulatedEntries: ${currentLastMonth} [LEAVE — already equals the real renewal value ${lastMonthTarget}]`
    );
  } else {
    console.error(
      `    lastMonthAccumulatedEntries: ${currentLastMonth} → ${lastMonthAfter}  [SET to real renewal's data.entries — corrects compounding baseline]`
    );
  }

  if (ARG_INCLUDE_POINTS) {
    console.error(`    rewardsPoints: ${currentPoints} → ${pointsAfter}  (decrement ${ledgerPoints})`);
  } else {
    console.error(`    rewardsPoints: ${currentPoints} [LEAVE — --include-points not set; small over-credit tolerated]`);
  }

  console.error(
    `    will write BenefitsReversed marker: ${reversalMarkerId}`
  );
  console.error(
    `    will $pull ${dupId} from User.processedPayments`
  );
  console.error(
    `    will DELETE spurious event: ${sourceEventId}`
  );

  if (DRY_RUN) {
    return {
      skipped: false,
      entriesReversed: accumulatedToReverse,
      drawEntriesReversed: drawEntriesToReverse,
      drawLedgerGap,
      drawIds: affectedDrawIds,
      pointsReversed: pointsToReverse,
      lastMonthAdjusted: willAdjustLastMonth,
      missingDrawIdRows: skippedRows.length,
    };
  }

  // ─── APPLY mode ──────────────────────────────────────────────────────────
  //
  // ORDER MATTERS. The counter mutations below are NOT individually idempotent
  // ($inc -N is unclamped and could drive a value negative on a re-run). So we
  // write the BenefitsReversed marker FIRST as an atomic claim — the unique
  // {paymentIntentId, eventType} index means a duplicate insert throws, which we
  // treat as "already reversed" and skip. If a later mutation then fails, the
  // marker still exists, so a re-run SKIPS (leaving a visible partial reversal to
  // reconcile by hand) rather than DOUBLE-reversing. Under-applying is safer than
  // over-applying for entry counts.

  // 1. Claim: write the BenefitsReversed marker first.
  try {
    await eventsColl.insertOne({
      _id: reversalMarkerId as unknown,
      paymentIntentId: dupId,
      eventType: "BenefitsReversed",
      userId: new mongoose.Types.ObjectId(userId),
      packageType: "membership",
      processedBy: "admin",
      timestamp: scriptStartTime,
      data: {
        reversed: {
          entries: accumulatedToReverse,
          drawEntries: drawEntriesToReverse,
          drawLedgerGap,
          drawIds: affectedDrawIds,
          points: ARG_INCLUDE_POINTS ? ledgerPoints : 0,
          lastMonthBefore: currentLastMonth,
          lastMonthAfter: willAdjustLastMonth ? lastMonthAfter : currentLastMonth,
          lastMonthSetFromSibling: willAdjustLastMonth ? String(realSibling!._id) : null,
        },
        reason: "zero-trial-duplicate",
        sourceEventId,
      },
      attributionAdId: null,
      attributionAdsetId: null,
      attributionCampaignId: null,
      convertingPlatform: null,
      attributionConfidence: null,
      isRenewal: false,
    });
  } catch (err) {
    // Duplicate-key (code 11000) → another run already claimed it; skip safely.
    if ((err as { code?: number }).code === 11000) {
      return {
        skipped: true,
        skipReason: "already-reversed (BenefitsReversed marker race)",
        entriesReversed: 0,
        drawEntriesReversed: 0,
        drawLedgerGap,
        drawIds: [],
        pointsReversed: 0,
        lastMonthAdjusted: false,
        missingDrawIdRows: skippedRows.length,
      };
    }
    throw err;
  }

  // 2. Remove draw entries per actionable drawGrant row (scoped, clamped).
  const { removeMajorDrawEntries } = await import("../src/utils/draws/remove-draw-entries");

  for (const g of actionableGrants) {
    const result = await removeMajorDrawEntries(
      userId,
      g.entries,
      g.sourceKey as "membership",
      g.drawId
    );
    if (!result.success) {
      console.error(
        `    [WARN] removeMajorDrawEntries failed for drawId=${g.drawId} entries=${g.entries}: ${result.error ?? "unknown"}`
      );
    }
  }

  // 3. Decrement accumulatedEntries by the amount that was actually granted
  //    (data.entries), independent of how many draw rows we could scope-reverse.
  if (accumulatedToReverse > 0) {
    await usersColl.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $inc: { accumulatedEntries: -accumulatedToReverse } }
    );
  }

  // 4. rewardsPoints (only when --include-points)
  if (ARG_INCLUDE_POINTS && pointsToReverse > 0) {
    await usersColl.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: { rewardsPoints: pointsAfter } }
    );
  }

  // 5. lastMonthAccumulatedEntries — SET to the real renewal's value (the correct
  //    cumulative baseline). Only when this is the latest cycle, a real sibling
  //    was found, and the current value actually differs (see Step 3 rationale).
  if (willAdjustLastMonth) {
    await usersColl.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: { "subscription.lastMonthAccumulatedEntries": lastMonthAfter } }
    );
  }

  // 6. Neutralize spurious source event:
  //    a) $pull dupId from User.processedPayments
  await usersColl.updateOne(
    { _id: new mongoose.Types.ObjectId(userId) },
    { $pull: { processedPayments: dupId } } as unknown as Parameters<typeof usersColl.updateOne>[1]
  );
  //    b) DELETE the spurious BenefitsGranted event (BenefitsReversed preserves the audit trail)
  await eventsColl.deleteOne({ _id: sourceEventId as unknown });

  return {
    skipped: false,
    entriesReversed: accumulatedToReverse,
    drawEntriesReversed: drawEntriesToReverse,
    drawLedgerGap,
    drawIds: affectedDrawIds,
    pointsReversed: pointsToReverse,
    lastMonthAdjusted: willAdjustLastMonth,
    missingDrawIdRows: skippedRows.length,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set — check .env.local");
    process.exit(1);
  }

  const connectDB = (await import("../src/lib/mongodb")).default;
  await connectDB();

  const db = mongoose.connection.db;
  if (!db) {
    console.error("Mongo connection is not ready");
    process.exit(1);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventsColl: MongoCollection = db.collection<any>("paymentevents");
  const usersColl: MongoCollection = db.collection("users");
  const majorDrawsColl: MongoCollection = db.collection("majordraws");

  const scriptStartTime = new Date();

  console.error(`\n=== reverse-duplicate-trial-entry-grants ===`);
  console.error(`Mode: ${DRY_RUN ? "DRY-RUN (zero writes)" : "APPLY (writing to MongoDB)"}`);
  console.error(`--include-points: ${ARG_INCLUDE_POINTS}`);
  console.error(`--since: ${ARG_SINCE}`);

  // ── Build the target set of subscription_update BenefitsGranted events ──

  // Base query: all membership BenefitsGranted with billingReason=subscription_update
  const sinceDate = new Date(ARG_SINCE);
  const baseQuery: Record<string, unknown> = {
    eventType: "BenefitsGranted",
    packageType: "membership",
    "data.billingReason": "subscription_update",
    timestamp: { $gte: sinceDate },
  };

  // Narrow to target user(s) when --userId or --email is given
  if (ARG_USER_ID) {
    if (!mongoose.Types.ObjectId.isValid(ARG_USER_ID)) {
      console.error(`Invalid userId: ${ARG_USER_ID}`);
      process.exit(1);
    }
    baseQuery.userId = new mongoose.Types.ObjectId(ARG_USER_ID);
  } else if (ARG_EMAIL) {
    const userDoc = await usersColl.findOne(
      { email: { $regex: `^${ARG_EMAIL}$`, $options: "i" } },
      { projection: { _id: 1 } }
    );
    if (!userDoc) {
      console.error(`No user found with email: ${ARG_EMAIL}`);
      process.exit(1);
    }
    baseQuery.userId = userDoc._id;
  }
  // --all: no additional filter (already scoped by since)

  const updateGrants = (await eventsColl
    .find(baseQuery)
    .sort({ timestamp: 1 })
    .toArray()) as BenefitsGrantedEvent[];

  console.error(`\nFound ${updateGrants.length} subscription_update BenefitsGranted event(s) since ${ARG_SINCE}.`);

  // Partition into confirmed-duplicates vs standalone
  type StandaloneEntry = { event: BenefitsGrantedEvent; userId: string };
  const confirmedDups: BenefitsGrantedEvent[] = [];
  const standalone: StandaloneEntry[] = [];

  for (const g of updateGrants) {
    const hasSibling = await findSiblingRealGrant(eventsColl, g.userId, g.timestamp as Date);
    if (hasSibling) {
      confirmedDups.push(g);
    } else {
      standalone.push({ event: g, userId: String(g.userId) });
    }
  }

  console.error(`Confirmed duplicates (paired): ${confirmedDups.length}`);
  console.error(`Standalone (no sibling — NOT auto-reversed): ${standalone.length}`);

  // ── Process confirmed duplicates ──────────────────────────────────────────

  let totalEntriesReversed = 0;
  let totalDrawEntriesReversed = 0;
  let totalDrawsAffected = 0;
  let totalMissingDrawIdRows = 0;
  let totalLastMonthAdjusted = 0;
  let eventsSkipped = 0;
  let eventsAnomalous = 0;
  let eventsReversed = 0;
  const seenUserIds = new Set<string>();
  const reversedUserIds = new Set<string>();

  console.error(`\n=== CONFIRMED DUPLICATES — PLAN ===`);

  for (const dupEvent of confirmedDups) {
    const uid = String(dupEvent.userId);

    // Fetch user for current field values
    const userDoc = await usersColl.findOne(
      { _id: new mongoose.Types.ObjectId(uid) },
      { projection: { email: 1, accumulatedEntries: 1, rewardsPoints: 1, subscription: 1, processedPayments: 1 } }
    );
    if (!userDoc) {
      console.error(`\n  [skip] event=${dupEvent._id} user=${uid} — user document not found`);
      eventsSkipped++;
      continue;
    }

    const userEmail = (userDoc.email as string) ?? "(no email)";

    if (!seenUserIds.has(uid)) {
      seenUserIds.add(uid);
      console.error(`\nUser: ${userEmail}  [${uid}]`);
      // Live-draw ground truth (read-only) — print BEFORE the per-event plan so
      // the GAP warning can be checked against actual draw membership counts.
      const drawState = await getUserDrawState(majorDrawsColl, uid);
      if (drawState.length === 0) {
        console.error(`  live draws: (user not present in any MajorDraw)`);
      } else {
        for (const ds of drawState) {
          console.error(
            `  live draw "${ds.name}" [${ds.drawId}]: membership=${ds.membership}  total=${ds.total}`
          );
        }
      }
    }

    const result = await reverseOneDupEvent(
      eventsColl,
      usersColl,
      dupEvent,
      uid,
      userEmail,
      userDoc as {
        accumulatedEntries?: number;
        rewardsPoints?: number;
        subscription?: { lastMonthAccumulatedEntries?: number };
        processedPayments?: string[];
      },
      scriptStartTime
    );

    if (result.skipped) {
      console.error(`    [SKIP] ${result.skipReason}`);
      eventsSkipped++;
      if (result.anomalous) eventsAnomalous++;
      continue;
    }

    eventsReversed++;
    reversedUserIds.add(uid);
    totalEntriesReversed += result.entriesReversed;
    totalDrawEntriesReversed += result.drawEntriesReversed ?? 0;
    totalDrawsAffected += result.drawIds.length;
    totalMissingDrawIdRows += result.missingDrawIdRows;
    if (result.lastMonthAdjusted) totalLastMonthAdjusted++;
  }

  const totalUsersAffected = reversedUserIds.size;

  // ── Standalone list ───────────────────────────────────────────────────────

  if (standalone.length > 0) {
    console.error(`\n=== FLAGGED — STANDALONE subscription_update grants (NOT auto-reversed, needs manual review) ===`);
    const standaloneUserIds = [...new Set(standalone.map((s) => s.userId))].map(
      (id) => new mongoose.Types.ObjectId(id)
    );
    const standaloneUsers = await usersColl
      .find({ _id: { $in: standaloneUserIds } }, { projection: { email: 1 } })
      .toArray();
    const emailMap = new Map(standaloneUsers.map((u) => [String(u._id), u.email as string]));

    for (const { event: g } of standalone) {
      const uid = String(g.userId);
      const email = emailMap.get(uid) ?? "(no email)";
      const entries = Number((g.data as { entries?: number })?.entries ?? 0);
      const ledger = (g.data.grants ?? {}) as GrantsLedger;
      const drawGrantCount = ledger.drawGrants?.length ?? 0;
      console.error(
        `  ${email}  [${uid}]  ${(g.timestamp as Date).toISOString()}  event=${g._id}  entries=${entries}  drawGrants=${drawGrantCount}`
      );
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.error(`\n=== SUMMARY ===`);
  console.error(`Users reversed:          ${totalUsersAffected}`);
  console.error(`Events reversed:         ${eventsReversed}  (clean duplicates — draw fully accounted by drawGrants)`);
  console.error(`Events skipped:          ${eventsSkipped}  (already-reversed / user-not-found / anomalous)`);
  console.error(`  of which ANOMALOUS:    ${eventsAnomalous}  (draw-ledger gap > 0 — FLAGGED for manual review, NOT reversed)`);
  console.error(`accumulatedEntries rev:  ${totalEntriesReversed}  (= sum of clean data.entries)`);
  console.error(`draw-ledger entries rev: ${totalDrawEntriesReversed}  (scoped removeMajorDrawEntries rows)`);
  console.error(`MajorDraw rows touched:  ${totalDrawsAffected}`);
  console.error(`lastMonth baselines set: ${totalLastMonthAdjusted}  (corrected to the real renewal value)`);
  console.error(`Ledger rows w/o drawId:  ${totalMissingDrawIdRows}  (skipped — needs manual review)`);
  console.error(`Standalone flagged:      ${standalone.length}  (NOT reversed)`);
  console.error(`--include-points:        ${ARG_INCLUDE_POINTS}`);

  if (DRY_RUN) {
    console.error(`\nDRY RUN — no writes. Re-run with --apply to execute.`);
  } else {
    console.error(`\nAPPLY complete.`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
