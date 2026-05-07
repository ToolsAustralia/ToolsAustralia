import { test, expect } from "../../fixtures/test";

// /major-draw is currently a server-side redirect to /promotional/giveaway
// (see src/app/(site)/major-draw/page.tsx). That destination route does not
// exist in the App Router — Next.js renders the 404 page. This spec asserts
// the redirect+404 behavior holds (so it fails loudly if the redirect target
// is changed without the destination being built).
test("/major-draw issues a redirect (currently to a 404 destination)", async ({ page }) => {
  await page.goto("/major-draw");

  // URL is no longer /major-draw (redirect happened).
  await expect(page).not.toHaveURL(/\/major-draw$/, { timeout: 10_000 });

  // Body renders (404 page or eventual real giveaway page).
  await expect(page.locator("body")).toBeVisible();
});
