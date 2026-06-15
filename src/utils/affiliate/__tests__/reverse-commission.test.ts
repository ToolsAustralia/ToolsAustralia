import assert from "node:assert/strict";
import { buildCommissionReversalIds } from "../reverse-commission";

const has = (arr: string[], v: string, msg: string) => assert.ok(arr.includes(v), `${msg}: missing "${v}" in [${arr.join(", ")}]`);

function run() {
  // 1 — one-time / upsell / mini-draw refund: raw PI only
  {
    const { piCandidates, invoiceCandidates } = buildCommissionReversalIds("pi_abc");
    has(piCandidates, "pi_abc", "raw PI matched");
    assert.equal(invoiceCandidates.length, 0, "no invoice candidates for a raw-PI refund");
  }

  // 2 — subscription refund: real PI + invoice id → must reach recurring AND first AND raw rows
  {
    const { piCandidates, invoiceCandidates } = buildCommissionReversalIds("pi_xyz", "in_123");
    has(piCandidates, "pi_xyz", "real charge PI (one-time-style rows)");
    has(piCandidates, "invoice_in_123", "membership-first PI stored as invoice_in_…");
    has(invoiceCandidates, "in_123", "recurring row stored by raw invoice id");
    has(invoiceCandidates, "invoice_in_123", "recurring row legacy invoice_in_ form");
  }

  // 3 — recurring refund with ONLY the invoice id (no separate PI) still reaches recurring + first
  {
    const { piCandidates, invoiceCandidates } = buildCommissionReversalIds(undefined as unknown as string, "in_777");
    has(piCandidates, "invoice_in_777", "membership-first reachable from invoice id");
    has(invoiceCandidates, "in_777", "recurring reachable");
    has(invoiceCandidates, "invoice_in_777", "recurring reachable (legacy form)");
  }

  // 4 — legacy: an invoice id passed in the paymentIntentId slot is normalized
  {
    const { piCandidates } = buildCommissionReversalIds("in_456");
    has(piCandidates, "in_456", "raw form kept");
    has(piCandidates, "invoice_in_456", "normalized invoice_in_ form added");
  }

  // 5 — empty inputs → empty (no accidental match-all)
  {
    const { piCandidates, invoiceCandidates } = buildCommissionReversalIds(undefined as unknown as string, undefined);
    assert.equal(piCandidates.length, 0, "no PI candidates");
    assert.equal(invoiceCandidates.length, 0, "no invoice candidates");
  }

  console.log("reverse-commission: all assertions passed");
}

run();
