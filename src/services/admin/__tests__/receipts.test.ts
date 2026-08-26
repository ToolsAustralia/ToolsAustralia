import assert from "node:assert/strict";
import {
  buildReceiptsCsv,
  classifyReceiptCategory,
  deriveReceiptRefund,
  isReceiptCategory,
  RECEIPT_CATEGORIES,
  RECEIPT_CATEGORY_LABELS,
  type ReceiptRefundIndex,
  type ReceiptRow,
} from "@/utils/admin/receipts";
import { classifyAcquisitionCategory } from "@/services/admin/platformRevenueBreakdown";
import {
  normalizeStripeObjectId,
  resolveStripeDashboardMode,
  stripeDashboardUrl,
} from "@/utils/billing/stripeDashboardUrl";

let failures = 0;
const test = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failures++;
    console.error(`✗ ${name}\n  ${(e as Error).message}`);
  }
};

// ─── Category classifier ─────────────────────────────────────────────────────────────────

test("classifier maps every PaymentEvent packageType to a category", () => {
  assert.equal(
    classifyReceiptCategory({ packageType: "membership" }),
    "membership-purchase"
  );
  assert.equal(classifyReceiptCategory({ packageType: "mini-draw" }), "mini-draw");
  assert.equal(classifyReceiptCategory({ packageType: "upsell" }), "upsell");
  assert.equal(
    classifyReceiptCategory({ packageType: "one-time", packageId: "tradie-pack" }),
    "one-time-purchase"
  );
  assert.equal(classifyReceiptCategory({ packageType: "weird" }), null, "unknown type → null");
});

test("renewals are membership-renewal — keyed off billingReason, never isRenewal", () => {
  // The whole point of the divergence from the dashboard. `PaymentEvent` also carries an
  // `isRenewal` boolean, but platformRevenueBreakdown.ts states the basis explicitly:
  // renewals are `data.billingReason === "subscription_cycle"`. Classifying off isRenewal
  // makes these numbers stop reconciling with the dashboard.
  assert.equal(
    classifyReceiptCategory({ packageType: "membership", billingReason: "subscription_cycle" }),
    "membership-renewal"
  );
  // Every other billingReason is an acquisition, not a renewal.
  for (const billingReason of ["subscription_create", "subscription_update", "manual", undefined]) {
    assert.equal(
      classifyReceiptCategory({ packageType: "membership", billingReason }),
      "membership-purchase",
      `billingReason=${billingReason}`
    );
  }
});

test("additional- packageId splits additional-one-time from one-time-purchase", () => {
  assert.equal(
    classifyReceiptCategory({ packageType: "one-time", packageId: "additional-tradie-pack" }),
    "additional-one-time"
  );
  assert.equal(
    classifyReceiptCategory({ packageType: "one-time", packageId: "tradie-pack" }),
    "one-time-purchase"
  );
  // A missing packageId must behave like the classifier's `(packageId ?? "")` — the Mongo
  // clause uses `$not: /^additional-/`, which also matches documents with no packageId, so
  // these two have to agree or the filtered list and the totals disagree.
  assert.equal(classifyReceiptCategory({ packageType: "one-time" }), "one-time-purchase");
  assert.equal(
    classifyReceiptCategory({ packageType: "one-time", packageId: "" }),
    "one-time-purchase"
  );
});

test("lockstep with classifyAcquisitionCategory — renewals are the ONLY difference", () => {
  // This is the reconciliation guarantee in test form. Receipts must agree with the
  // dashboard's acquisition classifier on every row EXCEPT renewals, which the dashboard
  // drops (null) and Receipts keeps. If this test fails, the documented delta
  // ("Receipts − dashboard == renewals") silently stops being true.
  const cases = [
    { packageType: "membership" },
    { packageType: "membership", billingReason: "subscription_create" },
    { packageType: "membership", billingReason: "subscription_cycle" },
    { packageType: "one-time", packageId: "tradie-pack" },
    { packageType: "one-time", packageId: "additional-tradie-pack" },
    { packageType: "one-time" },
    { packageType: "mini-draw" },
    { packageType: "upsell" },
  ];

  for (const c of cases) {
    const receipts = classifyReceiptCategory(c);
    const acquisition = classifyAcquisitionCategory({
      ...c,
      data: c.billingReason ? { billingReason: c.billingReason } : {},
    });
    const isRenewal = c.billingReason === "subscription_cycle";

    if (isRenewal) {
      assert.equal(acquisition, null, "dashboard drops renewals");
      assert.equal(receipts, "membership-renewal", "receipts keeps them, labelled");
    } else {
      assert.equal(
        receipts,
        acquisition,
        `divergence on ${JSON.stringify(c)} — reconciliation would break`
      );
    }
  }
});

test("category vocabulary is complete and labelled", () => {
  assert.equal(RECEIPT_CATEGORIES.length, 7, "6 dashboard categories + shop-order");
  for (const c of RECEIPT_CATEGORIES) {
    assert.ok(RECEIPT_CATEGORY_LABELS[c]?.trim(), `${c} has no label`);
    assert.ok(isReceiptCategory(c));
  }
  assert.equal(isReceiptCategory("not-a-category"), false);
  assert.equal(isReceiptCategory(""), false);
});

// ─── Stripe dashboard links ──────────────────────────────────────────────────────────────

test("stripeDashboardUrl handles pi_, invoice_in_ and cus_ in BOTH modes", () => {
  // live
  assert.equal(
    stripeDashboardUrl("pi_123", "live"),
    "https://dashboard.stripe.com/payments/pi_123"
  );
  assert.equal(
    stripeDashboardUrl("invoice_in_123", "live"),
    "https://dashboard.stripe.com/invoices/in_123",
    "the invoice_ storage prefix must be stripped"
  );
  assert.equal(
    stripeDashboardUrl("cus_123", "live"),
    "https://dashboard.stripe.com/customers/cus_123"
  );
  // test
  assert.equal(
    stripeDashboardUrl("pi_123", "test"),
    "https://dashboard.stripe.com/test/payments/pi_123"
  );
  assert.equal(
    stripeDashboardUrl("invoice_in_123", "test"),
    "https://dashboard.stripe.com/test/invoices/in_123"
  );
  assert.equal(
    stripeDashboardUrl("cus_123", "test"),
    "https://dashboard.stripe.com/test/customers/cus_123"
  );
});

test("stripeDashboardUrl accepts a bare in_ and refuses to guess anything else", () => {
  assert.equal(
    stripeDashboardUrl("in_123", "live"),
    "https://dashboard.stripe.com/invoices/in_123"
  );
  assert.equal(stripeDashboardUrl(null, "live"), null);
  assert.equal(stripeDashboardUrl(undefined, "live"), null);
  assert.equal(stripeDashboardUrl("   ", "live"), null);
  assert.equal(stripeDashboardUrl("ch_123", "live"), null, "unknown prefix → no link, not a guess");
});

test("normalizeStripeObjectId strips only the storage prefix", () => {
  assert.equal(normalizeStripeObjectId("invoice_in_123"), "in_123");
  assert.equal(normalizeStripeObjectId("pi_123"), "pi_123");
  assert.equal(normalizeStripeObjectId("in_123"), "in_123");
});

test("mode comes from the secret-key prefix and fails safe to test", () => {
  assert.equal(resolveStripeDashboardMode("sk_live_abc"), "live");
  assert.equal(resolveStripeDashboardMode("sk_test_abc"), "test");
  assert.equal(resolveStripeDashboardMode(undefined), "test", "unset must not link to live");
  assert.equal(resolveStripeDashboardMode("rk_live_abc"), "test", "restricted key → not sk_live_");
});

// ─── Refund marking ──────────────────────────────────────────────────────────────────────

const refundIndex: ReceiptRefundIndex = new Map([
  ["pi_full", { kind: "full" as const, amountCents: 5000, at: "2026-08-01T00:00:00.000Z" }],
  ["pi_partial", { kind: "partial" as const, amountCents: 1500, at: "2026-08-02T00:00:00.000Z" }],
  ["pi_over", { kind: "partial" as const, amountCents: 999_00, at: null }],
]);

test("no refund → net equals gross", () => {
  const r = deriveReceiptRefund(50, "pi_clean", refundIndex);
  assert.deepEqual(r, { refundStatus: "none", refundedAmount: 0, netAmount: 50, refundedAt: null });
});

test("full refund → whole row nets to zero (the dashboard's basis)", () => {
  // `fetchNetBenefitsGrantedWithMatch` drops a refunded row entirely; netting it to $0 here
  // is the same arithmetic, which is what keeps the two totals reconcilable.
  const r = deriveReceiptRefund(50, "pi_full", refundIndex);
  assert.equal(r.refundStatus, "refunded");
  assert.equal(r.refundedAmount, 50);
  assert.equal(r.netAmount, 0);
  assert.equal(r.refundedAt, "2026-08-01T00:00:00.000Z");
});

test("partial refund converts CENTS to dollars before subtracting", () => {
  // The unit trap: data.price is DOLLARS, data.refundAmount is CENTS. 1500 cents off a $50
  // payment is $15 back and $35 net — not $-1450.
  const r = deriveReceiptRefund(50, "pi_partial", refundIndex);
  assert.equal(r.refundStatus, "partially-refunded");
  assert.equal(r.refundedAmount, 15);
  assert.equal(r.netAmount, 35);
});

test("an over-refund clamps instead of reading as negative revenue", () => {
  const r = deriveReceiptRefund(50, "pi_over", refundIndex);
  assert.equal(r.refundedAmount, 50, "never refund more than was taken");
  assert.equal(r.netAmount, 0);
});

test("a row with no payment id is never marked refunded", () => {
  assert.equal(deriveReceiptRefund(50, null, refundIndex).refundStatus, "none");
  assert.equal(deriveReceiptRefund(50, undefined, refundIndex).refundStatus, "none");
});

test("cent-level arithmetic does not drift", () => {
  const idx: ReceiptRefundIndex = new Map([
    ["pi_x", { kind: "partial" as const, amountCents: 1010, at: null }],
  ]);
  const r = deriveReceiptRefund(30.3, "pi_x", idx);
  assert.equal(r.refundedAmount, 10.1);
  assert.equal(r.netAmount, 20.2, "no floating-point tail");
});

// ─── CSV ─────────────────────────────────────────────────────────────────────────────────

const row = (overrides: Partial<ReceiptRow> = {}): ReceiptRow => ({
  id: "BenefitsGranted-pi_1",
  source: "payment-event",
  timestamp: "2026-08-01T03:04:05.000Z",
  category: "membership-renewal",
  packageName: "Tradie",
  amount: 20,
  refundStatus: "none",
  refundedAmount: 0,
  netAmount: 20,
  refundedAt: null,
  customer: { userId: "u1", firstName: "Dave", lastName: "Smith", email: "dave@example.com" },
  stripe: {
    objectId: "invoice_in_1",
    objectLabel: "in_1",
    objectUrl: null,
    customerId: "cus_1",
    customerUrl: null,
  },
  ...overrides,
});

test("CSV has a header per column and one line per row", () => {
  const csv = buildReceiptsCsv([row(), row({ id: "b" })]);
  const lines = csv.split("\r\n");
  assert.equal(lines.length, 3, "header + 2 rows");
  assert.equal(lines[0].split(",").length, 12);
  assert.ok(lines[1].includes('"Membership renewal"'));
  assert.ok(lines[1].includes('"in_1"'), "exports the Stripe id as Stripe knows it");
});

test("CSV escapes embedded quotes rather than breaking the column count", () => {
  const csv = buildReceiptsCsv([row({ packageName: 'The "Big" Pack' })]);
  assert.ok(csv.includes('"The ""Big"" Pack"'));
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll tests passed");
