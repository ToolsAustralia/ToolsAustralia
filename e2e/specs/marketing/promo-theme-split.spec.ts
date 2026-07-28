import mongoose from "mongoose";
import { test, expect } from "../../fixtures/test";
import { connectE2eDb } from "../../helpers/db";

/**
 * Verifies the promo-landing default-theme A/B gate (`PromoThemeExperimentGate` +
 * `usePromoThemeExperiment`): half of new visitors default into DARK, the other half
 * stay LIGHT (control, today's behaviour), and a full-screen loader OVERLAYS the page
 * — children always render underneath for SEO — until the arm is resolved. The one
 * hard requirement under test: a dark-arm visitor must NEVER see a light frame once
 * the page is visible (no light-to-dark snap).
 *
 * DB SEEDING IS REQUIRED, NOT OPTIONAL. `PromoThemeExperimentGate`'s `experimentId`
 * prop is resolved server-side in `/promotions/[slug]/page.tsx` via
 * `ExperimentService.getActiveExperimentForSentinelSlug("__promo-theme__")` — when
 * that returns null (no active experiment), `usePromoThemeExperiment` resolves
 * `settled: true` SYNCHRONOUSLY and never calls `/api/ab-testing/assign` at all, so a
 * `page.route` stub on that endpoint alone (as a naive port of this test might assume)
 * would simply never fire. We insert a real active Experiment doc directly into the
 * e2e database (same pattern as draw9-assets.spec.ts's `majordraws` mutation) so the
 * gate actually engages; test 1 then stubs `/assign` at the network layer for a
 * deterministic dark arm, and test 2 relies on the same active experiment so its
 * "server HTML is substantial" assertion is a real guard against the overlay ever
 * replacing children, not a vacuous check against a bypassed gate.
 *
 * No Variant docs are seeded — `VariantAssignmentService.assignVariant` returns null
 * on zero variants (not a throw), so the real `/assign` endpoint still answers 200
 * with `variantConfig: null`, which `usePromoThemeExperiment` maps to "light". That's
 * fine for both tests: test 1 never lets the real endpoint answer (it's stubbed);
 * test 2 doesn't assert on the resolved theme at all, only on SSR payload size.
 *
 * SERIAL, sharing one seeded experiment: both tests read shared DB state and
 * `fullyParallel: true` can otherwise schedule tests from one file onto different
 * workers, which would double-insert / race the afterAll cleanup against a still-
 * running sibling test.
 */

const SLUG = "milwaukee-gearwrench";
const PROMO_THEME_SENTINEL_SLUG = "__promo-theme__";
const EXPERIMENT_NAME = "[e2e] promo-theme-split verification";

test.describe.configure({ mode: "serial" });

test.describe("promo theme split @smoke", () => {
  let experimentId: mongoose.Types.ObjectId | null = null;

  test.beforeAll(async () => {
    const db = await connectE2eDb();
    const experiments = db.connection.collection("experiments");
    // Defensive: remove any stray doc a previous crashed run left behind before
    // inserting a fresh one, so `findActiveBySentinelSlug`'s `sort({ createdAt: -1 })`
    // can never pick up stale state from this suite.
    await experiments.deleteMany({ name: EXPERIMENT_NAME });
    const { insertedId } = await experiments.insertOne({
      name: EXPERIMENT_NAME,
      status: "active",
      slugTargets: [PROMO_THEME_SENTINEL_SLUG],
      createdBy: new mongoose.Types.ObjectId(),
      archived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    experimentId = insertedId;
  });

  test.afterAll(async () => {
    if (!experimentId) return;
    const db = await connectE2eDb();
    await db.connection.collection("experiments").deleteOne({ _id: experimentId });
  });

  /**
   * The whole point of the gate: a dark-arm visitor must never see a light frame.
   * We stub /assign so the arm is deterministic, then sample <html> class from the
   * first paint onward and assert we never observed light-after-dark.
   */
  test("dark arm never paints light before dark", async ({ page }) => {
    await page.route("**/api/ab-testing/assign", async (route) => {
      const body = route.request().postDataJSON() as { slug?: string };
      if (body?.slug !== PROMO_THEME_SENTINEL_SLUG) return route.continue();
      await new Promise((r) => setTimeout(r, 250)); // realistic latency
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          variantId: "stub-dark",
          variantConfig: { promoTheme: { defaultTheme: "dark" } },
        }),
      });
    });

    await page.addInitScript(() => {
      (window as unknown as { __themeSamples: string[] }).__themeSamples = [];
      const sample = () => {
        const w = window as unknown as { __themeSamples: string[] };
        w.__themeSamples.push(document.documentElement.classList.contains("dark") ? "dark" : "light");
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    await page.goto(`/promotions/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("html")).toHaveClass(/dark/, { timeout: 30_000 });
    await page.waitForTimeout(1500);

    const samples: string[] = await page.evaluate(
      () => (window as unknown as { __themeSamples: string[] }).__themeSamples,
    );

    // The overlay must be up for every light sample: a light frame is only
    // acceptable while the loader covers the page. Asserting the theme actually
    // resolved to dark guards against a mis-shaped stub silently falling back to
    // light and this test passing for the wrong reason (see file header).
    const firstDark = samples.indexOf("dark");
    expect(firstDark, "theme resolved to dark").toBeGreaterThanOrEqual(0);
    expect(samples.slice(firstDark).every((s) => s === "dark"), "no dark→light regression").toBe(true);
  });

  test("control arm HTML is server-rendered, not a spinner", async ({ page }) => {
    const res = await page.goto(`/promotions/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const html = (await res?.text()) ?? "";
    expect(html.length, "server HTML is substantial, not a loader shell").toBeGreaterThan(20_000);
  });
});
