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

/**
 * Every surface/ink token carries a `dark:` pair.
 *
 * This shipped broken: the card was `bg-white` with no pair while its only consumer
 * (StripePaymentModal's Order Summary) themed its own text with `dark:`, so in dark mode the
 * labels went light-grey on a white card — unreadable, on the confirm step of a paid upgrade.
 * A light-only primitive does not render "in light mode"; it renders broken against any child
 * that respects the theme. Asserted on the class string rather than by eye, because the
 * failure is invisible until someone opens that exact modal in that exact theme.
 */
test("every surface and ink token is theme-paired", () => {
  const html = renderToString(
    React.createElement(
      Card,
      { padding: "md" },
      React.createElement(Card.Header, null, "H"),
      React.createElement(Card.Body, null, "B"),
      React.createElement(Card.Footer, null, "F")
    )
  );
  const classes = [...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/));
  const needsPair = classes.filter((c) =>
    /^(bg|text|border)-(white|black|neutral-\d{2,3})$/.test(c)
  );
  for (const c of needsPair) {
    const [prop] = c.split("-");
    assert.ok(
      classes.some((other) => other.startsWith(`dark:${prop}-`)),
      `"${c}" has no dark: counterpart — it will render light-on-light in dark mode`
    );
  }
  // Guard the guard: if the regex stops matching anything, the test silently passes forever.
  assert.ok(needsPair.length > 0, "expected to find themeable tokens to check");
});

console.log("\n========================================");
console.log(`Tests run: ${testsRun}, failed: ${testsFailed}`);
console.log("========================================");
process.exit(testsFailed > 0 ? 1 : 0);
