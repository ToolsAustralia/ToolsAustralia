// This baseline is a BURN-DOWN list of real product accessibility bugs found by the
// axe lens — see .superpowers/sdd/task-9-report.md for full node-level detail (targets,
// html, contrast ratios, helpUrls) on how each entry below was captured. Every entry
// pins a known, currently-unfixed defect so the suite stays truthfully green while the
// defect is on someone's backlog; it is NOT a way to make an unrelated new violation
// disappear. Removing an entry (because the underlying `src/` bug was fixed) is
// encouraged and expected. Adding a NEW entry requires controller/user signoff first —
// never add one just to silence a fresh failure this suite surfaced.
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "../../fixtures/test";
import { uiAudit } from "../../fixtures/ui-audit";

const PAGES = ["/", "/login", "/membership"];

const KNOWN_VIOLATIONS: Record<string, { ruleId: string; targetPattern: RegExp; bug: string }[]> = {
  "/": [
    {
      ruleId: "color-contrast",
      targetPattern: /corner-ribbon.*MOST POPULAR/,
      bug: "\"MOST POPULAR\" ribbon badge on the home membership card is white-on-gold (~2.19:1, needs 4.5:1) — src/components/sections/membership/ElectricPackageCard.tsx",
    },
    {
      ruleId: "color-contrast",
      targetPattern: /text-3xs|\.underline/,
      bug: "rotating promo-banner text/link is near-white-on-red (~4.36:1, needs 4.5:1) — src/components/promo or src/components/banners",
    },
  ],
  "/login": [
    {
      ruleId: "button-name",
      targetPattern: /\.right-4/,
      bug: "password show/hide toggle button has no accessible name (no text, aria-label, or title) — login form component",
    },
    {
      ruleId: "label",
      targetPattern: /border-/,
      bug: "email input has an empty placeholder and no <label>/aria-label — login form component",
    },
    {
      ruleId: "label",
      targetPattern: /input\[type="checkbox"\]/,
      bug: "remember-me checkbox has no <label>/aria-label — login form component",
    },
  ],
  "/membership": [
    {
      ruleId: "color-contrast",
      targetPattern: /text-3xs|\.underline/,
      bug: "rotating promo-banner text/link is near-red-on-red (~1.05:1, needs 4.5:1) — src/components/promo or src/components/banners",
    },
  ],
};

test.describe("accessibility + ui audit @a11y", () => {
  for (const path of PAGES) {
    test(`axe + uiAudit on ${path}`, async ({ page }, testInfo) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");

      expect(await uiAudit(page)).toEqual([]);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      const baseline = KNOWN_VIOLATIONS[path] ?? [];

      const unknown: string[] = [];
      for (const v of serious) {
        for (const node of v.nodes) {
          const target = node.target.map(String).join(" ");
          const label = `${v.id} @ ${target}`;
          const match = baseline.find((b) => b.ruleId === v.id && b.targetPattern.test(target));
          if (match) {
            testInfo.annotations.push({ type: "known-a11y-bug", description: `${label} — ${match.bug}` });
          } else {
            unknown.push(label);
          }
        }
      }

      expect(unknown, `NEW (unbaselined) axe violations on ${path}`).toEqual([]);
    });
  }
});
