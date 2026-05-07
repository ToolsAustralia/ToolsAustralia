// e2e/membership/explainer-modal.spec.ts
//
// SubscriptionExplainerModal auto-opens once per account on the dashboard
// for active subscribers (~2.5s after mount). Storage key:
//   subscriptionExplainerSeen_<userId>
//
// BLOCKED: clearing the localStorage key + sessionStorage flags + reloading
// did NOT cause the modal to render in the test environment. The trigger
// path has many state gates (UserSetupModal, modal queue, dashboard landing
// orchestration cooldown, accumulator data) and at least one returns early
// against test fixture state. Investigation: the trigger is a setTimeout(2500ms)
// inside a useEffect that also depends on `useResolvedMultiplier` resolving;
// in the test env, accountData.user?.subscription?.lastMonthAccumulatedEntries
// is likely undefined or the gating accountData.user.subscription.isActive is
// not yet truthy at the moment the effect runs.
//
// To unblock, the test would need: (a) a deterministic trigger API, OR
// (b) waiting for a network idle + giving 5s+ for orchestration to settle, OR
// (c) seeding the fixture with explicit lastMonthAccumulatedEntries.
// Marked BLOCKED rather than ship a flaky spec.

import { test } from "../fixtures/test";

test.describe("subscription explainer modal", () => {
  test.skip(
    "BLOCKED — auto-trigger path has state gates that fixture seed does not satisfy; needs investigation",
    async () => {
      // Intentionally empty.
    },
  );
});
