// e2e/banners-widgets/freeze-period-banner.spec.ts
//
// BLOCKED.
//
// `FreezePeriodBanner` (`src/components/banners/FreezePeroidBanner.tsx`)
// is defined as a presentational component with required props
// (nextDrawName, timeUntilDraw, status), but no production code path in
// `src/` actually mounts it. Grep across `src/` shows the file is the
// ONLY consumer of itself — there is no parent that imports + renders the
// banner conditional on a frozen MajorDraw.
//
// Asserting "the banner renders when frozen" therefore has no DOM target
// to attach to. To make this spec meaningful we would need to either:
//   1) Add a parent (e.g. in the (site) layout or my-account dashboard)
//      that mounts FreezePeriodBanner when currentMajorDraw.status ===
//      "frozen". That is a product change and out-of-scope per task
//      instructions.
//   2) Seed a frozen draw AND have a consumer to render it (same blocker).
//
// Per task instructions: "BLOCK if requires DB seed of frozen draw."
// Surface to the caller. The testid registry already reserves
// `testid.freezePeriodBanner` for when this banner is wired up.

import { test } from "../fixtures/test";

test.skip("freeze-period-banner renders during frozen period", () => {
  // Intentionally skipped. FreezePeriodBanner is unmounted from the
  // production tree as of 2026-05-05. See file header for rationale.
});
