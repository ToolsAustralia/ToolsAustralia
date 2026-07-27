import assert from "node:assert/strict";
import {
  resolveLandingHeroImage,
  resolveLandingHeroImagesWithUrgency,
  resolveEvergreenHeroImage,
  resolveLandingHeroBackground,
  LANDING_HERO_BACKGROUND,
} from "../landing-image-resolver";
import { LANDING_IMAGE_MANIFEST } from "@/generated/landingImageManifest";

/**
 * Every brand that ships landing art. HiKOKI joined the drawn-art set in the 2026-07
 * export (previously base-only), so it now belongs in the same loops as the other four
 * rather than being excluded from the drawn/urgency assertions.
 */
const LANDING_BRANDS = ["ryobi", "milwaukee", "dewalt", "makita", "hikoki"] as const;

/**
 * Light sidTB base files NOW ship for every brand (2026-06-12 — the winning A/B
 * hero, variation 2, replaced the per-brand defaults and added the previously
 * missing `{brand}-sidTB.webp` / `{brand}-sidTB-mobile.webp` light bases). The
 * resolver must return the light base directly — no dark fallback.
 */
function testLightSidTbReturnsLightBase() {
  for (const brand of LANDING_BRANDS) {
    const desktop = resolveLandingHeroImage(brand, "light", "desktop", "sidTB", null);
    const mobile = resolveLandingHeroImage(brand, "light", "mobile", "sidTB", null);
    assert.ok(
      !desktop.includes("-dark"),
      `${brand} light desktop sidTB (no urgency) should return light base, got ${desktop}`
    );
    assert.ok(
      !mobile.includes("-dark"),
      `${brand} light mobile sidTB (no urgency) should return light base, got ${mobile}`
    );
    assert.ok(
      LANDING_IMAGE_MANIFEST.has(desktop),
      `light base ${desktop} must exist in manifest`
    );
    assert.ok(
      LANDING_IMAGE_MANIFEST.has(mobile),
      `light base ${mobile} must exist in manifest`
    );
  }
}

/**
 * Existing combos must round-trip unchanged — no spurious mode swap when the
 * requested file is already on disk.
 */
function testExistingComboReturnsAsIs() {
  // milTB light desktop (base) is present on disk for all brands
  for (const brand of LANDING_BRANDS) {
    const url = resolveLandingHeroImage(brand, "light", "desktop", "milTB", null);
    assert.ok(!url.includes("-dark"), `${brand} milTB light should NOT swap to dark, got ${url}`);
    assert.ok(LANDING_IMAGE_MANIFEST.has(url), `${url} must exist in manifest`);
  }
  // No landing toolbox ships final-hours art — the tier collapses to the base hero.
  for (const brand of LANDING_BRANDS) {
    const url = resolveLandingHeroImage(brand, "light", "desktop", "sidTB", "final-hours");
    assert.ok(!url.includes("final-hours"), `${brand} sidTB final-hours should collapse to base, got ${url}`);
    assert.ok(LANDING_IMAGE_MANIFEST.has(url), `${url} must exist in manifest`);
  }
}

/**
 * sidTB dark bases no longer ship (2026-06-12 — the variation-2 promotion replaced the
 * per-brand defaults with light-only sidTB bases; no `*-sidTB-dark.webp` exists in the
 * manifest for any brand). A dark sidTB request must therefore fall back to the LIGHT
 * base: the returned URL has no `-dark` and is in the manifest. (Was previously asserting
 * a `-dark` URL — stale since 2026-06-12, which left `test:landing-image-resolver` red.)
 */
function testDarkSidTbFallsBackToLightBase() {
  for (const brand of LANDING_BRANDS) {
    const url = resolveLandingHeroImage(brand, "dark", "desktop", "sidTB", null);
    assert.ok(!url.includes("-dark"), `${brand} sidTB dark should fall back to light base, got ${url}`);
    assert.ok(LANDING_IMAGE_MANIFEST.has(url), `${url} must exist in manifest`);
  }
}

/**
 * Kincrome now ships -drawn-tomorrow / -drawn-tonight art (resolves with the suffix), but no
 * -final-hours tier (collapses to the base kinTB hero).
 */
function testKinTbDrawnTiersResolveAndFinalHoursCollapses() {
  for (const brand of LANDING_BRANDS) {
    for (const urgency of ["drawn-tomorrow", "drawn-tonight"] as const) {
      const url = resolveLandingHeroImage(brand, "light", "desktop", "kinTB", urgency);
      assert.ok(url.includes(urgency), `${brand} kinTB ${urgency} should resolve to real art, got ${url}`);
      assert.ok(LANDING_IMAGE_MANIFEST.has(url), `${url} must exist in manifest`);
    }
    const fh = resolveLandingHeroImage(brand, "light", "desktop", "kinTB", "final-hours");
    assert.ok(!fh.includes("final-hours"), `${brand} kinTB final-hours should collapse, got ${fh}`);
    assert.ok(LANDING_IMAGE_MANIFEST.has(fh), `${fh} must exist in manifest`);
  }
}

/**
 * All four variants returned by resolveLandingHeroImagesWithUrgency must exist
 * in the manifest after the fallback applies — no broken URLs reach SSR.
 */
function testAllVariantsExistInManifest() {
  for (const brand of LANDING_BRANDS) {
    for (const suffix of ["milTB", "sidTB", "kinTB"] as const) {
      for (const urgency of [null, "final-hours", "drawn-tomorrow", "drawn-tonight"] as const) {
        const paths = resolveLandingHeroImagesWithUrgency(brand, suffix, urgency);
        for (const [key, url] of Object.entries(paths)) {
          assert.ok(
            LANDING_IMAGE_MANIFEST.has(url),
            `${brand}/${suffix}/${urgency ?? "base"}/${key} -> ${url} not in manifest`
          );
        }
      }
    }
  }
}

/**
 * Every brand × toolbox × viewport now ships REAL drawn-tomorrow / drawn-tonight art
 * (2026-07 export completed the set: HiKOKI gained drawn art, and milTB/sidTB/kinTB all
 * carry both tiers).
 *
 * This is deliberately stronger than {@link testAllVariantsExistInManifest}, which only
 * asserts the returned URL is in the manifest — that assertion still passes when a tier
 * silently collapses to the base hero via the resolver's urgency fallback. Asserting the
 * suffix SURVIVES is what actually catches a missing/misnamed drawn asset.
 */
function testDrawnTiersResolveToRealArtEverywhere() {
  for (const brand of LANDING_BRANDS) {
    for (const suffix of ["milTB", "sidTB", "kinTB"] as const) {
      for (const viewport of ["desktop", "mobile"] as const) {
        for (const urgency of ["drawn-tomorrow", "drawn-tonight"] as const) {
          const url = resolveLandingHeroImage(brand, "light", viewport, suffix, urgency);
          assert.ok(
            url.includes(urgency),
            `${brand}/${suffix}/${viewport} ${urgency} collapsed to base — drawn art missing, got ${url}`
          );
          assert.ok(LANDING_IMAGE_MANIFEST.has(url), `${url} must exist in manifest`);
        }
      }
    }
  }
}

/**
 * Evergreen (all-prizes) assets exist for every urgency tier × viewport.
 */
function testEvergreenAllVariantsExist() {
  for (const viewport of ["desktop", "mobile"] as const) {
    for (const urgency of [null, "final-hours", "drawn-tomorrow", "drawn-tonight"] as const) {
      const url = resolveEvergreenHeroImage("light", viewport, urgency);
      assert.ok(
        LANDING_IMAGE_MANIFEST.has(url),
        `evergreen ${viewport}/${urgency ?? "base"} -> ${url} not in manifest`
      );
    }
  }
}

/**
 * Brand-aware loader stage background: a brand slug resolves to its own
 * bg-{brand}-{viewport}.webp (all five brands ship), and every returned URL is in
 * the manifest. The brand prefix is what `slugToBrandKey` keys on.
 */
function testLoaderBackgroundResolvesPerBrand() {
  for (const brand of ["dewalt", "makita", "milwaukee", "ryobi", "hikoki"] as const) {
    const bg = resolveLandingHeroBackground(`${brand}-sidchrome`);
    assert.ok(bg.desktop.includes(`bg-${brand}-desktop`), `${brand} → brand desktop bg, got ${bg.desktop}`);
    assert.ok(bg.mobile.includes(`bg-${brand}-mobile`), `${brand} → brand mobile bg, got ${bg.mobile}`);
    assert.ok(LANDING_IMAGE_MANIFEST.has(bg.desktop), `${bg.desktop} must be in manifest`);
    assert.ok(LANDING_IMAGE_MANIFEST.has(bg.mobile), `${bg.mobile} must be in manifest`);
  }
}

/**
 * Cash / evergreen / unknown / empty slugs have no brand → fall back to the shared
 * stage background (so non-brand promo pages keep the generic loader).
 */
function testLoaderBackgroundFallsBackForNonBrand() {
  const nonBrand: Array<string | null | undefined> = [null, undefined, "", "cash-10k", "all-prizes"];
  for (const slug of nonBrand) {
    const bg = resolveLandingHeroBackground(slug);
    assert.deepEqual(
      bg,
      { desktop: LANDING_HERO_BACKGROUND.desktop, mobile: LANDING_HERO_BACKGROUND.mobile },
      `non-brand slug ${String(slug)} should use the shared stage background`
    );
  }
}

function run() {
  testLightSidTbReturnsLightBase();
  testExistingComboReturnsAsIs();
  testDarkSidTbFallsBackToLightBase();
  testKinTbDrawnTiersResolveAndFinalHoursCollapses();
  testAllVariantsExistInManifest();
  testDrawnTiersResolveToRealArtEverywhere();
  testEvergreenAllVariantsExist();
  testLoaderBackgroundResolvesPerBrand();
  testLoaderBackgroundFallsBackForNonBrand();
  console.log("landing-image-resolver tests passed");
}

run();
