// e2e/affiliate/login.spec.ts
//
// Affiliate portal login form. Runs under chromium-guest (no storageState).
// Uses the seeded affiliate "affiliate-e2e-w<parallelIndex>" + shared E2E
// password. Asserts redirect to /affiliate and that the affiliate_token
// cookie is set on the response.

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";
import { E2E_USER_PASSWORD } from "../fixtures/test-users";

test("affiliate can log in via /affiliate/login and lands on dashboard", async ({
  page,
  context,
}, testInfo) => {
  test.skip(!E2E_USER_PASSWORD, "E2E_TEST_USER_PASSWORD not set");

  const username = `affiliate-e2e-w${testInfo.parallelIndex}`;

  await page.goto("/affiliate/login");

  await page.locator(byTestId(testid.affiliateLoginUsername)).fill(username);
  await page.locator(byTestId(testid.affiliateLoginPassword)).fill(E2E_USER_PASSWORD);
  await page.locator(byTestId(testid.affiliateLoginSubmit)).click();

  await page.waitForURL("/affiliate", { timeout: 15_000 });

  // affiliate_token is set httpOnly so it shows up in the cookie jar
  const cookies = await context.cookies();
  const tokenCookie = cookies.find((c) => c.name === "affiliate_token");
  expect(tokenCookie?.value).toBeTruthy();
});
