import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";
import { emailFor, E2E_USER_PASSWORD } from "../fixtures/test-users";

// Mutating in the sense that we authenticate within the test (chromium-guest project
// has no storage state — the test drives sign-in itself).
test.describe.configure({ mode: "serial" });

test.describe("login flow", () => {
  test("valid email + password redirects to /my-account", async ({ page }) => {
    const email = emailFor("fresh");

    await page.goto("/login");

    await page.locator(byTestId(testid.loginEmail)).fill(email);
    await page.locator(byTestId(testid.loginPassword)).fill(E2E_USER_PASSWORD);
    await page.locator(byTestId(testid.loginSubmit)).click();

    // The login page redirects via `useEffect` after `signIn()` resolves AND
    // a session refresh completes. Under loaded dev server (UI mode parallelism),
    // this chain can take 20-30s. Generous timeout to avoid flake.
    await page.waitForURL(/\/my-account$/, { timeout: 30_000 });
    await expect(page.locator(byTestId(testid.dashboardRoot))).toBeVisible({
      timeout: 25_000,
    });
  });

  test("wrong password shows visible error and stays on /login", async ({ page }) => {
    const email = emailFor("fresh");

    await page.goto("/login");

    await page.locator(byTestId(testid.loginEmail)).fill(email);
    await page.locator(byTestId(testid.loginPassword)).fill("definitely-wrong-password");
    await page.locator(byTestId(testid.loginSubmit)).click();

    // Error toast/banner — the page renders an inline error below the form on failure.
    await expect(page.getByText(/invalid email or password/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login$/);
  });
});
