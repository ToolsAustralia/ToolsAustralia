/**
 * Canonical event-shape snapshot test
 *
 * Fences the canonical property-name contract for NEW Klaviyo events added
 * after 2026-05-27. Phase 1 ships with no event builders to assert against —
 * Phases 3 and 4 add the `Viewed Giveaway` and `Started Checkout` snapshots.
 *
 * Source of truth: `docs/tracking/KLAVIYO_INTEGRATION.md` —
 *   "Canonical property names — new events only (drift containment)" section.
 *
 * If a new event needs a property not in `CANONICAL_KEYS`, add it to the doc
 * AND to this allowlist in the same PR. Do not loosen the assertion silently.
 *
 * Run via: `npm run test:klaviyo-canonical`
 */

import assert from "node:assert/strict";

/**
 * Allowlist of canonical property names that may appear on any event added
 * after 2026-05-27. Mirrors the table in KLAVIYO_INTEGRATION.md column 2.
 *
 * Note: this list intentionally does NOT include any `*_date` keys (locale
 * strings) or the camelCase aliases (`packagePrice`, `packageTier`, etc.) used
 * by legacy events. The `*_at` suffix is accepted via pattern match — see
 * `isCanonicalKey` below.
 */
export const CANONICAL_KEYS: ReadonlySet<string> = new Set([
  // Money + revenue
  "price",
  "$value",
  "currency",
  // Package shape
  "package_id",
  "package_name",
  "tier",
  "package_type",
  // Entries
  "entries_granted",
  "entries_purchased",
  "num_entries",
  // Identity
  "user_id",
  "payment_intent_id",
  // Boolean flags
  "is_authenticated",
  // Promo / giveaway context
  "promo_slug",
  "promo_id",
  "promo_title",
  "prize_name",
  "prize_image_url",
  "promo_url",
  // Deep links
  "checkout_url",
  "resume_url",
  // Step / phase discriminators
  "step",
  // Klaviyo standard revenue triple (only on Placed Order / Refunded Order — included for completeness)
  "Currency",
  "Order ID",
  "items",
]);

/**
 * Returns true if `key` is allowed on a canonical-schema event.
 * - explicit canonical keys (e.g. `price`, `tier`, `package_type`)
 * - any `*_at` ISO timestamp (e.g. `started_at`, `viewed_at`, `purchased_at`)
 */
export function isCanonicalKey(key: string): boolean {
  if (CANONICAL_KEYS.has(key)) return true;
  if (key.endsWith("_at")) return true;
  return false;
}

/**
 * Assert that every key on `properties` is canonical. Throws on first non-
 * canonical key with a message that names the event for debuggability.
 *
 * Usage in event-builder snapshot tests:
 *   const sample = createViewedGiveawayEvent(...);
 *   assertCanonicalShape("Viewed Giveaway", sample.properties);
 */
export function assertCanonicalShape(eventName: string, properties: Record<string, unknown>): void {
  const offenders: string[] = [];
  for (const key of Object.keys(properties)) {
    if (!isCanonicalKey(key)) offenders.push(key);
  }
  assert.deepEqual(
    offenders,
    [],
    `Event "${eventName}" emits non-canonical properties: ${offenders.join(", ")}. ` +
      `Either rename to a canonical key (see docs/tracking/KLAVIYO_INTEGRATION.md ` +
      `"Canonical property names" table) or add the new key to CANONICAL_KEYS in the same PR.`
  );
}

// ============================================================
// Self-test: the allowlist + assertion behave correctly
// ============================================================

function testCanonicalKeyAccepted() {
  assert.equal(isCanonicalKey("price"), true, "price is canonical");
  assert.equal(isCanonicalKey("tier"), true, "tier is canonical");
  assert.equal(isCanonicalKey("started_at"), true, "*_at is canonical via pattern");
  assert.equal(isCanonicalKey("viewed_at"), true, "*_at is canonical via pattern");
  assert.equal(isCanonicalKey("$value"), true, "$value is canonical");
}

function testNonCanonicalKeyRejected() {
  assert.equal(isCanonicalKey("package_tier"), false, "package_tier (legacy) is NOT canonical");
  assert.equal(isCanonicalKey("package_price"), false, "package_price is NOT canonical");
  assert.equal(isCanonicalKey("amount"), false, "amount (legacy) is NOT canonical");
  assert.equal(isCanonicalKey("total_amount"), false, "total_amount (legacy invoice) is NOT canonical");
  assert.equal(isCanonicalKey("amount_paid"), false, "amount_paid (legacy upsell) is NOT canonical");
  assert.equal(isCanonicalKey("purchase_date"), false, "purchase_date (legacy locale) is NOT canonical");
  assert.equal(isCanonicalKey("renewal_date"), false, "renewal_date (legacy locale) is NOT canonical");
  assert.equal(isCanonicalKey("entries"), false, "entries (bare legacy alias on Subscription Renewal Failed) is NOT canonical");
  assert.equal(isCanonicalKey("entries_added"), false, "entries_added (legacy alias) is NOT canonical");
  assert.equal(isCanonicalKey("entries_gained"), false, "entries_gained (legacy alias) is NOT canonical");
  assert.equal(isCanonicalKey("entries_formatted"), false, "entries_formatted (presentation-in-data anti-pattern) is NOT canonical");
  assert.equal(isCanonicalKey("timestamp"), false, "timestamp (legacy ISO duplicate; use <verb>_at) is NOT canonical");
}

function testAssertCanonicalShapePassesOnCanonicalPayload() {
  const validPayload = {
    package_id: "membership_standard",
    package_name: "Standard Membership",
    package_type: "membership",
    tier: "standard",
    price: 30,
    $value: 30,
    currency: "aud",
    is_authenticated: true,
    started_at: "2026-05-28T10:00:00Z",
    checkout_url: "https://example.com",
  };
  // Should not throw
  assertCanonicalShape("Test Canonical Event", validPayload);
}

function testAssertCanonicalShapeFailsOnLegacyDrift() {
  const driftedPayload = {
    package_id: "membership_standard",
    package_name: "Standard Membership",
    package_tier: "standard", // ← drift (should be `tier`)
    package_price: "30.00", // ← drift (should be `price`, number)
  };
  assert.throws(
    () => assertCanonicalShape("Test Drifted Event", driftedPayload),
    /package_tier.*package_price/,
    "drift offenders should appear in the error message"
  );
}

function testAcceptsArbitraryAtSuffix() {
  const payload = {
    started_at: "2026-05-28T10:00:00Z",
    purchased_at: "2026-05-28T11:00:00Z",
    cancelled_at: "2026-05-28T12:00:00Z",
    package_id: "x",
    package_name: "y",
    package_type: "membership",
    price: 1,
  };
  // No throw
  assertCanonicalShape("Time Suffix Smoke", payload);
}

// ============================================================
// Snapshot tests for the canonical event builders
// ============================================================

import { createViewedGiveawayEvent } from "../klaviyo-events";

function testViewedGiveawayShape() {
  const sample = createViewedGiveawayEvent(
    { email: "test@example.com", firstName: "Test", lastName: "User" },
    {
      promoSlug: "milwaukee-march",
      promoId: "promo_abc123",
      promoTitle: "Win a Milwaukee Tool Pack",
      prizeName: "Milwaukee 18V Combo Kit",
      prizeImageUrl: "https://example.com/prize.jpg",
      promoUrl: "https://toolsaustralia.com.au/promotions/milwaukee-march",
      isAuthenticated: false,
    }
  );

  assert.equal(sample.event, "Viewed Giveaway");
  assert.equal(sample.customer_properties.email, "test@example.com");

  // Fence the canonical property keys
  assertCanonicalShape("Viewed Giveaway", sample.properties);

  // Spot-check key values
  assert.equal(sample.properties.promo_slug, "milwaukee-march");
  assert.equal(sample.properties.is_authenticated, false);
  assert.equal(typeof sample.properties.viewed_at, "string");
  assert.match(sample.properties.viewed_at as string, /^\d{4}-\d{2}-\d{2}T/);
}

function testViewedGiveawayOmitsOptionalsWhenAbsent() {
  // promoId and prizeImageUrl are optional — when absent, they should be OMITTED
  // (not present as `""` or `undefined`) per the canonical no-sentinel rule.
  const sample = createViewedGiveawayEvent(
    { email: "test@example.com" },
    {
      promoSlug: "no-extras",
      promoTitle: "Title",
      prizeName: "Prize",
      promoUrl: "https://example.com",
      isAuthenticated: false,
    }
  );

  assert.equal(
    "promo_id" in sample.properties,
    false,
    "promo_id must be OMITTED when not provided (no sentinel)"
  );
  assert.equal(
    "prize_image_url" in sample.properties,
    false,
    "prize_image_url must be OMITTED when not provided (no sentinel)"
  );
  assert.equal(
    "user_id" in sample.properties,
    false,
    "user_id must be OMITTED for email-only (anonymous-then-cookied) callers"
  );
  assertCanonicalShape("Viewed Giveaway (minimal)", sample.properties);
}

function run() {
  testCanonicalKeyAccepted();
  testNonCanonicalKeyRejected();
  testAssertCanonicalShapePassesOnCanonicalPayload();
  testAssertCanonicalShapeFailsOnLegacyDrift();
  testAcceptsArbitraryAtSuffix();
  testViewedGiveawayShape();
  testViewedGiveawayOmitsOptionalsWhenAbsent();
  console.error("✓ canonical-events-shape: all self-tests + Viewed Giveaway snapshot passed");
}

run();
