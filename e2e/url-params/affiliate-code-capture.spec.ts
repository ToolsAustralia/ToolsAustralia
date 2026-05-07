// e2e/url-params/affiliate-code-capture.spec.ts
//
// useAffiliateLink (src/hooks/useAffiliateLink.ts) is mounted site-wide via
// AffiliateTracker in src/app/providers.tsx. When ?aff=XXX is in the URL the
// hook normalizes (trim + uppercase) and writes it to sessionStorage under
// the key "affiliate_code". Spec asserts that capture happens on any page
// load — using a stable, lightweight route so we don't depend on heavy data.

import { test, expect } from "../fixtures/test";

const STORAGE_KEY = "affiliate_code";
const TEST_CODE = "e2e-aff-code";

test("aff query param is captured into sessionStorage on landing", async ({ page }) => {
  await page.goto(`/?aff=${TEST_CODE}`);

  // Hook runs in a useEffect after hydration — poll until sessionStorage settles.
  await expect
    .poll(
      async () =>
        page.evaluate(
          (key) => window.sessionStorage.getItem(key),
          STORAGE_KEY,
        ),
      { timeout: 10_000 },
    )
    .toBe(TEST_CODE.toUpperCase());
});
