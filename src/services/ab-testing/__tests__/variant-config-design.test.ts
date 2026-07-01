import assert from "node:assert/strict";
import variantConfigService from "../VariantConfigService";

function run() {
  // Absent design → valid (control by default)
  assert.equal(variantConfigService.validateVariantConfig({ packages: {} }).valid, true, "absent design valid");

  // "promo" and "membership" → valid
  assert.equal(variantConfigService.validateVariantConfig({ packages: { design: "promo" } }).valid, true, "promo valid");
  assert.equal(variantConfigService.validateVariantConfig({ packages: { design: "membership" } }).valid, true, "membership valid");

  // Unknown value → invalid with a helpful error
  const bad = variantConfigService.validateVariantConfig({ packages: { design: "fancy" } });
  assert.equal(bad.valid, false, "unknown design invalid");
  assert.ok(bad.errors.some((e) => e.includes("Packages design")), "error mentions Packages design");

  // Merge: a scalar design on the spread packages key survives the merge untouched
  const merged = variantConfigService.mergeVariantConfig(
    variantConfigService.getDefaultConfig(),
    { packages: { design: "membership" } }
  );
  assert.equal(merged.packages?.design, "membership", "design survives merge");

  console.log("variant-config-design: all assertions passed");
}

run();
