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

  console.log("variantConfigService.membershipTheme: all assertions passed");
}

run();
