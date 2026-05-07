import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";

// IMPORTANT: PixelConsentModal is intentionally inert outside production.
// - `usePixelConsent()` only sets `showConsent=true` when `process.env.NODE_ENV === "production"`.
//   (src/components/modals/PixelConsentModal.tsx line ~190)
// - `UnifiedModalManager` hardcodes `<PixelConsentModal isOpen={false} />` for the "pixel-consent"
//   priority slot. (src/components/modals/UnifiedModalManager.tsx line ~211)
// - `PixelTracker` auto-grants on mount and writes `localStorage["pixel-consent"]="accepted"`,
//   `revokePixelConsent()` is a no-op, `hasPixelConsent()` always returns true.
//   (src/components/PixelTracker.tsx)
//
// So under `npm run dev` (NODE_ENV=development) the modal cannot reach the visible state through
// any normal user path. We test the actual product behaviour: auto-grant + no blocking modal.

test.describe("pixel consent (auto-accept mode)", () => {
  test.beforeEach(async ({ context }) => {
    // Clear cookies + storage so we land on the page as a brand-new visitor.
    await context.clearCookies();
  });

  test("home renders without the pixel-consent modal blocking the user (auto-accept)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Modal must NOT be present — the consent UI is suppressed in non-production
    // and the UnifiedModalManager slot is hardcoded to isOpen=false anyway.
    await expect(page.locator(byTestId(testid.pixelConsentModal))).toHaveCount(0);
  });

  test("PixelTracker auto-grants consent and writes the localStorage flag", async ({ page }) => {
    await page.goto("/");

    // PixelTracker mounts in the root layout and immediately calls
    // `localStorage.setItem("pixel-consent", "accepted")`. Wait for it.
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("pixel-consent")), { timeout: 5_000 })
      .toBe("accepted");

    // Reload — the flag persists (it's localStorage, not session) and no modal re-shows.
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    expect(await page.evaluate(() => localStorage.getItem("pixel-consent"))).toBe("accepted");
    await expect(page.locator(byTestId(testid.pixelConsentModal))).toHaveCount(0);
  });
});
