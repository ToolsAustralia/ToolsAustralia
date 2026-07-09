import assert from "node:assert/strict";

/**
 * Fences deriveMembershipDisplayStatus — the shared derivation behind the admin
 * user-detail modal's header badge (Active / Cancels {date} / Past Due / Paused /
 * Cancelled / Guest). Key invariants:
 *  - payment recovery (past_due/unpaid) wins over everything, incl. cancelled-while-past-due
 *  - trialing is a paid ACTIVE member (anchor-day artifact), never a "trial"
 *  - active + autoRenew:false = scheduled to cancel (still live until endDate)
 *  - incomplete / unknown / missing = guest ("none")
 *
 * Run: npm run test:membership-display-status
 */

let failures = 0;
const test = (name: string, fn: () => void | Promise<void>) => {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`✓ ${name}`))
    .catch((e: Error) => {
      failures++;
      console.error(`✗ ${name}\n  ${e.message}`);
    });
};

async function main() {
  const { deriveMembershipDisplayStatus } = await import(
    "@/utils/subscription/subscription-helpers"
  );

  await test("no subscription object → none (guest)", () => {
    assert.equal(deriveMembershipDisplayStatus(null), "none");
    assert.equal(deriveMembershipDisplayStatus(undefined), "none");
  });

  await test("registration default (incomplete, inactive) → none", () => {
    assert.equal(
      deriveMembershipDisplayStatus({ status: "incomplete", isActive: false }),
      "none"
    );
  });

  await test("incomplete_expired → none", () => {
    assert.equal(
      deriveMembershipDisplayStatus({ status: "incomplete_expired", isActive: false }),
      "none"
    );
  });

  await test("active + autoRenew on → active", () => {
    assert.equal(
      deriveMembershipDisplayStatus({ status: "active", isActive: true, autoRenew: true }),
      "active"
    );
  });

  await test("active + autoRenew undefined → active (autoRenew defaults on)", () => {
    assert.equal(
      deriveMembershipDisplayStatus({ status: "active", isActive: true }),
      "active"
    );
  });

  await test("trialing (anchor-day artifact) is ACTIVE, never a trial", () => {
    assert.equal(
      deriveMembershipDisplayStatus({ status: "trialing", isActive: true, autoRenew: true }),
      "active"
    );
  });

  await test("active + autoRenew off → scheduled_cancel", () => {
    assert.equal(
      deriveMembershipDisplayStatus({ status: "active", isActive: true, autoRenew: false }),
      "scheduled_cancel"
    );
  });

  await test("past_due → past_due (even while isActive false)", () => {
    assert.equal(
      deriveMembershipDisplayStatus({ status: "past_due", isActive: false, autoRenew: true }),
      "past_due"
    );
  });

  await test("cancelled WHILE past_due → past_due wins (payment problem is the signal)", () => {
    assert.equal(
      deriveMembershipDisplayStatus({ status: "past_due", isActive: false, autoRenew: false }),
      "past_due"
    );
  });

  await test("unpaid → past_due (recovery family)", () => {
    assert.equal(
      deriveMembershipDisplayStatus({ status: "unpaid", isActive: false }),
      "past_due"
    );
  });

  await test("paused status → paused (defensive — no DB writer today; retention pause lives on Stripe pause_collection)", () => {
    assert.equal(
      deriveMembershipDisplayStatus({ status: "paused", isActive: false }),
      "paused"
    );
  });

  await test("terminal cancelled → cancelled (both spellings)", () => {
    assert.equal(
      deriveMembershipDisplayStatus({ status: "cancelled", isActive: false }),
      "cancelled"
    );
    assert.equal(
      deriveMembershipDisplayStatus({ status: "canceled", isActive: false }),
      "cancelled"
    );
  });

  await test("unknown status + inactive → none", () => {
    assert.equal(deriveMembershipDisplayStatus({ status: "whatever", isActive: false }), "none");
    assert.equal(deriveMembershipDisplayStatus({}), "none");
  });

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed`);
    process.exit(1);
  }
  console.log("\nAll membership-display-status tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
