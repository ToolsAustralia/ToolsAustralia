import assert from "node:assert/strict";
import { getElectricPackageColorScheme } from "../electricPackageScheme";

function run() {
  const cases: Array<[string, string]> = [
    ["apprentice-pack", "#1E90FF"],
    ["tradie-pack", "#CCFF00"],
    ["foreman-pack", "#00E5FF"],
    ["boss-pack", "#E0A019"],
    ["power-pack", "#FF1F1F"],
    ["vip-pack", "#FFDF63"],
    ["additional-tradie-pack", "#CCFF00"],
    ["additional-vip-pack-member", "#FFDF63"],
  ];
  for (const [planId, expectedAccent] of cases) {
    const scheme = getElectricPackageColorScheme(planId);
    assert.equal(scheme.accentHex, expectedAccent, `accentHex for ${planId}`);
    assert.ok(scheme.bgGradient.length > 0, `bgGradient for ${planId}`);
    assert.ok(scheme.badgeStyle.background.length > 0, `badgeStyle for ${planId}`);
  }
  assert.equal(getElectricPackageColorScheme("totally-unknown").accentHex, "#FF1F1F");
  console.log("electricPackageScheme: all assertions passed");
}

run();
