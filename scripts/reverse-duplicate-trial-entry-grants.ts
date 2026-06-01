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

// ---------------------------------------------------------------------------
// Per-event reversal
// ---------------------------------------------------------------------------

interface ReversalResult {
  skipped: boolean;
  skipReason?: string;
  entriesReversed: number;
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

  const totalEntriesToReverse = actionableGrants.reduce((s, g) => s + g.entries, 0);
  const affectedDrawIds = actionableGrants.map((g) => g.drawId);
  const pointsToReverse = ARG_INCLUDE_POINTS ? ledgerPoints : 0;

  // Step 3 — determine lastMonthAccumulatedEntries plan
  // Only adjust if this is the MOST RECENT membership BenefitsGranted for this user
  const laterGrant = await eventsColl.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    eventType: "BenefitsGranted",
    packageType: "membership",
    timestamp: { $gt: dupEvent.timestamp },
  });
  const isLatestGrant = laterGrant === null;

  const currentLastMonth = userDoc.subscription?.lastMonthAccumulatedEntries ?? 0;
  const lastMonthAfter = Math.max(0, currentLastMonth - ledgerLastMonthDelta);

  const currentAccumulated = userDoc.accumulatedEntries ?? 0;
  const accumulatedAfter = Math.max(0, currentAccumulated - totalEntriesToReverse);

  const currentPoints = userDoc.rewardsPoints ?? 0;
  const pointsAfter = Math.max(0, currentPoints - pointsToReverse);

  // ─── DRY-RUN output ──────────────────────────────────────────────────────
  console.error(
    `\n  [event] ${sourceEventId}  paymentIntentId=${dupId}  pkg=${dupEvent.packageName ?? dupEvent.packageType}`
  );
  console.error(`    timestamp: ${dupEvent.timestamp.toISOString()}`);
  console.error(`    ledger drawGrants (major): ${majorGrants.length} row(s)`);

  for (const g of actionableGrants) {
    console.error(`      → drawId=${g.drawId} sourceKey=${g.sourceKey} entries=${g.entries} [WILL REVERSE]`);
  }
  for (const g of skippedRows) {
    console.error(
      `      → drawId=MISSING sourceKey=${g.sourceKey} entries=${g.entries} [SKIP — no drawId — needs manual review]`
    );
  }

  console.error(
    `    accumulatedEntries: ${currentAccumulated} → ${accumulatedAfter}  (decrement ${totalEntriesToReverse})`
  );

  if (isLatestGrant) {
    console.error(
      `    lastMonthAccumulatedEntries: ${currentLastMonth} → ${lastMonthAfter}  (this IS the latest grant, decrement ${ledgerLastMonthDelta})`
    );
  } else {
    console.error(
      `    lastMonthAccumulatedEntries: ${currentLastMonth} [LEAVE — later renewal overwrote; laterGrant._id=${String(laterGrant!._id)}]`
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
      entriesReversed: totalEntriesToReverse,
      drawIds: affectedDrawIds,
      pointsReversed: pointsToReverse,
      lastMonthAdjusted: isLatestGrant && ledgerLastMonthDelta > 0,
      missingDrawIdRows: skippedRows.length,
    };
  }

  // ─── APPLY mode ──────────────────────────────────────────────────────────

  // 2. Remove draw entries per actionable drawGrant row
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

  // 3. Decrement accumulatedEntries
  if (totalEntriesToReverse > 0) {
    await usersColl.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $inc: { accumulatedEntries: -totalEntriesToReverse } }
    );
  }

  // 4. rewardsPoints (only when --include-points)
  if (ARG_INCLUDE_POINTS && pointsToReverse > 0) {
    await usersColl.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: { rewardsPoints: pointsAfter } }
    );
  }

  // 5. lastMonthAccumulatedEntries (only if this is the latest grant)
  if (isLatestGrant && ledgerLastMonthDelta > 0) {
    await usersColl.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: { "subscription.lastMonthAccumulatedEntries": lastMonthAfter } }
    );
  }

  // 6. Write BenefitsReversed marker
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
        entries: totalEntriesToReverse,
        drawIds: affectedDrawIds,
        points: ARG_INCLUDE_POINTS ? ledgerPoints : 0,
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

  // 7. Neutralize spurious source event:
  //    a) $pull dupId from User.processedPayments
  await usersColl.updateOne(
    { _id: new mongoose.Types.ObjectId(userId) },
    { $pull: { processedPayments: dupId } } as unknown as Parameters<typeof usersColl.updateOne>[1]
  );
  //    b) DELETE the spurious BenefitsGranted event (BenefitsReversed preserves the audit trail)
  await eventsColl.deleteOne({ _id: sourceEventId as unknown });

  return {
    skipped: false,
    entriesReversed: totalEntriesToReverse,
    drawIds: affectedDrawIds,
    pointsReversed: pointsToReverse,
    lastMonthAdjusted: isLatestGrant && ledgerLastMonthDelta > 0,
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

  let totalUsersAffected = 0;
  let totalEntriesReversed = 0;
  let totalDrawsAffected = 0;
  let totalMissingDrawIdRows = 0;
  let eventsSkipped = 0;
  const seenUserIds = new Set<string>();

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
      continue;
    }

    totalEntriesReversed += result.entriesReversed;
    totalDrawsAffected += result.drawIds.length;
    totalMissingDrawIdRows += result.missingDrawIdRows;
  }

  totalUsersAffected = seenUserIds.size;

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
  console.error(`Users affected:          ${totalUsersAffected}`);
  console.error(`Events reversed:         ${confirmedDups.length - eventsSkipped}`);
  console.error(`Events skipped:          ${eventsSkipped}  (already reversed or user not found)`);
  console.error(`Total entries reversed:  ${totalEntriesReversed}`);
  console.error(`MajorDraw rows touched:  ${totalDrawsAffected}`);
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
