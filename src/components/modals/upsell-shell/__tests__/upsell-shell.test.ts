
import assert from "node:assert/strict";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { Trophy, ShieldCheck, Award, Lock } from "lucide-react";
import { UpsellHero, InfoGrid, UrgencyBanner, TrustBar } from "..";

let testsRun = 0;
let testsFailed = 0;
function test(name: string, fn: () => void): void {
  testsRun++;
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (err) { testsFailed++; console.error(`  ✗ ${name}`); console.error(err instanceof Error ? err.message : String(err)); }
}

console.log("\nupsell-shell smoke test");

const tones = ["neutral", "danger", "success", "tier-tradie", "tier-foreman", "tier-boss"] as const;
for (const tone of tones) {
  test(`UpsellHero tone=${tone}`, () => {
    const el = React.createElement(UpsellHero, {
      tone,
      eyebrow: "EYEBROW",
      title: "Headline",
      sub: "sub-copy",
    });
    const html = renderToString(el);
    assert.ok(html.includes("EYEBROW"));
    assert.ok(html.includes("Headline"));
    assert.ok(html.includes("sub-copy"));
  });
}

test("UpsellHero with infographic slot", () => {
  const el = React.createElement(UpsellHero, {
    eyebrow: "X",
    title: "Y",
    infographic: React.createElement("div", null, "INFOGRAPHIC"),
  });
  const html = renderToString(el);
  assert.ok(html.includes("INFOGRAPHIC"));
});

const framings = ["loss", "gain", "neutral"] as const;
for (const framing of framings) {
  test(`InfoGrid framing=${framing} (3 cells)`, () => {
    const el = React.createElement(InfoGrid, {
      framing,
      title: "GRID TITLE",
      cells: [
        { icon: React.createElement(Trophy, { size: 20 }), title: "Cell 1", desc: "d1" },
        { icon: React.createElement(Trophy, { size: 20 }), title: "Cell 2", desc: "d2" },
        { icon: React.createElement(Trophy, { size: 20 }), title: "Cell 3", desc: "d3" },
      ],
    });
    const html = renderToString(el);
    assert.ok(html.includes("GRID TITLE"));
    assert.ok(html.includes("Cell 1"));
    assert.ok(html.includes("Cell 3"));
  });
}

test("InfoGrid 2-cell variant", () => {
  const el = React.createElement(InfoGrid, {
    framing: "gain",
    cells: [
      { icon: React.createElement(Trophy, { size: 20 }), title: "A" },
      { icon: React.createElement(Trophy, { size: 20 }), title: "B" },
    ],
  });
  const html = renderToString(el);
  assert.ok(html.includes("A") && html.includes("B"));
});

const bannerTones = ["gold", "info", "warning"] as const;
for (const tone of bannerTones) {
  test(`UrgencyBanner tone=${tone}`, () => {
    const el = React.createElement(UrgencyBanner, { tone, title: "BANNER TITLE", sub: "sub" });
    const html = renderToString(el);
    assert.ok(html.includes("BANNER TITLE"));
    assert.ok(html.includes("sub"));
  });
}

test("TrustBar with 3 cells", () => {
  const el = React.createElement(TrustBar, {
    cells: [
      { icon: React.createElement(ShieldCheck, { size: 12 }), strong: "SSL", secondary: "secure" },
      { icon: React.createElement(Award, { size: 12 }), strong: "Govt", secondary: "certified" },
      { icon: React.createElement(Lock, { size: 12 }), strong: "Cancel", secondary: "anytime" },
    ],
  });
  const html = renderToString(el);
  assert.ok(html.includes("SSL"));
  assert.ok(html.includes("Govt"));
  assert.ok(html.includes("Cancel"));
});

console.log("\n========================================");
console.log(`Tests run: ${testsRun}, failed: ${testsFailed}`);
console.log("========================================");
process.exit(testsFailed > 0 ? 1 : 0);
