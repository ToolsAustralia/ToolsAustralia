import { test, expect } from "../fixtures/test";

// Footer link sanity check. We don't HTTP-fetch every href (too slow + brittle
// for external social links) — we just assert the href shapes look sane.
test.describe("footer links", () => {
  test("every footer anchor has a non-empty, recognizable href", async ({ page }) => {
    await page.goto("/");

    // Wait for footer to be hydrated/visible before scraping.
    const footer = page.locator("footer").first();
    await expect(footer).toBeVisible({ timeout: 5_000 });

    const anchors = await footer.locator("a[href]").all();
    expect(anchors.length, "footer should expose at least one link").toBeGreaterThan(0);

    for (const anchor of anchors) {
      const href = await anchor.getAttribute("href");
      expect(href, "href attribute should be present").not.toBeNull();
      expect(href!.length, "href should be non-empty").toBeGreaterThan(0);

      // Accept relative (/...), absolute https://, mailto:, tel:, or fragment (#...).
      // Everything in Footer.tsx falls into one of these buckets.
      expect(
        href!,
        `href "${href}" should look like a valid link target`,
      ).toMatch(/^(\/|https?:\/\/|mailto:|tel:|#)/);
    }
  });
});
