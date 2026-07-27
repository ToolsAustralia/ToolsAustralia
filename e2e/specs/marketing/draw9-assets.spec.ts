import fs from "node:fs";
import path from "node:path";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { test, expect } from "../../fixtures/test";
import { connectE2eDb } from "../../helpers/db";

/**
 * Draw 9 proof — every landing hero state the 2026-07-27 export produced, plus GearWrench
 * as the fourth toolbox and the new NT permit number.
 *
 * WHAT MAKES THIS DIFFERENT FROM landing-drawn-states.spec.ts
 * That spec proves the countdown TIERS reach the page. This one proves the whole draw 9
 * change, and adds the two dimensions that did not exist before:
 *   - LIGHT **and DARK**. No `*-dark.webp` had ever shipped; the resolver's light↔dark
 *     fallback silently served the light hero to dark-mode visitors. Draw 9 ships real dark
 *     art for every combination, so dark mode is now a distinct thing to prove — and it is
 *     invisible in a light-mode screenshot, which is exactly why it needs to be in frame.
 *   - GEARWRENCH, the fourth toolbox: 5 new prize slugs, a two-tone wordmark a CSS mask
 *     cannot render, and a combo-photo-pending fallback.
 *
 * GRID: 20 combinations (4 toolboxes × 5 toolsets) × 3 tiers (base / drawn-tomorrow /
 * drawn-tonight) × 2 modes = 120 hero resolutions per viewport, 240 across both.
 *
 * `ryobi × gearwrench` IS walked rather than skipped. Its artwork was never produced, so it
 * resolves through the fallback chain — showing it is the honest result, and the narration
 * says so instead of quietly hiding the one gap in the drop.
 *
 * THEME: set through the Zustand persist key `ta-theme` in an init script, which is what
 * `useThemeStore` reads. `emulateMedia({ colorScheme })` would NOT work — the app resolves
 * theme from its own store, not from `prefers-color-scheme`.
 *
 * ONE TEST PER PROJECT, NOT ONE TEST THAT RESIZES. Playwright fixes the video canvas when the
 * context is created and never rescales it, so a mid-recording `setViewportSize` composites
 * the page into a strip with the rest dead grey. The mobile test runs under mobile-chrome and
 * the desktop one under chromium-desktop; `e2e/proof/join.ts` stitches the two clips.
 *
 * SERIAL + restores `drawDate` in afterAll: this mutates the single shared seeded draw.
 */

const AEST = "Australia/Sydney";

/**
 * EVERY `page.goto` in this spec must pass this.
 *
 * `playwright.config.ts` sets no `navigationTimeout`, so a bare `goto` waits FOREVER. That is
 * survivable in a short spec; across this one's 120 navigations against `next dev` it is not.
 * A single wedged route compile hung the first recording for 20+ minutes with the server still
 * answering health checks — no error, no progress, just a dead run that burned the whole
 * session timeout. Bounded, a slow page fails loudly and points at the route.
 */
const NAV_TIMEOUT = 60_000;

test.describe.configure({ mode: "serial" });

/** The four toolbox chests — prize-slug segment → landing asset segment. */
const TOOLBOXES = [
  { slug: "milwaukee", tb: "milTB", label: "Milwaukee chest" },
  { slug: "sidchrome", tb: "sidTB", label: "Sidchrome chest" },
  { slug: "kincrome", tb: "kinTB", label: "Kincrome chest" },
  { slug: "gearwrench", tb: "gwTB", label: "GearWrench chest" },
] as const;

const BRANDS = [
  { key: "milwaukee", label: "Milwaukee" },
  { key: "dewalt", label: "DeWalt" },
  { key: "makita", label: "Makita" },
  { key: "ryobi", label: "Ryobi" },
  { key: "hikoki", label: "HiKOKI" },
] as const;

/** All 20 prize combinations, brand-major so the walk reads one brand at a time. */
const COMBOS = BRANDS.flatMap((brand) =>
  TOOLBOXES.map((toolbox) => ({
    slug: `${brand.key}-${toolbox.slug}`,
    asset: `${brand.key}-${toolbox.tb}`,
    label: `${brand.label} · ${toolbox.label}`,
    /** GearWrench × Ryobi was never produced — the one combination with no art of its own. */
    artMissing: brand.key === "ryobi" && toolbox.slug === "gearwrench",
  }))
);

function aestInstant(dayOffset: number, hhmm: string): Date {
  const base = new Date(Date.now() + dayOffset * 24 * 3600 * 1000);
  const ymd = formatInTimeZone(base, AEST, "yyyy-MM-dd");
  return fromZonedTime(`${ymd}T${hhmm}:00`, AEST);
}

async function setDrawDate(when: Date): Promise<void> {
  const db = await connectE2eDb();
  await db.connection
    .collection("majordraws")
    .updateOne({ status: "active" }, { $set: { drawDate: when, freezeEntriesAt: when } });
}

/**
 * Force the theme before any script runs. `useThemeStore` persists through Zustand's
 * localStorage adapter under `ta-theme`, and `readThemeFromPersistStorage` honours a stored
 * "dark" only when the user actually chose it — hence `userManualOverride: true`.
 */
async function setTheme(page: import("@playwright/test").Page, theme: "light" | "dark"): Promise<void> {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem(
        "ta-theme",
        JSON.stringify({ state: { theme: t, userManualOverride: true }, version: 0 })
      );
    } catch {
      /* storage unavailable — the run will simply record the default theme */
    }
  }, theme);
}

/**
 * Serve a missing clip from its base twin at the network layer.
 *
 * The video resolver only lists clips present in the manifest, so genuine 404s are rare —
 * but `ryobi × gearwrench` has no clip at all and the QA watchdog fails any test that logs a
 * 404. This reproduces the same end state without the console noise, leaving the watchdog
 * armed for real breakage.
 */
async function serveHeroClipFallback(page: import("@playwright/test").Page): Promise<void> {
  await page.route(/\/videos\/landing\/.*\.(webm|mp4)$/, async (route) => {
    const { pathname } = new URL(route.request().url());
    const file = path.join(process.cwd(), "public", pathname);
    if (fs.existsSync(file)) return route.fulfill({ path: file });
    const base = file.replace(/-drawn-(tonight|tomorrow)/, "").replace(/-dark/, "");
    if (base !== file && fs.existsSync(base)) return route.fulfill({ path: base });
    return route.continue();
  });
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
 * The VISIBLE promo hero still. `PromoHero` renders a mobile and a desktop container and
 * hides one by breakpoint, so a bare `.first()` often lands on the hidden one — and passing a
 * hidden locator to `demo.highlight` HANGS the test (its `scrollIntoViewIfNeeded` has no
 * configured timeout). Always resolve the visible one, and wait for the bitmap to decode so
 * the spotlight lands on artwork rather than the loader.
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
        /**
         * Wait for the bitmap to DECODE, not merely for the `<img>` to be in the DOM, so the
         * spotlight lands on artwork rather than the loader.
         *
         * The in-page promise MUST race a timer. `locator.evaluate`'s `timeout` option bounds
         * resolving the LOCATOR — it does NOT bound a promise running inside the page, so a
         * promise that never settles hangs the whole run with no error. That is not
         * hypothetical: an image the browser never requests (lazy + offscreen, or a hero the
         * page decided not to fetch) is never `complete` and fires neither `load` nor `error`,
         * so the naive version waits forever. It cost two dead recordings before the cause was
         * found — the run sat idle for 20+ minutes with the server happily answering.
         *
         * Resolving on `error` and on timeout is deliberate: a genuinely broken asset should
         * fail on the src assertions with a useful message, not time out here with a vague one.
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
        return img;
      }
    }
    if (Date.now() > deadline) throw new Error(`no visible "Promo Hero" image among ${count} candidates after 30s`);
    await page.waitForTimeout(250);
  }
}

async function heroSrc(img: import("@playwright/test").Locator): Promise<string> {
  return decodeURIComponent((await img.getAttribute("src")) ?? "");
}

/**
 * Walk all 20 combinations in the current viewport, theme and draw state.
 *
 * Assertions are written against the URL GRAMMAR, not the pixels — that is what makes them
 * survive an art re-export that keeps the same filenames, and what caught nine mis-named
 * source files during the ingest.
 */
async function walkAllCombos(
  page: import("@playwright/test").Page,
  demo: import("../../fixtures/demo").Demo,
  viewport: "mobile" | "desktop",
  mode: "light" | "dark",
  state: "base" | "drawn-tomorrow" | "drawn-tonight"
): Promise<void> {
  const stateLabel =
    state === "base" ? "Standard" : state === "drawn-tomorrow" ? "Drawn Tomorrow" : "Drawn Tonight";
  const modeLabel = mode === "dark" ? "Dark" : "Light";

  for (const combo of COMBOS) {
    await page.goto(`/promotions/${combo.slug}`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    const hero = await visibleHero(page);
    const src = await heroSrc(hero);

    if (combo.artMissing) {
      // No GearWrench × Ryobi art exists. Assert only that the page still renders a real
      // hero from the fallback chain — never a broken or empty src.
      expect(src, `${combo.slug} must still resolve to some hero`).toMatch(/\.webp/);
      await demo.highlight(hero, `${combo.label} · art not yet produced — falls back`);
      continue;
    }

    // No trailing hyphen: the BASE hero has no suffix at all (`milwaukee-milTB.webp`), unlike
    // every drawn/dark/mobile variant. `{brand}-{toolbox}` is already unambiguous — the mode,
    // tier and viewport assertions below pin the rest of the filename.
    expect(src, `${viewport} ${mode} ${state} ${combo.slug}`).toContain(combo.asset);
    if (state !== "base") {
      expect(src, `${viewport} ${mode} ${state} ${combo.slug}`).toContain(state);
    } else {
      expect(src, `${viewport} ${mode} base ${combo.slug}`).not.toContain("drawn-");
    }
    if (mode === "dark") {
      expect(src, `${viewport} dark ${combo.slug}`).toContain("-dark");
    } else {
      expect(src, `${viewport} light ${combo.slug}`).not.toContain("-dark");
    }
    if (viewport === "mobile") {
      expect(src, `${viewport} ${combo.slug}`).toContain("-mobile");
    } else {
      expect(src, `${viewport} ${combo.slug}`).not.toContain("-mobile");
    }

    await demo.highlight(hero, `${combo.label} · ${modeLabel} · ${stateLabel}`);
  }
}

/** The GearWrench beats — the parts of draw 9 that are not landing heroes. */
async function showGearWrench(
  page: import("@playwright/test").Page,
  demo: import("../../fixtures/demo").Demo,
  mode: "light" | "dark"
): Promise<void> {
  const modeLabel = mode === "dark" ? "dark" : "light";

  const gwCard = page.locator('[aria-label="GearWrench Toolbox"]').first();
  if (await gwCard.count()) {
    await demo.highlight(gwCard, `GearWrench wordmark — two-tone, ${modeLabel} theme`);
  }

  const hero = await visibleHero(page);
  await demo.highlight(hero, `GearWrench prize page · ${modeLabel} theme`);
}

/**
 * Open the prize-details modal and walk its Storage tab, where the GearWrench toolbox's 13
 * trays now each render their own photographed card.
 *
 * Best-effort by design: the modal is a click-gated dynamic import, and this beat exists to
 * SHOW the contents, not to gate the run. If the trigger or tab isn't found the beat narrates
 * what it could reach rather than failing a 9-minute recording over a UI affordance — the
 * data itself is asserted by `test:prize-summaries` and the asset paths by `test:prize-builder`.
 */
async function showPrizeDetails(
  page: import("@playwright/test").Page,
  demo: import("../../fixtures/demo").Demo
): Promise<void> {
  const trigger = page.getByRole("button", { name: /view full details/i }).first();
  if ((await trigger.count()) === 0) {
    await demo.highlight(page.locator("body"), "prize details trigger not on this layout");
    return;
  }

  await demo.smoothScrollTo(trigger);
  await demo.highlight(trigger, "Open the full prize details");
  await trigger.click();

  /**
   * The modal arrives via a dynamic import — give the chunk time to land.
   *
   * Target the tab by its STABLE ID (`#pbc-tab-{section.id}`, from TabBar.tsx), not by name.
   * Name matching failed twice here: `/storage/i` opened the toolset's own "PACKAGE™ Storage"
   * tab because it sorts first, and `/tool storage/i` as a `role: "button"` query matched
   * nothing at all — these are `role="tab"`, not buttons. The section id is the same
   * `"storage"` used in the catalog's `specSections`, so this cannot drift from the data.
   */
  const storageTab = page.locator("#pbc-tab-storage");
  await storageTab.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
  if (await storageTab.isVisible().catch(() => false)) {
    await demo.highlight(storageTab, "Tool Storage — the toolbox and all 13 trays");
    await storageTab.click().catch(() => {});
    await page.waitForTimeout(900);
  }

  /**
   * Scroll the tray cards through frame so the contents are actually legible, spotlighting a
   * few.
   *
   * Two traps, both frame-verified: Next/Image rewrites `src` to `/_next/image?url=…` so the
   * path arrives URL-ENCODED (a raw `/toolbox/gearwrench/` selector finds nothing), and the
   * encoded prefix must include the trailing slash — `toolbox%2Fgearwrench` alone also
   * matches `toolbox%2FgearwrenchTB.webp`, the standalone box render, so the spotlight landed
   * on the hero thumbnail instead of a tray.
   */
  const dialog = page.getByRole("dialog").last();
  const trayShots = dialog.locator('img[src*="toolbox%2Fgearwrench%2F"], img[src*="/toolbox/gearwrench/"]');
  const shots = Math.min(await trayShots.count(), 5);
  for (let i = 0; i < shots; i++) {
    const shot = trayShots.nth(i);
    await shot.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
    if (!(await shot.isVisible().catch(() => false))) continue;
    await demo.highlight(shot, "Photographed tray — model number and piece count in the copy");
  }

  /**
   * Scoped to the DIALOG, and deliberately left OPEN.
   *
   * Unscoped, the same selector also matched the page's "What's in this prize" preview grid —
   * these tray shots are in the prize gallery now, so they render behind the modal too — and
   * scrolling to those tiles scrolled the modal out of frame. `demo.step` screenshots at the
   * END of a beat, so leaving the modal open makes that screenshot self-proving: it shows the
   * Tool Storage tab actually selected. The next beat navigates, which dismisses it.
   */
}

test.describe("draw 9 assets @demo", () => {
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
   * Reduced motion makes the STILL the visible hero, which is the asset under test — the
   * clips are proven separately by their own manifest test. Dev toolbar hidden; missing
   * clips served from their base twin so the 404 watchdog stays armed for real breakage.
   */
  async function prepare(page: import("@playwright/test").Page, theme: "light" | "dark"): Promise<void> {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await setTheme(page, theme);
    await serveHeroClipFallback(page);
    await hideDevToolbar(page);
  }

  /**
   * Every beat's page state is prepared BEFORE its `demo.step`. `demo.step` paints the
   * caption and holds for ~3.6s *before* running the body, so a beat that mutates and
   * reloads inside its own body narrates a change the viewer cannot see yet.
   */
  async function runProof(
    page: import("@playwright/test").Page,
    demo: import("../../fixtures/demo").Demo,
    viewport: "mobile" | "desktop"
  ): Promise<void> {
    const where = viewport === "mobile" ? "On a phone" : "On desktop";

    // ── The permit number ──────────────────────────────────────────────────────────────
    await prepare(page, "light");
    await setDrawDate(aestInstant(20, "20:30"));
    await page.goto("/promotions", { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });

    await demo.step(`${where}, draw 9 starts with a new NT permit number — NTP/17494`, async () => {
      const permit = page.getByText(/NTP\/17494/).first();
      await expect(permit).toBeAttached({ timeout: 30_000 });
      await demo.smoothScrollTo(permit);
      await demo.highlight(permit, "Permit NTP/17494");
    });

    // ── GearWrench, the fourth toolbox ─────────────────────────────────────────────────
    await page.goto("/promotions/milwaukee-gearwrench", { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });

    await demo.step(
      "GearWrench joins as the fourth toolbox — 288 pieces, with its own prize page",
      async () => {
        await showGearWrench(page, demo, "light");
      }
    );

    await demo.step(
      "And the prize details show what's actually inside those 288 pieces — every tray photographed",
      async () => {
        await showPrizeDetails(page, demo);
      }
    );

    // ── All 20 combinations, standard hero, light ──────────────────────────────────────
    await demo.step(
      "With the draw weeks away, all twenty combinations show their standard hero in light mode",
      async () => {
        await walkAllCombos(page, demo, viewport, "light", "base");
      }
    );

    // ── The same twenty in DARK — art that never existed before draw 9 ─────────────────
    await prepare(page, "dark");
    await page.goto("/promotions/milwaukee-milwaukee", { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });

    await demo.step(
      "Draw 9 is the first export with real dark artwork — until now dark mode was served the light hero",
      async () => {
        await walkAllCombos(page, demo, viewport, "dark", "base");
      }
    );

    // ── Drawn tomorrow, both modes ─────────────────────────────────────────────────────
    await setDrawDate(aestInstant(1, "20:30"));
    await prepare(page, "light");
    await page.goto("/promotions/milwaukee-milwaukee", { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });

    await demo.step("The day before the draw, every combination swaps to Drawn Tomorrow", async () => {
      await walkAllCombos(page, demo, viewport, "light", "drawn-tomorrow");
    });

    await prepare(page, "dark");
    await page.goto("/promotions/milwaukee-milwaukee", { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });

    await demo.step("And the same countdown art again in dark mode", async () => {
      await walkAllCombos(page, demo, viewport, "dark", "drawn-tomorrow");
    });

    // ── Drawn tonight, both modes ──────────────────────────────────────────────────────
    await setDrawDate(aestInstant(0, "23:59"));
    await prepare(page, "light");
    await page.goto("/promotions/milwaukee-milwaukee", { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });

    await demo.step("On draw day itself, all twenty swap again to Drawn Tonight", async () => {
      await walkAllCombos(page, demo, viewport, "light", "drawn-tonight");
    });

    await prepare(page, "dark");
    await page.goto("/promotions/milwaukee-milwaukee", { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });

    await demo.step("And Drawn Tonight in dark mode — completing all two hundred and forty states", async () => {
      await walkAllCombos(page, demo, viewport, "dark", "drawn-tonight");
    });
  }

  test("on mobile, every draw 9 hero state renders in both themes", async ({ page, demo }, testInfo) => {
    expect(
      testInfo.project.name,
      "must run under mobile-chrome so the video records at a real phone size"
    ).toBe("mobile-chrome");

    // 120 hero resolutions, each a page load plus a caption hold and a spotlight dwell, on
    // top of proof mode's 200ms slowMo.
    test.setTimeout(3_600_000);

    test.info().annotations.push({
      type: "demo-title",
      description: "Draw 9 on mobile — every prize combination, light and dark, across all three countdown states",
    });

    await runProof(page, demo, "mobile");
  });

  test("on desktop, every draw 9 hero state renders in both themes", async ({ page, demo }, testInfo) => {
    expect(
      testInfo.project.name,
      "must run under chromium-desktop so the video records at full desktop size"
    ).toBe("chromium-desktop");

    test.setTimeout(3_600_000);

    test.info().annotations.push({
      type: "demo-title",
      description: "Draw 9 on desktop — every prize combination, light and dark, across all three countdown states",
    });

    await runProof(page, demo, "desktop");
  });
});
