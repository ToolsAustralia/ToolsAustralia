// e2e/modal-queue/renewal-failed-auto-open.spec.ts
//
// Verifies that RenewalFailedModal auto-opens on /my-account when the
// authenticated user is past_due. This is the spec-of-record for the
// modal-queue domain's auto-open path.
//
// NOTE: `e2e/membership/renewal-failed.spec.ts` covers the SAME behaviour
// from the membership domain's perspective. Per the modal-queue domain
// instructions ("duplicates — keep the simpler version and skip the other"),
// the membership/renewal-failed.spec.ts version is kept and this entry is
// a pointer.
//
// Note also: the spec would run on `chromium-pastdue` (the past_due fixture
// project) rather than `chromium-fresh` — the fresh user is not past_due so
// the modal would never auto-open against that storageState.

import { test } from "../fixtures/test";

test.describe("renewal failed modal auto-open", () => {
  test.skip(
    "DUPLICATE — covered by e2e/membership/renewal-failed.spec.ts (chromium-pastdue project)",
    async () => {
      // Intentionally empty.
    },
  );
});
