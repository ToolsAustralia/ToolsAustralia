/**
 * Unit tests for the pure summarizeAuditRows helper in chatbotCostAnalytics.
 * No Mongo dependency — runs with tsx directly.
 */
import assert from "node:assert/strict";
import { summarizeAuditRows } from "../chatbotCostAnalytics";
import type { AuditRow } from "../chatbotCostAnalytics";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function row(partial: Partial<AuditRow>): AuditRow {
  return {
    actorKind: "anonymous",
    deflected: false,
    escalated: false,
    durationMs: undefined,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// 1. Empty rows → all zeros, no divide-by-zero
{
  const result = summarizeAuditRows([]);
  assert.equal(result.totalRequests, 0, "empty: totalRequests should be 0");
  assert.equal(result.deflectedCount, 0, "empty: deflectedCount should be 0");
  assert.equal(result.llmCount, 0, "empty: llmCount should be 0");
  assert.equal(result.deflectionRatePct, 0, "empty: deflectionRatePct should be 0 (no divide-by-zero)");
  assert.equal(result.escalatedCount, 0, "empty: escalatedCount should be 0");
  assert.equal(result.memberCount, 0, "empty: memberCount should be 0");
  assert.equal(result.anonymousCount, 0, "empty: anonymousCount should be 0");
  assert.equal(result.avgDurationMs, 0, "empty: avgDurationMs should be 0");
  console.log("✓ empty rows — all zeros, no divide-by-zero");
}

// 2. Mix of deflected and LLM requests
{
  const rows: AuditRow[] = [
    row({ deflected: true, actorKind: "anonymous" }),   // deflected
    row({ deflected: true, actorKind: "member" }),       // deflected
    row({ deflected: false, actorKind: "member", durationMs: 400 }),   // LLM
    row({ deflected: false, actorKind: "anonymous", durationMs: 600 }), // LLM
  ];
  const result = summarizeAuditRows(rows);
  assert.equal(result.totalRequests, 4, "mix: totalRequests");
  assert.equal(result.deflectedCount, 2, "mix: deflectedCount");
  assert.equal(result.llmCount, 2, "mix: llmCount");
  assert.equal(result.deflectionRatePct, 50, "mix: deflectionRatePct 50%");
  assert.equal(result.memberCount, 2, "mix: memberCount");
  assert.equal(result.anonymousCount, 2, "mix: anonymousCount");
  assert.equal(result.avgDurationMs, 500, "mix: avgDurationMs = (400+600)/2");
  console.log("✓ mixed deflected/LLM rows");
}

// 3. All deflected → 100% deflection rate, llmCount = 0
{
  const rows: AuditRow[] = [
    row({ deflected: true }),
    row({ deflected: true }),
    row({ deflected: true }),
  ];
  const result = summarizeAuditRows(rows);
  assert.equal(result.deflectionRatePct, 100, "all-deflected: rate 100%");
  assert.equal(result.llmCount, 0, "all-deflected: llmCount 0");
  console.log("✓ all deflected → 100% rate");
}

// 4. Deflection rate is rounded to 1 decimal place
{
  // 1 out of 3 = 33.333…% → rounds to 33.3
  const rows: AuditRow[] = [
    row({ deflected: true }),
    row({ deflected: false }),
    row({ deflected: false }),
  ];
  const result = summarizeAuditRows(rows);
  assert.equal(result.deflectionRatePct, 33.3, `rounding: expected 33.3 got ${result.deflectionRatePct}`);
  console.log("✓ deflectionRatePct rounded to 1 dp");
}

// 5. Escalation count
{
  const rows: AuditRow[] = [
    row({ escalated: true }),
    row({ escalated: true }),
    row({ escalated: false }),
  ];
  const result = summarizeAuditRows(rows);
  assert.equal(result.escalatedCount, 2, "escalations: count 2");
  console.log("✓ escalation count");
}

// 6. Member vs anonymous split
{
  const rows: AuditRow[] = [
    row({ actorKind: "member" }),
    row({ actorKind: "member" }),
    row({ actorKind: "anonymous" }),
  ];
  const result = summarizeAuditRows(rows);
  assert.equal(result.memberCount, 2, "actor split: memberCount 2");
  assert.equal(result.anonymousCount, 1, "actor split: anonymousCount 1");
  assert.equal(result.totalRequests, 3, "actor split: totalRequests 3");
  console.log("✓ member vs anonymous split");
}

// 7. avgDurationMs ignores null/undefined/0 durationMs
{
  const rows: AuditRow[] = [
    row({ durationMs: undefined }),
    row({ durationMs: null as unknown as undefined }),
    row({ durationMs: 0 }),    // excluded (0 treated as absent)
    row({ durationMs: 1000 }),
    row({ durationMs: 3000 }),
  ];
  const result = summarizeAuditRows(rows);
  // Only 1000 + 3000 contribute → avg = 2000
  assert.equal(result.avgDurationMs, 2000, `avgDurationMs: expected 2000 got ${result.avgDurationMs}`);
  console.log("✓ avgDurationMs ignores null/undefined/0");
}

console.log("\nAll tests passed.");
