// e2e/modal-queue/special-packages-substitution.spec.ts
//
// Verifies the UnifiedModalManager substitution effect (lines 92-109 of
// src/components/modals/UnifiedModalManager.tsx): when "special-packages" is
// requested but currentMajorDraw.status !== "active", the manager swaps in
// the gate-closed modal instead.
//
// Two pieces would be needed and BOTH are blocked:
//
//   1. A deterministic way to fire `requestModal("special-packages")` from
//      the spec. The Zustand store `useModalPriorityStore` is NOT exposed on
//      `window` in production code, so `page.evaluate` cannot call it. The
//      production trigger (`useMajorDrawEntryCta`) is gated on having
//      additional-package access (active subscription OR existing draw
//      entries) — see the existing `e2e/membership/special-packages.spec.ts`
//      which BLOCKED for exactly this reason.
//
//   2. A way to force currentMajorDraw to be non-active. Possible via
//      `page.route("**/api/major-draw", ...)` returning `{ status: "completed" }`,
//      but useless without (1).
//
// Both gaps would require production refactors disallowed by the
// writing-playwright-spec skill rules (no production code changes beyond
// adding data-testid attributes). Mark BLOCKED and surface to caller.

import { test } from "../fixtures/test";

test.describe("special-packages -> gate-closed substitution", () => {
  test.skip(
    "BLOCKED — modal store not globally exposed AND fresh fixture lacks additional-package access",
    async () => {
      // Intentionally empty.
    },
  );
});
