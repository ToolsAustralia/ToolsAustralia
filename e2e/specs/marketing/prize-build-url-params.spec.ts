import { test, expect } from "../../fixtures/test";

/**
 * Guards the "build your prize in place" contract on `/promotions/*` — panel finding F-008.
 *
 * The bug this spec exists to stop coming back: selecting a combination used to NAVIGATE to a
 * different prize page, which reset the scroll position to the top of the document and pushed a
 * history entry per click. It shipped to production once. The fix moved selection into query
 * params written with `window.history.replaceState` (never `router.replace`, which refetches the
 * RSC payload and resets scroll even with `{ scroll: false }` — see the comment block at
 * `src/components/sections/promo/PrizeShowcase.tsx:243`).
 *
 * Everything asserted here was verified by hand once (spec §7's B1-B8 matrix) and had no
 * automated guard. The four contract tests below are B1 (no scroll), B5 (no history growth),
 * B4 (a shared link opens on that build), and the beacon's debounce; the fifth is the data shape
 * that the admin's switch-away ratio has to survive.
 *
 * WHY `/promotions/makita`: a toolset LANDING page, so it also exercises the landing-slug →
 * default-prize resolution in `resolveBuiltPrizeSlug` (`makita` is not itself a prize slug;
 * the page's own prize is `makita-milwaukee`). It renders `PrizeShowcase` with `ssr: true` and
 * `slugProp` set, which means the localStorage toolbox preference is deliberately NOT read
 * (`PrizeShowcase.tsx:318`) — so every page load in this spec starts from the same selection
 * regardless of what an earlier test in the same context clicked. That is what makes the
 * multi-load test below deterministic.
 *
 * SELECTORS were read from the components, not guessed: `SelectorReel` renders each lane as
 * `role="radiogroup"` named by its head label ("Toolbox" / "Power toolset") with `role="radio"`
 * cards carrying `aria-checked`. A card's accessible name comes from its artwork — the toolbox
 * mark's `aria-label` (`BrandMark`, e.g. "470 Piece Kincrome Toolbox") and the toolset
 * wordmark's `alt` (`ReelCards`, e.g. "Ryobi"). Cards more than `REEL_VISIBLE_RADIUS` (3) away
 * from the focused one are `aria-hidden`, so `getByRole` only ever returns on-stage cards; with
 * 4 toolboxes and 5 toolsets every card in both lanes stays addressable.
 */

/** Toolset landing page. Its own prize is `makita-milwaukee` (Milwaukee toolbox is the default). */
const PROMO_PATH = "/promotions/makita";
const DEFAULT_BUILD = "makita-milwaukee";
const BEACON_PATH = "/api/tracking/promo-prize-build";

/** The payload `usePrizeBuildTracking` posts. Counts are cumulative; the server `$set`s them. */
interface BuildBeacon {
  slug: string;
  builtPrizeSlug: string;
  toolboxSwitches: number;
  toolsetSwitches: number;
}

type Page = import("@playwright/test").Page;

/** Collect every prize-build beacon the page fires, without intercepting it — the real POST
 *  still reaches the real route, so a 5xx there is still caught by the shared watchdog. */
function captureBuildBeacons(page: Page): BuildBeacon[] {
  const seen: BuildBeacon[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST" || !request.url().includes(BEACON_PATH)) return;
    const body = request.postData();
    if (body) seen.push(JSON.parse(body) as BuildBeacon);
  });
  return seen;
}

const toolboxLane = (page: Page) => page.getByRole("radiogroup", { name: "Toolbox", exact: true });
const toolsetLane = (page: Page) => page.getByRole("radiogroup", { name: "Power toolset", exact: true });

/**
 * Load the promo page and wait until BOTH reels are interactive.
 *
 * `PrizeShowcase` is `dynamic()` with `ssr: true`, so the reels are in the SSR HTML and VISIBLE
 * before their client chunk has arrived. Visibility alone is therefore not "interactive" — the
 * `networkidle` wait is what tells us the chunk is down. It is bounded and swallowed rather than
 * awaited strictly: it is a settle hint, and a promo page that keeps a socket warm must not fail
 * an assertion about prize selection.
 */
async function openShowcase(page: Page, search = ""): Promise<void> {
  await page.goto(`${PROMO_PATH}${search}`, { waitUntil: "domcontentloaded" });
  await expect(toolboxLane(page)).toBeVisible({ timeout: 45_000 });
  await expect(toolsetLane(page)).toBeVisible();
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
}

/**
 * Scroll the reels into view and wait for the scroll position to stop moving.
 *
 * Measuring a scroll delta is only meaningful from a settled position: lazy images and the promo
 * hero can still be resolving right after `domcontentloaded`. Polls rather than sleeping a fixed
 * amount so it costs nothing on a fast run.
 */
async function settleAtShowcase(page: Page, target?: import("@playwright/test").Locator): Promise<number> {
  // CENTRE the element that is about to be clicked — `scrollIntoViewIfNeeded` only guarantees it
  // is *visible*, which can leave it flush against the viewport edge. WebKit then scrolls it
  // further into view when the click focuses it, and a scroll-delta assertion reads that as page
  // movement (observed twice on mobile-safari as an 82px drift, passing on retry). Centring
  // leaves the native focus scroll with nothing to do, on every engine.
  const anchor = target ?? toolboxLane(page);
  await anchor.scrollIntoViewIfNeeded();
  await anchor.evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" as ScrollBehavior }));
  let previous = -1;
  for (let i = 0; i < 20; i++) {
    const current = await page.evaluate(() => Math.round(window.scrollY));
    if (current === previous) return current;
    previous = current;
    await page.waitForTimeout(150);
  }
  return previous;
}

/**
 * Warm the route before the first assertion, per docs/e2e/adding-a-spec.md's cold-server compile
 * budget: `/promotions/*` is a heavy route and this spec is the only one that drives its client
 * behaviour, so on a cold Turbopack dev server the first browser hit pays for every chunk.
 * Measured while writing this spec: without the warm-up, the beacon polls on the second and third
 * page loads timed out under three-project parallel load. A real browser navigation is required —
 * an HTML `request.get()` compiles the server route but not the client chunks.
 */
async function warmPromoRoute(browser: import("@playwright/test").Browser): Promise<void> {
  // NB: callers must also raise the HOOK's own timeout — a `beforeEach`-set test timeout does not
  // apply to `beforeAll`. Under a full `e2e:smoke` run (85 tests, 3 projects, one dev server) this
  // warm-up exceeded the default 90s hook budget on mobile-safari and flaked the whole file.
  const warm = await browser.newPage();
  try {
    await warm.goto(PROMO_PATH, { waitUntil: "domcontentloaded" });
    await warm
      .getByRole("radiogroup", { name: "Toolbox", exact: true })
      .waitFor({ state: "visible", timeout: 120_000 });
    await warm.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  } finally {
    await warm.close();
  }
}

test.describe("prize build URL params @smoke", () => {
  // `/promotions/*` is a heavy route and these tests wait on a 1s-debounced beacon on top of the
  // page load. The default 90s is sized for a single-page test; a three-project concurrent run
  // shares one `next dev` server, where a mobile-safari `click()` was observed timing out at 90s
  // and then passing on retry. Same reasoning as purchase-subscription.spec.ts's budget note.
  test.beforeEach(() => {
    test.setTimeout(150_000);
  });

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000); // hook budget, separate from the per-test one
    await warmPromoRoute(browser);
  });

  test("picking a toolbox writes the URL without moving the page", async ({ page }) => {
    // An unrelated param rides along: `buildPrizeSelectionHref` must preserve `aff`/`packages`/
    // UTMs, or a partner link would lose its attribution the moment the visitor touched a reel.
    await openShowcase(page, "?aff=e2e-partner");

    // Untouched page: no lane params at all. Their PRESENCE is what marks "engaged with the
    // reels", so a page nobody touched has to stay clean.
    expect(new URL(page.url()).searchParams.has("toolbox")).toBe(false);
    expect(new URL(page.url()).searchParams.has("toolset")).toBe(false);

    // Kincrome sits one card right of the default (Milwaukee) in the toolbox lane.
    const kincrome = toolboxLane(page).getByRole("radio", { name: /kincrome/i });

    const scrollBefore = await settleAtShowcase(page, kincrome);
    expect(scrollBefore, "the reels must be scrolled into view for this measurement to mean anything").toBeGreaterThan(0);

    await kincrome.click();

    await expect(kincrome).toHaveAttribute("aria-checked", "true");

    const params = new URL(page.url()).searchParams;
    expect(params.get("toolbox")).toBe("kincrome");
    // BOTH lanes are written, even the one still on its default — see `buildPrizeSelectionHref`.
    expect(params.get("toolset")).toBe("makita");
    expect(params.get("aff"), "unrelated params must survive the rewrite").toBe("e2e-partner");

    // THE REGRESSION. The old navigation reset this to 0; `replaceState` cannot scroll at all.
    const scrollAfter = await page.evaluate(() => Math.round(window.scrollY));
    expect(scrollAfter, "selecting a prize must not move the page").toBe(scrollBefore);
  });

  test("four selections add no history entries, so Back still leaves the page", async ({ page }) => {
    const beacons = captureBuildBeacons(page);
    await openShowcase(page);
    await settleAtShowcase(page);

    const historyBefore = await page.evaluate(() => window.history.length);

    // A chain, not four clicks on one card: each selection brings the next card on stage.
    // Toolbox lane order is milwaukee → kincrome → sidchrome → gearwrench.
    await toolboxLane(page).getByRole("radio", { name: /kincrome/i }).click();
    await toolboxLane(page).getByRole("radio", { name: /sidchrome/i }).click();
    await toolboxLane(page).getByRole("radio", { name: /gearwrench/i }).click();
    await toolsetLane(page).getByRole("radio", { name: /ryobi/i }).click();

    expect(new URL(page.url()).searchParams.get("toolbox")).toBe("gearwrench");
    expect(new URL(page.url()).searchParams.get("toolset")).toBe("ryobi");

    const historyAfter = await page.evaluate(() => window.history.length);
    expect(historyAfter, "replaceState must not push entries — pushState would make Back a trap").toBe(historyBefore);

    // Cross-lane cumulative counting, asserted where the debounce cannot interfere: the counters
    // only ever grow, so whether these four clicks produced one report or four, the LAST one
    // carries the totals. That makes this the timing-independent half of the beacon contract —
    // the debounce test below owns the "one write per burst" half.
    await expect
      .poll(() => beacons.at(-1), { timeout: 20_000 })
      .toEqual({
        slug: "makita",
        builtPrizeSlug: "ryobi-gearwrench",
        toolboxSwitches: 3,
        toolsetSwitches: 1,
      });
  });

  test("a shared link opens on exactly that build", async ({ page }) => {
    await openShowcase(page, "?toolset=milwaukee&toolbox=kincrome");

    await expect(
      toolboxLane(page).getByRole("radio", { checked: true }),
      "the toolbox lane must hydrate from ?toolbox="
    ).toHaveAccessibleName(/kincrome/i);
    await expect(
      toolsetLane(page).getByRole("radio", { checked: true }),
      "the toolset lane must hydrate from ?toolset="
    ).toHaveAccessibleName(/milwaukee/i);

    // Hydration must not rewrite the URL it just read.
    const params = new URL(page.url()).searchParams;
    expect(params.get("toolbox")).toBe("kincrome");
    expect(params.get("toolset")).toBe("milwaukee");
  });

  test("three rapid switches report one build, with cumulative counts", async ({ page }) => {
    const beacons = captureBuildBeacons(page);
    await openShowcase(page);
    await settleAtShowcase(page);

    /*
     * The burst is driven by the KEYBOARD, not by three clicks — `SelectorReel` implements the
     * ARIA radiogroup pattern (roving tabindex, Left/Right steps the lane with wrap-around), so
     * this is a first-class user path, not a shortcut around the UI.
     *
     * Why it matters: an earlier draft used three `click()`s and failed on all three projects
     * with 3 beacons instead of 1. That was the harness, not the product — each Playwright click
     * re-runs actionability checks, and on a dev server under parallel load the gap between
     * clicks exceeded the 1000ms debounce window, so three separate writes were CORRECT. Key
     * presses on an already-focused lane carry no such overhead, so the burst is actually a
     * burst and the assertion measures the debounce instead of the machine.
     */
    // All three steps stay in ONE lane. Crossing lanes mid-burst is not safe here:
    // `selectAndFocus` moves focus inside a `requestAnimationFrame`, which on WebKit landed
    // AFTER an explicit `focus()` on the other lane and stole the next key press back — the
    // burst then read `toolboxSwitches: 3, toolsetSwitches: 0` instead of 2/1. Waiting for focus
    // to stick would spend the debounce budget the test is here to measure. Cumulative counting
    // ACROSS both lanes is proved in the history test above, where timing does not matter.
    await toolboxLane(page).getByRole("radio", { checked: true }).focus();
    await page.keyboard.press("ArrowRight"); // milwaukee -> kincrome
    await page.keyboard.press("ArrowRight"); // kincrome  -> sidchrome
    await page.keyboard.press("ArrowRight"); // sidchrome -> gearwrench

    await expect.poll(() => beacons.length, { timeout: 20_000 }).toBeGreaterThan(0);
    // Past the debounce with room to spare: if it were per-click, the other two would land here.
    await page.waitForTimeout(1_500);

    expect(beacons.length, "the debounce must collapse a burst of switches into one write").toBe(1);
    expect(beacons[0]).toEqual({
      // The LANDING slug, never the built prize — the two are different columns on the visit row.
      slug: "makita",
      builtPrizeSlug: "makita-gearwrench",
      toolboxSwitches: 3,
      toolsetSwitches: 0,
    });
  });

  test("garbage lane params fall back to the page's own prize", async ({ page }) => {
    // `parseToolboxQueryParam`/`parseToolsetQueryParam` validate against the registries, so an
    // unknown value must be ignored rather than composing a prize slug that does not exist.
    await openShowcase(page, "?toolset=notabrand&toolbox=%20%3Cscript%3E");

    await expect(toolboxLane(page).getByRole("radio", { checked: true })).toHaveAccessibleName(/milwaukee/i);
    await expect(toolsetLane(page).getByRole("radio", { checked: true })).toHaveAccessibleName(/makita/i);
  });
});

/**
 * The multi-load test runs under a SHADOWED watchdog (docs/e2e/adding-a-spec.md, "Shadowing the
 * watchdog for known-benign noise"), because three full navigations in one test produce two
 * classes of console noise that the shared fixture cannot tell apart from a real bug:
 *
 * 1. `/api/major-draw` intermittently 404s ("No active major draw found", plus its companion
 *    "Failed to load resource ... 404") under three-project parallel load. The e2e seed creates
 *    exactly one draw, `status: "active"`, `activationDate` −1 day, `drawDate` +20 days
 *    (e2e/seed/draw.ts), so this is not a seed-state problem and it is not on the contract this
 *    spec asserts. Reported as panel finding F-015 for a human to root-cause; not silenced
 *    globally.
 * 2. WebKit reports a fetch cancelled by navigation as `pageerror: ... due to access control
 *    checks` and next-auth surfaces the same cancellation as `CLIENT_FETCH_ERROR ... Load
 *    failed` — 29 of them in one observed run, all on `/api/auth/session`. An artifact of
 *    navigating three times, not a defect.
 *
 * The four contract tests above keep the STRICT watchdog and load the same route, so a 404 that
 * became frequent would still fail this file. Only the test that navigates three times relaxes.
 */
const NAV_HEAVY_ALLOWLIST: RegExp[] = [
  /No active major draw found/i,
  /Failed to load resource.*\b404\b/i,
  /due to access control checks/i,
  /CLIENT_FETCH_ERROR/i,
];

/* eslint-disable react-hooks/rules-of-hooks -- Playwright's fixture continuation parameter is
   conventionally named `use`, which collides with React 19's `use` hook for this rule; the same
   false positive is already present, unfixed, in ../../fixtures/test.ts. Scoped to this override. */
const navHeavyTest = test.extend({
  // `auto: true` is inherited from the base declaration — re-specifying it here is a type error.
  watchdog: async ({ page, context, baseURL }, use) => {
    await context.route(/klaviyo\.com|contentsquare\.net|hotjar\.(com|io)/, (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "" })
    );
    const problems: string[] = [];
    const allowed = (text: string) => NAV_HEAVY_ALLOWLIST.some((rx) => rx.test(text));
    page.on("pageerror", (e) => {
      if (!allowed(e.message)) problems.push(`pageerror: ${e.message}`);
    });
    page.on("console", (m) => {
      if (m.type() === "error" && !allowed(m.text())) {
        problems.push(`console.error: ${m.text().slice(0, 300)}`);
      }
    });
    // 5xx is NOT allowlisted — a server error still fails this test.
    page.on("response", (r) => {
      if (baseURL && r.url().startsWith(baseURL) && r.status() >= 500) {
        problems.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`);
      }
    });
    await use();
    if (problems.length) {
      throw new Error(`QA watchdog caught ${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
    }
  },
});
/* eslint-enable react-hooks/rules-of-hooks */

navHeavyTest.describe("prize build URL params — multi-load @smoke", () => {
  navHeavyTest.beforeAll(async ({ browser }) => {
    navHeavyTest.setTimeout(240_000); // hook budget, separate from the per-test one
    await warmPromoRoute(browser);
  });

  /**
   * The shape that broke the admin dashboard (panel finding F-013, seen on staging as
   * "Switched away: 250%").
   *
   * One visitor can hold SEVERAL distinct builds — one per page load — so summing the
   * per-combination visitor counts legitimately exceeds the number of unique visitors. Every
   * unit test of the ratio used one row per visitor and so could never catch it. This test
   * produces the real thing end to end: one browser session, three loads, three different
   * builds. If a future change ever collapses a visitor to a single build, the premise behind
   * the fixed denominator changes and this goes red.
   *
   * "One visitor" is enforced two ways: the Playwright CONTEXT is one cookie jar across all
   * three loads, AND `ta_anon_id` — the cookie the visit row is actually keyed on — is asserted
   * present and unchanged throughout.
   *
   * That assertion has history worth keeping. When this spec was first written (2026-07-28) it
   * failed outright: the cookie's only writer was `/api/ab-testing/assign`, so a visitor who
   * never triggered an experiment reached `/promotions/*` with no identity at all — measured
   * against the real database, 92 of 241 promo visits in the preceding 30 days (38.2%) carried
   * neither `anonymousId` nor `userId`. That was raised as panel finding F-014, and main's
   * `c5a360c1` fixed it exactly as recommended: `src/middleware.ts` now mints the cookie for
   * every matched page route via `src/lib/ab-testing/anon-id-cookie.ts`. F-014 is therefore
   * SUPERSEDED, and the assertion below is what keeps it that way — narrow the middleware
   * matcher or drop the minting and this test goes red rather than silently under-counting
   * visitors again. Never seed the cookie to make it pass.
   */
  navHeavyTest("one visitor can report several different builds across page loads", async ({ page, context }) => {
    // Three full loads of a heavy route. Same reasoning as purchase-subscription.spec.ts's
    // budget note: the default 90s is sized for a single-page test, and a three-project
    // concurrent run shares one `next dev` server. Observed failing at `page.goto` on the
    // third load at 90s while otherwise passing on retry.
    navHeavyTest.setTimeout(180_000);

    const beacons = captureBuildBeacons(page);
    const anonId = async () =>
      (await context.cookies()).find((cookie) => cookie.name === "ta_anon_id")?.value;

    await openShowcase(page);
    await settleAtShowcase(page);

    // Minted by middleware on the very first page hit — see the block comment above.
    const visitor = await anonId();
    expect(visitor, "middleware must mint ta_anon_id on /promotions/* (F-014)").toBeTruthy();
    expect(visitor, "the id must match AnonymousIdService's format or assignments split").toMatch(/^anon_/);

    await toolboxLane(page).getByRole("radio", { name: /kincrome/i }).click();
    await expect.poll(() => beacons.length, { timeout: 25_000 }).toBe(1);

    await openShowcase(page);
    await settleAtShowcase(page);
    await toolsetLane(page).getByRole("radio", { name: /ryobi/i }).click();
    await expect.poll(() => beacons.length, { timeout: 25_000 }).toBe(2);

    await openShowcase(page);
    await settleAtShowcase(page);
    await toolboxLane(page).getByRole("radio", { name: /sidchrome/i }).click();
    await expect.poll(() => beacons.length, { timeout: 25_000 }).toBe(3);

    // All three reports name the same landing page, from the same session — and crucially the
    // same VISITOR: a re-minted id mid-session would split one person into several, which is
    // precisely the under-count F-014 described.
    expect(await anonId(), "all three builds must come from ONE visitor identity").toBe(visitor);
    expect(beacons.map((beacon) => beacon.slug)).toEqual(["makita", "makita", "makita"]);

    const builds = beacons.map((beacon) => beacon.builtPrizeSlug);
    // Each load starts from the page's own default, so the builds differ by the lane touched.
    expect(builds).toEqual(["makita-kincrome", "ryobi-milwaukee", "makita-sidchrome"]);
    expect(new Set(builds).size, "one visitor, three distinct builds").toBe(3);
    expect(builds).not.toContain(DEFAULT_BUILD);
  });
});
