/**
 * Smoke test for LoginModal — covers the extracted Hero sub-component only.
 * The orchestrator (index.tsx) has heavy deps (next-auth, popup auth, klaviyo)
 * and is exercised manually via /dev/modals?modal=login. The form logic was
 * preserved byte-identical when the file was moved into the folder.
 */
/* eslint-disable react/no-children-prop */

import assert from "node:assert/strict";
import * as React from "react";
import { renderToString } from "react-dom/server";
import Hero from "../Hero";

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

console.log("\nLoginModal Hero smoke test");

test("Hero — renders eyebrow + headline + close button", () => {
  const html = renderToString(React.createElement(Hero, { onClose: () => {} }));
  assert.ok(/Welcome back/i.test(html));
  assert.ok(/Log in/i.test(html));
  assert.ok(/aria-label="Close"/i.test(html));
});

console.log("\n========================================");
console.log(`Tests run: ${testsRun}, failed: ${testsFailed}`);
console.log("========================================");
process.exit(testsFailed > 0 ? 1 : 0);
