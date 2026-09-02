import assert from "node:assert/strict";
import { summarizeRenewalCohort } from "@/utils/admin/renewalCohort";

function run() {
  // Production shape, 2026-09-02 ~12:00 AEST: 51 cycles already invoiced (31 landed, 20 failed)
  // plus 51 members still scheduled later today.
  const open = summarizeRenewalCohort({
    statusCounts: { succeeded: 31, failed: 20 },
    pendingInRange: 51,
    isOpen: true,
  });
  assert.equal(open.dueInRange, 102, `dueInRange should be 102, got ${open.dueInRange}`);
  assert.equal(open.landedInRange, 31);
  assert.equal(open.failedInRange, 20);
  assert.equal(open.pendingInRange, 51);
  assert.equal(open.isOpen, true);
  // 31/51 — landed over ATTEMPTED, not over dueInRange. Over the full denominator this would
  // read 30.4% at noon purely because the day is young.
  assert.equal(open.collectionRate, 60.8, `collectionRate should be 60.8, got ${open.collectionRate}`);

  // THE IDENTITY TRAP: dueInRange sums every status bucket, so a status in neither numerator
  // stays in the denominator. `due > landed + failed + pending` is a legal state — writing the
  // identity the other way round would make a refunded renewal vanish from the day's total.
  const refunded = summarizeRenewalCohort({
    statusCounts: { succeeded: 10, failed: 2, refunded: 3 },
    pendingInRange: 5,
    isOpen: true,
  });
  assert.equal(refunded.dueInRange, 20, `refunded must stay in dueInRange, got ${refunded.dueInRange}`);
  assert.equal(refunded.landedInRange, 10, "refunded is not landed");
  assert.equal(refunded.failedInRange, 2, "refunded is not failed");
  assert.equal(refunded.collectionRate, 83.3, `collectionRate should ignore refunded, got ${refunded.collectionRate}`);

  // An unrecognised future status must behave exactly like `refunded`: counted in the
  // denominator, in neither numerator. This is what stops a new Stripe status from silently
  // deleting members from the day's total.
  const unknown = summarizeRenewalCohort({
    statusCounts: { succeeded: 4, failed: 1, some_new_status: 2 },
    pendingInRange: 0,
    isOpen: false,
  });
  assert.equal(unknown.dueInRange, 7, `unknown status must count in dueInRange, got ${unknown.dueInRange}`);
  assert.equal(unknown.landedInRange, 4);
  assert.equal(unknown.failedInRange, 1);

  // `recovered` is a landed outcome — the enum permits it, production has not produced one yet.
  const recovered = summarizeRenewalCohort({
    statusCounts: { succeeded: 5, recovered: 3, failed: 2 },
    pendingInRange: 0,
    isOpen: false,
  });
  assert.equal(recovered.landedInRange, 8, `recovered counts as landed, got ${recovered.landedInRange}`);
  assert.equal(recovered.collectionRate, 80);

  // Empty range → rate null, never 0%. A quiet pre-draw day must not read as total failure.
  const empty = summarizeRenewalCohort({ statusCounts: {}, pendingInRange: 0, isOpen: true });
  assert.equal(empty.dueInRange, 0);
  assert.equal(empty.collectionRate, null, `collectionRate should be null at due 0, got ${empty.collectionRate}`);

  // Due, but nothing attempted yet — also null, for the same reason.
  const allPending = summarizeRenewalCohort({ statusCounts: {}, pendingInRange: 40, isOpen: true });
  assert.equal(allPending.dueInRange, 40);
  assert.equal(allPending.landedInRange, 0);
  assert.equal(
    allPending.collectionRate,
    null,
    `collectionRate should be null when nothing attempted, got ${allPending.collectionRate}`,
  );

  // Closed range (2026-09-01): the remainder means "did not renew", so isOpen must survive.
  const closed = summarizeRenewalCohort({
    statusCounts: { succeeded: 89, failed: 50 },
    pendingInRange: 0,
    isOpen: false,
  });
  assert.equal(closed.dueInRange, 139);
  assert.equal(closed.isOpen, false);
  assert.equal(closed.collectionRate, 64, `collectionRate should be 64, got ${closed.collectionRate}`);

  // Defensive: negative and fractional counts are clamped rather than propagated into the UI.
  const dirty = summarizeRenewalCohort({
    statusCounts: { succeeded: -5, failed: 2.6 },
    pendingInRange: -1,
    isOpen: true,
  });
  assert.equal(dirty.landedInRange, 0, `negative clamped to 0, got ${dirty.landedInRange}`);
  assert.equal(dirty.failedInRange, 3, `fractional rounded, got ${dirty.failedInRange}`);
  assert.equal(dirty.pendingInRange, 0, `negative pending clamped, got ${dirty.pendingInRange}`);
  assert.equal(dirty.dueInRange, 3);

  console.log("renewalCohort helper tests passed");
}

run();
