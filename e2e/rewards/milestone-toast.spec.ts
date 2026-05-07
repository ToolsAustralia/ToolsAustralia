// e2e/rewards/milestone-toast.spec.ts
//
// BLOCKED.
//
// The `entry-reward-toast` (testid.entryRewardToast) is fired exclusively
// from the client-side `useEntryRewardToast()` hook, invoked from the
// `onSuccess` callbacks of three TanStack Query mutations:
//   - useMiniDrawQueries  (mini-draw purchase)
//   - useMajorDrawQueries (major-draw purchase)
//   - useSubscriptionQueries (subscription renewal)
//
// It is NOT wired to any Stripe webhook side-effect. Posting a webhook
// via `postWebhook(...)` updates the DB but does not cause the hook to
// fire — the hook only runs when the corresponding mutation completes
// IN THE BROWSER. To produce the toast deterministically from a spec we
// would need to drive a full purchase flow end-to-end (Stripe Element +
// 3DS + webhook), which is already covered by the membership/draws specs
// and is well outside the milestone-toast scope.
//
// Per task instructions: "BLOCK if too complex." Surface to the caller.

import { test } from "../fixtures/test";

test.skip("milestone toast appears after webhook-driven entry grant", () => {
  // Intentionally skipped. See file header for rationale.
});
