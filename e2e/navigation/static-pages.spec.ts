import { test, expect } from "../fixtures/test";

// The static legal/info pages: confirmed to exist via Glob at
// src/app/(site)/{faq,terms,privacy,competition-term-majordraw}/page.tsx.
//
// Note: not every static page renders a literal <h1> (terms/privacy use a styled
// <p> for their title; FAQ wraps content in <div>s rather than <main>; only
// competition-term-majordraw has both). So we assert each page returns 200, the
// URL didn't redirect, and the site footer hydrates as a visibility smoke test.
const STATIC_URLS = ["/faq", "/terms", "/privacy", "/competition-term-majordraw"] as const;

test.describe("static pages", () => {
  for (const url of STATIC_URLS) {
    test(`${url} loads successfully`, async ({ page }) => {
      const response = await page.goto(url);

      expect(response, `navigation to ${url} should not be null`).not.toBeNull();
      const status = response!.status();
      expect(status, `${url} should not 404 / 5xx`).toBeLessThan(400);

      // After client hydration, the URL should match the requested path (no
      // silent redirect to /404 or similar).
      expect(page.url(), `${url} should not redirect`).toContain(url);

      // Footer is part of the (site) layout; its presence confirms hydration.
      await expect(page.locator("footer").first()).toBeVisible({ timeout: 5_000 });
    });
  }
});
