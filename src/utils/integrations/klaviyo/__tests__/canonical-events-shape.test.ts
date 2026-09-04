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
import { formatDateForKlaviyo } from "../klaviyo-helpers";

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
  // Whether the customer held an ACTIVE membership at the instant of the event.
  // Point-in-time, past tense — the SAME `subscription.isActive` predicate as the
  // live `has_active_subscription` profile property, frozen at that instant. It
  // fixes STALENESS (the profile describes the customer whenever the flow reads
  // it, days later), NOT semantics: paused/past-due read false here too, and a
  // scheduled cancellation reads true. Carried by `One-Time Package Purchased`.
  "had_active_subscription",
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
  // Bonus Code Issued (per-customer coupon expiry)
  "code",
  "expires_at_label",
  // Subscription Cancellation Requested — the day access actually stops, formatted in AEST.
  // A display twin exists because Klaviyo stores a merge tag as one EXPRESSION and cannot
  // format an ISO instant, and because an anchor-24 period end stored as 14:00Z is the NEXT
  // day in Sydney. Always a string, never blank.
  "access_ends_at_label",
  "trigger",
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

import path from "node:path";
import { readFileSync } from "node:fs";
import {
  createViewedGiveawayEvent,
  createStartedCheckoutEvent,
  createBonusCodeIssuedEvent,
  createSubscriptionCancellationRequestedEvent,
  createSubscriptionCancelledEvent,
  createSubscriptionRenewalFailedEvent,
  createOneTimePackagePurchasedEvent,
  createPlacedOrderEvent,
} from "../klaviyo-events";
import type { IUser } from "@/models/User";
import type { KlaviyoEvent } from "@/types/klaviyo";

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

function fakeUser(overrides: Partial<IUser> = {}): IUser {
  // Minimal IUser shape for event-builder tests. Cast through unknown to avoid
  // declaring every field on the model when we only use email + _id.
  return {
    _id: { toString: () => "user_123" },
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    mobile: undefined,
    ...overrides,
  } as unknown as IUser;
}

function testStartedCheckoutShape_GuestRegistrationPath() {
  const sample = createStartedCheckoutEvent(fakeUser(), {
    packageId: "membership_standard",
    packageName: "Standard Membership",
    packageType: "membership",
    tier: "standard",
    price: 30,
    numEntries: 100,
    checkoutUrl: "https://example.com/membership?openMembership=1&packageId=membership_standard",
    promoSlug: "milwaukee-march",
    step: "registered",
    isAuthenticated: false, // Guest registration — always false
  });

  assert.equal(sample.event, "Started Checkout");
  assertCanonicalShape("Started Checkout", sample.properties);

  // Canonical value types — `price` is a number, not a string
  assert.equal(typeof sample.properties.price, "number");
  assert.equal(sample.properties.price, 30);
  assert.equal(sample.properties.$value, 30);
  assert.equal(sample.properties.currency, "aud");
  assert.equal(sample.properties.tier, "standard");
  assert.equal(sample.properties.package_type, "membership");
  assert.equal(sample.properties.num_entries, 100);
  assert.equal(sample.properties.step, "registered");
  assert.equal(sample.properties.is_authenticated, false);
  assert.match(sample.properties.started_at as string, /^\d{4}-\d{2}-\d{2}T/);
}

function testStartedCheckoutShape_AuthedPaymentPath() {
  const sample = createStartedCheckoutEvent(fakeUser(), {
    packageId: "membership_premium",
    packageName: "Premium Membership",
    packageType: "membership",
    price: 50,
    checkoutUrl: "https://example.com/membership",
    step: "viewed",
    isAuthenticated: true, // Authed payment-submit
  });
  assert.equal(sample.properties.step, "viewed");
  assert.equal(sample.properties.is_authenticated, true);
  // Optional `tier`, `num_entries`, `promo_slug` omitted when absent
  assert.equal("tier" in sample.properties, false);
  assert.equal("num_entries" in sample.properties, false);
  assert.equal("promo_slug" in sample.properties, false);
}

// CRITICAL: the path that motivated Phase 6 (DJ's localhost test).
// A guest closes the modal mid-flow, reopens it (modal jumps directly to step-2
// because guestUserData persisted), clicks Pay. handleSubmit runs WITHOUT
// handleRegistration running first → ref-guard is false → client-side fire
// happens with step="viewed" but `is_authenticated` is STILL false because
// step-1 success didn't auto-login.
//
// This combination (step="viewed" + is_authenticated=false) MUST be a valid
// payload. The previous derivation-from-step would have produced is_authenticated=true
// here, which is wrong.
function testStartedCheckoutShape_GuestRecheckoutAfterPersistedGuestUserData() {
  const sample = createStartedCheckoutEvent(fakeUser(), {
    packageId: "tradie-onetime",
    packageName: "Tradie Pack",
    packageType: "one-time",
    tier: "tradie",
    price: 25,
    numEntries: 50,
    checkoutUrl: "https://example.com/membership",
    step: "viewed", // funnel position = payment-submit
    isAuthenticated: false, // BUT user is still a guest (step-1 didn't auto-login)
  });
  assert.equal(sample.properties.step, "viewed");
  assert.equal(
    sample.properties.is_authenticated,
    false,
    "step='viewed' + is_authenticated=false MUST be a valid combo — step-1 success does not authenticate"
  );
  assert.equal(sample.properties.package_type, "one-time");
}

function testBonusCodeIssuedShape() {
  const issuedAt = new Date("2026-08-25T03:00:00.000Z");
  // Exactly +72h from `issuedAt`, which is the only shape a personal window can
  // have since 2026-08-26. The previous fixture was an end-of-Sydney-day instant
  // (`2026-09-08T13:59:59.999Z`) — no issuance can carry that any more, and a
  // fixture that cannot occur teaches the next reader the wrong model.
  const expiresAt = new Date("2026-08-28T03:00:00.000Z");

  const sample = createBonusCodeIssuedEvent(fakeUser(), {
    code: "BONUS-ABC123",
    entriesAmount: 15,
    issuedAt,
    expiresAt,
    trigger: "cancel-click",
  });

  assert.equal(sample.event, "Bonus Code Issued");
  assertCanonicalShape("Bonus Code Issued", sample.properties);

  assert.equal(sample.properties.user_id, "user_123");
  assert.equal(sample.properties.code, "BONUS-ABC123");
  assert.equal(sample.properties.entries_granted, 15);
  assert.equal(sample.properties.issued_at, issuedAt.toISOString());
  assert.equal(sample.properties.expires_at, expiresAt.toISOString());
  assert.equal(sample.properties.trigger, "cancel-click");
  // HARDCODED, not derived. `expires_at_label` is the date the customer's email
  // actually prints, and it must name the instant redemption enforces. A
  // typeof/regex pair cannot catch the label being repointed at `issuedAt`, or
  // at `new Date()`, or at a different timezone — the label is minute-precision,
  // so two calls a tick apart agree either way. This string is the only
  // assertion that fails if the label stops tracking `expiresAt`.
  // 2026-08-28T03:00:00.000Z is 2026-08-28 13:00 in Sydney (UTC+10, AEST — before
  // the 2026-10-04 DST switch to AEDT). Note the deadline now lands at a real
  // time of day, not at 11:59PM: that is the exact-hours window, not a bug.
  assert.equal(sample.properties.expires_at_label, "Friday 28 August 2026, 1:00PM AEST");
}

// The single highest-stakes assertion in this file: `expiresAt` is a PARAMETER,
// never recomputed from `new Date()` inside the builder. Calling the builder
// twice with the SAME `expiresAt`, a tick apart, must yield byte-identical
// `expires_at` / `expires_at_label` — proving the builder emits the value it
// was handed rather than deriving a fresh instant each call.
function testBonusCodeIssuedEmitsThePassedExpiresAt() {
  // Exact-hours fixture, same reason as above.
  const expiresAt = new Date("2026-08-28T03:00:00.000Z");

  const first = createBonusCodeIssuedEvent(fakeUser(), {
    code: "BONUS-ABC123",
    entriesAmount: 15,
    issuedAt: new Date(),
    expiresAt,
    trigger: "checkout-start",
  });

  // A tick apart — if the builder ever called `new Date()` for expiresAt
  // instead of using the parameter, this would drift.
  const second = createBonusCodeIssuedEvent(fakeUser(), {
    code: "BONUS-ABC123",
    entriesAmount: 15,
    issuedAt: new Date(),
    expiresAt,
    trigger: "checkout-start",
  });

  assert.equal(first.properties.expires_at, expiresAt.toISOString());
  assert.equal(second.properties.expires_at, expiresAt.toISOString());
  assert.equal(first.properties.expires_at, second.properties.expires_at);
  assert.equal(first.properties.expires_at_label, second.properties.expires_at_label);
}

// ============================================================
// Subscription Cancellation Requested (2026-08-26) — the win-back flow's trigger
// ============================================================

function testSubscriptionCancellationRequestedShape() {
  const cancelledAt = new Date("2026-08-26T04:30:00.000Z");
  const accessEndsAt = new Date("2026-09-24T13:59:59.000Z");

  const sample = createSubscriptionCancellationRequestedEvent(fakeUser(), {
    packageData: { packageId: "tradie-subscription", packageName: "Tradie", tier: "tradie", price: 20 },
    cancelledAt,
    accessEndsAt,
  });

  assert.equal(sample.event, "Subscription Cancellation Requested");
  // Distinct from the webhook-only event — the whole point of the carve-out in
  // docs/subscription/rules.md R4. If these ever collide, the duplicate-emission
  // bug that rule prevents is back.
  assert.notEqual(sample.event, "Subscription Cancelled");
  assertCanonicalShape("Subscription Cancellation Requested", sample.properties);

  assert.equal(sample.properties.user_id, "user_123");
  // The whole reason this event exists rather than reusing the legacy one: a REAL
  // package name and a REAL tier. The legacy "Subscription Cancelled" ships
  // package_name "Subscription" and the raw package id as `tier`.
  assert.equal(sample.properties.package_name, "Tradie");
  assert.notEqual(sample.properties.package_name, "Subscription");
  assert.equal(sample.properties.tier, "tradie");
  assert.notEqual(sample.properties.tier, "tradie-subscription");
  assert.equal(sample.properties.package_id, "tradie-subscription");
  assert.equal(sample.properties.package_type, "membership");
  // Canonical: price is a NUMBER, not the legacy "20.00" string.
  assert.equal(typeof sample.properties.price, "number");
  assert.equal(sample.properties.price, 20);

  // Hardcoded, not derived from the fixture Dates — an expression borrowed from
  // the implementation would pass even if the builder swapped the two fields.
  assert.equal(sample.properties.cancelled_at, "2026-08-26T04:30:00.000Z");
  assert.equal(sample.properties.access_ends_at, "2026-09-24T13:59:59.000Z");

  // DISPLAY-READY twin. The cancellation-confirmation email's whole job is to name the day
  // access stops, and Klaviyo's editor cannot format an ISO instant — a merge tag prints it
  // verbatim. AEST, not UTC: 13:59:59Z is still the 24th in Sydney, but an anchor-24 renewal
  // stored as 14:00Z is the 25th, so a UTC label would name the wrong day.
  assert.equal(sample.properties.access_ends_at_label, "24 September 2026");
}

// A member who cancels keeps everything until the paid period ends, so the confirmation
// email must name a date. These are the two ways it can fail to have one.
function testAccessEndsAtLabelNeverThrowsAndNeverBlanks() {
  // Unparseable Date. `toISOString()` raises RangeError on this, which used to take the
  // whole builder down and silently drop the event (the emit is wrapped non-blocking at
  // CancelSubscriptionService, so the cancellation itself always survived).
  const broken = createSubscriptionCancellationRequestedEvent(fakeUser(), {
    packageData: null,
    cancelledAt: new Date("2026-08-26T04:30:00.000Z"),
    accessEndsAt: new Date("not-a-date"),
  });
  assert.equal(broken.properties.access_ends_at_label, "when your current period ends");
  assert.equal(broken.properties.access_ends_at, undefined);

  // Unknown date. Never empty — the Klaviyo editor cannot hide one line of a text block,
  // so a blank would leave a dangling label in the customer's email.
  const unknown = createSubscriptionCancellationRequestedEvent(fakeUser(), {
    packageData: null,
    cancelledAt: new Date("2026-08-26T04:30:00.000Z"),
    accessEndsAt: null,
  });
  assert.equal(unknown.properties.access_ends_at_label, "when your current period ends");
}

function testSubscriptionCancellationRequestedOmitsUnresolvedPackage() {
  // A member whose stored `subscription.packageId` no longer resolves must still
  // trigger the win-back flow — the event fires, minus the package block. No
  // "Subscription" / "unknown" sentinel (canonical no-sentinel rule).
  const sample = createSubscriptionCancellationRequestedEvent(fakeUser(), {
    packageData: null,
    cancelledAt: new Date("2026-08-26T04:30:00.000Z"),
    accessEndsAt: null,
  });

  assert.equal(sample.event, "Subscription Cancellation Requested");
  assertCanonicalShape("Subscription Cancellation Requested (no package)", sample.properties);
  assert.equal("package_id" in sample.properties, false, "package_id must be OMITTED when the package did not resolve");
  assert.equal("package_name" in sample.properties, false, "package_name must be OMITTED — never a 'Subscription' sentinel");
  assert.equal("tier" in sample.properties, false, "tier must be OMITTED — never the raw package id");
  assert.equal("price" in sample.properties, false, "price must be OMITTED when the package did not resolve");
  assert.equal("access_ends_at" in sample.properties, false, "access_ends_at must be OMITTED when unknown");
  assert.equal(sample.properties.cancelled_at, "2026-08-26T04:30:00.000Z");
}

// ============================================================
// One-Time Package Purchased — the had_active_subscription carrier (2026-08-26)
// ============================================================

// DELIBERATELY NO `assertCanonicalShape` CALL HERE, and do not add one. This is a
// LEGACY-shaped event: it emits `purchase_date`, `timestamp` and `points_earned`,
// none of which are canonical, so fencing its whole shape would fail on keys that
// have nothing to do with this property — and re-shaping a live event is banned by
// the no-refactor policy in docs/tracking/KLAVIYO_INTEGRATION.md. The note exists so
// nobody adds the call, watches it go red, and deletes this whole test instead.
//
// What this DOES pin is the one property on it that cannot be reconstructed later.
// `had_active_subscription` is a point-in-time fact captured PRE-GRANT in
// `payment-processing.ts`; the `CANONICAL_KEYS` entry above only PERMITS the key, so
// before this test the emit line could be deleted with `tsc` and every suite still
// green, and every one-time purchase in the gap would lose the value permanently.
function testOneTimePackagePurchasedCarriesHadActiveSubscription() {
  const base = {
    packageId: "tradie-pack",
    packageName: "Tradie Pack",
    price: 25,
    entriesGranted: 3,
    pointsEarned: 0,
    paymentIntentId: "pi_test_onetime",
  };

  const member = createOneTimePackagePurchasedEvent(fakeUser(), {
    ...base,
    hadActiveSubscription: true,
  });
  assert.equal(member.event, "One-Time Package Purchased");
  assert.equal(
    member.properties.had_active_subscription,
    true,
    "an active member topping up must emit had_active_subscription: true"
  );

  const nonMember = createOneTimePackagePurchasedEvent(fakeUser(), {
    ...base,
    hadActiveSubscription: false,
  });
  assert.equal(
    nonMember.properties.had_active_subscription,
    false,
    "a buyer with no active membership must emit had_active_subscription: false"
  );

  // Presence, stated rather than implied. The two assertions above already fail if
  // the key is dropped (strict equal: `undefined` is neither `true` nor `false`),
  // but the contract is that the property is ALWAYS on the payload — never omitted
  // for the `false` case the way the canonical no-sentinel rule omits absent
  // optionals. A Klaviyo `is set` filter cannot tell an omitted key from a false one.
  assert.equal(
    "had_active_subscription" in nonMember.properties,
    true,
    "had_active_subscription must be PRESENT on the payload, never omitted"
  );
}

// ---------------------------------------------------------------------------
// Placed Order — the `is_renewal` discriminator
//
// Klaviyo's "Marketing Revenue" custom metric is `Placed Order WHERE is_renewal = 0`.
// Klaviyo treats a MISSING property as "not set", which does not match that filter —
// so an omitted flag silently drops the sale out of the metric with no error anywhere.
// Empirically: the metric reads A$0 for every window before 28 May 2026, which is
// exactly when `is_renewal` started being emitted.
//
// Neither emitter had any test coverage before 2026-09-02 (`grep is_renewal` over
// *.test.ts returned zero hits), which is how the shop emitter shipped without it.
// See docs/superpowers/specs/2026-09-02-klaviyo-shop-is-renewal-design.md
// ---------------------------------------------------------------------------

const shopEmits: KlaviyoEvent[] = [];

/**
 * Stub for the `@/lib/klaviyo` singleton. `trackShopPlacedOrder` returns void and
 * calls `trackEventBackground` directly, so it cannot be snapshot-tested like the
 * pure builders above — the payload has to be captured on its way out.
 */
const stubKlaviyo = {
  trackEventBackground(event: KlaviyoEvent): void {
    shopEmits.push(event);
  },
  async trackEvent(): Promise<never> {
    throw new Error("trackShopPlacedOrder must use trackEventBackground, never a blocking trackEvent");
  },
};

/**
 * Install `exports` into `require.cache` for a repo-relative `.ts` path, so a module
 * loaded AFTER this call resolves the stub instead of the real thing. Mechanism copied
 * from src/services/subscription/__tests__/cancel-subscription-churn-emit.test.ts:145.
 */
function stubModule(relativeTsPath: string, exports: unknown): void {
  const resolved = require.resolve(path.resolve(process.cwd(), relativeTsPath));
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    children: [],
    paths: [],
    parent: undefined,
    exports,
  } as unknown as NodeJS.Module;
}

function testShopPlacedOrderCarriesIsRenewalFalse() {
  stubModule("src/lib/klaviyo.ts", { klaviyo: stubKlaviyo });

  /* eslint-disable @typescript-eslint/no-require-imports */
  const loadedKlaviyo = require("@/lib/klaviyo") as { klaviyo: unknown };
  const revenueService = require("../klaviyo-revenue-service") as {
    trackShopPlacedOrder: (p: {
      email?: string;
      userId?: string;
      orderNumber: string;
      totalAmount: number;
      items: { productId: string; name: string; quantity: number; price: number }[];
    }) => void;
  };
  /* eslint-enable @typescript-eslint/no-require-imports */

  // HARD SAFETY GATE — prove by object identity that the service reaches the stub,
  // not the real client, BEFORE emitting anything. A silently-failed stub install
  // would otherwise turn this test into a live write against production Klaviyo.
  assert.equal(
    loadedKlaviyo.klaviyo,
    stubKlaviyo,
    "require.cache stub did not take effect — ABORT, this would hit real Klaviyo"
  );

  shopEmits.length = 0;
  revenueService.trackShopPlacedOrder({
    email: "shopper@example.com",
    userId: "user_123",
    orderNumber: "TA-1001",
    totalAmount: 59,
    items: [{ productId: "prod_1", name: "Hoodie", quantity: 1, price: 59 }],
  });

  assert.equal(shopEmits.length, 1, "exactly one Placed Order must be emitted");
  const props = shopEmits[0].properties;

  assert.equal(shopEmits[0].event, "Placed Order");
  assert.equal(props.is_renewal, false, "merchandise is never a renewal — must emit is_renewal: false");

  // Presence, stated rather than implied. The assertion above already fails if the key
  // is dropped (strict equal: `undefined` is not `false`), but the contract is that the
  // property is ALWAYS on the payload. Klaviyo cannot tell an omitted key from a false
  // one, and only the omitted case silently drops the sale from the metric.
  assert.equal("is_renewal" in props, true, "is_renewal must be PRESENT, never omitted");

  // The discriminator and the frozen revenue keys must survive the additive edit.
  assert.equal(props.order_type, "shop");
  assert.equal(props.$value, 59);
  assert.equal(props.Currency, "AUD");
  assert.equal(props["Order ID"], "TA-1001");
  assert.ok(Array.isArray(props.items), "items[] must still be present");
}

function testCreatePlacedOrderEventAlwaysCarriesIsRenewal() {
  const base = {
    orderId: "order_test_1",
    value: 20,
    currency: "AUD",
    packageType: "membership" as const,
    packageId: "tradie",
    packageName: "Tradie",
  };

  const renewal = createPlacedOrderEvent(fakeUser(), { ...base, isRenewal: true });
  assert.equal(renewal.properties.is_renewal, true, "a subscription_cycle order must emit is_renewal: true");

  // Omitted must default to false, NOT undefined — the `?? false` at klaviyo-events.ts:736.
  // Without it every non-renewal order falls out of Marketing Revenue exactly the way
  // merchandise sales did before 2026-09-02.
  const firstPurchase = createPlacedOrderEvent(fakeUser(), base);
  assert.equal(firstPurchase.properties.is_renewal, false, "an omitted isRenewal must emit false, never undefined");
  assert.equal(
    "is_renewal" in firstPurchase.properties,
    true,
    "is_renewal must be PRESENT on every Placed Order, never omitted"
  );
}

function testFinalizeShopOrderStillCallsTheEmitter() {
  // Deliberately crude: `finalizeShopOrder` reaches Mongo, Stripe and the print provider,
  // so importing it here is not proportionate. Every other assertion in this file pins the
  // payload built INSIDE trackShopPlacedOrder — none of them notices if the CALL
  // disappears, which would stop merch sales reaching Klaviyo entirely while tsc, lint
  // and this suite all stay green.
  const source = readFileSync(path.resolve(process.cwd(), "src/services/shop/finalizeShopOrder.ts"), "utf8");
  assert.ok(
    source.includes("trackShopPlacedOrder("),
    "finalizeShopOrder must still call trackShopPlacedOrder — the Klaviyo emit for merch orders"
  );
}

// ============================================================
// Subscription Cancelled (legacy) — date formatting
// ============================================================

// This event is LEGACY and deliberately not held to the canonical shape (it ships
// package_name "Subscription" and the raw package id as `tier`). What IS pinned is the
// date format, because `formatDateForKlaviyo` feeds 15 properties and one of them
// (`renewal_date`) is printed verbatim by a LIVE transactional email.
//
// It used to be `toLocaleDateString("en-US")` with no timeZone: US ordering, formatted in
// the SERVER's zone. Measured 2026-09-04 against production, 112 of 300 consecutive
// `Subscription Renewed` events (37.3%) printed the PREVIOUS Sydney day.
function testDatePropertiesAreAESTAndAUFormatted() {
  const sample = createSubscriptionCancelledEvent(fakeUser(), {
    packageId: "tradie-subscription",
    packageName: "Subscription",
    tier: "tradie-subscription",
  });

  const date = sample.properties.cancellation_date as string;

  // AU ordering — "4 September 2026", never the en-US "September 4, 2026".
  assert.match(date, /^\d{1,2} [A-Z][a-z]+ \d{4}$/);
  assert.doesNotMatch(date, /,/);

  // The boundary that caused the bug: 14:30Z is already the NEXT day in Sydney. Asserted
  // through the shared helper directly, since the event itself stamps "now".
  assert.equal(formatDateForKlaviyo(new Date("2026-09-23T14:30:00.000Z")), "24 September 2026");
  assert.notEqual(formatDateForKlaviyo(new Date("2026-09-23T14:30:00.000Z")), "23 September 2026");
  // ...and a time safely inside the Sydney day is unaffected.
  assert.equal(formatDateForKlaviyo(new Date("2026-09-23T09:00:00.000Z")), "23 September 2026");
}

// `next_payment_attempt` has its OWN inline formatter — fixing the shared helper does not
// touch it. It carries a TIME, so a UTC render was wrong by up to 11 hours as well as a day:
// it printed "2:30 PM" for an instant that is 12:30 AM in Sydney.
function testNextPaymentAttemptIsAESTWithTime() {
  const ev = createSubscriptionRenewalFailedEvent(fakeUser(), {
    packageId: "tradie-subscription",
    packageName: "Tradie",
    tier: "tradie",
    failureReason: "card_declined",
    amount: 20,
    paymentIntentId: "pi_x",
    nextPaymentAttempt: Date.parse("2026-09-23T14:30:00.000Z") / 1000,
  });
  assert.equal(ev.properties.next_payment_attempt, "24 September 2026 at 12:30 AM");

  // Stripe has exhausted its retries — empty, which the templates gate on.
  const exhausted = createSubscriptionRenewalFailedEvent(fakeUser(), {
    packageId: "tradie-subscription",
    packageName: "Tradie",
    tier: "tradie",
    failureReason: "card_declined",
    amount: 20,
    paymentIntentId: "pi_x",
    nextPaymentAttempt: null,
  });
  assert.equal(exhausted.properties.next_payment_attempt, "");
}

function run() {
  testCanonicalKeyAccepted();
  testNonCanonicalKeyRejected();
  testAssertCanonicalShapePassesOnCanonicalPayload();
  testAssertCanonicalShapeFailsOnLegacyDrift();
  testAcceptsArbitraryAtSuffix();
  testViewedGiveawayShape();
  testViewedGiveawayOmitsOptionalsWhenAbsent();
  testStartedCheckoutShape_GuestRegistrationPath();
  testStartedCheckoutShape_AuthedPaymentPath();
  testStartedCheckoutShape_GuestRecheckoutAfterPersistedGuestUserData();
  testBonusCodeIssuedShape();
  testBonusCodeIssuedEmitsThePassedExpiresAt();
  testSubscriptionCancellationRequestedShape();
  testAccessEndsAtLabelNeverThrowsAndNeverBlanks();
  testDatePropertiesAreAESTAndAUFormatted();
  testNextPaymentAttemptIsAESTWithTime();
  testSubscriptionCancellationRequestedOmitsUnresolvedPackage();
  testOneTimePackagePurchasedCarriesHadActiveSubscription();
  testShopPlacedOrderCarriesIsRenewalFalse();
  testCreatePlacedOrderEventAlwaysCarriesIsRenewal();
  testFinalizeShopOrderStillCallsTheEmitter();
  console.error(
    "✓ canonical-events-shape: all self-tests + Viewed Giveaway + Started Checkout + Bonus Code Issued + Subscription Cancellation Requested + One-Time Package Purchased snapshots + Placed Order is_renewal (shop + package + call site) passed"
  );
}

run();
