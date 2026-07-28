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

  // promoTheme (promo landing default-theme experiment).
  // Guards the merge whitelist: mergeVariantConfig rebuilds config from an explicit
  // key list, so a new key that isn't added there is silently dropped on read —
  // which would make the theme experiment an A/A with plausible-looking data.
  assert.equal(def.promoTheme?.defaultTheme, "light", "default promoTheme is light");

  const darkArm = VariantConfigService.mergeVariantConfig(def, {
    promoTheme: { defaultTheme: "dark" },
  });
  assert.equal(darkArm.promoTheme?.defaultTheme, "dark", "merged promoTheme survives as dark");

  const lightArm = VariantConfigService.mergeVariantConfig(def, {
    promoTheme: { defaultTheme: "light" },
  });
  assert.equal(lightArm.promoTheme?.defaultTheme, "light", "explicit light arm survives merge");

  const controlArm = VariantConfigService.mergeVariantConfig(def, {});
  assert.equal(controlArm.promoTheme?.defaultTheme, "light", "empty config falls back to light");

  const okTheme = VariantConfigService.validateVariantConfig({
    promoTheme: { defaultTheme: "dark" },
  });
  assert.equal(okTheme.valid, true, `valid promoTheme should pass: ${okTheme.errors.join(", ")}`);

  const badTheme = VariantConfigService.validateVariantConfig({
    promoTheme: { defaultTheme: "purple" },
  });
  assert.equal(badTheme.valid, false, "unknown defaultTheme should fail validation");
  assert.ok(
    badTheme.errors.some((e) => e.includes("defaultTheme")),
    "error message mentions defaultTheme",
  );

  console.log("variantConfigService.membershipTheme + disableVideo: all assertions passed");
}

run();
