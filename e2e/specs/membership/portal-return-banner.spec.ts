import { test, expect } from "../../fixtures/test";
import { MEMBER_STATE } from "../../lib/paths";

/**
 * Assertion coverage for the rewards-return banner on /membership (panel F-023).
 * The narrated walkthrough lives in `portal-return-demo.spec.ts` (@demo); THIS spec
 * is the guard: server-side param resolution, the untrusted-input rules, and the
 * "normal visitors see nothing" invariant.
 *
 * Non-mutating (navigation + reads only) → @smoke. Never clicks "Open partner portal":
 * the SSO route POSTs to the REAL iGoDirect production tenant and auto-creates a
 * permanent MyRewards record (see docs/e2e/adding-a-spec.md).
 *
 * Fixture offers (from src/generated/partnerCatalogOffers.ts, regenerated from the
 * committed CSV — ids are stable vendor ids): 1064993 = Amazon.com.au eGift Card @100%,
 * 1066574 = Witchery eGift Card @40%.
 *
 * KNOWN CHARACTERISTIC (2026-07-28, measured — not a product bug): on a freshly booted
 * dev server these tests can need Playwright's retry. /membership is one of the heaviest
 * client bundles in the app and Turbopack compiles it on the first BROWSER hit; until
 * then the banner sits in its skeleton. Measured under identical fixture conditions
 * (pinned x-forwarded-for + third-party route blocking): warm server → banner settles in
 * 3-8s with every /api/* call 200 and no page errors; cold server → the skeleton can
 * outlive a 60s assertion. The beforeAll below pays that compile once; the retry absorbs
 * the rest. If these ever fail ON RETRY, that IS a real regression — investigate, don't
 * raise the timeout.
 */
const AMAZON = { id: "1064993", name: "Amazon.com.au eGift Card", pct: 100 };
const WITCHERY = { id: "1066574", name: "Witchery eGift Card", pct: 40 };

const BANNER_EYEBROW = "Partner catalogue";

/**
 * Wait for the banner to finish its two-phase render before asserting copy.
 *
 * The banner paints a same-height SKELETON first (panel F-001 — it must NOT pop in
 * late and shift the page), then swaps in the resolved copy once useDashboardState's
 * queries settle. Asserting a headline without waiting for that swap races the
 * skeleton and fails with "element not found" even though the feature is healthy —
 * which is exactly how this spec flaked before the helper existed. Waiting on
 * `aria-busy` (set only by the skeleton) is deterministic, and doubles as coverage
 * that the skeleton exists and clears.
 */
async function bannerSettled(page: import("@playwright/test").Page) {
  const banner = page.locator("section", { hasText: BANNER_EYEBROW }).first();
  await expect(banner).toBeVisible({ timeout: 60_000 });
  await expect(banner).not.toHaveAttribute("aria-busy", "true", { timeout: 60_000 });
}

test.describe("rewards-return banner @smoke", () => {
  test.skip(process.env.E2E_EXTERNAL === "1", "needs the seeded isolated environment");

  // Cold-dev-server budget. /membership is a heavy route and the banner only settles
  // once useDashboardState's queries resolve (/api/major-draw, and for members
  // /api/users/[id]/my-account) — in a freshly booted dev server EACH of those
  // compiles on first hit. Measured: warm ≈ 2s, cold ≫ 30s, which made every
  // assertion here flaky-on-first-run before this budget + the warm-up below.
  test.describe.configure({ timeout: 150_000 });

  // Warm the route with a REAL navigation, once per run. An HTML-only request is not
  // enough: it compiles the server route but not the /membership CLIENT chunks, and it
  // is those (heavy page: modal + every section) that Turbopack compiles on the first
  // BROWSER hit. Verified: under identical fixture conditions on a warm server the
  // banner settles in 3-8s; on a cold one the skeleton can outlive a 60s assertion.
  test.beforeAll(async ({ browser }) => {
    const warm = await browser.newPage();
    try {
      await warm.goto("/membership?utm_campaign=rewards-return&offer_id=1064993", {
        waitUntil: "networkidle",
        timeout: 120_000,
      });
      // Let the client bundle hydrate and the dashboard queries resolve once.
      await warm
        .locator("section", { hasText: BANNER_EYEBROW })
        .first()
        .and(warm.locator(':not([aria-busy="true"])'))
        .waitFor({ state: "visible", timeout: 120_000 });
    } catch {
      // Warm-up is best-effort — a failure here must not mask a real assertion below.
    } finally {
      await warm.close();
    }
  });

  test.describe("guest", () => {
    // Explicit empty state — a guest visit that still gets full fixture coverage.
    test.use({ storageState: { cookies: [], origins: [] } });

    test("no params → no banner at all", async ({ page }) => {
      await page.goto("/membership");
      await expect(page.getByRole("heading", { name: /Save big/i }).first()).toBeVisible({
        timeout: 60_000,
      });
      // The eyebrow is unique to the banner; the page's own sections never render it.
      await expect(page.getByText(BANNER_EYEBROW, { exact: true })).toHaveCount(0);
    });

    test("campaign only → generic unlock banner", async ({ page }) => {
      await page.goto("/membership?utm_campaign=rewards-return");
      await bannerSettled(page);
      await expect(page.getByRole("heading", { name: "Unlock the partner catalogue" })).toBeVisible();
      // F-004: a lapsed-session member must always find a way in.
      await expect(page.getByRole("link", { name: /Log in to check your access/i })).toBeVisible();
    });

    test("known offer_id → server-resolved offer name and tier", async ({ page }) => {
      await page.goto(`/membership?utm_campaign=rewards-return&offer_id=${AMAZON.id}`);
      await bannerSettled(page);
      await expect(
        page.getByRole("heading", { name: `${AMAZON.name} unlocks at ${AMAZON.pct}% access.` })
      ).toBeVisible();
    });

    test("untrusted params never render: script payload, junk level, prototype key", async ({ page }) => {
      // The watchdog fixture fails the test on any pageerror, so an executed payload
      // would surface there too; this asserts the sanitised OUTPUT.
      await page.goto(
        "/membership?utm_campaign=rewards-return&offer_name=%3Cscript%3Ealert(1)%3C%2Fscript%3E&level=999"
      );
      await bannerSettled(page);
      await expect(page.getByRole("heading", { name: "Unlock the partner catalogue" })).toBeVisible();
      await expect(page.locator("body")).not.toContainText("alert(1)");

      // F-008: an off-catalogue name is discarded even with a VALID ladder level.
      await page.goto("/membership?utm_campaign=rewards-return&offer_name=Free%20%24500%20Bonus&level=50");
      await bannerSettled(page);
      await expect(page.getByRole("heading", { name: "Unlock the partner catalogue" })).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Free $500 Bonus");

      // Prototype-chain key must not resolve to a phantom offer.
      await page.goto("/membership?utm_campaign=rewards-return&offer_id=__proto__");
      await bannerSettled(page);
      await expect(page.getByRole("heading", { name: "Unlock the partner catalogue" })).toBeVisible();
    });

    test("catalogue-matched offer_name resolves (case/spacing-insensitive)", async ({ page }) => {
      await page.goto(
        `/membership?utm_campaign=rewards-return&offer_name=${encodeURIComponent("  witchery   egift   card ")}`
      );
      await bannerSettled(page);
      // Catalogue values win: canonical name + the catalogue's own percent.
      await expect(
        page.getByRole("heading", { name: `${WITCHERY.name} unlocks at ${WITCHERY.pct}% access.` })
      ).toBeVisible();
    });
  });

  test.describe("seeded member (Tradie, 50%)", () => {
    test.use({ storageState: MEMBER_STATE });

    test("offer above their tier → gap headline + unlock recommendation", async ({ page }) => {
      await page.goto(`/membership?utm_campaign=rewards-return&offer_id=${AMAZON.id}`);
      await bannerSettled(page);
      await expect(
        page.getByRole("heading", { name: `You're at 50% — ${AMAZON.name} needs ${AMAZON.pct}%.` })
      ).toBeVisible();
      // Cheapest package covering 100% is the Boss membership ($80/mo) — see
      // test:unlock-packages for the full ladder.
      await expect(page.getByRole("button", { name: /Unlock with the Boss/i })).toBeVisible();
      // F-011: full coverage reads "all N", never "N of N".
      await expect(page.getByText(/Unlocks all [\d,]+ partner offers/)).toBeVisible();
    });

    test("offer within their tier → covered state, no unlock CTA", async ({ page }) => {
      await page.goto(`/membership?utm_campaign=rewards-return&offer_id=${WITCHERY.id}`);
      await bannerSettled(page);
      await expect(
        page.getByRole("heading", { name: `You're set — your 50% access covers ${WITCHERY.name}.` })
      ).toBeVisible();
      await expect(page.getByRole("button", { name: /Unlock with the/i })).toHaveCount(0);
    });
  });
});
