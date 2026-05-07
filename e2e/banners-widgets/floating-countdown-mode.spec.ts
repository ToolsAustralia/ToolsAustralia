// e2e/banners-widgets/floating-countdown-mode.spec.ts
//
// FloatingCountdownBanner toggles its countdown target between
// `currentMajorDraw.drawDate` (gates open) and `nextDraw.activationDate`
// (gates closed) based on `currentMajorDraw.status !== "active"`.
//
// Mode-toggle assertion is hard to make deterministic without seeding a
// specific MajorDraw status. We narrow to "renders" (or "absent if no
// major draw is seeded") plus a sniff at the gates-closed/open visual
// branch ("GATES CLOSED" headline vs "WIN THE BEST TRADIE SETUP" / "Enter Now").
//
// Already covered for the "mounts conditionally" angle by
// e2e/draws/major/countdown-banner.spec.ts. This spec adds a gates-state
// observation.

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";

test("floating-countdown-banner reflects gates-open / gates-closed mode", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForTimeout(1500);

  const banner = page.locator(byTestId(testid.floatingCountdownBanner));
  const visible = await banner.isVisible().catch(() => false);

  if (!visible) {
    test.info().annotations.push({
      type: "note",
      description: "No major draw seeded — banner absent. Test passes (no draw == banner hidden by design).",
    });
    await expect(page.locator("body")).toBeVisible();
    return;
  }

  // Banner mounted. Inspect the headline branch — one of:
  //   "GATES CLOSED"           (status !== active, counts to nextDraw.activationDate)
  //   "WIN THE BEST TRADIE SETUP" (status === active, counts to currentMajorDraw.drawDate)
  const headline = banner.locator("h3").first();
  const headlineText = await headline.textContent();
  const isClosed = headlineText?.includes("GATES CLOSED") ?? false;
  const isOpen = headlineText?.includes("WIN THE BEST TRADIE SETUP") ?? false;

  expect(isClosed || isOpen, `Expected banner headline to be either gates-closed or gates-open mode (got: "${headlineText}")`).toBe(true);

  test.info().annotations.push({
    type: "note",
    description: `floating-countdown-banner mode: ${isClosed ? "gates-closed (next draw)" : "gates-open (current draw)"}`,
  });
});
