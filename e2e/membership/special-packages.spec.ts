// e2e/membership/special-packages.spec.ts
//
// SpecialPackagesModal can only be deterministically triggered by
// requestModal("special-packages") via useMajorDrawEntryCta when the user
// has additional package access (active sub OR existing draw entries).
// Fresh fixture has neither, so the trigger path is gated.
//
// Furthermore: UnifiedModalManager intercepts and substitutes
// special-packages -> gate-closed when no major draw is "active". The fresh
// seed does not guarantee an active major draw.
//
// BLOCKED — needs both (a) eligible fixture and (b) active major draw seeded.
// Not feasible without additional fixture infra.

import { test } from "../fixtures/test";

test.describe("special packages modal", () => {
  test.skip(
    "BLOCKED — fresh fixture lacks additional-package access AND active major draw seeding required",
    async () => {
      // Intentionally empty.
    },
  );
});
