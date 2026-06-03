import assert from "node:assert/strict";
import { summarizeRenewalProgress } from "@/utils/admin/renewalProgress";

function run() {
  // Normal case: 3178 of 3882 → 81.9%, 704 remaining.
  const a = summarizeRenewalProgress({ base: 3882, renewed: 3178, baseAsOf: "2026-04-29", isComplete: true });
  assert.equal(a.rate, 81.9, `rate should be 81.9, got ${a.rate}`);
  assert.equal(a.remaining, 704, `remaining should be 704, got ${a.remaining}`);
  assert.equal(a.isComplete, true);
  assert.equal(a.baseAsOf, "2026-04-29");

  // Cap at 100% even if renewed somehow exceeds base (defensive).
  const b = summarizeRenewalProgress({ base: 100, renewed: 130, baseAsOf: null, isComplete: false });
  assert.equal(b.rate, 100, `rate should cap at 100, got ${b.rate}`);
  assert.equal(b.renewed, 100, `renewed should cap at base, got ${b.renewed}`);
  assert.equal(b.remaining, 0);

  // No base (no snapshot) → rate null, remaining 0.
  const c = summarizeRenewalProgress({ base: 0, renewed: 0, baseAsOf: null, isComplete: false });
  assert.equal(c.rate, null, `rate should be null when base is 0, got ${c.rate}`);
  assert.equal(c.remaining, 0);

  // Current-draw early: 106 of 3880 → 2.7%, large remaining, not complete.
  const d = summarizeRenewalProgress({ base: 3880, renewed: 106, baseAsOf: "2026-05-27", isComplete: false });
  assert.equal(d.rate, 2.7, `rate should be 2.7, got ${d.rate}`);
  assert.equal(d.remaining, 3774);
  assert.equal(d.isComplete, false);

  console.log("renewalProgress helper tests passed");
}

run();
