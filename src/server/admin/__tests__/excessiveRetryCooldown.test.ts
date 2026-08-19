import assert from "node:assert/strict";
import {
  EXCESSIVE_RETRY_COOLDOWN_DAYS,
  classifyInvoiceRetrieveError as classify,
  shouldCooldownForExcessiveRetry,
} from "../chargeOrRecoverPolicy";

const NOW = new Date("2026-08-18T00:00:00.000Z");
const FP = "fp_blocked_card";
const DAY = 24 * 60 * 60 * 1000;

function blockAgedDays(
  days: number,
  outcomeReason: string | null = "previously_declined_do_not_retry"
) {
  return {
    cardFingerprint: FP,
    outcomeReason,
    capturedAt: new Date(NOW.getTime() - days * DAY),
  };
}

// ── the cards that MUST keep being retried ───────────────────────────────────

// No block on record at all.
assert.equal(
  shouldCooldownForExcessiveRetry({ latestBlock: null, currentFingerprint: FP, now: NOW }).cooldown,
  false,
  "no block row → charge normally"
);

// The member replaced their card after being blocked. The new card was never
// blocked, so freezing it would lose revenue for no reason. This is the case a
// customer-scoped cooldown would get wrong.
assert.equal(
  shouldCooldownForExcessiveRetry({
    latestBlock: blockAgedDays(1),
    currentFingerprint: "fp_a_brand_new_card",
    now: NOW,
  }).cooldown,
  false,
  "different card → charge immediately"
);

// Radar-type blocks ARE fixable by the allow list, so they must not cool down.
for (const radarReason of ["highest_risk_level", "rule", "blocklist"]) {
  assert.equal(
    shouldCooldownForExcessiveRetry({
      latestBlock: blockAgedDays(1, radarReason),
      currentFingerprint: FP,
      now: NOW,
    }).cooldown,
    false,
    `radar reason ${radarReason} → charge normally`
  );
}

// Block has aged out of the window.
assert.equal(
  shouldCooldownForExcessiveRetry({
    latestBlock: blockAgedDays(EXCESSIVE_RETRY_COOLDOWN_DAYS + 0.1),
    currentFingerprint: FP,
    now: NOW,
  }).cooldown,
  false,
  "aged past the window → charge normally"
);

// Exactly at the boundary is retryable, not held.
assert.equal(
  shouldCooldownForExcessiveRetry({
    latestBlock: blockAgedDays(EXCESSIVE_RETRY_COOLDOWN_DAYS),
    currentFingerprint: FP,
    now: NOW,
  }).cooldown,
  false,
  "exactly at the boundary → charge normally"
);

// Unknown fingerprint (not among the expanded payment methods) fails OPEN.
assert.equal(
  shouldCooldownForExcessiveRetry({
    latestBlock: blockAgedDays(1),
    currentFingerprint: null,
    now: NOW,
  }).cooldown,
  false,
  "unknown fingerprint → fail open and charge"
);

// Missing reason on an older row must not accidentally cool down.
assert.equal(
  shouldCooldownForExcessiveRetry({
    latestBlock: blockAgedDays(1, null),
    currentFingerprint: FP,
    now: NOW,
  }).cooldown,
  false,
  "no outcomeReason → charge normally"
);

// ── the cards that MUST sit out ──────────────────────────────────────────────

const fresh = shouldCooldownForExcessiveRetry({
  latestBlock: blockAgedDays(0),
  currentFingerprint: FP,
  now: NOW,
});
assert.equal(fresh.cooldown, true, "same card, blocked just now → cooldown");
assert.equal(
  fresh.cooldown === true ? fresh.daysRemaining : -1,
  EXCESSIVE_RETRY_COOLDOWN_DAYS,
  "a fresh block reports the full window"
);

const oneDayIn = shouldCooldownForExcessiveRetry({
  latestBlock: blockAgedDays(1),
  currentFingerprint: FP,
  now: NOW,
});
assert.equal(oneDayIn.cooldown, true, "same card, 1 day in → still cooling down");
assert.equal(
  oneDayIn.cooldown === true ? oneDayIn.daysRemaining : -1,
  EXCESSIVE_RETRY_COOLDOWN_DAYS - 1,
  "daysRemaining counts down"
);

// retryAfter is derived from the block, not from now.
const twoDaysIn = shouldCooldownForExcessiveRetry({
  latestBlock: blockAgedDays(2),
  currentFingerprint: FP,
  now: NOW,
});
assert.equal(
  twoDaysIn.cooldown === true ? twoDaysIn.retryAfter.toISOString() : "",
  new Date(NOW.getTime() + 1 * DAY).toISOString(),
  "retryAfter = blockedAt + window"
);

// Never reports 0 days remaining while still cooling down.
const almostOver = shouldCooldownForExcessiveRetry({
  latestBlock: blockAgedDays(EXCESSIVE_RETRY_COOLDOWN_DAYS - 0.01),
  currentFingerprint: FP,
  now: NOW,
});
assert.equal(almostOver.cooldown, true, "just inside the window → cooldown");
assert.ok(
  almostOver.cooldown === true && almostOver.daysRemaining >= 1,
  "daysRemaining never renders as 0 while held"
);

console.log("✅ excessiveRetryCooldown: all assertions passed");

// ── classifyInvoiceRetrieveError ─────────────────────────────────────────────
// A transient failure must NEVER be recorded as "invoice deleted/void": that
// silently retires a member for the day and misleads the operator.
{
  // Genuinely gone.
  assert.equal(classify({ code: "resource_missing" }), "permanent", "resource_missing → permanent");
  assert.equal(classify({ statusCode: 404 }), "permanent", "404 → permanent");

  // Reachability problems — a paced run meets these most.
  assert.equal(classify({ statusCode: 429 }), "transient", "429 → transient");
  assert.equal(classify({ code: "rate_limit" }), "transient", "rate_limit → transient");
  for (const statusCode of [500, 502, 503, 504]) {
    assert.equal(classify({ statusCode }), "transient", `${statusCode} → transient`);
  }
  assert.equal(
    classify({ type: "StripeConnectionError" }),
    "transient",
    "connection error → transient"
  );

  // Real errors: not retryable, but NOT evidence the invoice is gone.
  assert.equal(classify({ statusCode: 401 }), "fatal", "401 → fatal, not permanent");
  assert.equal(classify({ statusCode: 400, code: "parameter_invalid_empty" }), "fatal", "400 → fatal");
  assert.equal(classify(null), "fatal", "null → fatal");
  assert.equal(classify(undefined), "fatal", "undefined → fatal");
  assert.equal(classify(new Error("boom")), "fatal", "plain Error → fatal");

  // The regression this guards: a rate limit must not read as a deleted invoice.
  assert.notEqual(classify({ statusCode: 429 }), "permanent", "429 must never be permanent");

  console.log("✅ classifyInvoiceRetrieveError: all assertions passed");
}
