// e2e/toasts/entry-reward.spec.ts
//
// BLOCKED.
//
// The `entry-reward-toast` (testid.entryRewardToast) is fired exclusively
// from the client-side `useEntryRewardToast()` hook, invoked from the
// `onSuccess` callbacks of TanStack Query mutations:
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
// and is well outside the entry-reward toast scope.
//
// The component edit `src/hooks/useEntryRewardToast.ts` was updated to
// stamp `testId: "entry-reward-toast"` onto the toast — once a future
// spec drives a full purchase flow it will be assertable via
// `page.locator(byTestId(testid.entryRewardToast))`.
//
// Per task instructions: "BLOCK if toast trigger is unclear." Mirrors
// the existing `e2e/rewards/milestone-toast.spec.ts` block.

import { test } from "../fixtures/test";

test.skip("entry-reward toast appears after webhook-driven entry grant", () => {
  // Intentionally skipped. See file header for rationale.
});
