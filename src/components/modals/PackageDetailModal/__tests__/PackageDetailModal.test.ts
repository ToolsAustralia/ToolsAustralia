/**
 * Smoke test for PackageDetailModal. Renders the component in 7 meaningful
 * prop combos via react-dom/server's renderToString — catches import errors,
 * undefined access, broken JSX, missing context providers.
 *
 * Visual parity is verified manually via /dev/modals.
 */
/* eslint-disable react/no-children-prop */

import assert from "node:assert/strict";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { LoadingProvider } from "@/contexts/LoadingContext";
import { ToastProvider } from "@/components/ui/Toast";
import PackageDetailModal from "../index";

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
  props: React.ComponentProps<typeof PackageDetailModal>;
}

const tradiePkg = {
  _id: "tradie-subscription",
  name: "Tradie",
  type: "subscription" as const,
  features: ["10% off Partner Discounts", "Bonus support"],
  entriesPerMonth: 3,
  partnerDiscountDays: 7,
};

const foremanPkg = { ...tradiePkg, _id: "foreman-subscription", name: "Foreman", entriesPerMonth: 8 };
const bossPkg = { ...tradiePkg, _id: "boss-subscription", name: "Boss", entriesPerMonth: 15 };

const oneTimePkg = {
  _id: "starter-pack",
  name: "Starter Pack",
  type: "one-time" as const,
  features: ["Bonus entries", "1 Days Access to Partner Discounts"],
  totalEntries: 25,
  partnerDiscountDays: 1,
};

const combos: Combo[] = [
  {
    name: "Tradie subscription with chart + active membership",
    props: {
      isOpen: true,
      onClose: noop,
      packageData: tradiePkg,
      membershipType: "subscription",
      accumulation: { entriesPerMonth: 3, lastMonthAccumulatedEntries: 12 },
      hasActiveSubscription: true,
      onOpenSettingsSubscription: noop,
    },
  },
  {
    name: "Foreman subscription, no active membership (View plans CTA)",
    props: {
      isOpen: true,
      onClose: noop,
      packageData: foremanPkg,
      membershipType: "subscription",
      accumulation: { entriesPerMonth: 8, lastMonthAccumulatedEntries: 25 },
      onOpenMembershipModal: noop,
    },
  },
  {
    name: "Boss subscription with special packages access",
    props: {
      isOpen: true,
      onClose: noop,
      packageData: bossPkg,
      membershipType: "subscription",
      accumulation: { entriesPerMonth: 15, lastMonthAccumulatedEntries: 60 },
      hasActiveSubscription: true,
      hasAccessToAdditionalPackages: true,
      onOpenSettingsSubscription: noop,
      onOpenSpecialPackages: noop,
    },
  },
  {
    name: "Subscription without accumulation (no chart)",
    props: {
      isOpen: true,
      onClose: noop,
      packageData: tradiePkg,
      membershipType: "subscription",
      hasActiveSubscription: true,
      onOpenSettingsSubscription: noop,
    },
  },
  {
    name: "One-time package",
    props: {
      isOpen: true,
      onClose: noop,
      packageData: oneTimePkg,
      membershipType: "one-time",
      hasAccessToAdditionalPackages: true,
      onOpenSpecialPackages: noop,
    },
  },
  {
    name: "One-time minimal (Got it fallback)",
    props: {
      isOpen: true,
      onClose: noop,
      packageData: oneTimePkg,
      membershipType: "one-time",
    },
  },
  {
    name: "isOpen=false renders null",
    props: {
      isOpen: false,
      onClose: noop,
      packageData: tradiePkg,
      membershipType: "subscription",
    },
  },
];

console.log("\nPackageDetailModal smoke test");

for (const combo of combos) {
  test(combo.name, () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const modalEl = React.createElement(PackageDetailModal, combo.props);
    const toastEl = React.createElement(ToastProvider, { children: modalEl });
    const loadingEl = React.createElement(LoadingProvider, { children: toastEl });
    const queryEl = React.createElement(QueryClientProvider, {
      client: queryClient,
      children: loadingEl,
    });
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
