import fs from "node:fs";
import path from "node:path";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { test, expect } from "../../fixtures/test";
import { connectE2eDb } from "../../helpers/db";

/**
 * Landing hero countdown tiers — proves the `drawn-tomorrow` / `drawn-tonight` stills
 * shipped by the 2026-07 export actually reach the page, for EVERY prize combination
 * (5 brands x 3 toolboxes = 15) in BOTH states and BOTH viewports: 60 hero resolutions.
 *
 * The tier is derived SERVER-side from the active major draw's `drawDate`
 * (`getLandingHeroUrgencyFromDrawDay`, AEST calendar-day comparison), so the only way to
 * exercise it is to move that date and reload — there is no query-param override. The walk
 * is therefore ordered to change `drawDate` as few times as possible: one state, all 15
 * combos, then the other state.
 *
 * VIEWPORT: `PromoHero` picks its hero client-side from `matchMedia` and renders both a
 * mobile and a desktop container gated by Tailwind's `lg` breakpoint (1024px), so the
 * viewport genuinely decides which asset is under test — no UA sniffing involved.
 *
 * ONE TEST PER PROJECT, NOT ONE TEST THAT RESIZES. Playwright fixes the video canvas when the
 * context is created and never rescales it, so a `setViewportSize` to a phone mid-recording
 * composites the page into a ~208x450 strip anchored top-left of the 800x450 canvas with the
 * rest dead grey — frame-verified, 2026-07-24. Splitting into a mobile test (mobile-chrome /
 * Pixel 7) and a desktop test (chromium-desktop) lets each record at its own native size; the
 * two clips are then joined into one deliverable by `e2e/proof/join.ts` (npm run e2e:proof:join).
 * Each test asserts its project so neither can be run in the wrong viewport.
 *
 * Reduced motion (`page.emulateMedia`): `PromoHero` is video-first (`showVideo`), and
 * renders the still alongside the clip with `motion-reduce:hidden` / `motion-reduce:block`.
 * Under reduced motion the STILL is the visible hero, which is exactly the asset under test.
 * (The drawn CLIPS are still the previous design and HiKOKI has none — see
 * docs/promo/gotchas.md, "Drawn-tier stills were redesigned but the drawn CLIPS were not".)
 * It's set via `emulateMedia` rather than `test.use({ reducedMotion })` because the extended
 * `test` in fixtures/test.ts types `use()` against its own Fixtures, not Playwright's options.
 *
 * All 15 combinations now serve the current 2026-07 design in both viewports: the mobile kinTB
 * exports 21-28 that first arrived with HiKOKI's sub-headline over Milwaukee / DeWalt / Makita /
 * Ryobi artwork were re-exported and shipped on 2026-07-27 (docs/promo/architecture.md). Because
 * the held-back files had kept their FILENAMES, these assertions did not change when the pixels
 * did — which is exactly why they are written against the URL grammar rather than the artwork.
 *
 * SERIAL + restores `drawDate` in afterAll: this mutates the single shared seeded draw,
 * so it must not interleave with other specs reading draw state.
 */

const AEST = "Australia/Sydney";

test.describe.configure({ mode: "serial" });

/** The three toolbox chests a brand can be paired with — prize-slug segment → asset segment. */
const TOOLBOXES = [
  { slug: "milwaukee", tb: "milTB", label: "Milwaukee chest" },
  { slug: "sidchrome", tb: "sidTB", label: "Sidchrome chest" },
  { slug: "kincrome", tb: "kinTB", label: "Kincrome chest" },
] as const;

const BRANDS = [
  { key: "milwaukee", label: "Milwaukee" },
  { key: "dewalt", label: "DeWalt" },
  { key: "makita", label: "Makita" },
  { key: "ryobi", label: "Ryobi" },
  { key: "hikoki", label: "HiKOKI" },
] as const;

/** All 15 prize combinations, brand-major so the walk reads one brand at a time. */
const COMBOS = BRANDS.flatMap((brand) =>
  TOOLBOXES.map((toolbox) => ({
    slug: `${brand.key}-${toolbox.slug}`,
    asset: `${brand.key}-${toolbox.tb}`,
    label: `${brand.label} · ${toolbox.label}`,
  }))
);

/** Build a UTC instant for a given AEST calendar-day offset + wall-clock time. */
function aestInstant(dayOffset: number, hhmm: string): Date {
  const base = new Date(Date.now() + dayOffset * 24 * 3600 * 1000);
  const ymd = formatInTimeZone(base, AEST, "yyyy-MM-dd");
  return fromZonedTime(`${ymd}T${hhmm}:00`, AEST);
}

/**
 * Resolve the drawn→base hero-clip fallback at the network layer instead of via a 404.
 *
 * `getLandingHeroVideoPaths` deliberately lists the drawn clip first and appends the BASE
 * clip, relying on the browser advancing past a 404 `<source>` natively — that's how a brand
 * with no drawn clip (HiKOKI, and every brand until the new drawn clips land) still animates.
 * Working as designed, but it emits "Failed to load resource: 404" console errors, and the
 * QA watchdog fails any test that logs one.
 *
 * Serving the base clip for a not-yet-shipped drawn clip reproduces the SAME end state the
 * browser reaches on its own, minus the console noise — so the watchdog stays armed for real
 * 404s in this spec rather than being blanket-allowlisted. Anything that genuinely doesn't
 * exist still 404s.
 */
async function serveHeroClipFallback(page: import("@playwright/test").Page): Promise<void> {
  await page.route(/\/videos\/landing\/.*\.(webm|mp4)$/, async (route) => {
    const { pathname } = new URL(route.request().url());
    const file = path.join(process.cwd(), "public", pathname);
    if (fs.existsSync(file)) return route.fulfill({ path: file });
    const base = file.replace(/-drawn-(tonight|tomorrow)/, "");
    if (base !== file && fs.existsSync(base)) return route.fulfill({ path: base });
    return route.continue();
  });
}

/**
 * Hide the holiday-banner dev toolbar (`PromoHolidayDevToolbar`, bottom-left, dev-only) for
 * the recording — it is developer tooling, not product, and it sits in frame competing with
 * the hero. Keyed on its stable `aria-label`s. `addInitScript` re-applies on every navigation.
 */
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

async function setDrawDate(when: Date): Promise<void> {
  const db = await connectE2eDb();
  await db.connection
    .collection("majordraws")
    .updateOne({ status: "active" }, { $set: { drawDate: when, freezeEntriesAt: when } });
}

/**
 * The VISIBLE promo hero still. `PromoHero` renders a mobile and a desktop container and
 * hides one by breakpoint, so a bare `.first()` often lands on the hidden one — and passing
 * a hidden locator to `demo.highlight` HANGS THE TEST: `showHighlight` calls
 * `scrollIntoViewIfNeeded()`, whose actionability wait has no timeout configured here, so it
 * blocks until the whole test times out. (Invisible outside proof mode, where `highlight` is
 * a no-op — so it fails only in the recorded run.) Always resolve the visible one first.
 */
async function visibleHero(page: import("@playwright/test").Page) {
  const imgs = page.locator('img[alt^="Promo Hero"]');
  await expect(imgs.first()).toBeAttached({ timeout: 30_000 });

  /**
   * POLL, don't one-shot. Waiting for the FIRST hero to attach does not mean the VISIBLE one
   * has: `PromoHero` renders a mobile and a desktop copy and hides one by breakpoint, so right
   * after `domcontentloaded` the attached copy can be the hidden twin while its visible
   * counterpart is still hydrating. Scanning once at that instant finds nothing visible and
   * throws immediately — observed as a 1-in-3 flake on this spec's 60 navigations, where the
   * cost of losing a 3-minute recording to a 250ms race is high and the retry is nearly free.
   */
  const deadline = Date.now() + 30_000;
  for (;;) {
    const count = await imgs.count();
    for (let i = 0; i < count; i++) {
      const img = imgs.nth(i);
      if (await img.isVisible()) {
        await awaitHeroPainted(img); // every caller wants the artwork, not the loader
        return img;
      }
    }
    if (Date.now() > deadline) {
      throw new Error(`no visible "Promo Hero" image among ${count} candidates after 30s`);
    }
    await page.waitForTimeout(250);
  }
}

/** Decoded `src` of a hero locator (Next/Image wraps the path in /_next/image?url=…). */
async function heroSrc(img: ReturnType<typeof visibleHero> extends Promise<infer T> ? T : never): Promise<string> {
  return decodeURIComponent((await img.getAttribute("src")) ?? "");
}

/**
 * Block until the hero's BITMAP has actually decoded, not merely until its `<img>` is in the
 * DOM and visible.
 *
 * `PromoHero` renders a brand "stage" background in place of a skeleton while the draw query
 * resolves, so a page that is attached-and-visible can still be showing the loader rather than
 * the artwork. Highlighting at that point spotlights a placeholder: frame-verified on the
 * first mobile recording, where BOTH sampled frames landed on the loader and roughly half the
 * run showed no hero at all — which defeats the point of a video about the artwork.
 *
 * Resolving on `error` as well as `load` is deliberate: a genuinely broken asset should fail
 * on the src assertions with a useful message, not time out here with a vague one.
 */
async function awaitHeroPainted(img: import("@playwright/test").Locator): Promise<void> {
  /**
   * The in-page promise MUST race a timer.
   *
   * `locator.evaluate`'s `timeout` bounds resolving the LOCATOR — it does NOT bound a promise
   * running inside the page. An image the browser never requests (or one whose combination has
   * no art) is never `complete` and fires neither `load` nor `error`, so without the timer this
   * waits forever: no error, no progress, the run just dies. That is not hypothetical — it cost
   * two dead recordings on `draw9-assets.spec.ts` (2026-07-27), which walks a combination with
   * no artwork. This spec only escapes it because every hero it walks currently has art.
   */
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
}

/**
 * Walk all 15 prize combinations in the current viewport + draw state, asserting each hero
 * resolves to ITS OWN brand + toolbox + state art (never a shared fallback), and spotlighting
 * each one so the viewer can read which combination is on screen.
 *
 * `drawDate` is NOT touched here — the caller sets the state once and walks, which is what
 * keeps a 60-hero run to three DB writes instead of sixty.
 */
async function walkAllCombos(
  page: import("@playwright/test").Page,
  demo: import("../../fixtures/demo").Demo,
  viewport: "mobile" | "desktop",
  state: "drawn-tomorrow" | "drawn-tonight"
): Promise<void> {
  const stateLabel = state === "drawn-tomorrow" ? "Drawn Tomorrow" : "Drawn Tonight";
  for (const combo of COMBOS) {
    await page.goto(`/promotions/${combo.slug}`, { waitUntil: "domcontentloaded" });
    const hero = await visibleHero(page);
    const src = await heroSrc(hero);

    // Brand + toolbox + countdown tier, and the mobile art on mobile — uniform across all 15
    // because the assertions are written against the URL grammar, not the artwork.
    expect(src, `${viewport} ${state} ${combo.slug}`).toContain(`${combo.asset}-`);
    expect(src, `${viewport} ${state} ${combo.slug}`).toContain(state);
    if (viewport === "mobile") {
      expect(src, `${viewport} ${state} ${combo.slug}`).toContain("-mobile-");
    } else {
      expect(src, `${viewport} ${state} ${combo.slug}`).not.toContain("-mobile-");
    }

    await demo.highlight(hero, `${combo.label} · ${stateLabel}`);
  }
}

test.describe("landing drawn-state @demo", () => {
  // ─── SKIPPED 2026-08-26 (draw 10) ──────────────────────────────────────────────────
  // Draw 10 deleted all 480 drawn-tier clips and 160 drawn-tier stills: every one carried
  // "& $5K CASH" burned into the artwork, and the draw no longer awards that cash. This
  // spec's entire subject is that art, so every assertion here would now fail on a resolver
  // FALLBACK rather than on a real regression — a red run that says nothing true.
  //
  // RE-ENABLE by deleting this line once the replacement drawn-tomorrow / drawn-tonight art
  // ships. That is the branch's only outstanding asset set, so this is a when-not-if.
  test.skip(true, "drawn-tier art removed in draw 10; replacement art not yet shipped");

  let originalDrawDate: unknown = null;

  test.beforeAll(async () => {
    const db = await connectE2eDb();
    const draw = await db.connection
      .collection("majordraws")
      .findOne({ status: "active" }, { projection: { drawDate: 1 } });
    originalDrawDate = draw?.drawDate ?? null;
  });

  test.afterAll(async () => {
    if (originalDrawDate) await setDrawDate(originalDrawDate as Date);
  });

  /**
   * Shared per-test preparation. The still hero only wins over the clip under reduced
   * motion (see the file header); the clip route resolves the drawn→base fallback without
   * console 404s; the dev toolbar is developer tooling that shouldn't be in frame.
   */
  async function prepare(page: import("@playwright/test").Page): Promise<void> {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await serveHeroClipFallback(page);
    await hideDevToolbar(page);
  }

  /**
   * Every beat's page state is prepared BEFORE its `demo.step`, never inside it.
   * `demo.step` paints the caption and holds for ~3.6s *before* running the body, so a
   * beat that mutates + reloads inside its own body narrates a change the viewer cannot
   * see yet — frame-verified on the first recording, where the caption ran a full state
   * ahead of the hero for the whole video. Preparing first means the caption always
   * describes what is already on screen.
   */

  test("on mobile, every prize combination swaps to its Drawn Tomorrow and Drawn Tonight artwork", async ({
    page,
    demo,
  }, testInfo) => {
    expect(
      testInfo.project.name,
      "must run under mobile-chrome so the video records at a real phone size"
    ).toBe("mobile-chrome");

    // 31 hero resolutions, each a page load plus a caption hold and a spotlight dwell, on
    // top of proof mode's 200ms slowMo. The 90s default is nowhere near it.
    test.setTimeout(1_800_000);

    test.info().annotations.push({
      type: "demo-title",
      description: "Mobile — every prize combination on the final two days before a draw",
    });

    await prepare(page);

    // Draw is weeks away → no countdown tier, so the opening beat shows the standard hero.
    await setDrawDate(aestInstant(20, "20:30"));
    await page.goto("/promotions/milwaukee-milwaukee", { waitUntil: "domcontentloaded" });
    await expect(page.locator('img[alt^="Promo Hero"]').first()).toBeAttached({ timeout: 45_000 });

    await demo.step("On a phone, with the draw still weeks away, the standard hero shows", async () => {
      const hero = await visibleHero(page);
      const src = await heroSrc(hero);
      expect(src).toContain("milwaukee-milTB");
      expect(src).not.toContain("drawn-tomorrow");
      expect(src).not.toContain("drawn-tonight");
      await demo.highlight(hero, "Standard hero");
    });

    await setDrawDate(aestInstant(1, "20:30"));

    await demo.step(
      "The day before the draw, every one of the fifteen prize combinations swaps to Drawn Tomorrow",
      async () => {
        await walkAllCombos(page, demo, "mobile", "drawn-tomorrow");
      }
    );

    await setDrawDate(aestInstant(0, "23:59"));

    await demo.step("On draw day itself, all fifteen swap again to Drawn Tonight", async () => {
      await walkAllCombos(page, demo, "mobile", "drawn-tonight");
    });

    /**
     * Closing beat on the four mobile Kincrome pages whose first export described the wrong
     * prize (HiKOKI's kit over Milwaukee / DeWalt / Makita / Ryobi art) and was held back.
     * The re-export shipped 2026-07-27, so this re-walks them to show the corrected copy —
     * the part of this batch a reviewer most wants to see. Page prepared before the beat, per
     * the convention above; the caption then covers all four via demo.ts's navigation repaint.
     */
    await page.goto("/promotions/milwaukee-kincrome", { waitUntil: "domcontentloaded" });

    await demo.step(
      "And the four Kincrome pages whose first export described the wrong prize have been re-exported — each now names its own kit",
      async () => {
        for (const [brand, label] of [
          ["milwaukee", "Milwaukee"],
          ["dewalt", "DeWalt"],
          ["makita", "Makita"],
          ["ryobi", "Ryobi"],
        ] as const) {
          if (brand !== "milwaukee") {
            await page.goto(`/promotions/${brand}-kincrome`, { waitUntil: "domcontentloaded" });
          }
          const hero = await visibleHero(page);
          expect(await heroSrc(hero)).toContain(`${brand}-kinTB-mobile-drawn-tonight`);
          await demo.highlight(hero, `${label} · corrected copy`);
        }
      }
    );
  });

  test("on desktop, every prize combination swaps to its Drawn Tomorrow and Drawn Tonight artwork", async ({
    page,
    demo,
  }, testInfo) => {
    expect(
      testInfo.project.name,
      "must run under chromium-desktop so the video records at full desktop size"
    ).toBe("chromium-desktop");

    test.setTimeout(1_800_000);

    test.info().annotations.push({
      type: "demo-title",
      description: "Desktop — every prize combination on the final two days before a draw",
    });

    await prepare(page);

    await setDrawDate(aestInstant(20, "20:30"));
    await page.goto("/promotions/milwaukee-milwaukee", { waitUntil: "domcontentloaded" });
    await expect(page.locator('img[alt^="Promo Hero"]').first()).toBeAttached({ timeout: 45_000 });

    await demo.step("The same pages on desktop, with the draw still weeks away", async () => {
      const hero = await visibleHero(page);
      const src = await heroSrc(hero);
      expect(src).toContain("milwaukee-milTB");
      expect(src).not.toContain("drawn-tomorrow");
      expect(src).not.toContain("drawn-tonight");
      await demo.highlight(hero, "Standard hero");
    });

    await setDrawDate(aestInstant(1, "20:30"));

    await demo.step(
      "The day before the draw, all fifteen combinations swap to Drawn Tomorrow",
      async () => {
        await walkAllCombos(page, demo, "desktop", "drawn-tomorrow");
      }
    );

    await setDrawDate(aestInstant(0, "23:59"));

    await demo.step("And on draw day, all fifteen swap again to Drawn Tonight", async () => {
      await walkAllCombos(page, demo, "desktop", "drawn-tonight");
    });
  });
});
