import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "../../fixtures/test";

test.describe("lens self-tests", () => {
  test("watchdog fails a test that console.errors", async ({ page }) => {
    test.fail(); // this test MUST fail via the watchdog — test.fail inverts it
    await page.goto("/");
    await page.evaluate(() => console.error("e2e watchdog self-test"));
  });

  test("axe detects a seeded violation", async ({ page }) => {
    await page.setContent('<html><body><img src="x.png"></body></html>');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => v.id)).toContain("image-alt");
  });
});
