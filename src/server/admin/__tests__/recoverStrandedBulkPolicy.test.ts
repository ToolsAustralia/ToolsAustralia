import assert from "node:assert/strict";
import type Stripe from "stripe";
import { classifyMemberForRecovery } from "../recoverStrandedBulkPolicy";

// Minimal invoice factory — only the fields the classifier reads.
function inv(p: {
  id: string;
  status: Stripe.Invoice["status"];
  amount_due?: number;
  attempt_count?: number;
  next_payment_attempt?: number | null;
  periodEnd?: number; // lines.data[0].period.end
}): Stripe.Invoice {
  return {
    id: p.id,
    status: p.status,
    amount_due: p.amount_due ?? 4000,
    amount_remaining: p.amount_due ?? 4000,
    attempt_count: p.attempt_count ?? 0,
    next_payment_attempt: p.next_payment_attempt ?? null,
    lines: { data: p.periodEnd ? [{ period: { end: p.periodEnd, start: 0 } }] : [] },
  } as unknown as Stripe.Invoice;
}

const CURRENT_END = 1783813563; // current period end
const AMT = 4000;

function run() {
  // jessendan0 shape: 3 stale opens (exhausted) + 1 superseded draft + 1 current draft
  const r = classifyMemberForRecovery(
    [
      inv({ id: "open_feb", status: "open", attempt_count: 9, next_payment_attempt: null, periodEnd: 1770853563 }),
      inv({ id: "open_mar", status: "open", attempt_count: 9, next_payment_attempt: null, periodEnd: 1773272763 }),
      inv({ id: "open_apr", status: "open", attempt_count: 1, next_payment_attempt: null, periodEnd: 1778543163 }),
      inv({ id: "draft_may", status: "draft", periodEnd: 1781221563 }),
      inv({ id: "draft_jun", status: "draft", periodEnd: CURRENT_END }),
      inv({ id: "paid_jan", status: "paid", periodEnd: 1768175163 }),
    ],
    CURRENT_END,
    AMT
  );
  assert.equal(r.classification, "RECOVERABLE", "has a current draft + stale opens");
  assert.equal(r.currentDraft?.id, "draft_jun", "current draft = the one matching current period end");
  assert.deepEqual(r.staleOpens.map((i) => i.id).sort(), ["open_apr", "open_feb", "open_mar"], "all exhausted opens");
  assert.deepEqual(r.supersededDrafts.map((i) => i.id), ["draft_may"], "older draft superseded");

  // NOT_STRANDED: a still-chargeable current open invoice (Stripe is still retrying)
  const ns = classifyMemberForRecovery(
    [inv({ id: "open_now", status: "open", attempt_count: 1, next_payment_attempt: 9999999999, periodEnd: CURRENT_END })],
    CURRENT_END,
    AMT
  );
  assert.equal(ns.classification, "NOT_STRANDED", "still-retrying open → normal charger handles it");

  // BLOCKED_NO_DRAFT: stale opens but no current held draft
  const bl = classifyMemberForRecovery(
    [inv({ id: "open_old", status: "open", attempt_count: 9, next_payment_attempt: null, periodEnd: 1770853563 })],
    CURRENT_END,
    AMT
  );
  assert.equal(bl.classification, "BLOCKED_NO_DRAFT", "no current draft to pay");

  // NOT_STRANDED: nothing actionable (all paid)
  const clean = classifyMemberForRecovery([inv({ id: "p", status: "paid", periodEnd: CURRENT_END })], CURRENT_END, AMT);
  assert.equal(clean.classification, "NOT_STRANDED", "no stranded invoices");

  // draft matches current period but WRONG amount (e.g. price changed mid-stranding) → not currentDraft
  const wrongAmt = classifyMemberForRecovery(
    [
      inv({ id: "open_old2", status: "open", attempt_count: 9, next_payment_attempt: null, periodEnd: 1770853563 }),
      inv({ id: "draft_wrong_price", status: "draft", amount_due: 2000, periodEnd: CURRENT_END }),
    ],
    CURRENT_END,
    AMT
  );
  assert.equal(wrongAmt.classification, "BLOCKED_NO_DRAFT", "wrong-amount draft not treated as current");
  assert.equal(wrongAmt.currentDraft, null, "amount mismatch → not currentDraft");

  console.log("recoverStrandedBulkPolicy tests passed");
}
run();
