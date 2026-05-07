// e2e/global-ui/search-overlay.spec.ts
//
// BLOCKED: the mobile search overlay state (`isSearchOpen`) exists in
// Header.tsx (line 92) and the overlay JSX renders when true (line 1138),
// but NOTHING in the codebase ever calls `setIsSearchOpen(true)`. There is
// no search trigger button in the header, mobile menu, or anywhere else
// that can open the overlay from a user action.
//
// Verified via: `grep -rn "setIsSearchOpen(true)" src/` => no matches.
//
// The overlay is dead code from the consumer perspective. Until a search
// trigger is added (e.g., a Search icon button next to Cart), this flow is
// not testable.
import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";

test.use({ viewport: { width: 390, height: 844 } });

test.skip("mobile search overlay opens via search trigger and chip auto-submits", async ({ page }) => {
  // Intentionally skipped — see file header. Spec scaffold left in place so
  // it can be wired up the moment a search trigger button is added.
  await page.goto("/");
  // const trigger = page.getByRole("button", { name: /search/i });
  // await trigger.click();
  await expect(page.locator(byTestId(testid.headerSearchOverlay))).toBeVisible();
  await page.getByRole("button", { name: /power tools/i }).click();
  await expect(page).toHaveURL(/q=Power\+Tools/);
});
