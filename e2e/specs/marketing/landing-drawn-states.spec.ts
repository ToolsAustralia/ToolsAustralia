import fs from "node:fs";
import path from "node:path";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { test, expect } from "../../fixtures/test";
import { connectE2eDb } from "../../helpers/db";

/**
 * Landing hero countdown tiers — proves the `drawn-tomorrow` / `drawn-tonight` stills
 * shipped by the 2026-07 export actually reach the page for each state.
 *
 * The tier is derived SERVER-side from the active major draw's `drawDate`
 * (`getLandingHeroUrgencyFromDrawDay`, AEST calendar-day comparison), so the only way to
 * exercise it is to move that date and reload — there is no query-param override.
 *
 * Reduced motion (`page.emulateMedia`): `PromoHero` is video-first (`showVideo`), and
 * renders the still alongside the clip with `motion-reduce:hidden` / `motion-reduce:block`.
 * Under reduced motion the STILL is the visible hero, which is exactly the asset under test.
 * (The drawn CLIPS are still the previous design and HiKOKI has none — see
 * docs/promo/gotchas.md, "Drawn-tier stills were redesigned but the drawn CLIPS were not".)
 * It's set via `emulateMedia` rather than `test.use({ reducedMotion })` because the extended
 * `test` in fixtures/test.ts types `use()` against its own Fixtures, not Playwright's options.
 *
 * SERIAL + restores `drawDate` in afterAll: this mutates the single shared seeded draw,
 * so it must not interleave with other specs reading draw state.
 */

const AEST = "Australia/Sydney";

test.describe.configure({ mode: "serial" });

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
  const count = await imgs.count();
  for (let i = 0; i < count; i++) {
    const img = imgs.nth(i);
    if (await img.isVisible()) return img;
  }
  throw new Error(`no visible "Promo Hero" image among ${count} candidates`);
}

/** Decoded `src` of a hero locator (Next/Image wraps the path in /_next/image?url=…). */
async function heroSrc(img: ReturnType<typeof visibleHero> extends Promise<infer T> ? T : never): Promise<string> {
  return decodeURIComponent((await img.getAttribute("src")) ?? "");
}

test.describe("landing drawn-state @demo", () => {
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

  test("hero swaps to the Drawn Tomorrow and Drawn Tonight artwork", async ({ page, demo }) => {
    // Proof mode adds a title card, per-beat caption holds and highlight dwells on top of
    // four page loads — well past the 90s default. Same allowance the other @demo specs use.
    test.setTimeout(300_000);

    test.info().annotations.push({
      type: "demo-title",
      description: "Landing pages on the final two days before a draw",
    });

    // The still hero only wins over the clip under reduced motion — see the file header.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await serveHeroClipFallback(page);
    await hideDevToolbar(page);

    /**
     * Each beat's page state is prepared BEFORE its `demo.step`, never inside it.
     * `demo.step` paints the caption and holds for ~3.6s *before* running the body, so a
     * beat that mutates + reloads inside its own body narrates a change the viewer cannot
     * see yet — frame-verified on the first recording, where the caption ran a full state
     * ahead of the hero for the whole video. Preparing first means the caption always
     * describes what is already on screen. (Same reason landing.spec.ts warms "/" before
     * its opening step.)
     */

    // Draw is weeks away → no countdown tier.
    await setDrawDate(aestInstant(20, "20:30"));
    await page.goto("/promotions/milwaukee-milwaukee");
    await expect(page.locator('img[alt^="Promo Hero"]').first()).toBeAttached({ timeout: 45_000 });

    await demo.step("The Milwaukee giveaway page, with the draw still weeks away", async () => {
      const hero = await visibleHero(page);
      const src = await heroSrc(hero);
      expect(src).toContain("milwaukee-milTB");
      expect(src).not.toContain("drawn-tomorrow");
      expect(src).not.toContain("drawn-tonight");
      await demo.highlight(hero, "Standard hero");
    });

    await setDrawDate(aestInstant(1, "20:30"));
    await page.reload({ waitUntil: "domcontentloaded" });

    await demo.step("The day before the draw, the hero has swapped to the Drawn Tomorrow artwork", async () => {
      const hero = await visibleHero(page);
      expect(await heroSrc(hero)).toContain("milwaukee-milTB-drawn-tomorrow");
      await demo.highlight(hero, "Drawn Tomorrow");
    });

    await setDrawDate(aestInstant(0, "23:59"));
    await page.reload({ waitUntil: "domcontentloaded" });

    await demo.step("On draw day itself, it swaps again to the Drawn Tonight artwork", async () => {
      const hero = await visibleHero(page);
      expect(await heroSrc(hero)).toContain("milwaukee-milTB-drawn-tonight");
      await demo.highlight(hero, "Drawn Tonight");
    });

    // Still on draw day — walk the other brand pages and confirm each resolves to ITS OWN
    // brand + toolbox art rather than a shared fallback.
    await page.goto("/promotions/dewalt-milwaukee", { waitUntil: "domcontentloaded" });

    await demo.step("Every brand's landing page carries its own Drawn Tonight artwork", async () => {
      let hero = await visibleHero(page);
      expect(await heroSrc(hero)).toContain("dewalt-milTB-drawn-tonight");
      await demo.highlight(hero, "DeWalt · Drawn Tonight");

      for (const [slug, expected, label] of [
        ["makita-sidchrome", "makita-sidTB-drawn-tonight", "Makita · Drawn Tonight"],
        ["ryobi-kincrome", "ryobi-kinTB-drawn-tonight", "Ryobi · Drawn Tonight"],
      ] as const) {
        await page.goto(`/promotions/${slug}`, { waitUntil: "domcontentloaded" });
        hero = await visibleHero(page);
        expect(await heroSrc(hero)).toContain(expected);
        await demo.highlight(hero, label);
      }
    });

    await page.goto("/promotions/hikoki-kincrome", { waitUntil: "domcontentloaded" });

    await demo.step("HiKOKI is new to the countdown set — this is its Drawn Tonight artwork", async () => {
      const hero = await visibleHero(page);
      expect(await heroSrc(hero)).toContain("hikoki-kinTB-drawn-tonight");
      await demo.highlight(hero, "HiKOKI · Drawn Tonight");
    });

    await setDrawDate(aestInstant(1, "20:30"));
    await page.reload({ waitUntil: "domcontentloaded" });

    await demo.step("And the same HiKOKI page a day earlier, in Drawn Tomorrow", async () => {
      const hero = await visibleHero(page);
      expect(await heroSrc(hero)).toContain("hikoki-kinTB-drawn-tomorrow");
      await demo.highlight(hero, "HiKOKI · Drawn Tomorrow");
    });
  });
});
