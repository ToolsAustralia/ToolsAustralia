import assert from "node:assert/strict";
import { isZeroAmountTrialUpdateInvoice } from "../trial-invoice";

function run() {
  // THE BUG CASE: Stripe's $0 trial-period invoice created when trial_end is set → must be skipped.
  assert.equal(
    isZeroAmountTrialUpdateInvoice({ billing_reason: "subscription_update", total: 0, amount_paid: 0 }),
    true,
    "$0 subscription_update trial-period invoice is skipped"
  );
  assert.equal(
    isZeroAmountTrialUpdateInvoice({ billing_reason: "subscription_update" }),
    true,
    "subscription_update with missing amounts is treated as $0 (Stripe always sends total; fail-skip)"
  );

  // MUST STILL GRANT (not matched):
  assert.equal(
    isZeroAmountTrialUpdateInvoice({ billing_reason: "subscription_cycle", total: 4000, amount_paid: 4000 }),
    false,
    "real subscription_cycle renewal still grants"
  );
  assert.equal(
    isZeroAmountTrialUpdateInvoice({ billing_reason: "subscription_create", total: 4000, amount_paid: 4000 }),
    false,
    "subscription_create still grants"
  );
  assert.equal(
    isZeroAmountTrialUpdateInvoice({ billing_reason: "subscription_update", total: 1500, amount_paid: 1500 }),
    false,
    "real upgrade proration (subscription_update with a charge) still grants"
  );
  assert.equal(
    isZeroAmountTrialUpdateInvoice({ billing_reason: "subscription_cycle", total: 0, amount_paid: 0 }),
    false,
    "100%-off renewal is subscription_cycle ($0) — NOT skipped, still a real renewal"
  );
  assert.equal(
    isZeroAmountTrialUpdateInvoice({ billing_reason: "subscription_update", total: 1500, amount_paid: 0 }),
    false,
    "subscription_update with an unpaid balance is not a $0 trial invoice"
  );

  console.log("trial-invoice tests passed");
}

run();
