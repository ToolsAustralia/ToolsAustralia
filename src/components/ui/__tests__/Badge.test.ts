/* eslint-disable react/no-children-prop */
import assert from "node:assert/strict";
import * as React from "react";
import { renderToString } from "react-dom/server";
import Badge from "../Badge";
import { assertThemePaired } from "./assertThemePaired";

let testsRun = 0;
let testsFailed = 0;
function test(name: string, fn: () => void): void {
  testsRun++;
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (err) { testsFailed++; console.error(`  ✗ ${name}`); console.error(err instanceof Error ? err.message : String(err)); }
}

console.log("\nBadge smoke test");

const tones = ["red", "gold", "tier-tradie", "tier-foreman", "tier-boss", "neutral", "success", "warning", "info"] as const;
const sizes = ["sm", "md"] as const;

for (const tone of tones) {
  for (const size of sizes) {
    test(`${tone} / ${size}`, () => {
      const el = React.createElement(Badge, { tone, size, children: "NEW" });
      const html = renderToString(el);
      assert.ok(html.length > 0);
      assert.ok(html.includes("NEW"));
    });
  }
}

test("accepts and forwards className override", () => {
  const el = React.createElement(Badge, { className: "test-override", children: "X" });
  const html = renderToString(el);
  assert.ok(html.includes("test-override"));
});

test("every tone is theme-paired", () => {
  let checked = 0;
  for (const tone of tones) {
    const html = renderToString(React.createElement(Badge, { tone, children: "x" }));
    checked += assertThemePaired(html, `Badge tone=${tone}`).length;
  }
  assert.ok(checked > 0, "expected to find themeable tokens to check");
});

console.log("\n========================================");
console.log(`Tests run: ${testsRun}, failed: ${testsFailed}`);
console.log("========================================");
process.exit(testsFailed > 0 ? 1 : 0);
