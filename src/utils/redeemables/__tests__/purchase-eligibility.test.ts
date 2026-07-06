import assert from "node:assert/strict";
import { hasQualifyingPurchase } from "../purchase-eligibility";

// Fixed, deterministic campaign window: July 2026.
const startsAt = new Date("2026-07-01T00:00:00.000Z");
const endsAt = new Date("2026-07-31T00:00:00.000Z");
const window = { startsAt, endsAt };

// Fixed "now" for the neverExpires (open-ended) case so results are stable.
const now = new Date("2026-07-15T00:00:00.000Z");

const inWindowPurchase = { purchaseDate: new Date("2026-07-15T00:00:00.000Z") };
const oldPurchase = { purchaseDate: new Date("2026-06-15T00:00:00.000Z") }; // pre-window / lifetime

let assertions = 0;
function check(actual: boolean, expected: boolean, label: string) {
  assert.equal(actual, expected, label);
  assertions += 1;
}

function testRequirementNone() {
  // "none" is always eligible, even for a completely empty user.
  check(hasQualifyingPurchase({}, window, "none", now), true, '"none" → true with empty user');
}

function testMembership() {
  check(
    hasQualifyingPurchase({ subscription: { isActive: true } }, window, "membership", now),
    true,
    '"membership": active subscription → true'
  );
  check(
    hasQualifyingPurchase({ subscription: { isActive: false } }, window, "membership", now),
    false,
    '"membership": inactive subscription → false'
  );
  check(
    hasQualifyingPurchase({}, window, "membership", now),
    false,
    '"membership": absent subscription → false'
  );
}

function testOneTime() {
  check(
    hasQualifyingPurchase({ oneTimePackages: [inWindowPurchase] }, window, "one-time", now),
    true,
    '"one-time": in-window purchase → true'
  );
  check(
    hasQualifyingPurchase({ oneTimePackages: [oldPurchase] }, window, "one-time", now),
    false,
    '"one-time": pre-window (lifetime/old) purchase → false'
  );
  check(
    hasQualifyingPurchase({}, window, "one-time", now),
    false,
    '"one-time": no oneTimePackages → false'
  );
  // Regression: an active member must NOT auto-pass a one-time requirement.
  check(
    hasQualifyingPurchase({ subscription: { isActive: true } }, window, "one-time", now),
    false,
    '"one-time": active subscription but no in-window one-time → false (regression)'
  );
}

function testAny() {
  check(
    hasQualifyingPurchase({ subscription: { isActive: true } }, window, "any", now),
    true,
    '"any": active subscription, no one-time → true'
  );
  check(
    hasQualifyingPurchase({ oneTimePackages: [inWindowPurchase] }, window, "any", now),
    true,
    '"any": in-window one-time, no subscription → true'
  );
  check(
    hasQualifyingPurchase({}, window, "any", now),
    false,
    '"any": neither membership nor one-time → false'
  );
  check(
    hasQualifyingPurchase({ oneTimePackages: [oldPurchase] }, window, "any", now),
    false,
    '"any": only an old (pre-window) one-time, no subscription → false'
  );
}

function testWindowBounds() {
  // Purchase exactly at the window floor (== startsAt) is inclusive.
  check(
    hasQualifyingPurchase(
      { oneTimePackages: [{ purchaseDate: startsAt }] },
      window,
      "one-time",
      now
    ),
    true,
    'window bounds: purchaseDate == startsAt → true'
  );
  // Purchase exactly at the window ceiling (== endsAt) is inclusive.
  check(
    hasQualifyingPurchase(
      { oneTimePackages: [{ purchaseDate: endsAt }] },
      window,
      "one-time",
      now
    ),
    true,
    'window bounds: purchaseDate == endsAt → true'
  );
  // Purchase strictly after the ceiling is excluded.
  check(
    hasQualifyingPurchase(
      { oneTimePackages: [{ purchaseDate: new Date("2026-08-01T00:00:00.000Z") }] },
      window,
      "one-time",
      now
    ),
    false,
    'window bounds: purchaseDate after endsAt → false'
  );
  // neverExpires campaign: ceiling falls back to `now`; purchase after start, before now → true.
  check(
    hasQualifyingPurchase(
      { oneTimePackages: [{ purchaseDate: new Date("2026-07-10T00:00:00.000Z") }] },
      { startsAt, neverExpires: true },
      "one-time",
      now
    ),
    true,
    'window bounds: neverExpires (no endsAt) + purchase after startsAt, before now → true'
  );
}

function run() {
  testRequirementNone();
  testMembership();
  testOneTime();
  testAny();
  testWindowBounds();
  console.log(`Purchase-eligibility tests passed (${assertions} assertions)`);
}

run();
