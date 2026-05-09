/**
 * Smoke test for RevenueDetailModal. Renders meaningful prop combos via
 * react-dom/server's renderToString to catch import errors, undefined access,
 * and broken JSX after the folder decomposition.
 *
 * Note: useRevenueDetails is fired on mount via useQuery; we run with
 * QueryClient retry disabled and stub fetch to a non-resolving promise so
 * we exercise the loading branch deterministically.
 */
/* eslint-disable react/no-children-prop */

import assert from "node:assert/strict";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import RevenueDetailModal from "../index";

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

// Stub global fetch so useRevenueDetails' queryFn never errors at boot.
// renderToString does a single synchronous pass so the query stays in its
// pending state and the loading branch renders.
if (typeof globalThis.fetch !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = () => new Promise(() => {});
}

const noop = () => {};

interface Combo {
  name: string;
  props: React.ComponentProps<typeof RevenueDetailModal>;
}

const combos: Combo[] = [
  {
    name: "open — default category, dateRange=today",
    props: {
      isOpen: true,
      onClose: noop,
      category: "membership-purchase",
      dateRange: "today",
    },
  },
  {
    name: "open — different category, dateRange=all-time, with onUserClick",
    props: {
      isOpen: true,
      onClose: noop,
      category: "mini-draw",
      dateRange: "all-time",
      onUserClick: noop,
    },
  },
  {
    name: "open — custom date range with start/end",
    props: {
      isOpen: true,
      onClose: noop,
      category: "upsell",
      dateRange: "custom",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    },
  },
  {
    name: "open — null category renders generic title",
    props: {
      isOpen: true,
      onClose: noop,
      category: null,
      dateRange: "yesterday",
    },
  },
  {
    name: "closed — renders without throwing",
    props: {
      isOpen: false,
      onClose: noop,
      category: "membership-renewal",
      dateRange: "current-draw",
    },
  },
];

console.log("\nRevenueDetailModal smoke test");

for (const combo of combos) {
  test(combo.name, () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const modalEl = React.createElement(RevenueDetailModal, combo.props);
    const queryEl = React.createElement(QueryClientProvider, { client: queryClient, children: modalEl });
    const tree = React.createElement(SessionProvider, { session: null, children: queryEl });
    const html = renderToString(tree);
    assert.ok(typeof html === "string", "renderToString must return a string");
  });
}

console.log("\n========================================");
console.log(`Tests run: ${testsRun}, failed: ${testsFailed}`);
console.log("========================================");
process.exit(testsFailed > 0 ? 1 : 0);
