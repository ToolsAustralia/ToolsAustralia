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
  // The shop sells a garment whose entries are a free inclusion, so it carries the
  // same rule-11 exposure as every page above — and it was NOT scanned until
  // 2026-08-17. A per-entry price written on a product page would have passed
  // every automated guard in the repo purely because this list did not mention it.
  "/shop",
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

  // The mini-draw DETAIL route, reached by navigation rather than a hard-coded id
  // because ids differ per environment.
  //
  // WHY THIS TEST EXISTS. On 2026-08-12 (ade906ab) the detail page shipped
  // `$1 / "Per entry"` in its mobile key-facts strip, and its desktop hero shipped
  // `$1 / "Entry"`. Both sat in production for 23 days. BANNED_COPY already contained
  // /\bper entry\b/i — the regex was never the problem. PAGES listed /mini-draws but
  // not the detail route underneath it, so nothing ever scanned the page. The comment
  // above /shop warns about precisely this failure mode; it then happened again on a
  // different route.
  //
  // The strip is inside `lg:hidden`, so a desktop-only run would not have caught it
  // either. This spec must keep running on at least one mobile project.
  test("no gambling/sold-entry framing on a mini-draw detail page", async ({ page }) => {
    await page.goto("/mini-draws");
    await page.waitForLoadState("networkidle");

    const firstDraw = page.locator('a[href^="/mini-draws/"]').first();
    // Fail loudly rather than vacuously pass. A detail page that cannot be reached is
    // a page that was not scanned, and "green because there was nothing to look at" is
    // the exact failure this file already documents at F-037.
    await expect(
      firstDraw,
      "No mini-draw detail link found on /mini-draws — the detail route went unscanned. " +
        "If the target environment genuinely has no mini draws, that is worth knowing; " +
        "do NOT relax this into a skip."
    ).toBeVisible({ timeout: 30_000 });

    // Read the href and navigate directly rather than clicking. Clicking a Next.js
    // <Link> is a SOFT navigation: no document load, so waitForLoadState("networkidle")
    // resolves while the RSC payload is still in flight and the scan reads a page that
    // is only banner + footer. A real goto is deterministic, and matches what a visitor
    // arriving on the URL actually gets.
    const href = await firstDraw.getAttribute("href");
    expect(href, "mini-draw card had no href").toBeTruthy();
    await page.goto(href!);
    await page.waitForLoadState("networkidle");

    const text = await page.locator("body").innerText();

    // Prove the detail CONTENT rendered before trusting the scan. Without this, a page
    // that is only header + footer chrome fails on the positive "free entries"
    // assertion with a confusing message — or worse, passes the banned-copy check
    // having looked at nothing. Same reasoning as the rewards-banner gate above (F-037).
    //
    // Asserted against innerText, NOT element visibility. The key-facts strip is
    // `lg:hidden` (mobile only) while the hero card is `hidden sm:flex` (desktop only),
    // so a locator matching both resolves .first() to whichever is hidden in the
    // current viewport and fails for the wrong reason. innerText already excludes
    // hidden nodes, so it reads exactly what this viewport shows.
    expect(
      text,
      `The mini-draw detail page at ${page.url()} rendered no draw content — only page ` +
        `chrome. The scan would have covered nothing. Check the target environment has an ` +
        `active mini draw, and that the request was not rate-limited or error-paged.`
    ).toMatch(/entries left|filled|mini pack/i);
    const hits = BANNED_COPY.filter((rx) => rx.test(text)).map(String);
    expect(hits, `Banned copy found on ${page.url()}: ${hits.join(", ")}`).toEqual([]);
    expect(text).toMatch(/free entr(y|ies)/i);
  });
});
