/**
 * Regression test: server-side "Invoice Generated" emission gate
 *
 * As of the 2026-07 invoice-reliability change, the base "Invoice Generated" receipt is
 * emitted server-side from `trackKlaviyoEvent` (payment-processing.ts) for every charge,
 * instead of relying on the fragile client-side `/api/invoice/finalize` call (which was
 * intermittently dropped when a customer navigated away — e.g. after accepting an upsell).
 *
 * `shouldEmitInvoiceGenerated(billing_reason)` encodes which charges we own vs which are
 * emitted elsewhere. Getting it wrong double-emails customers (renewals/upgrades already
 * receive an email) or silently drops receipts (new subs / one-time / mini / upsell).
 *
 * Invariant fenced here:
 *   - subscription_create  → EMIT  (new membership; the reported bug — must be reliable)
 *   - undefined / ""       → EMIT  (one-time pack, mini-draw, accepted upsell = its own charge)
 *   - subscription_cycle   → SKIP  (renewal → "Subscription Renewed" → "Membership Renewal" flow)
 *   - subscription_threshold → SKIP (also a renewal for the Subscription Renewed metric)
 *   - subscription_update  → SKIP  (upgrade → owned by invoice.payment_succeeded webhook)
 *
 * Run via: `npm run test:invoice-generated-gate`
 */

import assert from "node:assert/strict";
import { shouldEmitInvoiceGenerated } from "../klaviyo-invoice-service";
import { buildInvoiceData } from "../klaviyo-invoice-helpers";

function testEmitsForNewSubscription() {
  assert.equal(
    shouldEmitInvoiceGenerated("subscription_create"),
    true,
    "new membership (subscription_create) MUST emit its receipt server-side — this is the reported bug"
  );
}

function testEmitsForOneTimeAndUpsellAndMini() {
  // one-time packs, mini-draws, and accepted upsells arrive with no subscription billing_reason
  assert.equal(shouldEmitInvoiceGenerated(undefined), true, "undefined billing_reason (one-time/mini/upsell) MUST emit");
  assert.equal(shouldEmitInvoiceGenerated(""), true, "empty billing_reason MUST emit");
}

function testSkipsRenewals() {
  assert.equal(
    shouldEmitInvoiceGenerated("subscription_cycle"),
    false,
    "renewal (subscription_cycle) MUST NOT emit here — owned by the Membership Renewal flow (else double email)"
  );
  assert.equal(
    shouldEmitInvoiceGenerated("subscription_threshold"),
    false,
    "subscription_threshold is a renewal for the Subscription Renewed metric — MUST NOT double-emit"
  );
}

function testSkipsUpgrades() {
  assert.equal(
    shouldEmitInvoiceGenerated("subscription_update"),
    false,
    "upgrade (subscription_update) MUST NOT emit here — owned by the invoice.payment_succeeded webhook"
  );
}

// ── buildInvoiceData receipt line-item labelling ──────────────────────────────
// The "Receipt" Klaviyo template renders `{% for item in event.items %}{{ item.description }}`.
// Upsell offer ids aren't in the membership/mini catalogs, so the raw id would leak into the
// receipt line ("membership-upsell-boss") unless we use the clean offer name.

function testUpsellReceiptUsesCleanOfferName() {
  const invoice = buildInvoiceData(
    { packageType: "upsell", packageId: "membership-upsell-boss", packageName: "Foreman Pack", price: 39.99, entries: 300 },
    "pi_test_upsell"
  );
  assert.equal(
    invoice.items[0].description,
    "Foreman Pack",
    "upsell receipt line item must be the clean offer name, not the raw offer id"
  );
  assert.notEqual(invoice.items[0].description, "membership-upsell-boss", "raw offer id must not leak into the receipt");
  assert.equal(invoice.billingReason, undefined, "upsell is a one-off charge — no subscription billing_reason");
}

function testMembershipReceiptResolvesLabelAndBillingReason() {
  const invoice = buildInvoiceData(
    { packageType: "membership", packageId: "boss-subscription", packageName: "Boss", price: 80, entries: 1000 },
    "pi_test_membership"
  );
  // Resolved to a catalog label (not the raw id) and stamped as a new subscription.
  assert.notEqual(invoice.items[0].description, "boss-subscription", "membership line item must resolve to a label, not the id");
  assert.equal(invoice.billingReason, "subscription_create");
}

function run() {
  testEmitsForNewSubscription();
  testEmitsForOneTimeAndUpsellAndMini();
  testSkipsRenewals();
  testSkipsUpgrades();
  testUpsellReceiptUsesCleanOfferName();
  testMembershipReceiptResolvesLabelAndBillingReason();
  console.error("✓ invoice-generated-gate: emission rules + receipt line-item labelling passed");
}

run();
