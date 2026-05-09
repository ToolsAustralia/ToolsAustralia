/**
 * Smoke test for ExistingAccountModal. The modal imports LoginModal (heavy
 * deps: next-auth, popup auth, klaviyo) so we stub it out in this test.
 */
/* eslint-disable react/no-children-prop */

import assert from "node:assert/strict";
import * as React from "react";
import { renderToString } from "react-dom/server";
import Module from "node:module";

// Stub LoginModal (heavy) + next/navigation (router context required).
type RequireFn = (id: string) => unknown;
const moduleProto = (Module as unknown as { prototype: { require: RequireFn } }).prototype;
const originalRequire: RequireFn = moduleProto.require;
moduleProto.require = function patched(this: unknown, id: string) {
  // Match both the relative spec esbuild generates and the resolved path tsx
  // hands back if it's already resolved when we hit Module.prototype.require.
  if (/(^|\/|\\)LoginModal($|\/index)/.test(id)) {
    return { __esModule: true, default: () => null };
  }
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
const ExistingAccountModal = require("../index").default as React.ComponentType<{
  isOpen: boolean;
  onClose: () => void;
  conflictField?: "email" | "mobile";
  email?: string;
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

console.log("\nExistingAccountModal smoke test");

test("open — email conflict", () => {
  const html = renderToString(
    React.createElement(ExistingAccountModal, {
      isOpen: true,
      onClose: () => {},
      conflictField: "email",
      email: "user@example.com",
    })
  );
  assert.ok(/Email already exists/i.test(html));
  assert.ok(/email address/i.test(html));
});

test("open — mobile conflict", () => {
  const html = renderToString(
    React.createElement(ExistingAccountModal, {
      isOpen: true,
      onClose: () => {},
      conflictField: "mobile",
      email: "user@example.com",
    })
  );
  assert.ok(/Mobile already exists/i.test(html));
  assert.ok(/mobile number/i.test(html));
});

test("closed — renders null without throwing", () => {
  const html = renderToString(
    React.createElement(ExistingAccountModal, {
      isOpen: false,
      onClose: () => {},
      conflictField: "email",
      email: "user@example.com",
    })
  );
  assert.equal(html, "");
});

console.log("\n========================================");
console.log(`Tests run: ${testsRun}, failed: ${testsFailed}`);
console.log("========================================");
process.exit(testsFailed > 0 ? 1 : 0);
