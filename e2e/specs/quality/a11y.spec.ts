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

const KNOWN_VIOLATIONS: Record<string, { ruleId: string; targetPattern: RegExp; bug: string }[]> = {
  "/": [
    {
      ruleId: "color-contrast",
      // Full, stable axe target string for this node — static DOM path, no cycling
      // content, unchanged across every capture.
      targetPattern: exact(
        String.raw`.md\:grid-cols-3 > .sm\:pt-12.px-1.pt-8:nth-child(2) > .transition-\[transform\,box-shadow\].hover\:scale-\[1\.02\].rounded-3xl > .corner-ribbon[role="img"][aria-label="MOST POPULAR"] > div:nth-child(3) > div > .whitespace-nowrap.font-black`
      ),
      bug: "\"MOST POPULAR\" ribbon badge on the home membership card is white-on-gold (~2.19:1, needs 4.5:1) — src/components/sections/membership/ElectricPackageCard.tsx",
    },
    {
      ruleId: "color-contrast",
      // DOCUMENTED EXCEPTION: this node is the rotating promo-banner's text/link. The
      // visible copy and href cycle between several messages (confirmed across repeated
      // scans on this page: "Monthly tool giveaway." vs "Join Tools Australia for
      // exclusive benefits..." with hrefs /promotion or /membership), so the html/text
      // is not stable — but the CSS target selector axe generates for it IS stable:
      // every capture on this page returned exactly one of these 2 literal selectors,
      // never a longer or different chain (Tailwind's shared utility classes give axe
      // no unique wrapper/id to build a longer selector from, regardless of which
      // message is showing). Anchored via exactAny() to only those 2 known literal
      // strings — not a bare substring test — so a differently-shaped future violation
      // elsewhere on the page cannot silently match.
      targetPattern: exactAny([".text-3xs > .font-normal", ".underline"]),
      bug: "rotating promo-banner text/link is near-white-on-red (~4.36:1, needs 4.5:1) — src/components/promo or src/components/banners",
    },
  ],
  "/login": [
    {
      ruleId: "button-name",
      // Full, stable axe target string — the password show/hide toggle's DOM position.
      targetPattern: exact(".right-4"),
      bug: "password show/hide toggle button has no accessible name (no text, aria-label, or title) — login form component",
    },
    {
      ruleId: "label",
      // Full, stable axe target string (axe's CSS-escaped selector for the email input).
      targetPattern: exact(String.raw`.border-\[1\.5px\]`),
      bug: "email input has an empty placeholder and no <label>/aria-label — login form component",
    },
    {
      ruleId: "label",
      // Full, stable axe target string for the remember-me checkbox.
      targetPattern: exact('input[type="checkbox"]'),
      bug: "remember-me checkbox has no <label>/aria-label — login form component",
    },
  ],
  "/membership": [
    {
      ruleId: "color-contrast",
      // DOCUMENTED EXCEPTION: same rotating promo-banner as on "/" (see comment there)
      // — same 2 literal target selectors recur across every capture on this page,
      // exact-matched via exactAny(), never a bare substring test.
      targetPattern: exactAny([".text-3xs > .font-normal", ".underline"]),
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
