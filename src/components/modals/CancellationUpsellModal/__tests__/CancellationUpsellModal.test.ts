/**
 * Smoke test for CancellationUpsellModal. Renders the component in all 12
 * meaningful prop combos via react-dom/server's renderToString — catches
 * import errors, undefined access, broken JSX, missing context providers.
 *
 * This does NOT assert on visual output. Visual parity is verified manually
 * via /dev/modals (see Plan 2 Task 11).
 */

import assert from "node:assert/strict";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { LoadingProvider } from "@/contexts/LoadingContext";
import { ToastProvider } from "@/components/ui/Toast";
import CancellationUpsellModal from "../index";

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
  props: React.ComponentProps<typeof CancellationUpsellModal>;
}

const combos: Combo[] = [
  {
    name: "default — Tradie downgrade with saveLabel",
    props: {
      isOpen: true, onClose: noop, onRedeem: noop, onDecline: noop,
      accumulatedEntries: 60, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
      downgrade: { packageName: "Tradie", saveLabel: "Save $19/mo", onConfirm: noop },
    },
  },
  {
    name: "Foreman downgrade",
    props: {
      isOpen: true, onClose: noop, onRedeem: noop, onDecline: noop,
      accumulatedEntries: 60, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
      downgrade: { packageName: "Foreman", saveLabel: "Save $9/mo", onConfirm: noop },
    },
  },
  {
    name: "Boss downgrade",
    props: {
      isOpen: true, onClose: noop, onRedeem: noop, onDecline: noop,
      accumulatedEntries: 60, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
      downgrade: { packageName: "Boss", saveLabel: "Save $5/mo", onConfirm: noop },
    },
  },
  {
    name: "no saveLabel (middle check disappears)",
    props: {
      isOpen: true, onClose: noop, onRedeem: noop, onDecline: noop,
      accumulatedEntries: 60, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
      downgrade: { packageName: "Tradie", onConfirm: noop },
    },
  },
  {
    name: "no downgrade option",
    props: {
      isOpen: true, onClose: noop, onRedeem: noop, onDecline: noop,
      accumulatedEntries: 60, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
    },
  },
  {
    name: "0 accumulated entries (no-renewal copy)",
    props: {
      isOpen: true, onClose: noop, onRedeem: noop, onDecline: noop,
      accumulatedEntries: 0, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
      downgrade: { packageName: "Tradie", saveLabel: "Save $19/mo", onConfirm: noop },
    },
  },
  {
    name: "past due with entries",
    props: {
      isOpen: true, onClose: noop, onRedeem: noop, onDecline: noop,
      isPastDue: true, onResolvePayment: noop,
      accumulatedEntries: 60, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
      downgrade: { packageName: "Tradie", saveLabel: "Save $19/mo", onConfirm: noop },
    },
  },
  {
    name: "past due with 0 entries",
    props: {
      isOpen: true, onClose: noop, onRedeem: noop, onDecline: noop,
      isPastDue: true, onResolvePayment: noop,
      accumulatedEntries: 0, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
    },
  },
  {
    name: "no daysUntilDraw",
    props: {
      isOpen: true, onClose: noop, onRedeem: noop, onDecline: noop,
      accumulatedEntries: 60, drawCloseLabel: "Fri 26 Dec",
      downgrade: { packageName: "Tradie", saveLabel: "Save $19/mo", onConfirm: noop },
    },
  },
  {
    name: "no drawCloseLabel",
    props: {
      isOpen: true, onClose: noop, onRedeem: noop, onDecline: noop,
      accumulatedEntries: 60, daysUntilDraw: 5,
      downgrade: { packageName: "Tradie", saveLabel: "Save $19/mo", onConfirm: noop },
    },
  },
  {
    name: "long entries (12,500)",
    props: {
      isOpen: true, onClose: noop, onRedeem: noop, onDecline: noop,
      accumulatedEntries: 12500, daysUntilDraw: 5, drawCloseLabel: "Fri 26 Dec",
      downgrade: { packageName: "Tradie", saveLabel: "Save $19/mo", onConfirm: noop },
    },
  },
  {
    name: "isOpen=false (renders null without error)",
    props: {
      isOpen: false, onClose: noop, onRedeem: noop, onDecline: noop,
    },
  },
];

console.log("\nCancellationUpsellModal smoke test");

for (const combo of combos) {
  test(combo.name, () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const tree = React.createElement(
      SessionProvider,
      { session: null },
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(
          LoadingProvider,
          null,
          React.createElement(
            ToastProvider,
            null,
            React.createElement(CancellationUpsellModal, combo.props)
          )
        )
      )
    );
    const html = renderToString(tree);
    assert.ok(typeof html === "string", "renderToString must return a string");
    if (combo.props.isOpen) {
      assert.ok(html.length > 0, "isOpen=true should produce non-empty markup");
    }
  });
}

console.log("\n========================================");
console.log(`Tests run: ${testsRun}, failed: ${testsFailed}`);
console.log("========================================");
process.exit(testsFailed > 0 ? 1 : 0);
