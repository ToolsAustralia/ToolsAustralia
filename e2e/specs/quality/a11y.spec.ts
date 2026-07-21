import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "../../fixtures/test";
import { uiAudit } from "../../fixtures/ui-audit";

const PAGES = ["/", "/login", "/membership"];

test.describe("accessibility + ui audit @a11y", () => {
  for (const path of PAGES) {
    test(`axe + uiAudit on ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");

      expect(await uiAudit(page)).toEqual([]);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(
        serious.map((v) => `${v.id}: ${v.nodes.length} node(s) — ${v.help}`),
        `axe violations on ${path}`
      ).toEqual([]);
    });
  }
});
