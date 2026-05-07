import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";

// Theme is persisted to localStorage under "ta-theme" by useThemeStore (Zustand persist).
// The root layout has an inline script that applies the persisted theme before React
// hydrates, so a reload/navigation reapplies the dark class immediately.

test.describe.configure({ mode: "serial" });

test.describe("theme toggle", () => {
  test.beforeEach(async ({ page }) => {
    // Pre-seed a manual-override "light" baseline. autoThemeEnabled:false plus
    // userManualOverride:true short-circuits useAutoTheme so the Sydney clock
    // can't yank the theme back between the click and the assertion (which
    // races against `useAutoTheme`'s setTheme on first mount).
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem(
        "ta-theme",
        JSON.stringify({
          state: {
            theme: "light",
            autoThemeEnabled: false,
            userManualOverride: true,
            overrideTimestamp: Date.now(),
          },
          version: 0,
        })
      );
    });
    await page.reload();
  });

  test("clicking the toggle flips html.dark and persists across navigation", async ({ page }) => {
    const toggle = page.locator(byTestId(testid.themeToggleButton)).first();
    await expect(toggle).toBeVisible({ timeout: 5_000 });

    // Capture initial dark state once useAutoTheme has finished settling.
    // The hook can override the seeded `light` value to whatever the Sydney
    // schedule says on first paint; wait for that effect to land first.
    await page.waitForTimeout(500);
    const initialDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));

    await toggle.click();

    // Class flips on <html>.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")), {
        timeout: 5_000,
      })
      .toBe(!initialDark);

    // Theme is persisted to localStorage with the toggled value.
    const persistedAfterToggle = await page.evaluate(() => localStorage.getItem("ta-theme"));
    expect(persistedAfterToggle).toBeTruthy();
    const parsed = JSON.parse(persistedAfterToggle!);
    expect(parsed.state.theme).toBe(initialDark ? "light" : "dark");

    // Navigate to another route — the inline boot script in layout.tsx reapplies
    // the persisted theme before React hydrates, so the dark class persists.
    await page.goto("/shop");
    const darkAfterNav = await page.evaluate(() =>
      document.documentElement.classList.contains("dark")
    );
    expect(darkAfterNav).toBe(!initialDark);
  });
});
