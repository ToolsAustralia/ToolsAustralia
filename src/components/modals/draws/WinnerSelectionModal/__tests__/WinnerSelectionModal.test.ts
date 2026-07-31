/**
 * Smoke test for WinnerSelectionModal. Renders meaningful prop combos via
 * react-dom/server's renderToString to catch import errors, undefined access,
 * and broken JSX after the folder decomposition.
 */
/* eslint-disable react/no-children-prop */

import assert from "node:assert/strict";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import WinnerSelectionModal from "../index";

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

interface Combo {
  name: string;
  props: React.ComponentProps<typeof WinnerSelectionModal>;
}

const baseProps = {
  isOpen: true,
  onClose: noop,
  onWinnerSelected: noop,
  drawId: "draw-123",
  drawName: "December Major Draw 2026",
  totalEntries: 1234,
};

const combos: Combo[] = [
  {
    name: "open — major draw, no current winner",
    props: { ...baseProps, drawType: "major" },
  },
  {
    name: "open — mini draw, no current winner",
    props: { ...baseProps, drawType: "mini" },
  },
  {
    name: "open — major draw with existing winner (replace flow)",
    props: {
      ...baseProps,
      drawType: "major",
      currentWinner: {
        userId: "user-456",
        imageUrl: "/winner.webp",
        selectedPrize: "$10,000 Cash",
        testimony: "<p>Best decision ever!</p>",
        drawResultUrl: "https://randomdraws.com.au/abc",
      },
    },
  },
  {
    name: "open — mini draw with enableImageField",
    props: { ...baseProps, drawType: "mini", enableImageField: true },
  },
  {
    name: "open — mini draw with current winner + enableImageField",
    props: {
      ...baseProps,
      drawType: "mini",
      enableImageField: true,
      currentWinner: { userId: "user-789", imageUrl: "/photo.webp" },
    },
  },
  {
    name: "closed — renders without throwing",
    props: { ...baseProps, isOpen: false, drawType: "major" },
  },
];

console.log("\nWinnerSelectionModal smoke test");

for (const combo of combos) {
  test(combo.name, () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const modalEl = React.createElement(WinnerSelectionModal, combo.props);
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
