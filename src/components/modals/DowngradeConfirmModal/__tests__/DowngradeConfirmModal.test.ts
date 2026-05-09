/**
 * Smoke test for DowngradeConfirmModal. Renders all 3 tier combos +
 * closed state via react-dom/server's renderToString.
 *
 * Visual parity is verified manually via /dev/modals (see Plan 3 Task 2.6).
 */
/* eslint-disable react/no-children-prop */

import assert from "node:assert/strict";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import DowngradeConfirmModal from "../index";

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
  props: React.ComponentProps<typeof DowngradeConfirmModal>;
}

const baseProps = {
  isOpen: true,
  onClose: noop,
  onConfirm: noop,
  toPackagePrice: 40,
  toPartnerAccessPercent: 50,
  toPartnerDiscountDays: 30,
  toEntriesPerMonth: 15,
  effectiveDateLabel: "Fri 26 Dec",
  currentEntries: 60,
  saveLabel: "Save $19/mo",
};

const combos: Combo[] = [
  {
    name: "open — Tradie tier",
    props: { ...baseProps, fromPackageName: "Foreman", toPackageName: "Tradie" },
  },
  {
    name: "open — Foreman tier",
    props: { ...baseProps, fromPackageName: "Boss", toPackageName: "Foreman" },
  },
  {
    name: "open — Boss tier",
    props: { ...baseProps, fromPackageName: "Tradie", toPackageName: "Boss" },
  },
  {
    name: "open — minimal props (no saveLabel, no effectiveDateLabel, no currentEntries)",
    props: {
      isOpen: true,
      onClose: noop,
      onConfirm: noop,
      fromPackageName: "Boss",
      toPackageName: "Tradie",
      toPackagePrice: 19,
      toPartnerAccessPercent: 25,
      toPartnerDiscountDays: 14,
      toEntriesPerMonth: 10,
    },
  },
  {
    name: "closed — renders null without throwing",
    props: { ...baseProps, isOpen: false, fromPackageName: "Foreman", toPackageName: "Tradie" },
  },
];

console.log("\nDowngradeConfirmModal smoke test");

for (const combo of combos) {
  test(combo.name, () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const modalEl = React.createElement(DowngradeConfirmModal, combo.props);
    const queryEl = React.createElement(QueryClientProvider, { client: queryClient, children: modalEl });
    const tree = React.createElement(SessionProvider, { session: null, children: queryEl });
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
