// e2e/url-params/oauth-redirect.spec.ts
//
// /oauth-redirect (src/app/oauth-redirect/page.tsx) reads ?provider, ?csrfToken,
// ?callbackUrl from the URL, builds a hidden <form> POSTing to
// /api/auth/signin/<provider>, and auto-submits it.
//
// NARROWED per the e2e plan amendments (line ~1672): we cannot follow the
// Google OAuth flow headlessly, so this spec asserts only that the page
// posts to the correct NextAuth endpoint with the supplied csrfToken. We
// intercept the POST so the test stays inside our origin.

import { test, expect } from "../fixtures/test";

test("oauth-redirect posts to /api/auth/signin/<provider> with csrfToken", async ({ page }) => {
  // Intercept the POST so we never actually hit Google's OAuth flow. We capture
  // the request, then short-circuit it with a 200 so the page stops navigating.
  const postPromise = page.waitForRequest(
    (req) =>
      req.method() === "POST" && req.url().endsWith("/api/auth/signin/google"),
    { timeout: 10_000 },
  );

  await page.route("**/api/auth/signin/google", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html><body>intercepted</body></html>",
    });
  });

  await page.goto(
    `/oauth-redirect?provider=google&csrfToken=test-csrf-token-123&callbackUrl=%2Fmy-account`,
  );

  const postRequest = await postPromise;
  expect(postRequest.url()).toMatch(/\/api\/auth\/signin\/google$/);

  // Verify the POST body carried the csrfToken and callbackUrl form fields.
  const postData = postRequest.postData() ?? "";
  expect(postData).toContain("csrfToken=test-csrf-token-123");
  expect(postData).toContain("callbackUrl=");
});
