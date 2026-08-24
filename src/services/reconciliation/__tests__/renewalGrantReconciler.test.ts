import assert from "node:assert/strict";
import dotenv from "dotenv";
import path from "node:path";

// Load .env.local BEFORE any import that reads env at module scope (the stripe
// singleton throws at import when STRIPE_SECRET_KEY is missing, and connectDB
// needs MONGODB_URI). `.env.local` points at the DEV cluster — never production.
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * Regression test for the Stripe-anchored renewal-grant reconciler.
 *
 * WHAT THIS PINS. On 2026-08-23 eleven members were charged $300.00 and granted
 * nothing, and NOTHING in the codebase could see it: every existing check
 * (`reconcile-major-draw-entries`, `fix-major-draw-renewal-entries`,
 * `verify-major-draw-entries`) starts from a `BenefitsGranted` PaymentEvent, so a
 * renewal that died BEFORE writing one is not even a candidate. This reconciler
 * runs the opposite direction — from the paid cycle — so the anti-join IS the
 * detector. A regression that silently made the join return nothing would restore
 * the exact blind spot, with no other net behind it.
 *
 * Fixtures are written with the raw driver (`Model.collection.insertMany`) so
 * `createdAt` can be pinned to a 2019 window that cannot collide with real data;
 * Mongoose's `timestamps: true` would otherwise overwrite it on save.
 */

const WINDOW_START = new Date("2019-03-01T00:00:00.000Z");
const WINDOW_END = new Date("2019-03-02T00:00:00.000Z");
const INSIDE = new Date("2019-03-01T12:00:00.000Z");
const BEFORE = new Date("2019-02-28T12:00:00.000Z");

const INV_UNGRANTED = "in_recon_test_ungranted_001";
const INV_GRANTED = "in_recon_test_granted_001";
const INV_FAILED_CYCLE = "in_recon_test_failedcycle_001";
const INV_NOT_CYCLE = "in_recon_test_notcycle_001";
const INV_OUTSIDE_WINDOW = "in_recon_test_outside_001";
const INV_RECOVERED = "in_recon_test_recovered_001";
const ALL_FIXTURE_INVOICES = [
  INV_UNGRANTED,
  INV_GRANTED,
  INV_FAILED_CYCLE,
  INV_NOT_CYCLE,
  INV_OUTSIDE_WINDOW,
  INV_RECOVERED,
];

const EVT_DEAD = "evt_recon_test_dead_001";
const EVT_QUEUED = "evt_recon_test_queued_001";

let failures = 0;
function expect(label: string, actual: unknown, expected: unknown) {
  try {
    assert.deepEqual(actual, expected);
    console.log(`  PASS  ${label}`);
  } catch {
    failures++;
    console.error(`  FAIL  ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

async function run() {
  const mongoose = (await import("mongoose")).default;
  const { default: connectDB } = await import("@/lib/mongodb");
  const { default: MembershipRenewalCycle } = await import("@/models/MembershipRenewalCycle");
  const { default: PaymentEvent } = await import("@/models/PaymentEvent");
  const { default: StripeWebhookQueue } = await import("@/models/StripeWebhookQueue");
  const { findUngrantedRenewals, findDeadWebhookEvents, runRenewalGrantReconciliation } = await import(
    "@/services/reconciliation/renewalGrantReconciler"
  );
  const { upsertRenewalCycleFromFailedInvoice, upsertRenewalCycleFromPaidInvoice } = await import(
    "@/services/admin/membershipAnalyticsPersistence"
  );

  await connectDB();

  const userId = new mongoose.Types.ObjectId("60f0000000000000000000a1");

  function cycle(overrides: Record<string, unknown>) {
    return {
      userId,
      stripeSubscriptionId: "sub_recon_test_001",
      billingReason: "subscription_cycle",
      status: "succeeded",
      dueAt: INSIDE,
      amountDueCents: 2000,
      amountPaidCents: 2000,
      succeededAt: INSIDE,
      confidence: "stripe",
      createdAt: INSIDE,
      updatedAt: INSIDE,
      ...overrides,
    };
  }

  function grantEvent(invoiceId: string, processedBy: string) {
    return {
      _id: `BenefitsGranted-invoice_${invoiceId}`,
      paymentIntentId: `invoice_${invoiceId}`,
      eventType: "BenefitsGranted",
      userId,
      packageType: "membership",
      data: { entries: 15 },
      processedBy,
      timestamp: INSIDE,
      isRenewal: true,
    };
  }

  async function cleanup() {
    await Promise.allSettled([
      MembershipRenewalCycle.deleteMany({ stripeInvoiceId: { $in: ALL_FIXTURE_INVOICES } }),
      PaymentEvent.deleteMany({
        _id: { $in: ALL_FIXTURE_INVOICES.map((i) => `BenefitsGranted-invoice_${i}`) },
      }),
      StripeWebhookQueue.deleteMany({ eventId: { $in: [EVT_DEAD, EVT_QUEUED] } }),
    ]);
  }

  // Start from a clean slate in case a previous aborted run left fixtures behind.
  await cleanup();

  try {
    await MembershipRenewalCycle.collection.insertMany([
      // The incident shape: paid cycle, no grant.
      cycle({ stripeInvoiceId: INV_UNGRANTED, amountPaidCents: 8000 }),
      // Healthy: paid cycle WITH its grant (seeded below).
      cycle({ stripeInvoiceId: INV_GRANTED }),
      // A failed cycle is not money we kept — must never be reported.
      cycle({ stripeInvoiceId: INV_FAILED_CYCLE, status: "failed", succeededAt: null, failedAt: INSIDE }),
      // A non-cycle invoice (upgrade proration etc.) is out of this reconciler's remit.
      cycle({ stripeInvoiceId: INV_NOT_CYCLE, billingReason: "subscription_update" }),
      // Same shape as the gap, but its last touch is outside the window.
      cycle({ stripeInvoiceId: INV_OUTSIDE_WINDOW, createdAt: BEFORE, succeededAt: BEFORE, updatedAt: BEFORE }),
    ] as never[]);

    await PaymentEvent.collection.insertOne(grantEvent(INV_GRANTED, "webhook") as never);

    // -- The anti-join ------------------------------------------------------
    const rows = await findUngrantedRenewals(WINDOW_START, WINDOW_END);
    const found = new Set(rows.map((r) => r.stripeInvoiceId));

    expect("paid cycle with NO BenefitsGranted is reported", found.has(INV_UNGRANTED), true);
    expect("paid cycle WITH its BenefitsGranted is not reported", found.has(INV_GRANTED), false);
    expect("failed cycle is not reported", found.has(INV_FAILED_CYCLE), false);
    expect("non-subscription_cycle invoice is not reported", found.has(INV_NOT_CYCLE), false);
    expect("cycle whose updatedAt is outside the window is not reported", found.has(INV_OUTSIDE_WINDOW), false);

    const gap = rows.find((r) => r.stripeInvoiceId === INV_UNGRANTED);
    expect("gap carries the userId as a string", gap?.userId, userId.toString());
    expect("gap carries amountPaidCents", gap?.amountPaidCents, 8000);
    expect(
      "gap carries chargedAt",
      gap?.chargedAt instanceof Date && gap.chargedAt.getTime(),
      INSIDE.getTime()
    );

    // Healing the gap must clear it — this is the "is it fixed yet?" signal Phase 0
    // and any future backfill are verified against.
    await PaymentEvent.collection.insertOne(grantEvent(INV_UNGRANTED, "admin") as never);
    const afterHeal = await findUngrantedRenewals(WINDOW_START, WINDOW_END);
    expect(
      "granting the missing entries clears the gap",
      afterHeal.some((r) => r.stripeInvoiceId === INV_UNGRANTED),
      false
    );

    // -- Dunning recovery: the row's createdAt is its FAILURE date ----------
    //
    // THE REGRESSION THIS GUARDS. `MembershipRenewalCycle` rows are UPSERTED.
    // `upsertRenewalCycleFromFailedInvoice` creates the row at FAILURE time; a
    // later successful retry (Stripe dunning, or /api/cron/charge-past-due) flips
    // it to "succeeded" via findOneAndUpdate, leaving `createdAt` pinned to the
    // original failure date. Window on `createdAt` and a renewal that declined on
    // the 24th, was recovered on the 29th and whose grant then failed sits five
    // days outside every window this cron will ever run — permanently invisible,
    // and exactly the past-due-recovery population the spec exists to protect.
    //
    // Driven through the REAL production upserts, not hand-seeded, so this pins
    // Mongoose's actual timestamp behaviour rather than a belief about it.
    const testStart = new Date();
    const recoveredInvoice = {
      id: INV_RECOVERED,
      billing_reason: "subscription_cycle",
      period_end: Math.floor(INSIDE.getTime() / 1000),
      created: Math.floor(INSIDE.getTime() / 1000),
      amount_due: 2000,
      total: 2000,
      amount_paid: 2000,
      status_transitions: { paid_at: Math.floor(INSIDE.getTime() / 1000) },
    } as unknown as Parameters<typeof upsertRenewalCycleFromPaidInvoice>[0]["invoice"];

    // 1. The renewal declines — the row is born "failed".
    await upsertRenewalCycleFromFailedInvoice({
      invoice: recoveredInvoice,
      userId,
      stripeSubscriptionId: "sub_recon_test_001",
    });
    // 2. Backdate it so "created at failure time" is a date outside the window.
    await MembershipRenewalCycle.collection.updateOne(
      { stripeInvoiceId: INV_RECOVERED },
      { $set: { createdAt: BEFORE, updatedAt: BEFORE } }
    );
    // 3. Recovery lands — the REAL production flip to "succeeded".
    await upsertRenewalCycleFromPaidInvoice({
      invoice: recoveredInvoice,
      userId,
      stripeSubscriptionId: "sub_recon_test_001",
    });

    const recoveredDoc = await MembershipRenewalCycle.collection.findOne<{
      status: string;
      createdAt: Date;
      updatedAt: Date;
      succeededAt: Date;
    }>({ stripeInvoiceId: INV_RECOVERED });

    expect("recovery flips the cycle to succeeded", recoveredDoc?.status, "succeeded");
    expect(
      "createdAt stays pinned to the FAILURE date (this is the false-clean mechanism)",
      recoveredDoc?.createdAt?.getTime(),
      BEFORE.getTime()
    );
    expect(
      "updatedAt IS bumped by the flip — so it is the field the window must use",
      (recoveredDoc?.updatedAt?.getTime() ?? 0) >= testStart.getTime(),
      true
    );

    // 4. A live-clock window must find it, even though createdAt is years earlier.
    const liveWindow = await findUngrantedRenewals(
      new Date(testStart.getTime() - 60_000),
      new Date(Date.now() + 60_000)
    );
    const liveHit = liveWindow.find((r) => r.stripeInvoiceId === INV_RECOVERED);
    expect("dunning-recovered renewal is detected by an updatedAt window", Boolean(liveHit), true);
    expect(
      "and it reports the RECOVERY charge time, not the failure date",
      liveHit?.chargedAt instanceof Date && liveHit.chargedAt.getTime(),
      INSIDE.getTime()
    );

    // 5. Same shape, clock-independent: updatedAt inside the fixture window while
    //    createdAt sits before it. This is the durable guard.
    await MembershipRenewalCycle.collection.updateOne(
      { stripeInvoiceId: INV_RECOVERED },
      { $set: { updatedAt: INSIDE } }
    );
    const pinned = await findUngrantedRenewals(WINDOW_START, WINDOW_END);
    expect(
      "detected on updatedAt while createdAt (the old anchor) is outside the window",
      pinned.some((r) => r.stripeInvoiceId === INV_RECOVERED),
      true
    );
    expect("...and createdAt really is outside it", BEFORE < WINDOW_START, true);

    // Granting it clears it, same as any other gap.
    await PaymentEvent.collection.insertOne(grantEvent(INV_RECOVERED, "admin") as never);
    const recoveredHealed = await findUngrantedRenewals(WINDOW_START, WINDOW_END);
    expect(
      "granting the recovered renewal clears it too",
      recoveredHealed.some((r) => r.stripeInvoiceId === INV_RECOVERED),
      false
    );

    // -- "recovered" status is accepted, not just "succeeded" ----------------
    await PaymentEvent.deleteMany({ _id: `BenefitsGranted-invoice_${INV_RECOVERED}` });
    await MembershipRenewalCycle.collection.updateOne(
      { stripeInvoiceId: INV_RECOVERED },
      { $set: { status: "recovered" } }
    );
    const asRecovered = await findUngrantedRenewals(WINDOW_START, WINDOW_END);
    expect(
      'status "recovered" is treated as money kept, same as "succeeded"',
      asRecovered.some((r) => r.stripeInvoiceId === INV_RECOVERED),
      true
    );
    // Restore so the orchestrator totals below stay predictable.
    await MembershipRenewalCycle.deleteMany({ stripeInvoiceId: INV_RECOVERED });

    // -- Dead webhook rows --------------------------------------------------
    await StripeWebhookQueue.collection.insertMany([
      {
        eventId: EVT_DEAD,
        type: "invoice.payment_succeeded",
        payload: { id: EVT_DEAD },
        status: "dead",
        attempts: 6,
        nextAttemptAt: INSIDE,
        claimedAt: null,
        lastError: "membership package not found",
        enqueuedAt: INSIDE,
        processedAt: INSIDE,
        createdAt: INSIDE,
        updatedAt: INSIDE,
      },
      {
        eventId: EVT_QUEUED,
        type: "invoice.payment_succeeded",
        payload: { id: EVT_QUEUED },
        status: "queued",
        attempts: 1,
        nextAttemptAt: INSIDE,
        claimedAt: null,
        lastError: null,
        enqueuedAt: INSIDE,
        processedAt: null,
        createdAt: INSIDE,
        updatedAt: INSIDE,
      },
    ] as never[]);

    const dead = await findDeadWebhookEvents();
    const deadIds = new Set(dead.map((d) => d.eventId));
    expect("a dead queue row is reported", deadIds.has(EVT_DEAD), true);
    expect("a still-retrying queued row is not reported", deadIds.has(EVT_QUEUED), false);
    expect(
      "dead row carries its lastError (often the only surviving diagnostic)",
      dead.find((d) => d.eventId === EVT_DEAD)?.lastError,
      "membership package not found"
    );

    // -- Orchestrator -------------------------------------------------------
    // Re-open the gap so the summary has something to total.
    await PaymentEvent.deleteMany({ _id: `BenefitsGranted-invoice_${INV_UNGRANTED}` });
    const summary = await runRenewalGrantReconciliation({ since: WINDOW_START, until: WINDOW_END });
    expect("summary counts the gap", summary.ungrantedCount, 1);
    expect("summary totals the cents", summary.ungrantedCents, 8000);
    expect("summary reports dead rows", summary.deadCount >= 1, true);
    expect("summary echoes the window it used", summary.since, WINDOW_START.toISOString());
  } finally {
    await cleanup();
    await mongoose.connection.close().catch(() => {});
  }

  if (failures > 0) {
    console.error(`renewalGrantReconciler test FAILED (${failures} assertion(s))`);
    process.exit(1);
  }
  console.log("renewalGrantReconciler test passed");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
