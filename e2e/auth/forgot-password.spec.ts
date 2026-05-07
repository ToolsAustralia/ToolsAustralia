import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";
import { withFreshMember, getDb } from "../fixtures/seed-helpers";
import bcrypt from "bcryptjs";

// /api/auth/request-password-reset rate-limits at 1 request per 5 minutes per email.
// We use withFreshMember() so each run gets a unique email and the limiter never
// blocks. Per the spec contract we deliberately skip the rate-limit assertion to
// avoid polluting other auth specs that share the limiter.
test.describe.configure({ mode: "serial" });

let testEmail: string;
let cleanup: () => Promise<void>;

test.beforeAll(async () => {
  const fresh = await withFreshMember();
  testEmail = fresh.email;
  cleanup = fresh.cleanup;

  // Create the user directly (withFreshMember only reserves an email).
  const { User } = await getDb();
  const passwordHash = await bcrypt.hash("Test_Password_123!", 12);
  await User.create({
    firstName: "Forgot",
    lastName: "Tester",
    email: testEmail,
    password: passwordHash,
    isEmailVerified: true,
    profileSetupCompleted: true,
    isActive: true,
  });
});

test.afterAll(async () => {
  await cleanup();
});

test("forgot-password link from /login navigates to /reset-password and submits", async ({ page }) => {
  await page.goto("/login");
  await page.locator(byTestId(testid.forgotPasswordLink)).click();

  await expect(page).toHaveURL(/\/reset-password(\?|$)/);
  await expect(page.locator(byTestId(testid.resetPasswordEmail))).toBeVisible();

  await page.locator(byTestId(testid.resetPasswordEmail)).fill(testEmail);

  // Capture the API response — assert 2xx without asserting the toast text
  // (the toast is portal-rendered with race-prone visibility timing).
  const responsePromise = page.waitForResponse((r) =>
    r.url().includes("/api/auth/request-password-reset") && r.request().method() === "POST",
  );
  await page.locator(byTestId(testid.resetPasswordSubmit)).click();
  const response = await responsePromise;
  expect(response.status()).toBeGreaterThanOrEqual(200);
  expect(response.status()).toBeLessThan(300);

  // Success toast is dispatched on 2xx — visible briefly.
  await expect(page.getByText(/email sent|check your inbox/i).first()).toBeVisible({ timeout: 5_000 });
});
