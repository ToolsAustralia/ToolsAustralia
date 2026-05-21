import assert from "node:assert/strict";
import {
  resolveLandingHeroImage,
  resolveLandingHeroImagesWithUrgency,
  resolveEvergreenHeroImage,
} from "../landing-image-resolver";
import { LANDING_IMAGE_MANIFEST } from "@/generated/landingImageManifest";

/**
 * Light sidTB base files are NOT shipped for any brand. The resolver must
 * substitute the dark variant rather than returning a 404 URL.
 */
function testLightSidTbFallsBackToDark() {
  for (const brand of ["ryobi", "milwaukee", "dewalt", "makita"] as const) {
    const desktop = resolveLandingHeroImage(brand, "light", "desktop", "sidTB", null);
    const mobile = resolveLandingHeroImage(brand, "light", "mobile", "sidTB", null);
    assert.ok(
      desktop.includes("-dark"),
      `${brand} light desktop sidTB (no urgency) should fall back to dark, got ${desktop}`
    );
    assert.ok(
      mobile.includes("-dark"),
      `${brand} light mobile sidTB (no urgency) should fall back to dark, got ${mobile}`
    );
    assert.ok(
      LANDING_IMAGE_MANIFEST.has(desktop),
      `fallback ${desktop} must exist in manifest`
    );
    assert.ok(
      LANDING_IMAGE_MANIFEST.has(mobile),
      `fallback ${mobile} must exist in manifest`
    );
  }
}

/**
 * Existing combos must round-trip unchanged — no spurious mode swap when the
 * requested file is already on disk.
 */
function testExistingComboReturnsAsIs() {
  // milTB light desktop (base) is present on disk for all brands
  for (const brand of ["ryobi", "milwaukee", "dewalt", "makita"] as const) {
    const url = resolveLandingHeroImage(brand, "light", "desktop", "milTB", null);
    assert.ok(!url.includes("-dark"), `${brand} milTB light should NOT swap to dark, got ${url}`);
    assert.ok(LANDING_IMAGE_MANIFEST.has(url), `${url} must exist in manifest`);
  }
  // sidTB final-hours light desktop IS shipped
  for (const brand of ["ryobi", "milwaukee", "dewalt", "makita"] as const) {
    const url = resolveLandingHeroImage(brand, "light", "desktop", "sidTB", "final-hours");
    assert.ok(!url.includes("-dark"), `${brand} sidTB light final-hours should NOT swap, got ${url}`);
    assert.ok(LANDING_IMAGE_MANIFEST.has(url));
  }
}

/**
 * Dark variants must round-trip when they exist (sidTB dark base is shipped).
 */
function testDarkComboReturnsAsIs() {
  for (const brand of ["ryobi", "milwaukee", "dewalt", "makita"] as const) {
    const url = resolveLandingHeroImage(brand, "dark", "desktop", "sidTB", null);
    assert.ok(url.includes("-dark"), `${brand} sidTB dark should return dark URL`);
    assert.ok(LANDING_IMAGE_MANIFEST.has(url));
  }
}

/**
 * Kincrome ships only base assets — urgency tiers must collapse to base.
 */
function testKinTbUrgencyCollapsesToBase() {
  for (const brand of ["ryobi", "milwaukee", "dewalt", "makita"] as const) {
    for (const urgency of ["final-hours", "drawn-tomorrow", "drawn-tonight"] as const) {
      const url = resolveLandingHeroImage(brand, "light", "desktop", "kinTB", urgency);
      assert.ok(!url.includes(urgency), `${brand} kinTB ${urgency} should collapse, got ${url}`);
      assert.ok(LANDING_IMAGE_MANIFEST.has(url));
    }
  }
}

/**
 * All four variants returned by resolveLandingHeroImagesWithUrgency must exist
 * in the manifest after the fallback applies — no broken URLs reach SSR.
 */
function testAllVariantsExistInManifest() {
  for (const brand of ["ryobi", "milwaukee", "dewalt", "makita"] as const) {
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

function run() {
  testLightSidTbFallsBackToDark();
  testExistingComboReturnsAsIs();
  testDarkComboReturnsAsIs();
  testKinTbUrgencyCollapsesToBase();
  testAllVariantsExistInManifest();
  testEvergreenAllVariantsExist();
  console.log("landing-image-resolver tests passed");
}

run();
