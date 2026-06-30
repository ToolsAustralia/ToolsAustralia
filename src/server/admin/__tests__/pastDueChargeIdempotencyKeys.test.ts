import assert from "node:assert/strict";
import {
  buildBulkChargeIdempotencyKey,
  buildOneOffChargeIdempotencyKey,
  buildAdminChargeIdempotencyKey,
  buildForceChargeIdempotencyKey,
} from "../past-due-charge-idempotency";

/**
 * Regression suite for the 2026-06-29 "replayed decline" incident.
 *
 * Stripe retains idempotency keys for 24h and REPLAYS the cached response for any
 * reuse within that window (header `idempotent-replayed: true`) without re-charging.
 * The daily bulk run reused a stable `admin-charge-${invoiceId}` key, so every run
 * within 24h of the prior one replayed yesterday's decline (656/668), collecting $0.
 *
 * The invariant that would have caught it: the bulk key MUST differ across runs.
 */

// ── Bulk run-scoped key ──────────────────────────────────────────────────────

function testBulkKeyStableWithinSameRun() {
  // Resume safety: a chunk that re-touches the same invoice in the SAME run must
  // dedupe to exactly one Stripe charge.
  const a = buildBulkChargeIdempotencyKey("in_123", "run_abc");
  const b = buildBulkChargeIdempotencyKey("in_123", "run_abc");
  assert.equal(a, b);
}

function testBulkKeyDiffersAcrossRuns() {
  // THE FIX: same invoice in a LATER run → DIFFERENT key, so Stripe actually
  // re-attempts the charge instead of replaying the cached decline within 24h.
  const day1 = buildBulkChargeIdempotencyKey("in_123", "run_day1");
  const day2 = buildBulkChargeIdempotencyKey("in_123", "run_day2");
  assert.notEqual(day1, day2);
}

function testBulkKeyDiffersByInvoiceWithinRun() {
  const a = buildBulkChargeIdempotencyKey("in_aaa", "run_x");
  const b = buildBulkChargeIdempotencyKey("in_bbb", "run_x");
  assert.notEqual(a, b);
}

function testBulkKeyCarriesInvoiceAndRun() {
  const k = buildBulkChargeIdempotencyKey("in_123", "run_abc");
  assert.ok(k.includes("in_123"), "key must embed invoiceId");
  assert.ok(k.includes("run_abc"), "key must embed runId");
}

// ── One-off (per-user / admin button) key ────────────────────────────────────
// Window-bucketed (30s, aligned with the spam debounce): two TRULY-CONCURRENT
// submits of the same click land in the same bucket → identical key → Stripe
// dedupes them to ONE charge. A deliberate retry 30s+ later lands in a new bucket
// → fresh key → real attempt (no 24h replay). A pure random UUID would lose the
// concurrent-dedupe guarantee and risk a double-charge on a proxy/LB retry.

function testOneOffKeyDedupesConcurrentSubmitsInSameWindow() {
  // 0ms and 29_999ms are the same 30s bucket → MUST collide so Stripe dedupes.
  const a = buildOneOffChargeIdempotencyKey("in_123", 0);
  const b = buildOneOffChargeIdempotencyKey("in_123", 29_999);
  assert.equal(a, b);
}

function testOneOffKeyFreshAcrossWindows() {
  // 0ms vs 30_000ms cross the bucket boundary → DIFFERENT key → real retry, no replay.
  const a = buildOneOffChargeIdempotencyKey("in_123", 0);
  const b = buildOneOffChargeIdempotencyKey("in_123", 30_000);
  assert.notEqual(a, b);
}

function testOneOffKeyCarriesInvoice() {
  assert.ok(buildOneOffChargeIdempotencyKey("in_123", 0).includes("in_123"));
}

// ── Cross-scheme isolation: no two key schemes can ever collide ──────────────

function testSchemesNeverCollide() {
  const bulk = buildBulkChargeIdempotencyKey("in_123", "scope");
  const oneOff = buildOneOffChargeIdempotencyKey("in_123", 0);
  const recovery = buildAdminChargeIdempotencyKey("in_123");
  const force = buildForceChargeIdempotencyKey("in_123", "admin", 1);
  const all = [bulk, oneOff, recovery, force];
  assert.equal(new Set(all).size, all.length, "all scheme outputs must be distinct");
}

function run() {
  testBulkKeyStableWithinSameRun();
  testBulkKeyDiffersAcrossRuns();
  testBulkKeyDiffersByInvoiceWithinRun();
  testBulkKeyCarriesInvoiceAndRun();
  testOneOffKeyDedupesConcurrentSubmitsInSameWindow();
  testOneOffKeyFreshAcrossWindows();
  testOneOffKeyCarriesInvoice();
  testSchemesNeverCollide();
  console.log("past-due charge idempotency key tests passed");
}

run();
