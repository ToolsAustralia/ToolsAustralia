import assert from "node:assert/strict";
import VariantConfigService from "../VariantConfigService";

function run() {
  const def = VariantConfigService.getDefaultConfig();
  assert.equal(def.membershipTheme?.forceLight, false, "default forceLight is false");

  const control = VariantConfigService.mergeVariantConfig(def, {});
  assert.equal(control.membershipTheme?.forceLight, false, "control merged forceLight is false");

  const treatment = VariantConfigService.mergeVariantConfig(def, {
    membershipTheme: { forceLight: true },
  });
  assert.equal(treatment.membershipTheme?.forceLight, true, "treatment merged forceLight is true");

  const ok = VariantConfigService.validateVariantConfig({ membershipTheme: { forceLight: true } });
  assert.equal(ok.valid, true, `valid membershipTheme should pass: ${ok.errors.join(", ")}`);

  const bad = VariantConfigService.validateVariantConfig({ membershipTheme: { forceLight: "yes" } });
  assert.equal(bad.valid, false, "non-boolean forceLight should fail validation");
  assert.ok(
    bad.errors.some((e) => e.includes("forceLight")),
    "error message mentions forceLight",
  );

  // hero.disableVideo (static-image-vs-video experiment)
  assert.equal(def.hero?.disableVideo, false, "default hero.disableVideo is false");
  const staticArm = VariantConfigService.mergeVariantConfig(def, { hero: { disableVideo: true } });
  assert.equal(staticArm.hero?.disableVideo, true, "merged hero.disableVideo is true (static arm)");
  const videoArm = VariantConfigService.mergeVariantConfig(def, {});
  assert.equal(videoArm.hero?.disableVideo, false, "control keeps disableVideo false (video arm)");
  const okVideo = VariantConfigService.validateVariantConfig({ hero: { disableVideo: true } });
  assert.equal(okVideo.valid, true, `valid disableVideo should pass: ${okVideo.errors.join(", ")}`);
  const badVideo = VariantConfigService.validateVariantConfig({ hero: { disableVideo: "yes" } });
  assert.equal(badVideo.valid, false, "non-boolean disableVideo should fail validation");
  assert.ok(
    badVideo.errors.some((e) => e.includes("disableVideo")),
    "error message mentions disableVideo",
  );

  console.log("variantConfigService.membershipTheme + disableVideo: all assertions passed");
}

run();
