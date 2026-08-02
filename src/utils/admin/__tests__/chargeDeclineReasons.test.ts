import assert from "node:assert/strict";
import {
  MONGO_DECLINE_MATCH,
  RECOVERY_DECLINE_CODES,
  RECOVERY_DECLINE_LABELS,
  countsAsDecline,
  declineCodeOf,
  summariseDeclineRows,
  type DeclineClassifiableRow,
} from "../chargeDeclineReasons";

// Regression cover for the two admin decline views disagreeing (the "unknown 206" chip
// on the 30 Jul 2026 run, and the 237 re-bill declines the server summary hid entirely).

const declineRow = (over: Partial<DeclineClassifiableRow> = {}): DeclineClassifiableRow => ({
  status: "failed",
  declineCode: "insufficient_funds",
  ...over,
});

function testCodePrecedence() {
  // declineCode (specific issuer reason) beats errorCode (bucket) beats unknown.
  assert.equal(declineCodeOf({ declineCode: "do_not_honor", errorCode: "card_declined" }), "do_not_honor");
  assert.equal(declineCodeOf({ errorCode: "card_declined" }), "card_declined");
  assert.equal(declineCodeOf({}), "unknown");
  // null (Mongo absent-field) must behave like undefined, not become the code.
  assert.equal(declineCodeOf({ declineCode: null, errorCode: null }), "unknown");
}

function testOnlyFailedRowsCount() {
  for (const status of ["success", "skipped", undefined, null]) {
    assert.equal(countsAsDecline(declineRow({ status: status as string })), false, `status=${status}`);
  }
  assert.equal(countsAsDecline(declineRow()), true);
}

function testStepAuditRowsNeverCount() {
  // void / finalize / create audits are machinery, not card outcomes.
  for (const step of ["void", "finalize", "create"]) {
    assert.equal(countsAsDecline(declineRow({ recovery: { step } })), false, step);
  }
}

function testHeldDraftSummaryRowIsExcludedAsDuplicate() {
  // Has a coded twin pay row on the NEW invoice → counting both double-counts the member.
  const row = declineRow({
    declineCode: undefined,
    recovery: { bulk: true, newInvoiceId: "in_newTwin" },
  });
  assert.equal(countsAsDecline(row), false);
}

function testMintRebillSummaryRowIsCounted() {
  // THE BUG: no `newInvoiceId` ⇒ no twin anywhere ⇒ this row IS the decline.
  const row = declineRow({
    declineCode: undefined,
    errorCode: RECOVERY_DECLINE_CODES.rebillNotSettled,
    recovery: { bulk: true },
  });
  assert.equal(countsAsDecline(row), true);
  assert.equal(declineCodeOf(row), "rebill_not_settled");
  assert.ok(RECOVERY_DECLINE_LABELS[declineCodeOf(row)], "sentinel must have an admin label");
}

function testOrdinaryPayDeclineAlwaysCounts() {
  // A plain bulk pay decline carries no recovery tag at all.
  assert.equal(countsAsDecline(declineRow({ recovery: null })), true);
  assert.equal(countsAsDecline(declineRow({ recovery: undefined })), true);
}

function testSummariseSortsDescendingAndSkipsExcluded() {
  const rows: DeclineClassifiableRow[] = [
    declineRow({ declineCode: "lost_card" }),
    declineRow({ declineCode: "insufficient_funds" }),
    declineRow({ declineCode: "insufficient_funds" }),
    declineRow({ declineCode: "insufficient_funds" }),
    // excluded: duplicate half of a held-draft recovery
    declineRow({ declineCode: undefined, recovery: { bulk: true, newInvoiceId: "in_twin" } }),
    // excluded: machinery audit
    declineRow({ recovery: { step: "void" } }),
    // excluded: not a failure
    declineRow({ status: "success" }),
    // counted: mint re-bill decline
    declineRow({
      declineCode: undefined,
      errorCode: RECOVERY_DECLINE_CODES.rebillNotSettled,
      recovery: { bulk: true },
    }),
  ];
  assert.deepEqual(summariseDeclineRows(rows), [
    ["insufficient_funds", 3],
    ["lost_card", 1],
    ["rebill_not_settled", 1],
  ]);
  // Nothing may land in `unknown` here — that was the reported symptom.
  assert.equal(
    summariseDeclineRows(rows).some(([code]) => code === "unknown"),
    false
  );
}

function testMongoMatchMirrorsThePredicate() {
  // The aggregation and the client-side breakdown must encode the SAME rule.
  assert.equal(MONGO_DECLINE_MATCH.status, "failed");
  assert.deepEqual(MONGO_DECLINE_MATCH["result.recovery.step"], { $exists: false });
  assert.deepEqual(MONGO_DECLINE_MATCH.$or, [
    { "result.recovery.bulk": { $exists: false } },
    { "result.recovery.newInvoiceId": { $exists: false } },
  ]);

  // Evaluate the $or the way Mongo would, against every recovery shape, and assert it
  // agrees with countsAsDecline on all of them.
  const shapes: Array<DeclineClassifiableRow["recovery"]> = [
    null,
    { bulk: true },
    { bulk: true, newInvoiceId: "in_twin" },
    { newInvoiceId: "in_twin" },
  ];
  for (const recovery of shapes) {
    const mongoKeeps =
      !recovery?.step && (!recovery?.bulk || !recovery?.newInvoiceId);
    assert.equal(
      countsAsDecline(declineRow({ recovery })),
      mongoKeeps,
      `divergence for ${JSON.stringify(recovery)}`
    );
  }
}

function run() {
  testCodePrecedence();
  testOnlyFailedRowsCount();
  testStepAuditRowsNeverCount();
  testHeldDraftSummaryRowIsExcludedAsDuplicate();
  testMintRebillSummaryRowIsCounted();
  testOrdinaryPayDeclineAlwaysCounts();
  testSummariseSortsDescendingAndSkipsExcluded();
  testMongoMatchMirrorsThePredicate();
  console.log("chargeDeclineReasons tests passed");
}

run();
