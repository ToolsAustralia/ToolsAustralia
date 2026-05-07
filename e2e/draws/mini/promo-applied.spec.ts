import { test, expect } from "../../fixtures/test";

// BLOCKED: no active Promo seeded in test DB (verified via DB probe at spec
// authoring time). Without a live promo slug + active multiplier window, the
// mini-draw promo flow cannot be exercised end-to-end. Spec records the
// blocker invariant so it surfaces in reports.
test("mini-draw promo multiplier flow (BLOCKED — no seeded active promo)", async ({ page }) => {
  await page.goto("/mini-draws");
  await expect(page.locator("body")).toBeVisible();

  test.info().annotations.push({
    type: "blocked",
    description:
      "No active Promo documents in test DB. Restoring this spec requires (a) seeding an active Promo with multiplier > 1 in scripts/seed-e2e-fixtures.ts, (b) wiring the promo slug into a mini-draw entry purchase walk, (c) asserting the multiplier-applied banner / entry count.",
  });

  test.skip();
});
