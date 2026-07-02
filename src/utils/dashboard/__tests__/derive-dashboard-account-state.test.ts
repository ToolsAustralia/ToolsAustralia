import assert from "node:assert";
import { deriveDashboardAccountState } from "../derive-dashboard-account-state";

const base = { hasActiveMembership: false, isPastDue: false, hasActiveOneTime: false };

assert.strictEqual(deriveDashboardAccountState({ ...base }), "none");
assert.strictEqual(deriveDashboardAccountState({ ...base, hasActiveMembership: true }), "active");
assert.strictEqual(deriveDashboardAccountState({ ...base, hasActiveOneTime: true }), "onetime");

// past-due dominates even for an otherwise-active member
assert.strictEqual(
  deriveDashboardAccountState({ ...base, hasActiveMembership: true, isPastDue: true }),
  "pastdue",
);
// one-time holder that is also past-due on a lapsed sub → pastdue wins
assert.strictEqual(
  deriveDashboardAccountState({ ...base, hasActiveOneTime: true, isPastDue: true }),
  "pastdue",
);
// active membership beats a coexisting one-time pack
assert.strictEqual(
  deriveDashboardAccountState({ ...base, hasActiveMembership: true, hasActiveOneTime: true }),
  "active",
);

console.log("derive-dashboard-account-state: PASS");
