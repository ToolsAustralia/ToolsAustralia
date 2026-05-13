import { classifyRevenueBucket } from "../snapshotSchema";

let passed = 0;
let failed = 0;

function expect(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
    console.log(`✓ ${name}`);
  } else {
    failed += 1;
    console.error(`✗ ${name}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

// Membership: cycle = renewal, anything else = purchase
expect(
  "membership + subscription_cycle => membershipRenewal",
  classifyRevenueBucket({ packageType: "membership", packageId: "apprentice", billingReason: "subscription_cycle" }),
  "membershipRenewal"
);
expect(
  "membership + subscription_create => membershipPurchase",
  classifyRevenueBucket({ packageType: "membership", packageId: "apprentice", billingReason: "subscription_create" }),
  "membershipPurchase"
);
expect(
  "membership + undefined billingReason => membershipPurchase",
  classifyRevenueBucket({ packageType: "membership", packageId: "apprentice", billingReason: undefined }),
  "membershipPurchase"
);

// Mini-draw / upsell direct mapping
expect(
  "mini-draw => miniDraw",
  classifyRevenueBucket({ packageType: "mini-draw", packageId: "any", billingReason: undefined }),
  "miniDraw"
);
expect(
  "upsell => upsell",
  classifyRevenueBucket({ packageType: "upsell", packageId: "any", billingReason: undefined }),
  "upsell"
);

// One-time: additional vs first-time
expect(
  "one-time + additional-* => additionalOneTimePurchase",
  classifyRevenueBucket({ packageType: "one-time", packageId: "additional-apprentice-pack", billingReason: undefined }),
  "additionalOneTimePurchase"
);
expect(
  "one-time + *-pack (non-additional) => oneTimePurchase",
  classifyRevenueBucket({ packageType: "one-time", packageId: "apprentice-pack", billingReason: undefined }),
  "oneTimePurchase"
);
expect(
  "one-time + unknown packageId => oneTimePurchase (fallback)",
  classifyRevenueBucket({ packageType: "one-time", packageId: "weird-id", billingReason: undefined }),
  "oneTimePurchase"
);

// Unknown package types
expect(
  "unknown packageType => null",
  classifyRevenueBucket({ packageType: "ghost", packageId: undefined, billingReason: undefined }),
  null
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
