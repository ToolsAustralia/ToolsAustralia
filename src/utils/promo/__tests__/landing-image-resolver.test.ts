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
const LANDING_BRANDS = ["ryobi", "milwaukee", "dewalt", "makita", "hikoki", "stihl"] as const;

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
 * Dark art is REAL as of the draw 9 export (2026-07-27).
 *
 * History worth keeping, because this assertion has now been inverted twice: before draw 9
 * no `*-dark.webp` had ever shipped for any brand, so a dark request fell through to the
 * light file and this test asserted the ABSENCE of `-dark`. Draw 9 shipped all 12 variants
 * (3 tiers × 2 viewports × 2 modes) for every brand × toolbox, so a dark request must now
 * resolve to genuinely dark art — and dark-mode visitors finally stop being served the light
 * hero. Asserting the real file also means a regression in the ingest shows up here rather
 * than silently degrading back to the light fallback, which is invisible to the eye in a
 * light-mode screenshot.
 */
function testDarkVariantsResolveToRealDarkArt() {
  for (const brand of LANDING_BRANDS) {
    for (const suffix of ["milTB", "sidTB", "kinTB"] as const) {
      const url = resolveLandingHeroImage(brand, "dark", "desktop", suffix, null);
      assert.ok(url.includes("-dark"), `${brand} ${suffix} dark must resolve to dark art, got ${url}`);
      assert.ok(LANDING_IMAGE_MANIFEST.has(url), `${url} must exist in manifest`);
    }
  }
}

/**
 * GearWrench (`gwTB`) is the fourth toolbox, added in draw 9 — but its RYOBI pairing was
 * never produced. The four brands that do have art must resolve to real `gwTB` files in both
 * modes; Ryobi must degrade through the fallback chain to something that actually exists
 * rather than emitting a URL that 404s.
 */
function testGwTbResolvesWhereArtExistsAndDegradesForRyobi() {
  for (const brand of ["dewalt", "makita", "milwaukee", "hikoki"] as const) {
    for (const mode of ["light", "dark"] as const) {
      const url = resolveLandingHeroImage(brand, mode, "desktop", "gwTB", null);
      assert.ok(url.includes("gwTB"), `${brand} gwTB ${mode} should resolve to gwTB art, got ${url}`);
      assert.ok(LANDING_IMAGE_MANIFEST.has(url), `${url} must exist in manifest`);
    }
  }
  /**
   * Ryobi × gwTB has no art in any mode, viewport or tier. Whatever the resolver returns for
   * it must still be a REAL file: returning the desired-but-absent URL makes `/_next/image`
   * answer 400, which is a blank hero and a console error on a live page — caught by the
   * e2e QA watchdog during the draw 9 proof run, not by any unit test before it.
   */
  for (const viewport of ["desktop", "mobile"] as const) {
    for (const mode of ["light", "dark"] as const) {
      for (const urgency of [null, "drawn-tomorrow", "drawn-tonight"] as const) {
        const url = resolveLandingHeroImage("ryobi", mode, viewport, "gwTB", urgency);
        assert.ok(
          LANDING_IMAGE_MANIFEST.has(url),
          `ryobi gwTB ${mode} ${viewport} ${urgency ?? "base"} must fall back to a real file, got ${url}`
        );
      }
    }
  }
}

/**
 * Draw 10 (2026-08-26): the -drawn-tomorrow / -drawn-tonight art was WITHDRAWN for every brand
 * — all 160 files baked `& $5K CASH` into the headline and draw 10 removed that bonus — so all
 * three countdown tiers behaved the way -final-hours always has, dropping to the base hero.
 *
 * 2026-09-03: the replacement art landed, so the two drawn tiers must now SURVIVE as a suffix
 * again and only -final-hours collapses. That is the tripwire working as designed: the previous
 * version of this test asserted 'carries no countdown suffix at all' precisely so that dropping
 * replacement art in without restoring URGENCIES in scripts/check-landing-hero-assets.mjs would
 * go red rather than silently half-ship. It went red, both halves were restored together.
 */
function testKinTbDrawnTiersResolveAndFinalHoursCollapses() {
  for (const brand of LANDING_BRANDS) {
    for (const urgency of ["drawn-tomorrow", "drawn-tonight"] as const) {
      const url = resolveLandingHeroImage(brand, "light", "desktop", "kinTB", urgency);
      assert.ok(url.endsWith(`-${urgency}.webp`), `${brand} kinTB ${urgency} must keep its tier suffix, got ${url}`);
      assert.ok(LANDING_IMAGE_MANIFEST.has(url), `${url} must exist in manifest`);
    }
    const finalHours = resolveLandingHeroImage(brand, "light", "desktop", "kinTB", "final-hours");
    assert.ok(!finalHours.includes("final-hours"), `${brand} kinTB final-hours should collapse to base, got ${finalHours}`);
    assert.ok(LANDING_IMAGE_MANIFEST.has(finalHours), `${finalHours} must exist in manifest`);
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
  // Restored to its full strength for the 2026-09-03 draw-10 urgency export, which completed the
  // set: 6 brands x 4 toolboxes x 2 viewports x 2 modes x 2 tiers = 192 stills, no gaps. So the
  // suffix must SURVIVE everywhere — the weaker "resolves to something in the manifest" passes
  // even when a tier silently collapses to the base hero, which is exactly the half-shipped state
  // this is here to catch.
  for (const brand of LANDING_BRANDS) {
    for (const suffix of ["milTB", "sidTB", "kinTB", "gwTB"] as const) {
      for (const viewport of ["desktop", "mobile"] as const) {
        for (const mode of ["light", "dark"] as const) {
          for (const urgency of ["drawn-tomorrow", "drawn-tonight"] as const) {
            const url = resolveLandingHeroImage(brand, mode, viewport, suffix, urgency);
            assert.ok(LANDING_IMAGE_MANIFEST.has(url), `${url} must exist in manifest`);
            assert.ok(
              url.endsWith(`-${urgency}.webp`),
              `${brand}/${suffix}/${viewport}/${mode} ${urgency} lost its tier suffix, got ${url}`
            );
            assert.ok(
              url.includes(`/${brand}/`),
              `${brand}/${suffix}/${viewport} ${urgency} fell through to another brand, got ${url}`
            );
          }
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
 * Loader stage background is keyed on THEME since draw 9, not brand.
 *
 * Was `testLoaderBackgroundResolvesPerBrand` — ten `bg-{brand}-{viewport}.webp` files that
 * all showed the same backdrop, and could not express the one thing that actually varies.
 * Dark mode used to get the light backdrop with a dark hero painted over it.
 */
function testLoaderBackgroundResolvesPerMode() {
  for (const mode of ["light", "dark"] as const) {
    const bg = resolveLandingHeroBackground(mode);
    const wantsDark = mode === "dark";
    assert.equal(bg.desktop.includes("-dark"), wantsDark, `${mode} desktop bg, got ${bg.desktop}`);
    assert.equal(bg.mobile.includes("-dark"), wantsDark, `${mode} mobile bg, got ${bg.mobile}`);
    assert.ok(LANDING_IMAGE_MANIFEST.has(bg.desktop), `${bg.desktop} must be in manifest`);
    assert.ok(LANDING_IMAGE_MANIFEST.has(bg.mobile), `${bg.mobile} must be in manifest`);
  }
}

/** No argument = light, and the shared constant still points at real files. */
function testLoaderBackgroundDefaultsToLight() {
  assert.deepEqual(resolveLandingHeroBackground(), resolveLandingHeroBackground("light"));
  assert.ok(LANDING_IMAGE_MANIFEST.has(LANDING_HERO_BACKGROUND.desktop));
  assert.ok(LANDING_IMAGE_MANIFEST.has(LANDING_HERO_BACKGROUND.mobile));
}

function run() {
  testLightSidTbReturnsLightBase();
  testExistingComboReturnsAsIs();
  testDarkVariantsResolveToRealDarkArt();
  testGwTbResolvesWhereArtExistsAndDegradesForRyobi();
  testKinTbDrawnTiersResolveAndFinalHoursCollapses();
  testAllVariantsExistInManifest();
  testDrawnTiersResolveToRealArtEverywhere();
  testEvergreenAllVariantsExist();
  testLoaderBackgroundResolvesPerMode();
  testLoaderBackgroundDefaultsToLight();
  console.log("landing-image-resolver tests passed");
}

run();
