/**
 * Smoke test for PastDrawsModal. The modal calls usePastDrawsData (TanStack
 * Query under the hood) which needs a QueryClientProvider. Rather than stand
 * up the full hook stack, we stub usePastDrawsData and PastDrawCard at the
 * Module.prototype.require boundary so we can drive the orchestrator through
 * loading / error / empty / populated states.
 */
/* eslint-disable react/no-children-prop */

import assert from "node:assert/strict";
import * as React from "react";
import { renderToString } from "react-dom/server";
import Module from "node:module";

interface DrawStub {
  _id: string;
  drawDate: string;
}

let mockState: {
  draws: DrawStub[];
  isLoading: boolean;
  error: Error | null;
} = { draws: [], isLoading: false, error: null };

type RequireFn = (id: string) => unknown;
const moduleProto = (Module as unknown as { prototype: { require: RequireFn } }).prototype;
const originalRequire: RequireFn = moduleProto.require;
moduleProto.require = function patched(this: unknown, id: string) {
  // Stub the data hook so we don't need TanStack Query / fetch in the test.
  if (/usePastDrawsData($|\.ts)/.test(id)) {
    return {
      __esModule: true,
      usePastDrawsData: () => mockState,
    };
  }
  // Stub the card so we don't render the full prize/entries view.
  if (/PastDrawCard($|\/index|\.tsx)/.test(id)) {
    return {
      __esModule: true,
      default: ({ draw }: { draw: DrawStub }) =>
        React.createElement("div", { "data-test-card": draw._id }, draw._id),
    };
  }
  return originalRequire.call(this, id);
} as RequireFn;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PastDrawsModal = require("../index").default as React.ComponentType<{
  isOpen: boolean;
  onClose: () => void;
  userId: string;
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

const noop = () => {};

console.log("\nPastDrawsModal smoke test");

test("loading — shows skeleton", () => {
  mockState = { draws: [], isLoading: true, error: null };
  const html = renderToString(
    React.createElement(PastDrawsModal, {
      isOpen: true,
      onClose: noop,
      userId: "u1",
    })
  );
  assert.ok(/Your draw history/i.test(html));
  assert.ok(/animate-pulse/.test(html));
});

test("error — shows retry message", () => {
  mockState = { draws: [], isLoading: false, error: new Error("boom") };
  const html = renderToString(
    React.createElement(PastDrawsModal, {
      isOpen: true,
      onClose: noop,
      userId: "u1",
    })
  );
  assert.ok(/Something went wrong/i.test(html));
  assert.ok(/Retry now/i.test(html));
});

test("empty — shows empty state", () => {
  mockState = { draws: [], isLoading: false, error: null };
  const html = renderToString(
    React.createElement(PastDrawsModal, {
      isOpen: true,
      onClose: noop,
      userId: "u1",
    })
  );
  // PastDrawsEmptyState is the real component — just verify the modal rendered
  // without crashing and isn't showing skeleton/error.
  assert.ok(!/animate-pulse/.test(html));
  assert.ok(!/Something went wrong/.test(html));
});

test("populated — renders cards + count footer", () => {
  mockState = {
    draws: [
      { _id: "d1", drawDate: "2024-01-01" },
      { _id: "d2", drawDate: "2024-02-01" },
    ],
    isLoading: false,
    error: null,
  };
  const html = renderToString(
    React.createElement(PastDrawsModal, {
      isOpen: true,
      onClose: noop,
      userId: "u1",
    })
  );
  assert.ok(/data-test-card="d1"/.test(html));
  assert.ok(/data-test-card="d2"/.test(html));
  // React server rendering inserts `<!-- -->` markers between adjacent text
  // nodes from JSX expressions, so we test the meaningful tokens with that
  // separator allowed in between.
  const sep = "(?:<!--\\s*-->|\\s)*";
  assert.ok(new RegExp(`Showing${sep}2${sep}completed`, "i").test(html));
  assert.ok(/draws/.test(html));
  assert.ok(/you entered/i.test(html));
});

test("closed — renders null without throwing", () => {
  mockState = { draws: [], isLoading: false, error: null };
  const html = renderToString(
    React.createElement(PastDrawsModal, {
      isOpen: false,
      onClose: noop,
      userId: "u1",
    })
  );
  assert.equal(html, "");
});

console.log("\n========================================");
console.log(`Tests run: ${testsRun}, failed: ${testsFailed}`);
console.log("========================================");
process.exit(testsFailed > 0 ? 1 : 0);
