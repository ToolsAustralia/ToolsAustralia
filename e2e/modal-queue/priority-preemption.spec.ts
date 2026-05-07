// e2e/modal-queue/priority-preemption.spec.ts
//
// Verifies the modal priority queue's preemption + restore behaviour:
//   - low-priority modal opens
//   - high-priority modal preempts it (low is queued)
//   - closing high-priority restores the low one from the queue
//
// BLOCKED — `useModalPriorityStore` (Zustand store at
// src/stores/useModalPriorityStore.ts) is NOT exposed on `window` anywhere in
// production code. Calling `useModalPriorityStore.getState().requestModal(...)`
// from `page.evaluate` would require either:
//   (a) production code to expose the store globally (a refactor, disallowed
//       by the writing-playwright-spec skill rules), or
//   (b) driving each modal through its real production trigger path — but the
//       priority modals (upsell, user-setup, special-packages, gate-closed,
//       renewal-failed) each have very different triggers (sessionStorage
//       handoff, fixture state, profile flag, draw seeding, past_due
//       subscription) and there is no reliable way to fire two of them in
//       quick succession from a deterministic baseline.
//
// The unit-level behaviour (queue ordering, preemption, restore) is store
// logic and should be covered by a tsx unit test, not an E2E spec.

import { test } from "../fixtures/test";

test.describe("modal priority preemption", () => {
  test.skip(
    "BLOCKED — useModalPriorityStore is not globally exposed; cannot drive requestModal from page.evaluate",
    async () => {
      // Intentionally empty.
    },
  );
});
