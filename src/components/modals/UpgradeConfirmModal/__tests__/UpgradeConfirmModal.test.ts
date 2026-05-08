/**
 * Smoke test for UpgradeConfirmModal. Renders all 3 tier combos +
 * full prop set + closed state via react-dom/server's renderToString.
 *
 * Visual parity is verified manually via /dev/modals.
 */
/* eslint-disable react/no-children-prop */

import assert from "node:assert/strict";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import UpgradeConfirmModal from "../index";

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
  props: React.ComponentProps<typeof UpgradeConfirmModal>;
}

const baseProps = {
  isOpen: true,
  onClose: noop,
  onConfirm: noop,
  toPackagePrice: 59,
  toPartnerAccessPercent: 75,
  toPartnerDiscountDays: 30,
  toEntriesPerMonth: 25,
  upgradeEntriesGrant: 25,
  currentEntries: 60,
  effectiveDateLabel: "today",
};

const combos: Combo[] = [
  {
    name: "open — Tradie tier (upgrade to Tradie)",
    props: { ...baseProps, fromPackageName: "Starter", toPackageName: "Tradie", toPackagePrice: 29 },
  },
  {
    name: "open — Foreman tier (upgrade to Foreman)",
    props: { ...baseProps, fromPackageName: "Tradie", toPackageName: "Foreman", toPackagePrice: 49 },
  },
  {
    name: "open — Boss tier (upgrade to Boss)",
    props: { ...baseProps, fromPackageName: "Foreman", toPackageName: "Boss", toPackagePrice: 79 },
  },
  {
    name: "open — full prop set with upgradeEntriesGrant + currentEntries",
    props: {
      isOpen: true,
      onClose: noop,
      onConfirm: noop,
      fromPackageName: "Tradie",
      toPackageName: "Boss",
      toPackagePrice: 79,
      toPartnerAccessPercent: 100,
      toPartnerDiscountDays: 365,
      toEntriesPerMonth: 50,
      upgradeEntriesGrant: 50,
      currentEntries: 120,
      effectiveDateLabel: "today",
    },
  },
  {
    name: "closed — renders null without throwing",
    props: { ...baseProps, isOpen: false, fromPackageName: "Tradie", toPackageName: "Boss" },
  },
];

console.log("\nUpgradeConfirmModal smoke test");

for (const combo of combos) {
  test(combo.name, () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const modalEl = React.createElement(UpgradeConfirmModal, combo.props);
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
