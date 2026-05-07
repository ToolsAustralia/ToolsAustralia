// e2e/fixtures/test.ts
//
// Custom Playwright test fixture that picks the correct storageState file
// based on the running worker's index AND the project name. This is the
// SECOND HALF of the per-worker auth fix (auth.setup.ts being the first).
//
// Usage in any spec:
//   import { test, expect } from "../fixtures/test";
// (instead of `from "@playwright/test"`)
//
// Guest specs (chromium-guest project) get no storage state — they're
// unauthenticated. All other chromium-* projects load
// e2e/.auth/<role>-w<workerIndex>.json.
import { test as base, expect } from "@playwright/test";

const ROLE_BY_PROJECT: Record<string, string | null> = {
  "chromium-guest":      null,        // no auth
  "chromium-fresh":      "fresh",
  "chromium-tradie":     "tradie",
  "chromium-foreman":    "foreman",
  "chromium-boss":       "boss",
  "chromium-cancelling": "cancelling",
  "chromium-pastdue":    "pastdue",
  "chromium-affiliate":  "affiliate",
};

export const test = base.extend({
  storageState: async ({}, use, testInfo) => {
    const role = ROLE_BY_PROJECT[testInfo.project.name];
    if (role === null) {
      // Guest project — explicit empty state.
      await use({ cookies: [], origins: [] });
      return;
    }
    if (role === undefined) {
      // Setup projects or anything else — fall back to base default.
      await use(testInfo.project.use.storageState ?? { cookies: [], origins: [] });
      return;
    }
    // Use parallelIndex (always 0..N-1) not workerIndex (globally incrementing
    // when workers respawn after a failed test). Storage state files are seeded
    // for indices 0..workerCount()-1, so parallelIndex is what we need.
    await use(`e2e/.auth/${role}-w${testInfo.parallelIndex}.json`);
  },

  // Auto-block Klaviyo network requests AND strip the popup form from DOM.
  // Klaviyo's signup popup ("POPUP Form" dialog) intercepts pointer events
  // on shop/landing pages and breaks every spec that clicks anything below
  // it. Block at network level (so the script never loads) AND wipe any
  // already-rendered dialog from DOM defensively.
  context: async ({ context }, use) => {
    await context.route(
      /static\.klaviyo\.com|.*\.klaviyo\.com\/.*/i,
      (route) => route.abort(),
    );
    await context.addInitScript(() => {
      // Strip Klaviyo popups whenever they appear (mutation observer).
      const strip = () => {
        document
          .querySelectorAll('[class*="kl-private-reset-css"], [aria-label="POPUP Form"]')
          .forEach((el) => el.remove());
      };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", strip);
      } else {
        strip();
      }
      new MutationObserver(strip).observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    });
    await use(context);
  },
});

export { expect };
