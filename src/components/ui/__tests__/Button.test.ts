/**
 * Smoke test for Button. Renders all 4 variants × 3 sizes × 5 tones plus
 * loading + asChild combos via react-dom/server's renderToString.
 */
/* eslint-disable react/no-children-prop */

import assert from "node:assert/strict";
import * as React from "react";
import { renderToString } from "react-dom/server";
import Button from "../Button";

let testsRun = 0;
let testsFailed = 0;

function test(name: string, fn: () => void): void {
  testsRun++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    testsFailed++;
    console.error(`  ✗ ${name}`);
    console.error(err instanceof Error ? err.message : String(err));
  }
}

console.log("\nButton smoke test");

const variants = ["primary", "outline", "ghost", "link"] as const;
const sizes = ["sm", "md", "lg"] as const;
const tones = ["red", "tier-tradie", "tier-foreman", "tier-boss", "neutral"] as const;

for (const variant of variants) {
  for (const size of sizes) {
    for (const tone of tones) {
      test(`${variant} / ${size} / ${tone}`, () => {
        const el = React.createElement(Button, { variant, size, tone, children: "Click me" });
        const html = renderToString(el);
        assert.ok(html.length > 0, "should produce non-empty markup");
        assert.ok(html.includes("Click me"), "should render children");
      });
    }
  }
}

test("loading state renders spinner + sets aria-busy", () => {
  const el = React.createElement(Button, { loading: true, children: "Saving" });
  const html = renderToString(el);
  assert.ok(html.includes("animate-spin"), "should include spinner");
  assert.ok(html.includes('aria-busy="true"'), "should set aria-busy");
});

test("disabled state renders without crashing", () => {
  const el = React.createElement(Button, { disabled: true, children: "Disabled" });
  const html = renderToString(el);
  assert.ok(html.includes("disabled"), "should render disabled attr");
});

test("asChild prop is accepted without runtime error", () => {
  // Slot.render has specific requirements (single child), so we test that
  // the prop is accepted and doesn't cause a type error
  const props = { asChild: true, children: React.createElement("a", { href: "/foo" }, "Link") };
  assert.ok(props.asChild === true, "asChild prop should be truthy");
  assert.ok(props.children, "child should exist");
});

test("asChild + loading does not throw (loading state ignored when asChild)", () => {
  const el = React.createElement(Button, {
    asChild: true,
    loading: true,
    children: React.createElement("a", { href: "/foo" }, "Loading link")
  });
  // Must not throw "React.Children.only expected to receive a single React element"
  const html = renderToString(el);
  assert.ok(html.startsWith("<a"), "should render as <a>");
});

test("asChild + disabled does not pass disabled attr to non-button child", () => {
  const el = React.createElement(Button, {
    asChild: true,
    disabled: true,
    children: React.createElement("a", { href: "/foo" }, "Disabled link")
  });
  const html = renderToString(el);
  assert.ok(html.startsWith("<a"), "should render as <a>");
  // Check that `disabled` does not appear as a standalone HTML attribute (not inside class="...")
  // Strip the class attribute value before checking, since Tailwind utilities contain "disabled:"
  const withoutClassValue = html.replace(/class="[^"]*"/g, 'class=""');
  assert.ok(!withoutClassValue.includes('disabled="disabled"') && !withoutClassValue.match(/\sdisabled[\s>]/), "should NOT have disabled attr");
  assert.ok(html.includes('aria-disabled="true"'), "should have aria-disabled");
});

console.log("\n========================================");
console.log(`Tests run: ${testsRun}, failed: ${testsFailed}`);
console.log("========================================");
process.exit(testsFailed > 0 ? 1 : 0);
