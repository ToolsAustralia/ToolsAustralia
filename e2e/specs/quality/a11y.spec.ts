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

/**
 * Anchored, regex-escaped exact match against one literal axe target string (the
 * verbatim `node.target.join(" ")` value captured from a real scan — see
 * .superpowers/sdd/task-9-report.md). Anchoring with ^...$ means a longer/different
 * future selector that merely CONTAINS this text (e.g. a fragment embedded in a bigger
 * chain) will NOT match — only the exact same target string does.
 */
function exact(literalTarget: string): RegExp {
  const escaped = literalTarget.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}$`);
}

/** Same as exact(), but matches any one of several literal target strings. */
function exactAny(literalTargets: string[]): RegExp {
  const escaped = literalTargets.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^(?:${escaped.join("|")})$`);
}

// All 4 previously-tracked violations (password-toggle button-name, email + remember-me
// label, "MOST POPULAR" ribbon contrast, rotating promo-banner contrast) were fixed and
// verified clear — see docs/e2e/a11y-baseline.md's "Fixed" section for the per-fix detail.
// The map stays empty (not deleted) so the burn-down pattern is ready for the next real
// finding — see the file-top comment for the rules.
const KNOWN_VIOLATIONS: Record<string, { ruleId: string; targetPattern: RegExp; bug: string }[]> = {};

test.describe("accessibility + ui audit @a11y", () => {
  for (const path of PAGES) {
    test(`axe + uiAudit on ${path}`, async ({ page }, testInfo) => {
      test.skip(
        testInfo.project.name !== "chromium-desktop",
        "a11y baseline is captured on chromium-desktop; mobile baselining is a planned expansion"
      );

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
