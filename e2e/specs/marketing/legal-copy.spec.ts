import { test, expect } from "../../fixtures/test";

// CLAUDE.md §11 (LEGAL): Tools Australia is a game-of-chance trade promotion, not gambling,
// and entries are never sold — they are a free inclusion with a membership or pack purchase.
// This spec scans rendered marketing page body text for banned gambling/sold-entry vocabulary.
// Do NOT weaken these regexes, drop a page from PAGES, or skip this test to make it pass —
// a genuine hit here is a real legal-exposure finding that must be escalated, not silenced.
const BANNED_COPY: RegExp[] = [
  /\bodds\b/i,
  /chances? of winning/i,
  /boost your chances?/i,
  /increase your chances?/i,
  /better odds/i,
  /\blotter(y|ies)\b/i,
  /\blotto\b/i,
  /\braffles?\b/i,
  /\bsweepstakes?\b/i,
  /\bgambl(e|ing)\b/i,
  /\bper entry\b/i,
  /\$\d+(\.\d+)?\s*(\/|per)\s*entr(y|ies)/i,
  // Word-bounded so it does NOT match "better" (\bbet\b would still match "bet" inside
  // "betting" only via the (s|ting)? suffix group, not "better" — "better" has no word
  // boundary after "bet").
  /\bbet(s|ting)?\b/i,
  // Entries are a free inclusion, never sold — see CLAUDE.md §11.2.
  /\b(buy|purchase|pay for)\s+(an? )?entr(y|ies)\b/i,
];

// The rewards-return banner's copy renders ONLY with the portal params, so the bare
// /membership entry never scans it (panel F-023). offer_id 1064993 = Amazon.com.au
// eGift Card (100%) — a guest hits the "unlocks at 100% access" state.
const PAGES = [
  "/",
  "/membership",
  "/membership?utm_campaign=rewards-return&offer_id=1064993",
  "/mini-draws",
];

test.describe("legal copy guard @smoke", () => {
  for (const path of PAGES) {
    test(`no gambling/sold-entry framing on ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      // The rewards-return banner paints a SKELETON first and its copy only exists once
      // useDashboardState settles — `networkidle` can land before that, in which case the
      // scan reads no banner text at all, still finds "free entries" elsewhere on the
      // page, and passes green having covered nothing (panel F-037: a silent pass, never
      // red, so nobody notices). Gate on the skeleton clearing AND on the headline being
      // present, so an empty scan fails loudly instead.
      if (path.includes("utm_campaign=rewards-return")) {
        const banner = page.locator("section", { hasText: "Partner catalogue" }).first();
        await expect(banner).toBeVisible({ timeout: 60_000 });
        await expect(banner).not.toHaveAttribute("aria-busy", "true", { timeout: 60_000 });
        await expect(page.getByText(/unlocks at \d+% access\./)).toBeVisible({ timeout: 30_000 });
      }
      const text = await page.locator("body").innerText();
      const hits = BANNED_COPY.filter((rx) => rx.test(text)).map(String);
      expect(hits, `Banned copy found on ${path}: ${hits.join(", ")}`).toEqual([]);
      expect(text).toMatch(/free entr(y|ies)/i); // positive framing must be present
    });
  }
});
