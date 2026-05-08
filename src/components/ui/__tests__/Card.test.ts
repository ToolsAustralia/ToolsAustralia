/* eslint-disable react/no-children-prop */
import assert from "node:assert/strict";
import * as React from "react";
import { renderToString } from "react-dom/server";
import Card from "../Card";

let testsRun = 0;
let testsFailed = 0;
function test(name: string, fn: () => void): void {
  testsRun++;
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (err) { testsFailed++; console.error(`  ✗ ${name}`); console.error(err instanceof Error ? err.message : String(err)); }
}

console.log("\nCard smoke test");

const paddings = ["none", "sm", "md", "lg"] as const;

for (const padding of paddings) {
  test(`padding=${padding}`, () => {
    const el = React.createElement(Card, { padding, children: "body" });
    const html = renderToString(el);
    assert.ok(html.length > 0);
    assert.ok(html.includes("body"));
  });
}

test("compound: Card + Card.Header + Card.Body + Card.Footer", () => {
  const el = React.createElement(
    Card,
    { padding: "md" },
    React.createElement(Card.Header, null, React.createElement("h3", null, "Title")),
    React.createElement(Card.Body, null, React.createElement("p", null, "Body content")),
    React.createElement(Card.Footer, null, React.createElement("button", null, "OK"))
  );
  const html = renderToString(el);
  assert.ok(html.includes("Title"));
  assert.ok(html.includes("Body content"));
  assert.ok(html.includes("OK"));
});

console.log("\n========================================");
console.log(`Tests run: ${testsRun}, failed: ${testsFailed}`);
console.log("========================================");
process.exit(testsFailed > 0 ? 1 : 0);
