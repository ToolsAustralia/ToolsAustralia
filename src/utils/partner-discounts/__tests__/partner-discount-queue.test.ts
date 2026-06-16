import assert from "node:assert/strict";
import type { IUser } from "@/models/User";
import {
  addToPartnerDiscountQueue,
  processPartnerDiscountQueue,
  getReconciledPartnerDiscountSummary,
} from "@/utils/partner-discounts/partner-discount-queue";

/**
 * Regression coverage for the partner-discount queue activation logic.
 *
 * Bug (dan_427@hotmail.com, June 2026): a 2-day one-time pack stayed "queued/upcoming"
 * ~3 weeks after purchase. Root cause: a new purchase decided activate-vs-queue from the
 * stored `status === "active"` flag WITHOUT checking whether that item's window had already
 * elapsed. With nothing sweeping the queue between visits, an expired-but-not-swept "zombie"
 * still read as active, so the fresh same-tier pack wrongly queued behind it instead of
 * activating. The fix reconciles the queue against real time before placing the new item.
 */

function makeUser(): IUser {
  return {
    partnerDiscountQueue: [],
    subscription: { isActive: false },
  } as unknown as IUser;
}

const TRADIE = { packageId: "tradie-pack", packageName: "Tradie Pack", packageType: "one-time" as const, discountDays: 2, discountHours: 48 };
const FOREMAN = { packageId: "foreman-pack", packageName: "Foreman Pack", packageType: "one-time" as const, discountDays: 4, discountHours: 96 };

const DAY = 24 * 60 * 60 * 1000;

/** THE regression: a fresh purchase must activate, not queue behind an already-elapsed window. */
async function testFreshPurchaseActivatesOverElapsedZombie() {
  const user = makeUser();

  const first = await addToPartnerDiscountQueue(user, { ...TRADIE, stripePaymentIntentId: "pi_first" });
  assert.equal(first.status, "active", "first pack should activate immediately when nothing else is active");

  // Simulate production: the 2-day window elapsed days ago, but no sweep ran since, so the
  // row is still status:"active" with a stale PAST endDate (the zombie that caused the bug).
  first.startDate = new Date(Date.now() - 9 * DAY);
  first.endDate = new Date(Date.now() - 7 * DAY);

  const second = await addToPartnerDiscountQueue(user, { ...TRADIE, stripePaymentIntentId: "pi_second" });

  assert.equal(
    second.status,
    "active",
    "second same-tier pack must activate immediately because the first pack's window had already elapsed (regression: it used to queue behind the zombie)"
  );
  assert.equal(first.status, "expired", "the elapsed first pack must be expired, not left active");
  const activeCount = user.partnerDiscountQueue!.filter((i) => i.status === "active").length;
  assert.equal(activeCount, 1, "exactly one one-time period may be active at a time");
}

/** Intended stacking preserved: a genuinely-active window still defers the next same-tier pack. */
async function testSecondPackQueuesBehindGenuineActive() {
  const user = makeUser();
  const first = await addToPartnerDiscountQueue(user, { ...TRADIE, stripePaymentIntentId: "pi_a" });
  assert.equal(first.status, "active", "first activates");
  const second = await addToPartnerDiscountQueue(user, { ...TRADIE, stripePaymentIntentId: "pi_b" });
  assert.equal(second.status, "queued", "second same-tier pack queues behind a genuinely-active first (sequential stacking)");
  assert.equal(first.status, "active", "first stays active while genuinely within its window");
}

/** Intended preemption preserved: a higher tier still preempts a genuinely-active lower tier. */
async function testHigherTierPreemptsGenuineActiveLower() {
  const user = makeUser();
  const lower = await addToPartnerDiscountQueue(user, { ...TRADIE, stripePaymentIntentId: "pi_low" });
  assert.equal(lower.status, "active", "lower tier active first");
  const higher = await addToPartnerDiscountQueue(user, { ...FOREMAN, stripePaymentIntentId: "pi_high" });
  assert.equal(higher.status, "active", "higher tier (Foreman 55%) preempts and activates over lower (Tradie 40%)");
  assert.notEqual(lower.status, "active", "preempted lower tier must no longer be active");
}

/** Sanity: an active window whose endDate has passed is expired by a plain process sweep. */
async function testSweepExpiresElapsedActive() {
  const user = makeUser();
  const item = await addToPartnerDiscountQueue(user, { ...TRADIE, stripePaymentIntentId: "pi_x" });
  item.endDate = new Date(Date.now() - 1 * DAY);
  await processPartnerDiscountQueue(user);
  assert.equal(item.status, "expired", "processPartnerDiscountQueue must expire an active row whose endDate has passed");
}

/** The reconciled admin/display summary reflects a swept view, and never mutates the caller. */
async function testReconciledSummaryReflectsSweepWithoutMutating() {
  const user = makeUser();
  const a = await addToPartnerDiscountQueue(user, { ...TRADIE, stripePaymentIntentId: "pi_a" });
  const b = await addToPartnerDiscountQueue(user, { ...TRADIE, stripePaymentIntentId: "pi_b" });
  assert.equal(a.status, "active", "setup: first pack active");
  assert.equal(b.status, "queued", "setup: second pack queued behind it");

  // The active window elapsed but no sweep has persisted yet (the stale state SSO/admin would read raw).
  a.endDate = new Date(Date.now() - 1 * DAY);
  const storedStatusesBefore = user.partnerDiscountQueue!.map((i) => i.status);

  const summary = await getReconciledPartnerDiscountSummary(user);

  // Reconciled view: the elapsed pack is gone and the queued one is now the active period.
  assert.equal(summary.activePeriod.isActive, true, "reconciled summary reports an active period once the elapsed one is swept");
  assert.equal(summary.activePeriod.source, "one-time", "reconciled active source is the activated one-time pack");

  // The caller's user object must be untouched (read-only — no persisted side effects).
  assert.deepEqual(
    user.partnerDiscountQueue!.map((i) => i.status),
    storedStatusesBefore,
    "getReconciledPartnerDiscountSummary must NOT mutate the caller's user (read-only)"
  );
  assert.equal(a.status, "active", "original active row unchanged");
  assert.equal(b.status, "queued", "original queued row unchanged");
}

async function run() {
  await testFreshPurchaseActivatesOverElapsedZombie();
  await testSecondPackQueuesBehindGenuineActive();
  await testHigherTierPreemptsGenuineActiveLower();
  await testSweepExpiresElapsedActive();
  await testReconciledSummaryReflectsSweepWithoutMutating();
  console.log("Partner discount queue tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
