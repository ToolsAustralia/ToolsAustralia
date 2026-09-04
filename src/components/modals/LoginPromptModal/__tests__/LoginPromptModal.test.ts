/**
 * Smoke test for LoginPromptModal. Exercises the open + closed states via
 * react-dom/server's renderToString — catches import/JSX/undefined-access bugs.
 *
 * `useRouter` mock: this modal calls `next/navigation`'s useRouter which throws
 * outside the App Router context. We register a minimal stub before the
 * component is loaded.
 */


import assert from "node:assert/strict";
import * as React from "react";
import { renderToString } from "react-dom/server";
import Module from "node:module";

// Stub next/navigation BEFORE importing the modal so its useRouter() call
// resolves to a no-op router (instead of throwing "invariant expected").
type RequireFn = (id: string) => unknown;
const moduleProto = (Module as unknown as { prototype: { require: RequireFn } }).prototype;
const originalRequire: RequireFn = moduleProto.require;
moduleProto.require = function patched(this: unknown, id: string) {
  if (id === "next/navigation") {
    return {
      useRouter: () => ({
        push: () => {},
        replace: () => {},
        back: () => {},
        forward: () => {},
        refresh: () => {},
        prefetch: () => {},
      }),
    };
  }
  return originalRequire.call(this, id);
} as RequireFn;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const LoginPromptModal = require("../index").default as React.ComponentType<{
  isOpen: boolean;
  onClose: () => void;
}>;

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

console.log("\nLoginPromptModal smoke test");

test("open — renders headline + login CTA", () => {
  const html = renderToString(
    React.createElement(LoginPromptModal, { isOpen: true, onClose: () => {} })
  );
  assert.ok(html.length > 0);
  assert.ok(/Login to continue/i.test(html));
  assert.ok(/Go to login/i.test(html));
});

test("closed — renders null without throwing", () => {
  const html = renderToString(
    React.createElement(LoginPromptModal, { isOpen: false, onClose: () => {} })
  );
  assert.equal(html, "");
});

console.log("\n========================================");
console.log(`Tests run: ${testsRun}, failed: ${testsFailed}`);
console.log("========================================");
process.exit(testsFailed > 0 ? 1 : 0);
