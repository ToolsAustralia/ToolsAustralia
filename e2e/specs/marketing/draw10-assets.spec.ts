import { NTP_NUMBER } from "@/constants/legal";
import { TOOLBOXES, TOOLSETS } from "@/components/sections/promo/prize-selection/constants";
import { test, expect } from "../../fixtures/test";

/**
 * Draw 10 proof — what actually changed for the 2026-08-28 draw, on camera.
 *
 * Four things, in the order a reviewer cares about them:
 *   1. TEXT — the NT permit rolled to `NTP/17808`, and the **$5,000 cash bonus is gone**.
 *      The absence is the point, so it is asserted rather than merely not shown: the beat
 *      scans the rendered page for every spelling of the claim and fails if one survives.
 *   2. BUILD YOUR PRIZE — STIHL joins as the SIXTH power toolset (4 x 6 = 24 combinations),
 *      the "New" badge moves off HiKOKI onto STIHL, and GearWrench keeps its toolbox badge.
 *   3. PROMOTIONS PAGE — `/promotions/stihl` exists and serves real STIHL landing art in
 *      light AND dark, rather than the evergreen fallback the brand had before its art shipped.
 *   4. ORANGE THEME — selecting STIHL repaints the card accent to STIHL orange, which is the
 *      one change that is invisible in a still of the default (Milwaukee red) selection.
 *
 * WHY IT IS NOT AN EXTENSION OF draw9-assets.spec.ts
 * That spec walks 240 hero states to prove an art drop reached the page. This one proves a
 * PRODUCT change — a new brand, a removed prize component, a rolled legal value — so its beats
 * are assertions about meaning, not about filenames.
 *
 * CONVENTIONS INHERITED FROM THE DRAW-9 RECORDING (docs/e2e/proof-mode.md):
 *  - Page state is prepared BEFORE each `demo.step`; the caption paints and holds ~3.6s before
 *    the body runs, so mutating inside a beat narrates a change not yet on screen.
 *  - `demo.highlight` is only ever handed a locator resolved as VISIBLE — a hidden one hangs
 *    the run, because its `scrollIntoViewIfNeeded` has no configured timeout.
 *  - Theme comes from the app's own Zustand persist key `ta-theme`, not `prefers-color-scheme`.
 *  - ONE TEST PER PROJECT — Playwright fixes the video canvas at context creation, so resizing
 *    mid-recording composites the page into a dead-grey strip. Join the clips afterwards.
 *  - No draw-scoped literal is hardcoded: the permit comes from `NTP_NUMBER`, and the brand
 *    line-up and badge expectations are DERIVED from the live registries, so this demo tracks
 *    the source of truth instead of going stale the next time the line-up changes.
 *
 * Run (scope by FULL title — `--project` alone still collects both tests):
 *   npx tsx e2e/run.ts --proof --grep "on desktop, draw 10" --project chromium-desktop
 *   npx tsx e2e/run.ts --proof --grep "on mobile, draw 10"  --project mobile-chrome
 *   npm run e2e:proof:join -- draw-10-changes <mobile.mp4> <desktop.mp4>
 */

const NAV_TIMEOUT = 60_000;

test.describe.configure({ mode: "serial" });

/** Derived, never hardcoded — this demo must not go stale when the line-up changes again. */
const NEW_TOOLSETS = TOOLSETS.filter((t) => t.isNew).map((t) => t.name);
const NEW_TOOLBOXES = TOOLBOXES.filter((t) => t.isNew).map((t) => t.brandName);
const COMBO_COUNT = TOOLBOXES.length * TOOLSETS.length;
const STIHL = TOOLSETS.find((t) => t.id === "stihl");

/** Every spelling of the removed bonus a designer or copywriter might reach for. */
const CASH_CLAIM = /\$\s?5[,.]?000|\$\s?5\s?K\b|five thousand/i;

async function setTheme(page: import("@playwright/test").Page, theme: "light" | "dark"): Promise<void> {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem(
        "ta-theme",
        JSON.stringify({ state: { theme: t, userManualOverride: true }, version: 0 })
      );
    } catch {
      /* storage unavailable — the run records the default theme */
    }
  }, theme);
}

/** Hide the dev-only holiday-banner toolbar — developer tooling, not product. */
async function hideDevToolbar(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    const inject = () => {
      if (document.getElementById("__e2eHideDevTools")) return;
      const s = document.createElement("style");
      s.id = "__e2eHideDevTools";
      s.textContent =
        '[aria-label="Development: holiday promo banner preview"],' +
        '[aria-label="Show holiday banner development tools"]{display:none !important}';
      document.head?.appendChild(s);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inject);
    else inject();
  });
}

/**
 * The VISIBLE promo hero still, with its bitmap decoded.
 *
 * `PromoHero` renders a mobile AND a desktop copy and hides one by breakpoint, so `.first()`
 * is a coin flip — and a hidden locator handed to `demo.highlight` hangs the run. The in-page
 * decode promise MUST race a timer: an image the browser never requests is never `complete`
 * and fires neither `load` nor `error`, so a naive await never settles.
 */
async function visibleHero(page: import("@playwright/test").Page) {
  const imgs = page.locator('img[alt^="Promo Hero"]');
  await expect(imgs.first()).toBeAttached({ timeout: 30_000 });

  const deadline = Date.now() + 30_000;
  for (;;) {
    const count = await imgs.count();
    for (let i = 0; i < count; i++) {
      const img = imgs.nth(i);
      if (await img.isVisible()) {
        await img.evaluate(
          (el: HTMLImageElement) =>
            el.complete && el.naturalWidth > 0
              ? true
              : new Promise<boolean>((resolve) => {
                  const done = () => resolve(true);
                  el.addEventListener("load", done, { once: true });
                  el.addEventListener("error", done, { once: true });
                  setTimeout(done, 8_000);
                }),
          undefined,
          { timeout: 20_000 }
        );
        return img;
      }
    }
    if (Date.now() > deadline) {
      throw new Error(`no visible "Promo Hero" image among ${count} candidates after 30s`);
    }
    await page.waitForTimeout(250);
  }
}

const heroSrc = async (img: import("@playwright/test").Locator): Promise<string> =>
  decodeURIComponent((await img.getAttribute("src")) ?? "");

/** The reel card for a brand, resolved through its own wordmark alt text. */
function reelCard(page: import("@playwright/test").Page, brandName: string) {
  return page.locator(".pbc-reel-card").filter({ has: page.locator(`img[alt="${brandName}"]`) });
}

test.describe("draw 10 assets @demo", () => {
  async function prepare(page: import("@playwright/test").Page, theme: "light" | "dark"): Promise<void> {
    // Reduced motion makes the STILL the visible hero — the asset under test. The clips are
    // proven separately by their own manifest test.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await setTheme(page, theme);
    await hideDevToolbar(page);
  }

  async function runProof(
    page: import("@playwright/test").Page,
    demo: import("../../fixtures/demo").Demo,
    viewport: "mobile" | "desktop"
  ): Promise<void> {
    const where = viewport === "mobile" ? "On a phone" : "On desktop";

    // ══ 1. TEXT — the rolled permit ═══════════════════════════════════════════════════
    await prepare(page, "light");
    await page.goto("/promotions", { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    // Settle the page before the first caption. `demo.step` paints its caption and holds
    // ~3.6s BEFORE running the body, so a beat that starts on a still-loading page narrates
    // over "Loading the giveaway…" — two of six sampled frames in the first recording were
    // that loader.
    //
    // Waits on the PERMIT, not `visibleHero`: `/promotions` is the evergreen root and renders
    // no `img[alt^="Promo Hero"]` at all (that is a brand-page element), so waiting on the hero
    // here fails outright. Wait on what this page actually has.
    await expect(page.getByText(NTP_NUMBER).first()).toBeAttached({ timeout: 30_000 });

    await demo.step(`${where}, draw 10 carries a new NT permit — ${NTP_NUMBER}`, async () => {
      const permit = page.getByText(NTP_NUMBER).first();
      await expect(permit).toBeAttached({ timeout: 30_000 });
      await demo.smoothScrollTo(permit);
      await demo.highlight(permit, `Permit ${NTP_NUMBER}`);
    });

    // ══ 2. TEXT — the $5,000 bonus is gone ════════════════════════════════════════════
    // Proving an ABSENCE, so the assertion carries the beat: scan everything the visitor can
    // read. A screenshot cannot show that something is missing; a failing scan can.
    await page.goto("/promotions/stihl-gearwrench", { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await visibleHero(page);

    await demo.step(
      `${where}, the $5,000 cash bonus is gone — a tool prize is now tools only`,
      async () => {
        // Scan the PRODUCT, not the narration. `demo.step` paints its caption into the DOM as
        // #__e2eCaption, and this beat's own title contains "$5,000" — so a naive
        // `document.body.innerText` scan matches ITSELF and fails only in proof mode, where the
        // captions exist. The demo overlays (caption, spotlight label, title card) are stripped
        // before scanning.
        //
        // Reports the SURROUNDING text, not just the matched token: "a $5,000 claim survived"
        // names the symptom, but the 80 characters around it name the component — the difference
        // between a five-minute fix and a grep hunt through every promo surface.
        const hit = await page.evaluate((src) => {
          const clone = document.body.cloneNode(true) as HTMLElement;
          for (const id of ["__e2eCaption", "__e2eHighlight", "__e2eTitleCard"]) {
            clone.querySelectorAll(`#${id}`).forEach((n) => n.remove());
          }
          const text = clone.innerText ?? clone.textContent ?? "";
          const m = new RegExp(src, "i").exec(text);
          if (!m) return null;
          const at = m.index ?? 0;
          return text.slice(Math.max(0, at - 80), at + 80).replace(/s+/g, " ");
        }, CASH_CLAIM.source);
        expect(hit, `a $5,000 claim survived on /promotions/stihl-gearwrench — context: "${hit}"`).toBeNull();
        // The $10,000 cash-only option is a SEPARATE prize and must still be offered.
        const tenK = page.getByText(/\$10,000/).first();
        await expect(tenK).toBeAttached({ timeout: 15_000 });
        await demo.smoothScrollTo(tenK);
        await demo.highlight(tenK, "Only cash left: the $10,000 opt-out");
      }
    );

    // ══ 3. BUILD YOUR PRIZE — STIHL is the sixth toolset ══════════════════════════════
    const stihlCard = reelCard(page, STIHL!.name);
    await expect(stihlCard).toBeVisible({ timeout: 30_000 });

    await demo.step(
      `${where}, STIHL joins as the sixth power toolset — ${TOOLBOXES.length} x ${TOOLSETS.length} = ${COMBO_COUNT} combinations`,
      async () => {
        const cards = page.locator(".pbc-reel-card");
        await expect(cards).toHaveCount(TOOLBOXES.length + TOOLSETS.length);
        await demo.smoothScrollTo(stihlCard);
        await demo.highlight(stihlCard, `${STIHL!.name} — ${STIHL!.cardLabel}`);
      }
    );

    // ══ 4. BUILD YOUR PRIZE — the New badge moved ═════════════════════════════════════
    await demo.step(
      `${where}, the "New" badge moves to ${NEW_TOOLSETS.join(" + ")} — HiKOKI is no longer new`,
      async () => {
        // Derived from the registries, so this cannot drift from what the app believes.
        for (const name of NEW_TOOLSETS) {
          await expect(reelCard(page, name).getByText("New", { exact: true })).toBeVisible();
        }
        await expect(reelCard(page, "HiKOKI").getByText("New", { exact: true })).toHaveCount(0);
        const badge = stihlCard.getByText("New", { exact: true });
        await demo.highlight(badge, `New this draw${NEW_TOOLBOXES.length ? ` · ${NEW_TOOLBOXES.join(", ")} keeps its own` : ""}`);
      }
    );

    // ══ 5. ORANGE THEME — the accent follows the selected toolset ═════════════════════
    // Prepared before the beat: click, let the repaint settle, THEN narrate what is on screen.
    await stihlCard.click();
    // Let the accent repaint settle before narrating it — the beat is ABOUT the colour, so a
    // caption that lands mid-transition shows the old brand accent while claiming the new one.
    await page.waitForTimeout(900);

    await demo.step(`${where}, picking STIHL repaints the whole card in STIHL orange`, async () => {
      // Read it off the element that OWNS the variable. `--pbc-accent` is deliberately not
      // declared in globals.css (see the token block there): `PrizeBuilderCard` sets it INLINE
      // on the card root, so querying `.prize-builder` returns "" — that empty string is what
      // failed the first dry run, and it would have recorded a green-looking beat proving nothing.
      const accent = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>("[style*=\"--pbc-accent\"]");
        return el ? getComputedStyle(el).getPropertyValue("--pbc-accent").trim() : "";
      });
      expect(accent.toLowerCase()).toBe(STIHL!.accent.toLowerCase());
      const cta = page.getByRole("button", { name: /ENTER NOW/i }).first();
      await expect(cta).toBeVisible({ timeout: 15_000 });
      await demo.smoothScrollTo(cta);
      await demo.highlight(cta, `Accent ${STIHL!.accent} — CTA, rings and chips all follow`);
    });

    // ══ 6. PROMOTIONS PAGE — real STIHL landing art, light ════════════════════════════
    await page.goto("/promotions/stihl", { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    const lightHero = await visibleHero(page);
    const lightSrc = await heroSrc(lightHero);

    await demo.step(`${where}, /promotions/stihl serves STIHL's own landing art`, async () => {
      // Asserted on URL GRAMMAR: it must be a STIHL hero, not the evergreen collage the brand
      // fell back to before its art shipped.
      expect(lightSrc).toContain("/landing/stihl/stihl-");
      expect(lightSrc).not.toContain("all-prizes");
      expect(lightSrc).not.toContain("-dark");
      await demo.highlight(lightHero, "Light mode — stihl/stihl-*.webp");
    });

    // ══ 7. PROMOTIONS PAGE — and the same combination in dark ═════════════════════════
    await prepare(page, "dark");
    await page.goto("/promotions/stihl", { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    const darkHero = await visibleHero(page);
    const darkSrc = await heroSrc(darkHero);

    await demo.step(`${where}, and real dark-mode art — not the light hero reused`, async () => {
      expect(darkSrc).toContain("/landing/stihl/stihl-");
      expect(darkSrc).toContain("-dark");
      expect(darkSrc).not.toBe(lightSrc);
      await demo.highlight(darkHero, "Dark mode — a genuinely different file");
    });
  }

  test("on mobile, draw 10 changes: permit, no $5k, STIHL, orange theme", async ({ page, demo }, testInfo) => {
    // Guard: the serial describe means a wrong-project run would SKIP the other test too.
    expect(testInfo.project.name, "run this one under mobile-chrome").toBe("mobile-chrome");
    await runProof(page, demo, "mobile");
  });

  test("on desktop, draw 10 changes: permit, no $5k, STIHL, orange theme", async ({ page, demo }, testInfo) => {
    expect(testInfo.project.name, "run this one under chromium-desktop").toBe("chromium-desktop");
    await runProof(page, demo, "desktop");
  });
});
